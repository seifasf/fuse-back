import mongoose from 'mongoose';
import { Event } from '../models/Event.js';
import { TicketTier } from '../models/TicketTier.js';
import { SeatMap } from '../models/SeatMap.js';
import { SeatReservation } from '../models/SeatReservation.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { cacheDel } from '../utils/memoryCache.js';
import {
  buildSeatMap,
  assertSoldSeatsPreserved,
  assertHeldSeatsPreserved,
  syncSeatMapTiers,
  holdSeats,
  getSeatAvailability,
} from '../services/seatMapService.js';
import { isSeatedTier } from '../services/seatLayout.js';

async function findEventOr404(eventId) {
  if (!mongoose.isValidObjectId(eventId)) throw new AppError('Event not found', 404, 'NOT_FOUND');
  const event = await Event.findOne({ _id: eventId, deletedAt: null });
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND');
  return event;
}

/* ??? Admin ??????????????????????????????????????????????? */

export const adminGetSeatMap = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.eventId);
  if (req.query.only === 'availability') {
    const availability = await getSeatAvailability(event._id);
    res.set('Cache-Control', 'no-store');
    return res.json({ sold: availability.sold, held: availability.held });
  }
  const [seatMap, tiers, availability] = await Promise.all([
    SeatMap.findOne({ eventId: event._id }).lean(),
    TicketTier.find({ eventId: event._id }).sort({ sortOrder: 1, price: 1 }).lean(),
    getSeatAvailability(event._id),
  ]);
  res.json({
    seatMap,
    tiers,
    capacity: event.capacity,
    currency: event.currency,
    sold: availability.sold,
    held: availability.held,
  });
});

export const adminSaveSeatMap = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.eventId);
  const built = buildSeatMap(req.body);

  const eventTierIds = new Set(
    (await TicketTier.find({ eventId: event._id }).select('_id').lean()).map((t) => String(t._id))
  );
  for (const tier of built.tiers) {
    if (tier.tierId && !eventTierIds.has(String(tier.tierId))) tier.tierId = null;
  }

  await assertSoldSeatsPreserved(event._id, built.seats);
  await assertHeldSeatsPreserved(event._id, built.seats);

  const existing = await SeatMap.findOne({ eventId: event._id });
  const doc = existing || new SeatMap({ eventId: event._id });
  const previousTiers = existing ? existing.tiers.map((t) => t.toObject()) : [];
  const publish = req.body.publish === true || existing?.status === 'published';

  doc.canvas = built.canvas;
  doc.stage = built.stage;
  doc.maxSeatsPerOrder = built.maxSeatsPerOrder;
  doc.tiers = built.tiers;
  doc.seats = built.seats;
  doc.rowLabels = built.rowLabels;

  if (publish) {
    await syncSeatMapTiers(event, doc, previousTiers);
    doc.status = 'published';
    doc.publishedAt = doc.publishedAt || new Date();
  }

  await doc.save();
  cacheDel('public:');
  res.json({ seatMap: doc });
});

export const adminUnpublishSeatMap = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.eventId);
  const doc = await SeatMap.findOne({ eventId: event._id });
  if (!doc) throw new AppError('Seat map not found', 404, 'NOT_FOUND');
  const active = await SeatReservation.countDocuments({
    eventId: event._id,
    $or: [{ status: 'sold' }, { expiresAt: { $gt: new Date() } }],
  });
  if (active > 0) {
    throw new AppError(
      'Seats are already sold or being checked out, so the seat map can no longer be unpublished',
      409,
      'SOLD_SEATS_LOCKED'
    );
  }
  doc.status = 'draft';
  await doc.save();
  cacheDel('public:');
  res.json({ seatMap: doc });
});

/* ??? Public ?????????????????????????????????????????????? */

function publicSeatMapPayload(map, tiers) {
  const tierById = new Map(tiers.map((t) => [String(t._id), t]));
  return {
    canvas: map.canvas,
    stage: map.stage,
    maxSeatsPerOrder: map.maxSeatsPerOrder,
    tiers: map.tiers.map((t) => {
      const linked = tierById.get(String(t.tierId));
      const seated = isSeatedTier(t);
      return {
        key: t.key,
        tierId: t.tierId,
        name: linked?.name || t.name,
        prefix: t.prefix,
        color: linked?.color || t.color,
        price: linked?.price ?? t.price,
        currency: linked?.currency,
        maxPerOrder: linked?.maxPerOrder ?? map.maxSeatsPerOrder,
        orientation: t.orientation || 'horizontal',
        seated,
        ...(seated
          ? {}
          : { remaining: Math.max(0, (linked?.quantity ?? t.seatCount) - (linked?.sold || 0)) }),
        zone: t.zone,
      };
    }),
    seats: map.seats,
    rowLabels: map.rowLabels || [],
  };
}

export const getPublicSeatMap = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  if (!mongoose.isValidObjectId(eventId)) throw new AppError('Event not found', 404, 'NOT_FOUND');
  const availabilityOnly = req.query.only === 'availability';
  const map = await SeatMap.findOne({ eventId, status: 'published' })
    .select(availabilityOnly ? 'eventId' : undefined)
    .lean();
  if (!map) throw new AppError('This event has no seat map', 404, 'NOT_FOUND');

  if (availabilityOnly) {
    const availability = await getSeatAvailability(map.eventId, req.query.holdToken);
    res.set('Cache-Control', 'no-store');
    return res.json({
      availability: {
        sold: availability.sold,
        held: availability.held,
        mine: availability.mine,
        expiresAt: availability.myExpiresAt,
      },
    });
  }

  const [tiers, availability] = await Promise.all([
    TicketTier.find({ _id: { $in: map.tiers.map((t) => t.tierId).filter(Boolean) } })
      .select('name color price currency maxPerOrder quantity sold')
      .lean(),
    getSeatAvailability(map.eventId, req.query.holdToken),
  ]);

  res.set('Cache-Control', 'no-store');
  res.json({
    seatMap: publicSeatMapPayload(map, tiers),
    availability: {
      sold: availability.sold,
      held: availability.held,
      mine: availability.mine,
      expiresAt: availability.myExpiresAt,
    },
  });
});

export const holdPublicSeats = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  if (!mongoose.isValidObjectId(eventId)) throw new AppError('Event not found', 404, 'NOT_FOUND');
  const event = await Event.findOne({ _id: eventId, deletedAt: null }).select('status visibleOnSite').lean();
  if (!event || !['upcoming', 'live'].includes(event.status) || event.visibleOnSite === false) {
    throw new AppError('Event not available', 400, 'EVENT_UNAVAILABLE');
  }
  const map = await SeatMap.findOne({ eventId, status: 'published' }).lean();
  if (!map) throw new AppError('This event has no seat map', 404, 'NOT_FOUND');

  const result = await holdSeats({
    eventId: map.eventId,
    map,
    labels: req.body?.labels,
    holdToken: req.body?.holdToken,
  });

  if (result.taken.length) {
    throw new AppError(
      result.taken.length === 1
        ? `Seat ${result.taken[0]} was just taken. Pick another seat.`
        : `Seats ${result.taken.join(', ')} were just taken. Pick other seats.`,
      409,
      'SEAT_TAKEN',
      result
    );
  }
  res.set('Cache-Control', 'no-store');
  res.json(result);
});

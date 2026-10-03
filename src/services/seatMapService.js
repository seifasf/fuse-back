import crypto from 'crypto';
import mongoose from 'mongoose';
import { SeatMap } from '../models/SeatMap.js';
import { SeatReservation } from '../models/SeatReservation.js';
import { TicketTier } from '../models/TicketTier.js';
import { currencyForCountry } from '../models/constants.js';
import { normalizeHexColor } from '../constants/ticketTiers.js';
import { AppError } from '../utils/AppError.js';
import {
  SEAT_CANVAS,
  MIN_ZONE_SIZE,
  MAX_TIERS,
  MAX_SEATS_PER_TIER,
  MAX_SEATS_TOTAL,
  MIN_SEAT_RADIUS,
  MAX_ROWS_PER_TIER,
  MAX_SEATS_PER_ROW,
  MAX_GA_CAPACITY,
  tierPrefix,
  normalizeRowName,
  normalizeOrientation,
  isSeatedTier,
  isRectInsideCanvas,
  generateSeatLayout,
} from './seatLayout.js';

/** How long picked seats stay reserved while the guest is choosing seats and filling in details. */
export const SEAT_HOLD_MS = 2 * 60 * 1000;
/** Once a booking is created the guest is on the payment page, so seats must outlast the payment step. */
export const SEAT_PAYMENT_HOLD_MS = 10 * 60 * 1000;

function fail(message, code = 'VALIDATION_ERROR', details = null, status = 400) {
  throw new AppError(message, status, code, details);
}

function toRect(raw, what) {
  const rect = {
    x: Number(raw?.x),
    y: Number(raw?.y),
    w: Number(raw?.w),
    h: Number(raw?.h),
  };
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) {
    fail(`${what}: position and size are required`);
  }
  if (rect.w < MIN_ZONE_SIZE || rect.h < MIN_ZONE_SIZE) {
    fail(`${what} is too small (min ${MIN_ZONE_SIZE} x ${MIN_ZONE_SIZE})`);
  }
  if (!isRectInsideCanvas(rect)) {
    fail(`${what} must stay inside the canvas, below the logo`);
  }
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
  };
}

/**
 * Validate admin input and build the stored seat map (seats are generated here,
 * never taken from the client).
 */
export function buildSeatMap(body = {}) {
  const stage = toRect(body.stage, 'Stage');

  const rawTiers = Array.isArray(body.tiers) ? body.tiers : [];
  if (!rawTiers.length) fail('Add at least one tier');
  if (rawTiers.length > MAX_TIERS) fail(`Max ${MAX_TIERS} tiers per seat map`);

  const keys = new Set();
  const prefixes = new Map();
  const tiers = rawTiers.map((t, idx) => {
    const name = String(t?.name || '').trim().slice(0, 40);
    if (!name) fail(`Tier ${idx + 1} needs a name`);

    const key = String(t?.key || '').trim().slice(0, 40);
    if (!key) fail(`Tier "${name}" is missing its key`);
    if (keys.has(key)) fail(`Duplicate tier key "${key}"`);
    keys.add(key);

    const seated = isSeatedTier(t);
    const prefix = tierPrefix(name);
    if (seated) {
      if (prefixes.has(prefix)) {
        fail(
          `"${name}" and "${prefixes.get(prefix)}" would both label seats ${prefix}-1, ${prefix}-2... Rename one of them.`
        );
      }
      prefixes.set(prefix, name);
    }

    const rows = seated ? parseRows(t?.rows, name) : [];
    const seatCount = rows.length ? rows.reduce((sum, r) => sum + r.seats, 0) : Number(t?.seatCount);
    if (rows.length && t?.seatCount != null && Number(t.seatCount) !== seatCount) {
      fail(`"${name}": the rows add up to ${seatCount} seats, but the tier total is ${t.seatCount}. Make them equal.`);
    }
    if (!Number.isInteger(seatCount) || seatCount < 1) {
      fail(
        seated
          ? `"${name}": number of seats must be a whole number above 0`
          : `"${name}": capacity must be a whole number above 0`
      );
    }
    if (seated && seatCount > MAX_SEATS_PER_TIER) {
      fail(`"${name}": max ${MAX_SEATS_PER_TIER} seats per tier`);
    }
    if (!seated && seatCount > MAX_GA_CAPACITY) {
      fail(`"${name}": max ${MAX_GA_CAPACITY} tickets for a not-seated tier`);
    }

    const price = Number(t?.price);
    if (!Number.isFinite(price) || price < 0) fail(`"${name}": price must be 0 or more`);

    const tierId =
      t?.tierId && mongoose.isValidObjectId(t.tierId) ? new mongoose.Types.ObjectId(String(t.tierId)) : null;

    return {
      key,
      tierId,
      name,
      prefix,
      color: normalizeHexColor(t?.color),
      price: Math.round(price * 1000) / 1000,
      seatCount,
      rows,
      orientation: normalizeOrientation(t?.orientation),
      seated,
      zone: toRect(t?.zone, `"${name}" zone`),
    };
  });

  const totalSeats = tiers.filter((t) => t.seated).reduce((sum, t) => sum + t.seatCount, 0);
  if (totalSeats > MAX_SEATS_TOTAL) fail(`Max ${MAX_SEATS_TOTAL} seats per seat map`);

  const { seats, rowLabels } = generateSeatLayout(tiers);
  for (const tier of tiers) {
    const first = seats.find((s) => s.tierKey === tier.key);
    if (first && first.r < MIN_SEAT_RADIUS) {
      fail(`"${tier.name}" zone is too small for ${tier.seatCount} seats. Make the zone bigger or lower the count.`);
    }
  }

  const labels = new Set();
  for (const s of seats) {
    if (labels.has(s.label)) fail(`Duplicate seat label ${s.label}`);
    labels.add(s.label);
  }

  const maxSeatsPerOrder = Math.min(50, Math.max(1, Math.floor(Number(body.maxSeatsPerOrder) || 10)));

  return {
    canvas: { ...SEAT_CANVAS },
    stage,
    tiers,
    seats,
    rowLabels,
    maxSeatsPerOrder,
  };
}

/** Optional named rows for a tier. An empty list means the tier uses the auto grid. */
function parseRows(raw, tierName) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail(`"${tierName}": rows must be a list`);
  if (raw.length > MAX_ROWS_PER_TIER) fail(`"${tierName}": max ${MAX_ROWS_PER_TIER} rows per tier`);
  const names = new Set();
  return raw.map((r, idx) => {
    const name = normalizeRowName(r?.name);
    if (!name) fail(`"${tierName}": row ${idx + 1} needs a name (letters or numbers)`);
    if (names.has(name)) fail(`"${tierName}": row name "${name}" is used twice`);
    names.add(name);
    const seats = Number(r?.seats);
    if (!Number.isInteger(seats) || seats < 1) {
      fail(`"${tierName}": row ${name} needs a whole number of seats above 0`);
    }
    if (seats > MAX_SEATS_PER_ROW) fail(`"${tierName}": max ${MAX_SEATS_PER_ROW} seats per row`);
    return { name, seats };
  });
}

/** Sold seats must keep their label and tier; otherwise the change is rejected. */
export async function assertSoldSeatsPreserved(eventId, nextSeats) {
  const sold = await SeatReservation.find({ eventId, status: 'sold' }).select('label tierKey').lean();
  if (!sold.length) return;
  const nextByLabel = new Map(nextSeats.map((s) => [s.label, s.tierKey]));
  const broken = sold.filter((r) => nextByLabel.get(r.label) !== r.tierKey).map((r) => r.label);
  if (broken.length) {
    const sample = broken.slice(0, 8).join(', ');
    fail(
      `These seats are already sold and would be removed or renumbered: ${sample}${
        broken.length > 8 ? ` and ${broken.length - 8} more` : ''
      }. Keep the tier name and don't lower its seat count below the sold seats.`,
      'SOLD_SEATS_LOCKED',
      { labels: broken },
      409
    );
  }
}

/** Seats a guest is paying for right now must not disappear, or their payment could not be confirmed. */
export async function assertHeldSeatsPreserved(eventId, nextSeats) {
  const held = await SeatReservation.find({
    eventId,
    status: 'held',
    bookingId: { $ne: null },
    expiresAt: { $gt: new Date() },
  })
    .select('label tierKey')
    .lean();
  if (!held.length) return;
  const nextByLabel = new Map(nextSeats.map((s) => [s.label, s.tierKey]));
  const broken = held.filter((r) => nextByLabel.get(r.label) !== r.tierKey).map((r) => r.label);
  if (broken.length) {
    fail(
      `Guests are checking out with seats ${broken.slice(0, 8).join(', ')}${
        broken.length > 8 ? ` and ${broken.length - 8} more` : ''
      } right now. Try again in a few minutes.`,
      'SEATS_IN_CHECKOUT',
      { labels: broken },
      409
    );
  }
}

/**
 * Create / update the TicketTier behind every seat map tier (price, quantity = seats).
 * Tiers removed from the map are deleted when nothing was sold.
 * Mutates mapDoc.tiers[].tierId.
 */
export async function syncSeatMapTiers(event, mapDoc, previousTiers = []) {
  const currency = currencyForCountry(event.country);
  const existing = await TicketTier.find({ eventId: event._id });
  const byId = new Map(existing.map((t) => [String(t._id), t]));

  const usedIds = new Set();
  const plan = mapDoc.tiers.map((mapTier) => {
    let tier = mapTier.tierId ? byId.get(String(mapTier.tierId)) : null;
    if (!tier) {
      tier = existing.find(
        (t) => !usedIds.has(String(t._id)) && t.name.toLowerCase() === mapTier.name.toLowerCase()
      );
    }
    if (tier) {
      if (usedIds.has(String(tier._id))) {
        fail(`Ticket tier "${tier.name}" is linked to two seat map tiers`);
      }
      usedIds.add(String(tier._id));
    }
    return { mapTier, tier: tier || null };
  });

  for (const { mapTier, tier } of plan) {
    const clash = existing.find(
      (t) =>
        (!tier || String(t._id) !== String(tier._id)) &&
        t.name.toLowerCase() === mapTier.name.toLowerCase()
    );
    if (clash) {
      fail(`A ticket tier named "${clash.name}" already exists. Link it instead of creating a new one.`);
    }
  }

  const soldCounts = await SeatReservation.aggregate([
    { $match: { eventId: event._id, status: 'sold' } },
    { $group: { _id: '$tierKey', n: { $sum: 1 } } },
  ]);
  const soldByKey = new Map(soldCounts.map((r) => [r._id, r.n]));

  for (const { mapTier, tier } of plan) {
    if (!tier) continue;
    const seated = isSeatedTier(mapTier);
    const seatedSold = soldByKey.get(mapTier.key) || 0;
    if (seated && tier.sold > seatedSold) {
      fail(
        `"${tier.name}" already has ${tier.sold - seatedSold} ticket(s) sold without seats. Keep it "Not seated" or use a new tier for seats.`,
        'TIER_HAS_UNSEATED_SALES'
      );
    }
    if (mapTier.seatCount < tier.sold) {
      fail(
        seated
          ? `"${mapTier.name}" has ${tier.sold} sold, so it needs at least ${tier.sold} seats`
          : `"${mapTier.name}" has ${tier.sold} sold, so its capacity must be at least ${tier.sold}`
      );
    }
  }

  const removed = previousTiers
    .filter((p) => p.tierId && !usedIds.has(String(p.tierId)))
    .map((p) => byId.get(String(p.tierId)))
    .filter(Boolean);
  const removedIds = new Set(removed.map((t) => String(t._id)));

  const capacity = Math.max(0, Number(event.capacity) || 0);
  const otherTiersTotal = existing
    .filter((t) => !usedIds.has(String(t._id)) && !removedIds.has(String(t._id)))
    .reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);
  const seatTotal = mapDoc.tiers.reduce((sum, t) => sum + t.seatCount, 0);
  if (otherTiersTotal + seatTotal > capacity) {
    fail(
      `The seat map has ${seatTotal} tickets${
        otherTiersTotal ? ` plus ${otherTiersTotal} other tickets` : ''
      }, but the event capacity is ${capacity}. Raise Total Venue Capacity in the Details tab.`,
      'CAPACITY_EXCEEDED'
    );
  }

  for (const { mapTier, tier } of plan) {
    const fields = {
      name: mapTier.name,
      color: mapTier.color,
      price: mapTier.price,
      currency,
      quantity: mapTier.seatCount,
      maxPerOrder: Math.min(mapDoc.maxSeatsPerOrder || 10, 50),
      isActive: true,
      seated: isSeatedTier(mapTier),
    };
    if (tier) {
      Object.assign(tier, fields);
      await tier.save();
      mapTier.tierId = tier._id;
    } else {
      const created = await TicketTier.create({ ...fields, eventId: event._id });
      mapTier.tierId = created._id;
    }
  }

  for (const tier of removed) {
    if (tier.sold > 0) {
      tier.isActive = false;
      await tier.save();
    } else {
      await TicketTier.deleteOne({ _id: tier._id });
    }
  }
}

/**
 * Seated / not seated switch from the Tiers tab. If the tier is on the event's seat map, its zone is
 * re-generated (seats added or removed) with the same checks as saving the map in the builder.
 */
export async function setSeatMapTierSeating(event, tier, seated) {
  const doc = await SeatMap.findOne({ eventId: event._id, 'tiers.tierId': tier._id });
  if (!doc) return null;
  const index = doc.tiers.findIndex((t) => String(t.tierId) === String(tier._id));
  if (isSeatedTier(doc.tiers[index]) === seated) return doc;

  if (seated && tier.sold > 0) {
    fail(
      `"${tier.name}" already has ${tier.sold} ticket(s) sold without seats, so it has to stay "Not seated".`,
      'TIER_HAS_UNSEATED_SALES',
      null,
      409
    );
  }
  const built = buildSeatMap({
    stage: doc.stage,
    maxSeatsPerOrder: doc.maxSeatsPerOrder,
    tiers: doc.tiers.map((t, i) => ({ ...t.toObject(), seated: i === index ? seated : isSeatedTier(t) })),
  });
  await assertSoldSeatsPreserved(event._id, built.seats);
  await assertHeldSeatsPreserved(event._id, built.seats);

  doc.tiers = built.tiers;
  doc.seats = built.seats;
  doc.rowLabels = built.rowLabels;
  await doc.save();
  return doc;
}

export function newHoldToken() {
  return crypto.randomUUID();
}

function cleanToken(token) {
  const raw = String(token || '').trim();
  return /^[A-Za-z0-9-]{16,64}$/.test(raw) ? raw : '';
}

function uniqueLabels(labels) {
  return [...new Set((Array.isArray(labels) ? labels : []).map((l) => String(l || '').trim()).filter(Boolean))];
}

/**
 * Make `labels` exactly the set of seats held by this hold token.
 * Seats that someone else holds or bought are returned in `taken` (not held).
 */
/** The unique (eventId, label) index is what prevents double booking - never write before it exists. */
function seatIndexesReady() {
  return SeatReservation.init();
}

export async function holdSeats({ eventId, map, labels, holdToken, bookingId = null, holdMs = SEAT_HOLD_MS }) {
  await seatIndexesReady();
  const wanted = uniqueLabels(labels);
  if (wanted.length > map.maxSeatsPerOrder) {
    fail(`You can pick up to ${map.maxSeatsPerOrder} seats per order`, 'LIMIT');
  }
  const seatByLabel = new Map(map.seats.map((s) => [s.label, s]));
  const unknown = wanted.filter((l) => !seatByLabel.has(l));
  if (unknown.length) fail(`Unknown seat(s): ${unknown.join(', ')}`, 'INVALID_SEAT');

  const tierIdByKey = new Map(map.tiers.map((t) => [t.key, t.tierId || null]));
  const token = cleanToken(holdToken) || newHoldToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + holdMs);

  await SeatReservation.deleteMany({
    eventId,
    holdToken: token,
    status: 'held',
    label: { $nin: wanted },
  });

  if (wanted.length) {
    await SeatReservation.deleteMany({
      eventId,
      label: { $in: wanted },
      status: 'held',
      expiresAt: { $lte: now },
    });
    await SeatReservation.updateMany(
      { eventId, holdToken: token, status: 'held', label: { $in: wanted } },
      { $set: { expiresAt, ...(bookingId ? { bookingId } : {}) } }
    );
  }

  const mine = new Set(
    (
      await SeatReservation.find({
        eventId,
        holdToken: token,
        status: 'held',
        label: { $in: wanted },
      })
        .select('label')
        .lean()
    ).map((r) => r.label)
  );

  const taken = [];
  for (const label of wanted) {
    if (mine.has(label)) continue;
    const seat = seatByLabel.get(label);
    try {
      await SeatReservation.create({
        eventId,
        label,
        tierKey: seat.tierKey,
        tierId: tierIdByKey.get(seat.tierKey),
        status: 'held',
        holdToken: token,
        bookingId,
        expiresAt,
      });
    } catch (err) {
      if (err?.code === 11000) taken.push(label);
      else throw err;
    }
  }

  return {
    holdToken: token,
    expiresAt,
    held: wanted.filter((l) => !taken.includes(l)),
    taken,
  };
}

/** Seat availability for the public map. Seats held by `holdToken` count as the viewer's own. */
export async function getSeatAvailability(eventId, holdToken) {
  const token = cleanToken(holdToken);
  const now = new Date();
  const docs = await SeatReservation.find({ eventId })
    .select('label status holdToken expiresAt')
    .lean();
  const sold = [];
  const held = [];
  const mine = [];
  let myExpiresAt = null;
  for (const d of docs) {
    if (d.status === 'sold') sold.push(d.label);
    else if (d.expiresAt && d.expiresAt <= now) continue;
    else if (token && d.holdToken === token) {
      mine.push(d.label);
      if (!myExpiresAt || d.expiresAt < myExpiresAt) myExpiresAt = d.expiresAt;
    } else held.push(d.label);
  }
  return { sold, held, mine, myExpiresAt };
}

function seatsTakenError(taken) {
  return new AppError(
    taken.length === 1
      ? `Seat ${taken[0]} was just taken by someone else. Please pick another seat.`
      : `Seats ${taken.join(', ')} were just taken by someone else. Please pick other seats.`,
    409,
    'SEAT_TAKEN',
    { taken }
  );
}

/** At checkout: hold exactly the booking's seats under its hold token, or fail with SEAT_TAKEN. */
export async function claimSeatsForBooking({ eventId, map, labels, holdToken, bookingId }) {
  const result = await holdSeats({ eventId, map, labels, holdToken, bookingId, holdMs: SEAT_PAYMENT_HOLD_MS });
  if (result.taken.length) throw seatsTakenError(result.taken);
  return result;
}

/**
 * On payment confirmation: re-check every seat and mark it sold.
 * Throws SEAT_TAKEN (and keeps the rest held) if any seat was lost.
 */
export async function finalizeBookingSeats(booking, map) {
  const eventId = booking.eventId?._id || booking.eventId;
  const items = booking.items.filter((i) => i.seats?.length);
  if (!items.length) return;
  await seatIndexesReady();
  if (!map) {
    throw new AppError('This event no longer has a seat map. Contact support.', 409, 'SEAT_UNAVAILABLE');
  }

  const seatByLabel = new Map(map.seats.map((s) => [s.label, s]));
  const keyByTierId = new Map(map.tiers.map((t) => [String(t.tierId), t.key]));
  const wanted = [];
  for (const item of items) {
    const tierKey = keyByTierId.get(String(item.tierId));
    for (const label of item.seats) {
      if (!tierKey || seatByLabel.get(label)?.tierKey !== tierKey) {
        throw new AppError(
          `Seat ${label} is no longer part of the seat map. Please pick another seat.`,
          409,
          'SEAT_UNAVAILABLE',
          { taken: [label] }
        );
      }
      wanted.push({ label, tierKey, tierId: item.tierId });
    }
  }

  const now = new Date();
  const ownFilter = [{ bookingId: booking._id }];
  if (booking.seatHoldToken) ownFilter.push({ holdToken: booking.seatHoldToken, status: 'held' });

  await SeatReservation.deleteMany({
    eventId,
    label: { $in: wanted.map((w) => w.label) },
    status: 'held',
    expiresAt: { $lte: now },
    $nor: ownFilter,
  });

  const converted = [];
  const taken = [];
  for (const w of wanted) {
    const soldFields = {
      status: 'sold',
      bookingId: booking._id,
      tierKey: w.tierKey,
      tierId: w.tierId,
    };
    const own = await SeatReservation.findOneAndUpdate(
      { eventId, label: w.label, $or: ownFilter },
      { $set: soldFields, $unset: { expiresAt: 1 } },
      { new: true }
    );
    if (own) {
      converted.push(w.label);
      continue;
    }
    try {
      await SeatReservation.create({ eventId, label: w.label, ...soldFields });
      converted.push(w.label);
    } catch (err) {
      if (err?.code === 11000) taken.push(w.label);
      else throw err;
    }
  }

  if (taken.length) {
    await SeatReservation.updateMany(
      { eventId, bookingId: booking._id, label: { $in: converted } },
      { $set: { status: 'held', expiresAt: new Date(now.getTime() + SEAT_PAYMENT_HOLD_MS) } }
    );
    throw seatsTakenError(taken);
  }
}

/**
 * Manual / complimentary tickets: mark the seats the admin picked as sold, all or nothing.
 * Seats that are sold, assigned or held in someone's checkout fail with SEAT_TAKEN (the unique
 * (eventId, label) index is the check, so two admins or a guest can't get the same seat).
 */
export async function assignChosenSeats({ eventId, map, tierKey, tierId, labels, qty, bookingId }) {
  await seatIndexesReady();
  const order = new Map(map.seats.map((s, i) => [s.label, i]));
  const tierOf = new Map(map.seats.map((s) => [s.label, s.tierKey]));
  const wanted = uniqueLabels(labels).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  if (wanted.length !== qty) {
    fail(`Pick ${qty} seat${qty === 1 ? '' : 's'} on the seat map`, 'SEATS_REQUIRED');
  }
  const wrong = wanted.filter((label) => tierOf.get(label) !== tierKey);
  if (wrong.length) fail(`Seat ${wrong[0]} is not part of this tier`, 'INVALID_SEAT');

  await SeatReservation.deleteMany({
    eventId,
    status: 'held',
    expiresAt: { $lte: new Date() },
    label: { $in: wanted },
  });

  const assigned = [];
  const taken = [];
  try {
    for (const label of wanted) {
      try {
        await SeatReservation.create({ eventId, label, tierKey, tierId, status: 'sold', bookingId });
        assigned.push(label);
      } catch (err) {
        if (err?.code === 11000) taken.push(label);
        else throw err;
      }
    }
  } catch (err) {
    await SeatReservation.deleteMany({ eventId, bookingId, label: { $in: assigned } });
    throw err;
  }

  if (taken.length) {
    await SeatReservation.deleteMany({ eventId, bookingId, label: { $in: assigned } });
    throw new AppError(
      taken.length === 1
        ? `Seat ${taken[0]} is no longer available (sold, assigned or in someone's checkout). Pick another seat.`
        : `Seats ${taken.join(', ')} are no longer available (sold, assigned or in someone's checkout). Pick other seats.`,
      409,
      'SEAT_TAKEN',
      { taken }
    );
  }
  return wanted;
}

export async function releaseBookingSeats(bookingId) {
  await SeatReservation.deleteMany({ bookingId });
}

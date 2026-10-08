import { Booking } from '../models/Booking.js';
import { Event } from '../models/Event.js';
import { TicketTier } from '../models/TicketTier.js';
import { Ticket } from '../models/Ticket.js';
import { getPaymentProvider } from '../services/payments/index.js';
import { currencyForCountry, SOLD_BOOKING_STATUSES } from '../models/constants.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import { colorForTierName, normalizeHexColor } from '../constants/ticketTiers.js';
import { cacheDel } from '../utils/memoryCache.js';
import { stepTimer } from '../utils/stepTimer.js';
import { isEmailConfigured, sendOrderReceivedEmail } from '../services/email/index.js';
import mongoose from 'mongoose';
import { SeatMap } from '../models/SeatMap.js';
import {
  claimSeatsForBooking,
  detachSeatsFromCheckout,
  finalizeBookingSeats,
  releaseBookingSeats,
} from '../services/seatMapService.js';
import { isSeatedTier } from '../services/seatLayout.js';
import {
  createTicketsForBooking,
  formatTicketsForClient,
  isBookingEmailInFlight,
  orderStatusPath,
  sendBookingEmailInBackground,
} from '../services/bookingTickets.js';
import {
  generateAccessKey,
  releaseTierCapacity,
  reserveTierCapacity,
} from '../services/approvalService.js';

export const createBooking = asyncHandler(async (req, res) => {
  const { eventId, items, guest, provider, acceptedTerms, holdToken } = req.body;
  if (!eventId || !items?.length || !guest?.email) {
    throw new AppError('Missing booking fields', 400, 'VALIDATION_ERROR');
  }
  if (acceptedTerms !== true) {
    throw new AppError(
      'You must accept the Terms & Conditions before purchasing tickets',
      400,
      'TERMS_REQUIRED'
    );
  }

  const event = await Event.findOne({ _id: eventId, deletedAt: null });
  if (!event || !['upcoming', 'live'].includes(event.status)) {
    throw new AppError('Event not available', 400, 'EVENT_UNAVAILABLE');
  }
  if (event.visibleOnSite === false) {
    throw new AppError('Event is not available on the website', 400, 'EVENT_HIDDEN');
  }

  const currency = currencyForCountry(event.country);
  let total = 0;
  let ticketCount = 0;
  const validatedItems = [];

  const seatMap = await SeatMap.findOne({ eventId: event._id, status: 'published' }).lean();
  const seatedTierByTierId = new Map(
    (seatMap?.tiers || []).filter((t) => t.tierId && isSeatedTier(t)).map((t) => [String(t.tierId), t])
  );
  const seatByLabel = new Map((seatMap?.seats || []).map((s) => [s.label, s]));
  const allSeatLabels = [];

  for (const item of items) {
    const tier = await TicketTier.findOne({ _id: item.tierId, eventId, isActive: true });
    if (!tier) throw new AppError('Invalid ticket tier', 400, 'INVALID_TIER');
    const qty = Math.max(0, Number(item.qty) || 0);
    if (qty < 1) throw new AppError('Invalid ticket quantity', 400, 'VALIDATION_ERROR');
    if (tier.sold + (tier.reserved || 0) + qty > tier.quantity) {
      throw new AppError(`Not enough tickets for ${tier.name}`, 400, 'SOLD_OUT');
    }
    if (qty > tier.maxPerOrder) {
      throw new AppError(`Max ${tier.maxPerOrder} tickets per order for ${tier.name}`, 400, 'LIMIT');
    }

    const rawMembers = Array.isArray(item.members) ? item.members : [];
    if (rawMembers.length !== qty) {
      throw new AppError(
        `Add name and phone for each of the ${qty} ${tier.name} guest(s)`,
        400,
        'MEMBERS_REQUIRED'
      );
    }
    const members = rawMembers.map((m, idx) => {
      const name = typeof m?.name === 'string' ? m.name.trim() : '';
      const phone = typeof m?.phone === 'string' ? m.phone.trim() : '';
      if (!name || name.length < 2) {
        throw new AppError(`Guest ${idx + 1} name is required for ${tier.name}`, 400, 'VALIDATION_ERROR');
      }
      if (!phone || phone.replace(/\D/g, '').length < 8) {
        throw new AppError(`Guest ${idx + 1} phone is required for ${tier.name}`, 400, 'VALIDATION_ERROR');
      }
      return { name: name.slice(0, 120), phone: phone.slice(0, 32) };
    });

    const seatedTier = seatedTierByTierId.get(String(tier._id));
    const rawSeats = Array.isArray(item.seats) ? item.seats : [];
    let seats = [];
    if (seatedTier) {
      seats = [...new Set(rawSeats.map((s) => String(s || '').trim()).filter(Boolean))];
      if (seats.length !== qty) {
        throw new AppError(`Pick ${qty} seat(s) on the map for ${tier.name}`, 400, 'SEATS_REQUIRED');
      }
      const wrong = seats.filter((label) => seatByLabel.get(label)?.tierKey !== seatedTier.key);
      if (wrong.length) {
        throw new AppError(`Seat ${wrong[0]} is not a ${tier.name} seat`, 400, 'INVALID_SEAT');
      }
      allSeatLabels.push(...seats);
    } else if (rawSeats.length) {
      throw new AppError(`${tier.name} tickets don't have seat numbers`, 400, 'INVALID_SEAT');
    }

    validatedItems.push({
      tierId: tier._id,
      tierName: tier.name,
      tierColor: normalizeHexColor(tier.color || colorForTierName(tier.name)),
      qty,
      unitPrice: tier.price,
      members,
      seats,
    });
    total += tier.price * qty;
    ticketCount += qty;
  }

  const email = String(guest.email).trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('Valid email is required', 400, 'VALIDATION_ERROR');
  }
  const primary = validatedItems[0]?.members?.[0];
  const guestName =
    (typeof guest.name === 'string' && guest.name.trim()) || primary?.name || 'Guest';
  const guestPhone =
    (typeof guest.phone === 'string' && guest.phone.trim()) || primary?.phone || '';
  if (allSeatLabels.length > (seatMap?.maxSeatsPerOrder ?? Infinity)) {
    throw new AppError(`You can pick up to ${seatMap.maxSeatsPerOrder} seats per order`, 400, 'LIMIT');
  }

  const manual = env.paymentMode === 'manual';
  const bookingId = new mongoose.Types.ObjectId();
  const expiresAt = new Date(Date.now() + (manual ? env.approvalHoldHours * 3600_000 : 30 * 60 * 1000));

  // Manual orders hold their tickets until an admin approves or rejects them (or they expire).
  if (manual) await reserveTierCapacity(validatedItems);

  let seatHoldToken = '';
  let booking;
  try {
    if (allSeatLabels.length) {
      const claim = await claimSeatsForBooking({
        eventId: event._id,
        map: seatMap,
        labels: allSeatLabels,
        holdToken,
        bookingId,
        ...(manual ? { holdMs: expiresAt.getTime() - Date.now() } : {}),
      });
      seatHoldToken = manual ? await detachSeatsFromCheckout(bookingId) : claim.holdToken;
    }

    booking = await Booking.create({
      _id: bookingId,
      seatHoldToken,
      clientId: req.user?._id || null,
      guest: {
        name: guestName.slice(0, 120),
        email,
        phone: guestPhone.slice(0, 32),
      },
      eventId,
      eventSnapshot: {
        title: event.title,
        country: event.country,
        startsAt: event.startsAt,
        venue: event.venue,
      },
      items: validatedItems,
      ticketCount,
      total,
      currency,
      status: manual ? 'pending_approval' : 'pending',
      paymentProvider: manual ? 'offline' : provider || 'mock',
      accessKey: generateAccessKey(),
      expiresAt,
    });
  } catch (err) {
    if (allSeatLabels.length) await releaseBookingSeats(bookingId);
    if (manual) await releaseTierCapacity(validatedItems);
    throw err;
  }

  if (manual) {
    cacheDel('public:');
    const statusUrl = orderStatusPath(booking);
    if (isEmailConfigured()) {
      sendOrderReceivedEmail({
        toEmail: booking.guest.email,
        toName: booking.guest.name,
        eventTitle: event.title,
        startsAt: event.startsAt,
        venue: event.venue,
        summary: validatedItems.map(
          (i) => `${i.qty} x ${i.tierName}${i.seats.length ? ` (${i.seats.join(', ')})` : ''}`
        ),
        total: `${total} ${currency}`,
        orderPath: statusUrl,
      }).catch(() => {});
    }
    return res.status(201).json({ booking, statusUrl, paymentMode: 'manual' });
  }

  const paymentProvider = getPaymentProvider(event.country, provider);
  const returnPath = `/booking/${booking._id}/confirmation`;
  const returnUrl = `${env.clientUrl}${returnPath}`;
  const payment = await paymentProvider.createPayment({ booking, returnUrl });

  booking.paymentRef = payment.paymentRef;
  await booking.save();

  // Prefer same-origin path so the SPA can navigate even if CLIENT_URL is misconfigured
  const paymentUrl =
    typeof payment.paymentUrl === 'string' && payment.paymentUrl.includes('/booking/')
      ? `${returnPath}?bookingId=${booking._id}&status=success`
      : payment.paymentUrl || `${returnPath}?status=success`;

  res.status(201).json({ booking, paymentUrl, paymentMode: 'gateway' });
});

export const confirmPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const timer = stepTimer(`confirm ${bookingId}`);
  const booking = await Booking.findById(bookingId).populate('eventId');
  timer.mark('load');
  if (!booking) throw new AppError('Booking not found', 404, 'NOT_FOUND');

  const sendAlreadyPaid = async (booking, { retryEmail = true } = {}) => {
    const existing = await Ticket.find({ bookingId });
    const formatted = await formatTicketsForClient(existing);

    // Retry email if it never went out (e.g. Brevo was added later, or the server restarted mid-send)
    const emailQueued = retryEmail ? sendBookingEmailInBackground(booking, existing) : false;
    const emailSent =
      Boolean(booking.emailSentAt) || emailQueued || isBookingEmailInFlight(booking._id);
    timer.done('already-paid');

    return res.json({
      booking,
      tickets: formatted,
      alreadyPaid: true,
      delivery: emailSent ? 'email+download' : 'download',
      emailSent,
    });
  };

  if (booking.status === 'paid') return sendAlreadyPaid(booking);

  // In manual mode tickets are only issued by an admin approving the order.
  if (env.paymentMode !== 'gateway') {
    throw new AppError('Online payment is not enabled', 400, 'PAYMENT_DISABLED');
  }

  if (booking.status !== 'pending') {
    throw new AppError('Booking cannot be paid', 400, 'INVALID_STATUS');
  }

  if (booking.items.some((item) => item.seats?.length)) {
    const seatMap = await SeatMap.findOne({ eventId: booking.eventId?._id || booking.eventId }).lean();
    if (!seatMap) throw new AppError('The seat map for this event is no longer available', 409, 'SEAT_UNAVAILABLE');
    await finalizeBookingSeats(booking, seatMap);
    timer.mark('seats');
  }

  // Only one concurrent confirm may issue tickets; the others wait for them and return them.
  const paidAt = new Date();
  const claimed = await Booking.updateOne(
    { _id: booking._id, status: 'pending' },
    { $set: { status: 'paid', paidAt } }
  );
  timer.mark('claim');
  if (!claimed.modifiedCount) {
    for (let i = 0; i < 40; i += 1) {
      if ((await Ticket.countDocuments({ bookingId: booking._id })) >= booking.items.length) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const fresh = await Booking.findById(bookingId).populate('eventId');
    if (fresh?.status !== 'paid') throw new AppError('Booking cannot be paid', 400, 'INVALID_STATUS');
    return sendAlreadyPaid(fresh, { retryEmail: false });
  }

  booking.status = 'paid';
  booking.paidAt = paidAt;

  const eventId = booking.eventId?._id || booking.eventId;
  const tickets = await createTicketsForBooking(booking);
  timer.mark('tickets');

  await Promise.all([
    ...booking.items.map((item) =>
      TicketTier.updateOne({ _id: item.tierId }, { $inc: { sold: item.qty } })
    ),
    Event.updateOne({ _id: eventId }, { $inc: { ticketsSold: booking.ticketCount } }),
  ]);
  cacheDel('public:');
  cacheDel('analytics:');
  timer.mark('counters');

  const emailQueued = sendBookingEmailInBackground(booking, tickets);
  const formatted = await formatTicketsForClient(tickets);
  timer.mark('qr');
  timer.done(`tickets=${tickets.length} email=${emailQueued ? 'queued' : 'skipped'}`);

  res.json({
    booking,
    tickets: formatted,
    delivery: emailQueued ? 'email+download' : 'download',
    emailSent: emailQueued,
  });
});

export const paymentWebhook = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const paymentProvider = getPaymentProvider(null, provider);
  const result = await paymentProvider.verifyWebhook(req.body);

  if (result.success && req.body.bookingId) {
    req.params.bookingId = req.body.bookingId;
    return confirmPayment(req, res);
  }

  res.json({ received: true });
});

/** Orders the guest can see on My tickets: issued ones plus manual orders waiting for, or closed without, approval. */
const MY_ORDER_STATUSES = [...SOLD_BOOKING_STATUSES, 'pending_approval', 'rejected', 'expired'];

export const getMyTickets = asyncHandler(async (req, res) => {
  const filter = req.user
    ? { $or: [{ clientId: req.user._id }, { 'guest.email': req.user.email }] }
    : { 'guest.email': req.query.email };

  if (!filter.$or && !req.query.email) {
    throw new AppError('Email required', 400, 'VALIDATION_ERROR');
  }

  const bookings = await Booking.find({ ...filter, status: { $in: MY_ORDER_STATUSES } })
    .populate('eventId')
    .sort({ createdAt: -1 })
    .lean();

  const soldIds = bookings.filter((b) => SOLD_BOOKING_STATUSES.includes(b.status)).map((b) => b._id);
  const tickets = await Ticket.find({ bookingId: { $in: soldIds } }).lean();

  // The order-status link (with its secret) only goes to a signed-in owner, never to an email-only lookup.
  const out = bookings.map(({ accessKey, ...b }) => ({
    ...b,
    statusUrl: req.user ? orderStatusPath({ _id: b._id, accessKey }) : '',
  }));

  res.json({ bookings: out, tickets });
});

import { Booking } from '../models/Booking.js';
import { Event } from '../models/Event.js';
import { TicketTier } from '../models/TicketTier.js';
import { Ticket } from '../models/Ticket.js';
import { getPaymentProvider } from '../services/payments/index.js';
import { generateTicketQrDataUrl, getQrPayload } from '../services/ticketQr.js';
import { generateTicketCode } from '../utils/ticketCode.js';
import { currencyForCountry } from '../models/constants.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import QRCode from 'qrcode';
import { colorForTierName, normalizeHexColor } from '../constants/ticketTiers.js';

export const createBooking = asyncHandler(async (req, res) => {
  const { eventId, items, guest, provider, acceptedTerms } = req.body;
  if (!eventId || !items?.length || !guest?.name || !guest?.email || !guest?.phone) {
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

  const currency = currencyForCountry(event.country);
  let total = 0;
  let ticketCount = 0;
  const validatedItems = [];

  for (const item of items) {
    const tier = await TicketTier.findOne({ _id: item.tierId, eventId, isActive: true });
    if (!tier) throw new AppError('Invalid ticket tier', 400, 'INVALID_TIER');
    if (tier.sold + item.qty > tier.quantity) {
      throw new AppError(`Not enough tickets for ${tier.name}`, 400, 'SOLD_OUT');
    }
    if (item.qty > tier.maxPerOrder) {
      throw new AppError(`Max ${tier.maxPerOrder} tickets per order for ${tier.name}`, 400, 'LIMIT');
    }
    validatedItems.push({
      tierId: tier._id,
      tierName: tier.name,
      tierColor: normalizeHexColor(tier.color || colorForTierName(tier.name)),
      qty: item.qty,
      unitPrice: tier.price,
    });
    total += tier.price * item.qty;
    ticketCount += item.qty;
  }

  const booking = await Booking.create({
    clientId: req.user?._id || null,
    guest,
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
    status: 'pending',
    paymentProvider: provider || 'mock',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  const paymentProvider = getPaymentProvider(event.country, provider);
  const returnUrl = `${env.clientUrl}/booking/${booking._id}/confirmation`;
  const payment = await paymentProvider.createPayment({ booking, returnUrl });

  booking.paymentRef = payment.paymentRef;
  await booking.save();

  res.status(201).json({ booking, paymentUrl: payment.paymentUrl });
});

export const confirmPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const booking = await Booking.findById(bookingId).populate('eventId');
  if (!booking) throw new AppError('Booking not found', 404, 'NOT_FOUND');

  const formatTickets = async (ticketDocs) => {
    const out = [];
    for (const t of ticketDocs) {
      const qrDataUrl = t.qrPayload
        ? await QRCode.toDataURL(t.qrPayload, { margin: 1, width: 300 })
        : await generateTicketQrDataUrl(t._id, booking._id, t.eventId);
      out.push({
        id: t._id,
        code: t.code,
        status: t.status,
        tierName: t.tierName,
        tierColor: t.tierColor,
        eventTitle: t.eventTitle,
        holderName: t.holderName,
        qrDataUrl,
      });
    }
    return out;
  };

  if (booking.status === 'paid') {
    const existing = await Ticket.find({ bookingId });
    return res.json({
      booking,
      tickets: await formatTickets(existing),
      alreadyPaid: true,
      delivery: 'download',
    });
  }

  if (booking.status !== 'pending') {
    throw new AppError('Booking cannot be paid', 400, 'INVALID_STATUS');
  }

  booking.status = 'paid';
  booking.paidAt = new Date();
  await booking.save();

  const eventDoc = booking.eventId;
  const eventId = eventDoc._id || eventDoc;
  const eventTitle = eventDoc.title || booking.eventSnapshot?.title || 'FUSE Event';

  const tickets = [];

  for (const item of booking.items) {
    for (let i = 0; i < item.qty; i++) {
      const ticket = await Ticket.create({
        bookingId: booking._id,
        eventId,
        tierId: item.tierId,
        code: generateTicketCode(),
        qrPayload: `pending_${booking._id}_${Date.now()}_${i}`,
        holderName: booking.guest.name,
        holderEmail: booking.guest.email,
        holderPhone: booking.guest.phone,
        tierName: item.tierName,
        tierColor: normalizeHexColor(item.tierColor || colorForTierName(item.tierName)),
        eventTitle,
      });

      const qrPayload = getQrPayload(ticket._id, booking._id, eventId);
      ticket.qrPayload = qrPayload;
      await ticket.save();
      tickets.push(ticket);
    }

    await TicketTier.findByIdAndUpdate(item.tierId, { $inc: { sold: item.qty } });
  }

  await Event.findByIdAndUpdate(eventId, { $inc: { ticketsSold: booking.ticketCount } });
  await booking.save();

  // Email / WhatsApp disabled until providers are connected — tickets are downloadable in the UI
  res.json({
    booking,
    tickets: await formatTickets(tickets),
    delivery: 'download',
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

export const getMyTickets = asyncHandler(async (req, res) => {
  const filter = req.user
    ? { $or: [{ clientId: req.user._id }, { 'guest.email': req.user.email }] }
    : { 'guest.email': req.query.email };

  if (!filter.$or && !req.query.email) {
    throw new AppError('Email required', 400, 'VALIDATION_ERROR');
  }

  const bookings = await Booking.find({ ...filter, status: 'paid' })
    .populate('eventId')
    .sort({ createdAt: -1 })
    .lean();

  const tickets = await Ticket.find({
    bookingId: { $in: bookings.map((b) => b._id) },
  }).lean();

  res.json({ bookings, tickets });
});

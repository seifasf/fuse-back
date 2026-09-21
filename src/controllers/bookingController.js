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
import { cacheDel } from '../utils/memoryCache.js';
import { sendTicketsEmail, isEmailConfigured } from '../services/email/index.js';

export const createBooking = asyncHandler(async (req, res) => {
  const { eventId, items, guest, provider, acceptedTerms } = req.body;
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

  for (const item of items) {
    const tier = await TicketTier.findOne({ _id: item.tierId, eventId, isActive: true });
    if (!tier) throw new AppError('Invalid ticket tier', 400, 'INVALID_TIER');
    const qty = Math.max(0, Number(item.qty) || 0);
    if (qty < 1) throw new AppError('Invalid ticket quantity', 400, 'VALIDATION_ERROR');
    if (tier.sold + qty > tier.quantity) {
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

    validatedItems.push({
      tierId: tier._id,
      tierName: tier.name,
      tierColor: normalizeHexColor(tier.color || colorForTierName(tier.name)),
      qty,
      unitPrice: tier.price,
      members,
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

  const booking = await Booking.create({
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
    status: 'pending',
    paymentProvider: provider || 'mock',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

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

  res.status(201).json({ booking, paymentUrl });
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
      const members =
        Array.isArray(t.members) && t.members.length
          ? t.members.map((m) => ({ name: m.name, phone: m.phone }))
          : [{ name: t.holderName, phone: t.holderPhone || '' }];
      out.push({
        id: t._id,
        code: t.code,
        status: t.status,
        tierName: t.tierName,
        tierColor: t.tierColor,
        eventTitle: t.eventTitle,
        holderName: t.holderName,
        admitCount: t.admitCount || members.length || 1,
        members,
        qrDataUrl,
      });
    }
    return out;
  };

  if (booking.status === 'paid') {
    const existing = await Ticket.find({ bookingId });
    const formatted = await formatTickets(existing);

    // Retry email if it never went out (e.g. Brevo was added later)
    let emailSent = Boolean(booking.emailSentAt);
    if (!emailSent && isEmailConfigured() && existing.length) {
      const eventDoc = booking.eventId;
      const mail = await sendTicketsEmail({
        toEmail: booking.guest.email,
        toName: booking.guest.name,
        eventTitle: existing[0]?.eventTitle || eventDoc?.title || booking.eventSnapshot?.title,
        venue: eventDoc?.venue || booking.eventSnapshot?.venue,
        startsAt: eventDoc?.startsAt || booking.eventSnapshot?.startsAt,
        tickets: existing,
        complimentary: booking.paymentProvider === 'manual',
      });
      if (mail.sent) {
        booking.emailSentAt = new Date();
        await booking.save();
        emailSent = true;
      }
    }

    return res.json({
      booking,
      tickets: formatted,
      alreadyPaid: true,
      delivery: emailSent ? 'email+download' : 'download',
      emailSent,
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
    const members =
      Array.isArray(item.members) && item.members.length === item.qty
        ? item.members.map((m) => ({
            name: String(m.name || '').trim(),
            phone: String(m.phone || '').trim(),
          }))
        : Array.from({ length: item.qty }, () => ({
            name: booking.guest.name,
            phone: booking.guest.phone || '',
          }));

    const holderName = members.map((m) => m.name).filter(Boolean).join(', ') || booking.guest.name;
    const holderPhone = members[0]?.phone || booking.guest.phone || '';

    const ticket = await Ticket.create({
      bookingId: booking._id,
      eventId,
      tierId: item.tierId,
      code: generateTicketCode(),
      qrPayload: `pending_${booking._id}_${Date.now()}_${item.tierId}`,
      holderName: holderName.slice(0, 120),
      holderEmail: booking.guest.email,
      holderPhone: holderPhone.slice(0, 32),
      members,
      admitCount: item.qty,
      tierName: item.tierName,
      tierColor: normalizeHexColor(item.tierColor || colorForTierName(item.tierName)),
      eventTitle,
    });

    const qrPayload = getQrPayload(ticket._id, booking._id, eventId);
    ticket.qrPayload = qrPayload;
    await ticket.save();
    tickets.push(ticket);

    await TicketTier.findByIdAndUpdate(item.tierId, { $inc: { sold: item.qty } });
  }

  await Event.findByIdAndUpdate(eventId, { $inc: { ticketsSold: booking.ticketCount } });
  await booking.save();
  cacheDel('public:');
  cacheDel('analytics:');

  let emailSent = false;
  const mail = await sendTicketsEmail({
    toEmail: booking.guest.email,
    toName: booking.guest.name,
    eventTitle,
    venue: eventDoc?.venue || booking.eventSnapshot?.venue,
    startsAt: eventDoc?.startsAt || booking.eventSnapshot?.startsAt,
    tickets,
    complimentary: false,
  });
  if (mail.sent) {
    booking.emailSentAt = new Date();
    await booking.save();
    emailSent = true;
  } else if (mail.mock) {
    console.log('[email] Booking confirmed — Brevo not configured yet (mock).');
  }

  res.json({
    booking,
    tickets: await formatTickets(tickets),
    delivery: emailSent ? 'email+download' : 'download',
    emailSent,
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

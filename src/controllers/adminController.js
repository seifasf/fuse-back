import { Booking } from '../models/Booking.js';
import { Event } from '../models/Event.js';
import { TicketTier } from '../models/TicketTier.js';
import { Character } from '../models/Character.js';
import { Ticket } from '../models/Ticket.js';
import { User } from '../models/User.js';
import { SiteContent } from '../models/SiteContent.js';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../constants/terms.js';
import { colorForTierName, normalizeHexColor } from '../constants/ticketTiers.js';
import { slugify } from '../utils/slugify.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import bcrypt from 'bcryptjs';
import { generateTicketCode } from '../utils/ticketCode.js';
import { generateTicketQrDataUrl, getQrPayload } from '../services/ticketQr.js';
import { sendTicketEmail } from '../services/email.js';
import { sendTicketWhatsApp } from '../services/whatsapp.js';

/* ??? Events ??????????????????????????????????????????????? */

export const adminListEvents = asyncHandler(async (req, res) => {
  const events = await Event.find({ deletedAt: null }).sort({ startsAt: -1 }).lean();
  res.json({ events });
});

function sanitizeEventBody(body = {}) {
  const data = { ...body };
  // datetime-local empty strings must not be cast as Date
  for (const key of ['startsAt', 'endsAt']) {
    if (data[key] === '' || data[key] === null) {
      if (key === 'endsAt') delete data[key];
      else data[key] = undefined;
    }
  }
  if (typeof data.title === 'string') data.title = data.title.trim();
  if (typeof data.venue === 'string') data.venue = data.venue.trim();
  if (typeof data.city === 'string') data.city = data.city.trim();
  if (typeof data.description === 'string') data.description = data.description.trim();
  if (typeof data.capacity === 'string' && data.capacity !== '') {
    data.capacity = Number(data.capacity);
  }
  return data;
}

async function uniqueEventSlug(title, excludeId = null) {
  const base = slugify(title) || 'event';
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await Event.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
    if (!existing) return candidate;
    candidate = `${base}-${n++}`;
  }
}

export const adminCreateEvent = asyncHandler(async (req, res) => {
  const data = sanitizeEventBody(req.body);
  if (!data.title) throw new AppError('Event title is required', 400, 'VALIDATION_ERROR');
  if (!data.venue) throw new AppError('Venue is required', 400, 'VALIDATION_ERROR');
  if (!data.startsAt) throw new AppError('Start date/time is required', 400, 'VALIDATION_ERROR');
  if (!data.country) throw new AppError('Country is required', 400, 'VALIDATION_ERROR');

  data.slug = await uniqueEventSlug(data.title);
  if (!data.coverImage && data.images?.[0]) data.coverImage = data.images[0];
  if (!data.timezone) {
    data.timezone = data.country === 'KW' ? 'Asia/Kuwait' : 'Africa/Cairo';
  }
  data.deletedAt = null;

  try {
    const event = await Event.create(data);
    res.status(201).json({ event });
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError('An event with this name already exists', 409, 'CONFLICT');
    }
    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      throw new AppError(err.message, 400, 'VALIDATION_ERROR');
    }
    throw err;
  }
});

export const adminUpdateEvent = asyncHandler(async (req, res) => {
  const data = sanitizeEventBody(req.body);
  if (data.title && !data.slug) {
    data.slug = await uniqueEventSlug(data.title, req.params.id);
  }

  try {
    const event = await Event.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND');
    res.json({ event });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err?.code === 11000) {
      throw new AppError('An event with this name already exists', 409, 'CONFLICT');
    }
    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      throw new AppError(err.message, 400, 'VALIDATION_ERROR');
    }
    throw err;
  }
});

export const adminDeleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findByIdAndUpdate(
    req.params.id,
    { deletedAt: new Date(), status: 'cancelled', featured: false },
    { new: true }
  );
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND');
  res.json({ deleted: true, soft: true });
});

/* ??? Ticket Tiers ?????????????????????????????????????????? */

export const adminListTiers = asyncHandler(async (req, res) => {
  const tiers = await TicketTier.find({ eventId: req.params.eventId }).lean();
  res.json({ tiers });
});

export const adminCreateTier = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const color = normalizeHexColor(req.body.color || colorForTierName(name));
  const tier = await TicketTier.create({
    ...req.body,
    name,
    color,
    eventId: req.params.eventId,
  });
  res.status(201).json({ tier });
});

export const adminUpdateTier = asyncHandler(async (req, res) => {
  const data = { ...req.body };
  if (data.name) data.name = String(data.name).trim();
  if (data.color || data.name) {
    data.color = normalizeHexColor(data.color || colorForTierName(data.name));
  }
  const tier = await TicketTier.findByIdAndUpdate(req.params.tierId, data, { new: true });
  res.json({ tier });
});

export const adminDeleteTier = asyncHandler(async (req, res) => {
  await TicketTier.findByIdAndDelete(req.params.tierId);
  res.json({ deleted: true });
});

/* ??? Characters ???????????????????????????????????????????? */

async function uniqueCharacterSlug(name, excludeId = null) {
  const base = slugify(name) || 'artist';
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await Character.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id');
    if (!existing) return candidate;
    candidate = `${base}-${n++}`;
  }
}

function sanitizeCharacterBody(body = {}) {
  const data = { ...body };
  if (!data.country) delete data.country;
  if (Array.isArray(data.tags)) {
    data.tags = data.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 20);
  }
  if (typeof data.name === 'string') data.name = data.name.trim();
  if (typeof data.bio === 'string') data.bio = data.bio.trim();
  if (typeof data.image === 'string') data.image = data.image.trim();
  return data;
}

export const adminListCharacters = asyncHandler(async (req, res) => {
  const characters = await Character.find({ deletedAt: null }).sort({ name: 1 }).lean();
  res.json({ characters });
});

export const adminCreateCharacter = asyncHandler(async (req, res) => {
  const data = sanitizeCharacterBody(req.body);
  if (!data.name) throw new AppError('Artist name is required', 400, 'VALIDATION_ERROR');

  data.slug = await uniqueCharacterSlug(data.name);
  data.deletedAt = null;

  try {
    const character = await Character.create(data);
    res.status(201).json({ character });
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError('An artist with this name already exists', 409, 'CONFLICT');
    }
    if (err?.name === 'ValidationError') {
      throw new AppError(err.message, 400, 'VALIDATION_ERROR');
    }
    throw err;
  }
});

export const adminUpdateCharacter = asyncHandler(async (req, res) => {
  const data = sanitizeCharacterBody(req.body);
  if (data.name && !data.slug) {
    data.slug = await uniqueCharacterSlug(data.name, req.params.id);
  }

  try {
    const character = await Character.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!character) throw new AppError('Artist not found', 404, 'NOT_FOUND');
    res.json({ character });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err?.code === 11000) {
      throw new AppError('An artist with this name already exists', 409, 'CONFLICT');
    }
    if (err?.name === 'ValidationError') {
      throw new AppError(err.message, 400, 'VALIDATION_ERROR');
    }
    throw err;
  }
});

export const adminDeleteCharacter = asyncHandler(async (req, res) => {
  await Character.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), featured: false });
  res.json({ deleted: true, soft: true });
});

/* ??? Bookings ?????????????????????????????????????????????? */

export const adminListBookings = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { 'guest.name': { $regex: search, $options: 'i' } },
      { 'guest.email': { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('eventId', 'title country')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Booking.countDocuments(filter),
  ]);

  res.json({ bookings, total, page: Number(page), limit: Number(limit) });
});

export const adminCancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findByIdAndUpdate(
    req.params.id,
    { status: 'cancelled', cancelledAt: new Date() },
    { new: true }
  );
  if (!booking) throw new AppError('Booking not found', 404, 'NOT_FOUND');
  await Ticket.updateMany(
    { bookingId: booking._id, status: { $ne: 'used' } },
    { status: 'cancelled' }
  );
  res.json({ booking });
});

export const adminGetBookingTickets = asyncHandler(async (req, res) => {
  const tickets = await Ticket.find({ bookingId: req.params.id }).lean();
  res.json({ tickets });
});

/* ??? Gate Agents ??????????????????????????????????????????? */

export const adminListAgents = asyncHandler(async (req, res) => {
  const agents = await User.find({ role: 'gate_agent' })
    .select('-passwordHash')
    .populate('assignedEventIds', 'title')
    .lean();
  res.json({ agents });
});

export const adminCreateAgent = asyncHandler(async (req, res) => {
  const { name, email, password, assignedEventIds } = req.body;
  if (!name || !email || !password) {
    throw new AppError('Name, email, and password required', 400, 'VALIDATION_ERROR');
  }
  const passwordHash = await bcrypt.hash(password, 8);
  const agent = await User.create({
    name,
    email,
    passwordHash,
    role: 'gate_agent',
    assignedEventIds: assignedEventIds || [],
  });
  res.status(201).json({ agent: { id: agent._id, name, email, assignedEventIds } });
});

export const adminUpdateAgent = asyncHandler(async (req, res) => {
  const { name, assignedEventIds } = req.body;
  const update = {};
  if (name) update.name = name;
  if (assignedEventIds !== undefined) update.assignedEventIds = assignedEventIds;
  const agent = await User.findByIdAndUpdate(req.params.id, update, { new: true })
    .select('-passwordHash')
    .lean();
  res.json({ agent });
});

export const adminDeleteAgent = asyncHandler(async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

/* ??? Site Content ?????????????????????????????????????????? */

export const adminGetContent = asyncHandler(async (req, res) => {
  let content = await SiteContent.findOne({ key: 'home' });
  if (content && !content.termsAndConditions?.trim()) {
    content.termsAndConditions = DEFAULT_TERMS_AND_CONDITIONS;
  }
  res.json({
    content: content
      ? content
      : { key: 'home', termsAndConditions: DEFAULT_TERMS_AND_CONDITIONS },
  });
});

export const adminUpdateContent = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  delete payload._id;
  delete payload.__v;
  delete payload.createdAt;
  delete payload.updatedAt;
  payload.key = 'home';

  const content = await SiteContent.findOneAndUpdate(
    { key: 'home' },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json({ content });
});

/* ??? Sections ?????????????????????????????????????????????? */

export const adminGetSections = asyncHandler(async (req, res) => {
  let content = await SiteContent.findOne({ key: 'home' });
  if (!content) {
    content = await SiteContent.create({ key: 'home', sections: defaultSections() });
  } else if (!content.sections || content.sections.length === 0) {
    content.sections = defaultSections();
    await content.save();
  }
  res.json({ sections: content.sections });
});

export const adminUpdateSections = asyncHandler(async (req, res) => {
  const { sections } = req.body;
  const content = await SiteContent.findOneAndUpdate(
    { key: 'home' },
    { $set: { sections, key: 'home' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json({ sections: content.sections });
});

export const adminAddSection = asyncHandler(async (req, res) => {
  const { type, label, config } = req.body;
  const content = await SiteContent.findOne({ key: 'home' });
  const maxOrder = content?.sections?.length ? Math.max(...content.sections.map((s) => s.order)) : 0;
  const newSection = {
    id: `${type}_${Date.now()}`,
    type,
    label: label || type.replace('_', ' '),
    visible: true,
    order: maxOrder + 1,
    config: config || {},
  };
  const updated = await SiteContent.findOneAndUpdate(
    { key: 'home' },
    { $push: { sections: newSection } },
    { upsert: true, new: true }
  );
  res.status(201).json({ section: newSection, sections: updated.sections });
});

export const adminUpdateSection = asyncHandler(async (req, res) => {
  const { sectionId } = req.params;
  const updated = await SiteContent.findOneAndUpdate(
    { key: 'home', 'sections.id': sectionId },
    {
      $set: Object.fromEntries(
        Object.entries(req.body).map(([k, v]) => [`sections.$.${k}`, v])
      ),
    },
    { new: true }
  );
  res.json({ sections: updated?.sections });
});

export const adminDeleteSection = asyncHandler(async (req, res) => {
  const { sectionId } = req.params;
  await SiteContent.findOneAndUpdate(
    { key: 'home' },
    { $pull: { sections: { id: sectionId } } }
  );
  res.json({ deleted: true });
});

/* ??? Banners ??????????????????????????????????????????????? */

export const adminAddBanner = asyncHandler(async (req, res) => {
  const updated = await SiteContent.findOneAndUpdate(
    { key: 'home' },
    { $push: { banners: req.body } },
    { upsert: true, new: true }
  );
  res.status(201).json({ banners: updated.banners });
});

export const adminDeleteBanner = asyncHandler(async (req, res) => {
  const updated = await SiteContent.findOneAndUpdate(
    { key: 'home' },
    { $pull: { banners: { _id: req.params.bannerId } } },
    { new: true }
  );
  res.json({ banners: updated.banners });
});

/* ??? Clients & manual tickets ????????????????????????????? */

export const adminListClients = asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 30 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const matchPaid = { status: 'paid' };
  const pipeline = [
    { $match: matchPaid },
    {
      $group: {
        _id: { $toLower: '$guest.email' },
        name: { $last: '$guest.name' },
        email: { $last: '$guest.email' },
        phone: { $last: '$guest.phone' },
        bookings: { $sum: 1 },
        tickets: { $sum: '$ticketCount' },
        spent: { $sum: '$total' },
        currencies: { $addToSet: '$currency' },
        lastBookingAt: { $max: '$createdAt' },
        firstBookingAt: { $min: '$createdAt' },
      },
    },
    { $sort: { lastBookingAt: -1 } },
  ];

  if (search) {
    const q = String(search).trim();
    pipeline.push({
      $match: {
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { phone: { $regex: q, $options: 'i' } },
        ],
      },
    });
  }

  const [facet] = await Booking.aggregate([
    ...pipeline,
    {
      $facet: {
        clients: [{ $skip: skip }, { $limit: Number(limit) }],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  res.json({
    clients: facet.clients.map((c) => ({
      id: c._id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      bookings: c.bookings,
      tickets: c.tickets,
      spent: c.spent,
      currencies: c.currencies,
      lastBookingAt: c.lastBookingAt,
      firstBookingAt: c.firstBookingAt,
    })),
    total: facet.total[0]?.count || 0,
    page: Number(page),
    limit: Number(limit),
  });
});

export const adminIssueManualTicket = asyncHandler(async (req, res) => {
  const { eventId, tierId, qty = 1, guest, sendEmail = false, sendWhatsApp = false, note = '' } = req.body;

  if (!eventId || !tierId || !guest?.name || !guest?.email || !guest?.phone) {
    throw new AppError('Event, tier, and guest name/email/phone are required', 400, 'VALIDATION_ERROR');
  }

  const quantity = Math.min(Math.max(Number(qty) || 1, 1), 20);
  const event = await Event.findOne({ _id: eventId, deletedAt: null });
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND');

  const tier = await TicketTier.findOne({ _id: tierId, eventId, isActive: true });
  if (!tier) throw new AppError('Invalid ticket tier', 400, 'INVALID_TIER');
  if (tier.sold + quantity > tier.quantity) {
    throw new AppError(`Not enough tickets for ${tier.name}`, 400, 'SOLD_OUT');
  }

  const currency = event.country === 'KW' ? 'KWD' : 'EGP';
  const booking = await Booking.create({
    guest: {
      name: String(guest.name).trim(),
      email: String(guest.email).trim().toLowerCase(),
      phone: String(guest.phone).trim(),
    },
    eventId,
    eventSnapshot: {
      title: event.title,
      country: event.country,
      startsAt: event.startsAt,
      venue: event.venue,
    },
    items: [
      {
        tierId: tier._id,
        tierName: tier.name,
        tierColor: normalizeHexColor(tier.color || colorForTierName(tier.name)),
        qty: quantity,
        unitPrice: 0,
      },
    ],
    ticketCount: quantity,
    total: 0,
    currency,
    status: 'paid',
    paymentProvider: 'manual',
    paymentRef: note ? `manual:${String(note).slice(0, 120)}` : 'manual',
    paidAt: new Date(),
  });

  const tickets = [];
  const qrDataUrls = [];

  for (let i = 0; i < quantity; i++) {
    const ticket = await Ticket.create({
      bookingId: booking._id,
      eventId: event._id,
      tierId: tier._id,
      code: generateTicketCode(),
      qrPayload: `pending_${booking._id}_${Date.now()}_${i}`,
      holderName: booking.guest.name,
      holderEmail: booking.guest.email,
      holderPhone: booking.guest.phone,
      tierName: tier.name,
      tierColor: normalizeHexColor(tier.color || colorForTierName(tier.name)),
      eventTitle: event.title,
    });

    const qrPayload = getQrPayload(ticket._id, booking._id, event._id);
    ticket.qrPayload = qrPayload;
    await ticket.save();

    const qrDataUrl = await generateTicketQrDataUrl(ticket._id, booking._id, event._id);
    tickets.push(ticket);
    qrDataUrls.push({ ticketId: ticket._id, code: ticket.code, qrDataUrl });
  }

  await TicketTier.findByIdAndUpdate(tier._id, { $inc: { sold: quantity } });
  await Event.findByIdAndUpdate(event._id, { $inc: { ticketsSold: quantity } });

  // Optional delivery — off by default until SMTP / WhatsApp are connected
  if (sendEmail) {
    try {
      await sendTicketEmail({
        to: booking.guest.email,
        name: booking.guest.name,
        eventTitle: event.title,
        tickets: qrDataUrls,
      });
      booking.emailSentAt = new Date();
    } catch (err) {
      console.error('Manual ticket email failed:', err.message);
    }
  }

  if (sendWhatsApp) {
    try {
      await sendTicketWhatsApp({
        phone: booking.guest.phone,
        name: booking.guest.name,
        eventTitle: event.title,
        ticketCount: tickets.length,
      });
      booking.whatsappSentAt = new Date();
    } catch (err) {
      console.error('Manual ticket WhatsApp failed:', err.message);
    }
  }

  await booking.save();

  res.status(201).json({
    booking,
    tickets: tickets.map((t, i) => ({
      id: t._id,
      code: t.code,
      status: t.status,
      tierName: t.tierName,
      tierColor: t.tierColor,
      eventTitle: t.eventTitle,
      qrDataUrl: qrDataUrls[i].qrDataUrl,
    })),
    emailSent: Boolean(booking.emailSentAt),
    whatsappSent: Boolean(booking.whatsappSentAt),
    delivery: 'download',
  });
});

/** Door ops: events with guest / check-in counts */
export const adminDoorEvents = asyncHandler(async (req, res) => {
  const events = await Event.find({ deletedAt: null }).sort({ startsAt: -1 }).lean();
  const stats = await Ticket.aggregate([
    {
      $group: {
        _id: '$eventId',
        totalGuests: { $sum: 1 },
        joined: { $sum: { $cond: [{ $eq: ['$status', 'used'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'valid'] }, 1, 0] } },
      },
    },
  ]);
  const byEvent = Object.fromEntries(stats.map((s) => [String(s._id), s]));

  res.json({
    events: events.map((e) => {
      const s = byEvent[String(e._id)] || { totalGuests: 0, joined: 0, pending: 0 };
      return {
        ...e,
        totalGuests: s.totalGuests,
        joinedCount: s.joined,
        pendingCount: s.pending,
        joinRate: s.totalGuests ? Math.round((s.joined / s.totalGuests) * 100) : 0,
      };
    }),
  });
});

/** Door ops: people coming to one event + joined status */
export const adminDoorEventGuests = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { q = '', status = 'all' } = req.query;

  const event = await Event.findOne({ _id: eventId, deletedAt: null }).lean();
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND');

  const filter = { eventId };
  if (status === 'joined') filter.status = 'used';
  else if (status === 'pending') filter.status = 'valid';
  else if (status === 'cancelled') filter.status = { $in: ['cancelled', 'refunded'] };

  if (q && String(q).trim()) {
    const term = String(q).trim();
    filter.$or = [
      { holderName: { $regex: term, $options: 'i' } },
      { holderEmail: { $regex: term, $options: 'i' } },
      { holderPhone: { $regex: term, $options: 'i' } },
      { code: { $regex: term, $options: 'i' } },
      { tierName: { $regex: term, $options: 'i' } },
    ];
  }

  const [guests, total, joined, pending] = await Promise.all([
    Ticket.find(filter)
      .sort({ scannedAt: -1, createdAt: -1 })
      .limit(500)
      .lean(),
    Ticket.countDocuments({ eventId }),
    Ticket.countDocuments({ eventId, status: 'used' }),
    Ticket.countDocuments({ eventId, status: 'valid' }),
  ]);

  res.json({
    event,
    summary: {
      total,
      joined,
      pending,
      joinRate: total ? Math.round((joined / total) * 100) : 0,
    },
    guests: guests.map((g) => ({
      id: g._id,
      name: g.holderName,
      email: g.holderEmail,
      phone: g.holderPhone,
      code: g.code,
      tierName: g.tierName,
      status: g.status,
      joined: g.status === 'used',
      scannedAt: g.scannedAt || null,
      createdAt: g.createdAt,
    })),
  });
});

/* ??? Defaults ?????????????????????????????????????????????? */

function defaultSections() {
  return [
    { id: 'hero', type: 'hero', label: 'Hero Banner', visible: true, order: 0, config: {} },
    { id: 'stats', type: 'stats', label: 'Live Stats Bar', visible: true, order: 1, config: {} },
    { id: 'upcoming_events', type: 'upcoming_events', label: 'Upcoming Events', visible: true, order: 2, config: {} },
    { id: 'characters', type: 'characters', label: 'Top Characters / Artists', visible: true, order: 3, config: {} },
    { id: 'past_events', type: 'past_events', label: 'Past Nights Gallery', visible: true, order: 4, config: {} },
    { id: 'about', type: 'about', label: 'About FUSE Story', visible: true, order: 5, config: {} },
    { id: 'contact', type: 'contact', label: 'Contact & Support', visible: true, order: 6, config: {} },
    { id: 'cta', type: 'cta', label: 'Call to Action Band', visible: true, order: 7, config: {} },
  ];
}

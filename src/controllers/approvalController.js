import mongoose from 'mongoose';
import { Booking } from '../models/Booking.js';
import { Event } from '../models/Event.js';
import { Ticket } from '../models/Ticket.js';
import { SeatMap } from '../models/SeatMap.js';
import { SOLD_BOOKING_STATUSES } from '../models/constants.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { cacheDel } from '../utils/memoryCache.js';
import { env } from '../config/env.js';
import { finalizeBookingSeats, releaseBookingSeats } from '../services/seatMapService.js';
import {
  createTicketsForBooking,
  formatTicketsForClient,
  isBookingEmailInFlight,
  sendBookingEmailInBackground,
} from '../services/bookingTickets.js';
import {
  accessKeyMatches,
  closePendingOrder,
  convertReservedToSold,
  expireStaleApprovals,
} from '../services/approvalService.js';

function assertObjectId(id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Order not found', 404, 'NOT_FOUND');
}

function eventOf(booking) {
  const e = booking.eventId && typeof booking.eventId === 'object' && booking.eventId.title ? booking.eventId : null;
  return {
    id: e?._id || booking.eventId,
    title: e?.title || booking.eventSnapshot?.title || 'FUSE Event',
    slug: e?.slug || '',
    startsAt: e?.startsAt || booking.eventSnapshot?.startsAt,
    venue: e?.venue || booking.eventSnapshot?.venue || '',
    city: e?.city || '',
    country: e?.country || booking.eventSnapshot?.country || '',
    coverImage: e?.coverImage || '',
  };
}

function itemsOf(booking) {
  return (booking.items || []).map((i) => ({
    tierId: i.tierId,
    tierName: i.tierName,
    tierColor: i.tierColor,
    qty: i.qty,
    unitPrice: i.unitPrice,
    seats: i.seats || [],
    members: (i.members || []).map((m) => ({ name: m.name, phone: m.phone })),
  }));
}

/** What the guest's order page shows - no internal ids beyond the order itself. */
function guestOrderView(booking) {
  return {
    _id: booking._id,
    status: booking.status,
    guest: { name: booking.guest?.name, email: booking.guest?.email, phone: booking.guest?.phone },
    event: eventOf(booking),
    items: itemsOf(booking),
    ticketCount: booking.ticketCount,
    total: booking.total,
    currency: booking.currency,
    createdAt: booking.createdAt,
    expiresAt: booking.status === 'pending_approval' ? booking.expiresAt : undefined,
    approvedAt: booking.approvedAt || (booking.status === 'paid' ? booking.paidAt : undefined),
    rejectedAt: booking.rejectedAt,
    rejectionReason: booking.status === 'rejected' ? booking.rejectionReason || '' : '',
    emailSent: Boolean(booking.emailSentAt) || isBookingEmailInFlight(booking._id),
  };
}

function adminOrderView(booking) {
  return {
    ...guestOrderView(booking),
    guest: booking.guest,
    accessKey: booking.accessKey || '',
    expiresAt: booking.expiresAt,
    paymentProvider: booking.paymentProvider,
    approvedAt: booking.approvedAt,
    rejectionReason: booking.rejectionReason || '',
    cancelledAt: booking.cancelledAt,
    expiredAt: booking.expiredAt,
  };
}

/**
 * GET /bookings/:bookingId/status?key=  -  the guest's order page. Open with the secret key from the
 * order link, or signed in as the owner / an admin. Tickets are included once the order is approved.
 */
export const getOrderStatus = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  assertObjectId(bookingId);
  let booking = await Booking.findById(bookingId).populate('eventId', 'title slug startsAt venue city coverImage');
  const isOwner =
    req.user && (req.user.role === 'admin' || (booking?.clientId && String(booking.clientId) === String(req.user._id)));
  if (!booking || (!isOwner && !accessKeyMatches(booking, req.query.key))) {
    throw new AppError('Order not found', 404, 'NOT_FOUND');
  }

  if (booking.status === 'pending_approval' && booking.expiresAt && booking.expiresAt <= new Date()) {
    await closePendingOrder(booking._id, 'expired', { expiredAt: new Date() });
    booking = await Booking.findById(bookingId).populate('eventId', 'title slug startsAt venue city coverImage');
  }

  const sold = SOLD_BOOKING_STATUSES.includes(booking.status);
  const tickets = sold ? await formatTicketsForClient(await Ticket.find({ bookingId: booking._id })) : [];

  res.set('Cache-Control', 'no-store');
  res.json({
    order: guestOrderView(booking),
    tickets,
    paymentMode: env.paymentMode,
  });
});

const TAB_FILTERS = {
  pending: { status: 'pending_approval' },
  approved: { status: 'approved' },
  closed: { status: { $in: ['rejected', 'expired'] } },
};

/** GET /admin/approvals?tab=pending|approved|closed&eventId=&search=&page=&limit= */
export const adminListApprovals = asyncHandler(async (req, res) => {
  await expireStaleApprovals();
  const tab = TAB_FILTERS[req.query.tab] ? req.query.tab : 'pending';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

  const scope = {};
  if (req.query.eventId && mongoose.isValidObjectId(String(req.query.eventId))) {
    scope.eventId = new mongoose.Types.ObjectId(String(req.query.eventId));
  }
  const search = String(req.query.search || '').trim().slice(0, 80);
  if (search) {
    const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    scope.$or = [{ 'guest.name': rx }, { 'guest.email': rx }, { 'guest.phone': rx }, { 'items.members.phone': rx }];
  }

  const filter = { ...scope, ...TAB_FILTERS[tab] };
  const sort =
    tab === 'pending' ? { createdAt: 1 } : tab === 'approved' ? { approvedAt: -1, createdAt: -1 } : { updatedAt: -1 };

  const [orders, total, pending, approved, closed] = await Promise.all([
    Booking.find(filter)
      .populate('eventId', 'title slug startsAt venue city')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Booking.countDocuments(filter),
    Booking.countDocuments({ ...scope, ...TAB_FILTERS.pending }),
    Booking.countDocuments({ ...scope, ...TAB_FILTERS.approved }),
    Booking.countDocuments({ ...scope, ...TAB_FILTERS.closed }),
  ]);

  res.json({
    orders: orders.map(adminOrderView),
    total,
    page,
    limit,
    counts: { pending, approved, closed },
  });
});

/** GET /admin/approvals/:id/tickets  -  issued tickets with QR images, for the admin PDF download. */
export const adminGetOrderTickets = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const booking = await Booking.findById(req.params.id).populate('eventId', 'title slug startsAt venue city');
  if (!booking) throw new AppError('Order not found', 404, 'NOT_FOUND');
  const tickets = await formatTicketsForClient(await Ticket.find({ bookingId: booking._id }));
  res.json({ order: adminOrderView(booking), tickets });
});

async function waitForTickets(booking) {
  for (let i = 0; i < 40; i += 1) {
    if ((await Ticket.countDocuments({ bookingId: booking._id })) >= booking.items.length) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function alreadyApprovedResponse(res, bookingId) {
  const booking = await Booking.findById(bookingId).populate('eventId', 'title slug startsAt venue city');
  const tickets = await formatTicketsForClient(await Ticket.find({ bookingId }));
  return res.json({
    order: adminOrderView(booking),
    tickets,
    alreadyApproved: true,
    emailSent: Boolean(booking.emailSentAt) || isBookingEmailInFlight(bookingId),
  });
}

/**
 * POST /admin/approvals/:id/approve  -  race-safe: the order must still be pending and not expired,
 * every seat is re-checked and marked sold, and only the request that wins the status claim issues
 * tickets and sends the email. Repeated or concurrent approvals return the same tickets.
 */
export const adminApproveOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  assertObjectId(id);
  const booking = await Booking.findById(id).populate('eventId');
  if (!booking) throw new AppError('Order not found', 404, 'NOT_FOUND');

  if (booking.status === 'approved') {
    await waitForTickets(booking);
    return alreadyApprovedResponse(res, booking._id);
  }
  if (booking.status !== 'pending_approval') {
    throw new AppError(`This order is already ${booking.status.replace('_', ' ')}`, 409, 'NOT_PENDING', {
      status: booking.status,
    });
  }
  if (booking.expiresAt && booking.expiresAt <= new Date()) {
    await closePendingOrder(booking._id, 'expired', { expiredAt: new Date() });
    throw new AppError('This order expired and its seats were released', 409, 'ORDER_EXPIRED', { status: 'expired' });
  }

  const seated = booking.items.some((item) => item.seats?.length);
  if (seated) {
    const eventId = booking.eventId?._id || booking.eventId;
    const seatMap = await SeatMap.findOne({ eventId }).lean();
    if (!seatMap) throw new AppError('The seat map for this event is no longer available', 409, 'SEAT_UNAVAILABLE');
    try {
      await finalizeBookingSeats(booking, seatMap, { holdUntil: booking.expiresAt });
    } catch (err) {
      const now = await Booking.findById(booking._id).select('status').lean();
      if (now?.status !== 'pending_approval') await releaseBookingSeats(booking._id);
      throw err;
    }
  }

  const approvedAt = new Date();
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'pending_approval' },
    {
      $set: { status: 'approved', approvedAt, approvedBy: req.user?._id, paidAt: approvedAt },
      $unset: { expiresAt: 1 },
    },
    { new: true }
  ).populate('eventId');

  if (!claimed) {
    const fresh = await Booking.findById(booking._id).select('status items').lean();
    if (fresh?.status === 'approved') {
      await waitForTickets(fresh);
      return alreadyApprovedResponse(res, booking._id);
    }
    // Rejected / expired / cancelled while we were marking seats sold: give them back.
    if (seated) await releaseBookingSeats(booking._id);
    throw new AppError(`This order is already ${String(fresh?.status || 'closed').replace('_', ' ')}`, 409, 'NOT_PENDING', {
      status: fresh?.status,
    });
  }

  const tickets = await createTicketsForBooking(claimed);
  await Promise.all([
    convertReservedToSold(claimed.items),
    Event.updateOne({ _id: claimed.eventId?._id || claimed.eventId }, { $inc: { ticketsSold: claimed.ticketCount } }),
  ]);
  cacheDel('public:');
  cacheDel('analytics:');

  const emailQueued = sendBookingEmailInBackground(claimed, tickets);
  res.json({
    order: adminOrderView(claimed),
    tickets: await formatTicketsForClient(tickets),
    emailSent: emailQueued,
  });
});

/** POST /admin/approvals/:id/reject { reason? }  -  releases the seats and tickets held by the order. */
export const adminRejectOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  assertObjectId(id);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
  const closed = await closePendingOrder(id, 'rejected', {
    rejectedAt: new Date(),
    rejectedBy: req.user?._id,
    rejectionReason: reason,
  });
  if (!closed) {
    const current = await Booking.findById(id).select('status').lean();
    if (!current) throw new AppError('Order not found', 404, 'NOT_FOUND');
    throw new AppError(`This order is already ${current.status.replace('_', ' ')}`, 409, 'NOT_PENDING', {
      status: current.status,
    });
  }
  await closed.populate('eventId', 'title slug startsAt venue city');
  res.json({ order: adminOrderView(closed) });
});

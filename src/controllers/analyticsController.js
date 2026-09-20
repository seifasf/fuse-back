import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { Ticket } from '../models/Ticket.js';
import { TicketTier } from '../models/TicketTier.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { cacheGet, cacheSet } from '../utils/memoryCache.js';

export const getOverview = asyncHandler(async (req, res) => {
  const cacheKey = 'analytics:overview';
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  const [
    totalEvents,
    upcomingEvents,
    liveEvents,
    pastEvents,
    totalBookings,
    paidBookings,
    totalTickets,
    usedTickets,
    eventsLite,
    revAgg,
    categoryAgg,
    topEvents,
    tierAgg,
    timelineAgg,
    categoryEventCounts,
  ] = await Promise.all([
    Event.countDocuments({ deletedAt: null }),
    Event.countDocuments({ deletedAt: null, status: 'upcoming' }),
    Event.countDocuments({ deletedAt: null, status: 'live' }),
    Event.countDocuments({ deletedAt: null, status: 'past' }),
    Booking.countDocuments(),
    Booking.countDocuments({ status: 'paid' }),
    Ticket.countDocuments(),
    Ticket.countDocuments({ status: 'used' }),
    Event.find({ deletedAt: null }).select('country category').lean(),
    Booking.aggregate([
      { $match: { status: 'paid' } },
      {
        $group: {
          _id: '$currency',
          total: { $sum: '$total' },
          ticketsSold: { $sum: '$ticketCount' },
          bookings: { $sum: 1 },
        },
      },
    ]),
    Booking.aggregate([
      { $match: { status: 'paid' } },
      { $lookup: { from: 'events', localField: 'eventId', foreignField: '_id', as: 'event' } },
      { $unwind: '$event' },
      {
        $group: {
          _id: '$event.category',
          ticketsSold: { $sum: '$ticketCount' },
          revenueKWD: { $sum: { $cond: [{ $eq: ['$currency', 'KWD'] }, '$total', 0] } },
          revenueEGP: { $sum: { $cond: [{ $eq: ['$currency', 'EGP'] }, '$total', 0] } },
          bookingsCount: { $sum: 1 },
        },
      },
    ]),
    Booking.aggregate([
      { $match: { status: 'paid' } },
      {
        $group: {
          _id: '$eventId',
          revenue: { $sum: '$total' },
          currency: { $first: '$currency' },
          ticketsSold: { $sum: '$ticketCount' },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 6 },
      { $lookup: { from: 'events', localField: '_id', foreignField: '_id', as: 'event' } },
      { $unwind: '$event' },
      {
        $project: {
          title: '$event.title',
          slug: '$event.slug',
          category: '$event.category',
          country: '$event.country',
          venue: '$event.venue',
          capacity: '$event.capacity',
          coverImage: '$event.coverImage',
          revenue: 1,
          currency: 1,
          ticketsSold: 1,
          bookings: 1,
        },
      },
    ]),
    Ticket.aggregate([
      {
        $group: {
          _id: '$tierName',
          count: { $sum: 1 },
          usedCount: { $sum: { $cond: [{ $eq: ['$status', 'used'] }, 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Booking.aggregate([
      { $match: { status: 'paid' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          tickets: { $sum: '$ticketCount' },
          total: { $sum: '$total' },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 90 },
    ]),
    Event.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ]);

  let kwdRevenue = 0;
  let egpRevenue = 0;
  let kwdTickets = 0;
  let egpTickets = 0;
  for (const r of revAgg) {
    if (r._id === 'KWD') {
      kwdRevenue = r.total;
      kwdTickets = r.ticketsSold;
    } else if (r._id === 'EGP') {
      egpRevenue = r.total;
      egpTickets = r.ticketsSold;
    }
  }

  const categoryMap = {
    'club night': { label: 'Club Nights', count: 0 },
    festival: { label: 'Festivals', count: 0 },
    concert: { label: 'Concerts', count: 0 },
    rooftop: { label: 'Rooftops', count: 0 },
    'pool party': { label: 'Pool Parties', count: 0 },
    'pop-up': { label: 'Pop-Up Venues', count: 0 },
    private: { label: 'Private Lounges', count: 0 },
  };

  for (const row of categoryEventCounts) {
    const cat = row._id || 'club night';
    if (!categoryMap[cat]) {
      categoryMap[cat] = {
        label: String(cat).charAt(0).toUpperCase() + String(cat).slice(1),
        count: 0,
      };
    }
    categoryMap[cat].count = row.count;
  }

  const categoryBreakdown = Object.keys(categoryMap)
    .map((catKey) => {
      const agg = categoryAgg.find((c) => c._id === catKey);
      const ticketsSold = agg ? agg.ticketsSold : 0;
      return {
        category: catKey,
        label: categoryMap[catKey].label,
        eventsCount: categoryMap[catKey].count,
        ticketsSold,
        revenueKWD: agg ? agg.revenueKWD : 0,
        revenueEGP: agg ? agg.revenueEGP : 0,
        bookingsCount: agg ? agg.bookingsCount : 0,
        percentage: totalTickets > 0 ? Math.round((ticketsSold / totalTickets) * 100) : 0,
      };
    })
    .filter((c) => c.eventsCount > 0 || c.ticketsSold > 0);

  const kwEventIds = eventsLite.filter((e) => e.country === 'KW').map((e) => e._id);
  const egEventIds = eventsLite.filter((e) => e.country === 'EG').map((e) => e._id);

  const [kwUsedTickets, egUsedTickets] = await Promise.all([
    kwEventIds.length
      ? Ticket.countDocuments({ status: 'used', eventId: { $in: kwEventIds } })
      : 0,
    egEventIds.length
      ? Ticket.countDocuments({ status: 'used', eventId: { $in: egEventIds } })
      : 0,
  ]);

  const payload = {
    totalEvents,
    upcomingEvents,
    liveEvents,
    pastEvents,
    totalBookings,
    paidBookings,
    totalTickets,
    usedTickets,
    checkInRate: totalTickets ? Math.round((usedTickets / totalTickets) * 100) : 0,
    revenue: [
      { _id: 'KWD', total: kwdRevenue },
      { _id: 'EGP', total: egpRevenue },
    ],
    kwdRevenue,
    egpRevenue,
    kwdTickets,
    egpTickets,
    categoryBreakdown,
    topEvents,
    tierBreakdown: tierAgg.map((t) => ({
      name: t._id || 'Standard',
      count: t.count,
      usedCount: t.usedCount,
      percentage: totalTickets > 0 ? Math.round((t.count / totalTickets) * 100) : 0,
    })),
    countryBreakdown: {
      kw: {
        eventsCount: kwEventIds.length,
        ticketsSold: kwdTickets,
        revenue: kwdRevenue,
        usedTickets: kwUsedTickets,
        checkInRate: kwdTickets > 0 ? Math.round((kwUsedTickets / kwdTickets) * 100) : 0,
      },
      eg: {
        eventsCount: egEventIds.length,
        ticketsSold: egpTickets,
        revenue: egpRevenue,
        usedTickets: egUsedTickets,
        checkInRate: egpTickets > 0 ? Math.round((egUsedTickets / egpTickets) * 100) : 0,
      },
    },
    salesTimeline: timelineAgg.map((t) => ({
      date: t._id,
      tickets: t.tickets,
      revenue: t.total,
      bookings: t.bookings,
    })),
  };

  cacheSet(cacheKey, payload, 20_000);
  res.set('X-Cache', 'MISS');
  res.json(payload);
});

export const getEventAnalytics = asyncHandler(async (req, res) => {
  const eventId = req.params.id;
  const event = await Event.findById(eventId)
    .select('title slug country venue capacity coverImage category status startsAt')
    .lean();
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found' });

  const [paidStats, ticketStats, tiers, salesOverTime] = await Promise.all([
    Booking.aggregate([
      { $match: { eventId: event._id, status: 'paid' } },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$total' },
          bookings: { $sum: 1 },
        },
      },
    ]),
    Ticket.aggregate([
      { $match: { eventId: event._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          used: { $sum: { $cond: [{ $eq: ['$status', 'used'] }, 1, 0] } },
        },
      },
    ]),
    TicketTier.find({ eventId })
      .select('name sold quantity price')
      .lean(),
    Booking.aggregate([
      { $match: { eventId: event._id, status: 'paid' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          revenue: { $sum: '$total' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const revenue = paidStats[0]?.revenue || 0;
  const bookingsCount = paidStats[0]?.bookings || 0;
  const ticketsSold = ticketStats[0]?.total || 0;
  const usedTickets = ticketStats[0]?.used || 0;

  res.json({
    event,
    revenue,
    ticketsSold,
    usedTickets,
    checkInRate: ticketsSold ? Math.round((usedTickets / ticketsSold) * 100) : 0,
    salesByTier: tiers.map((tier) => ({
      name: tier.name,
      sold: tier.sold,
      quantity: tier.quantity,
      revenue: tier.sold * tier.price,
    })),
    salesOverTime,
    bookings: bookingsCount,
  });
});

export const exportEventCsv = asyncHandler(async (req, res) => {
  const eventId = req.params.id;
  const [bookings, tickets] = await Promise.all([
    Booking.find({ eventId, status: 'paid' })
      .select('guest total currency')
      .lean(),
    Ticket.find({ eventId }).select('bookingId status scannedAt').lean(),
  ]);

  const rows = [
    ['Booking ID', 'Guest Name', 'Email', 'Phone', 'Total', 'Currency', 'Ticket Status', 'Scanned At'].join(','),
    ...bookings.flatMap((b) => {
      const bTickets = tickets.filter((t) => String(t.bookingId) === String(b._id));
      return bTickets.map((t) =>
        [b._id, b.guest.name, b.guest.email, b.guest.phone, b.total, b.currency, t.status, t.scannedAt || ''].join(',')
      );
    }),
  ];

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=event-${eventId}-report.csv`);
  res.send(rows.join('\n'));
});

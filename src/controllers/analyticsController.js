import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { Ticket } from '../models/Ticket.js';
import { TicketTier } from '../models/TicketTier.js';
import { Character } from '../models/Character.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getOverview = asyncHandler(async (req, res) => {
  const [
    totalEvents,
    upcomingEvents,
    liveEvents,
    pastEvents,
    totalBookings,
    paidBookings,
    totalTickets,
    usedTickets,
    eventsList,
  ] = await Promise.all([
    Event.countDocuments(),
    Event.countDocuments({ status: 'upcoming' }),
    Event.countDocuments({ status: 'live' }),
    Event.countDocuments({ status: 'past' }),
    Booking.countDocuments(),
    Booking.countDocuments({ status: 'paid' }),
    Ticket.countDocuments(),
    Ticket.countDocuments({ status: 'used' }),
    Event.find({}).lean(),
  ]);

  // Aggregate revenue by currency
  const revAgg = await Booking.aggregate([
    { $match: { status: 'paid' } },
    { $group: { _id: '$currency', total: { $sum: '$total' }, ticketsSold: { $sum: '$ticketCount' }, bookings: { $sum: 1 } } },
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

  // Real FUSE Event Category breakdown
  const categoryAgg = await Booking.aggregate([
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
  ]);

  // Build category stats combined with total events in each category
  const categoryMap = {
    'club night': { label: 'Club Nights', count: 0 },
    festival: { label: 'Festivals', count: 0 },
    concert: { label: 'Concerts', count: 0 },
    rooftop: { label: 'Rooftops', count: 0 },
    'pool party': { label: 'Pool Parties', count: 0 },
    'pop-up': { label: 'Pop-Up Venues', count: 0 },
    private: { label: 'Private Lounges', count: 0 },
  };

  for (const ev of eventsList) {
    const cat = ev.category || 'club night';
    if (!categoryMap[cat]) {
      categoryMap[cat] = { label: cat.charAt(0).toUpperCase() + cat.slice(1), count: 0 };
    }
    categoryMap[cat].count += 1;
  }

  const categoryBreakdown = Object.keys(categoryMap).map((catKey) => {
    const agg = categoryAgg.find((c) => c._id === catKey);
    const ticketsSold = agg ? agg.ticketsSold : 0;
    const revenueKWD = agg ? agg.revenueKWD : 0;
    const revenueEGP = agg ? agg.revenueEGP : 0;
    const bookingsCount = agg ? agg.bookingsCount : 0;

    return {
      category: catKey,
      label: categoryMap[catKey].label,
      eventsCount: categoryMap[catKey].count,
      ticketsSold,
      revenueKWD,
      revenueEGP,
      bookingsCount,
      percentage: totalTickets > 0 ? Math.round((ticketsSold / totalTickets) * 100) : 0,
    };
  }).filter((c) => c.eventsCount > 0 || c.ticketsSold > 0);

  // Top events with complete metadata
  const topEvents = await Booking.aggregate([
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
    {
      $lookup: { from: 'events', localField: '_id', foreignField: '_id', as: 'event' },
    },
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
  ]);

  // Ticket tier breakdown
  const tierAgg = await Ticket.aggregate([
    {
      $group: {
        _id: '$tierName',
        count: { $sum: 1 },
        usedCount: { $sum: { $cond: [{ $eq: ['$status', 'used'] }, 1, 0] } },
      },
    },
    { $sort: { count: -1 } },
  ]);

  // Daily timeline (last 7 days of ticket activity)
  const timelineAgg = await Booking.aggregate([
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
  ]);

  // Country stats
  const kwEvents = eventsList.filter((e) => e.country === 'KW').length;
  const egEvents = eventsList.filter((e) => e.country === 'EG').length;

  const kwUsedTickets = await Ticket.countDocuments({
    status: 'used',
    eventId: { $in: eventsList.filter((e) => e.country === 'KW').map((e) => e._id) },
  });
  const egUsedTickets = await Ticket.countDocuments({
    status: 'used',
    eventId: { $in: eventsList.filter((e) => e.country === 'EG').map((e) => e._id) },
  });

  res.json({
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
        eventsCount: kwEvents,
        ticketsSold: kwdTickets,
        revenue: kwdRevenue,
        usedTickets: kwUsedTickets,
        checkInRate: kwdTickets > 0 ? Math.round((kwUsedTickets / kwdTickets) * 100) : 0,
      },
      eg: {
        eventsCount: egEvents,
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
  });
});

export const getEventAnalytics = asyncHandler(async (req, res) => {
  const eventId = req.params.id;
  const event = await Event.findById(eventId).lean();
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found' });

  const [bookings, tickets, tiers, usedTickets] = await Promise.all([
    Booking.find({ eventId, status: 'paid' }).lean(),
    Ticket.find({ eventId }).lean(),
    TicketTier.find({ eventId }).lean(),
    Ticket.countDocuments({ eventId, status: 'used' }),
  ]);

  const revenue = bookings.reduce((sum, b) => sum + b.total, 0);
  const salesByTier = tiers.map((tier) => ({
    name: tier.name,
    sold: tier.sold,
    quantity: tier.quantity,
    revenue: tier.sold * tier.price,
  }));

  const salesOverTime = await Booking.aggregate([
    { $match: { eventId: event._id, status: 'paid' } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
        revenue: { $sum: '$total' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    event,
    revenue,
    ticketsSold: tickets.length,
    usedTickets,
    checkInRate: tickets.length ? Math.round((usedTickets / tickets.length) * 100) : 0,
    salesByTier,
    salesOverTime,
    bookings: bookings.length,
  });
});

export const exportEventCsv = asyncHandler(async (req, res) => {
  const eventId = req.params.id;
  const bookings = await Booking.find({ eventId, status: 'paid' }).lean();
  const tickets = await Ticket.find({ eventId }).lean();

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

import { Ticket } from '../models/Ticket.js';
import { Event } from '../models/Event.js';
import { ScanLog } from '../models/ScanLog.js';
import { verifyQrPayload } from '../services/qr.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Events available for the current gate agent / admin to scan */
export const listGateEvents = asyncHandler(async (req, res) => {
  const filter = {
    deletedAt: null,
    status: { $in: ['live', 'upcoming'] },
  };

  if (req.user.role === 'gate_agent') {
    const assigned = req.user.assignedEventIds || [];
    if (assigned.length) {
      filter._id = { $in: assigned };
    }
  }

  const events = await Event.find(filter)
    .select('title slug country city venue startsAt status coverImage capacity ticketsSold checkInCount')
    .sort({ startsAt: 1 })
    .lean();

  res.json({ events });
});

export const scanTicket = asyncHandler(async (req, res) => {
  const { qrPayload, code, eventId } = req.body;

  if (!eventId) {
    throw new AppError('Please select an event before scanning', 400, 'EVENT_REQUIRED');
  }

  const selectedEvent = await Event.findOne({ _id: eventId, deletedAt: null });
  if (!selectedEvent) throw new AppError('Event not found', 404, 'NOT_FOUND');

  if (req.user.role === 'gate_agent') {
    const assigned = req.user.assignedEventIds?.map(String) || [];
    if (assigned.length && !assigned.includes(String(eventId))) {
      throw new AppError('Not assigned to this event', 403, 'FORBIDDEN');
    }
  }

  let ticket = null;

  if (qrPayload) {
    const decoded = verifyQrPayload(qrPayload);
    if (!decoded) {
      await ScanLog.create({
        eventId,
        agentId: req.user._id,
        result: 'invalid',
        message: 'Invalid QR signature',
      }).catch(() => {});
      throw new AppError('Invalid QR code', 400, 'INVALID_QR');
    }
    ticket = await Ticket.findById(decoded.ticketId);
  } else if (code) {
    ticket = await Ticket.findOne({ code: String(code).trim().toUpperCase() });
  } else {
    throw new AppError('QR payload or ticket code required', 400, 'VALIDATION_ERROR');
  }

  if (!ticket) throw new AppError('Ticket not found', 404, 'NOT_FOUND');

  // Must match the event chosen on the scanner
  if (String(ticket.eventId) !== String(eventId)) {
    await ScanLog.create({
      ticketId: ticket._id,
      eventId,
      agentId: req.user._id,
      result: 'forbidden',
      holderName: ticket.holderName,
      tierName: ticket.tierName,
      code: ticket.code,
      message: 'Ticket belongs to a different event',
    }).catch(() => {});
    throw new AppError('This ticket is for a different event', 400, 'WRONG_EVENT');
  }

  if (req.user.role === 'gate_agent') {
    const assigned = req.user.assignedEventIds?.map(String) || [];
    if (assigned.length && !assigned.includes(String(ticket.eventId))) {
      await ScanLog.create({
        ticketId: ticket._id,
        eventId: ticket.eventId,
        agentId: req.user._id,
        result: 'forbidden',
        holderName: ticket.holderName,
        tierName: ticket.tierName,
        code: ticket.code,
        message: 'Agent not assigned to this event',
      });
      throw new AppError('Not assigned to this event', 403, 'FORBIDDEN');
    }
  }

  ticket.scanAttempts += 1;

  if (ticket.status === 'used') {
    await ticket.save();
    await ScanLog.create({
      ticketId: ticket._id,
      eventId: ticket.eventId,
      agentId: req.user._id,
      result: 'already_used',
      holderName: ticket.holderName,
      tierName: ticket.tierName,
      code: ticket.code,
      message: 'Duplicate scan attempt',
    });
    return res.json({
      status: 'already_used',
      ticket: {
        holderName: ticket.holderName,
        holderEmail: ticket.holderEmail || '',
        holderPhone: ticket.holderPhone || '',
        scannedAt: ticket.scannedAt,
        event: ticket.eventTitle,
        tier: ticket.tierName,
        tierColor: ticket.tierColor || '',
        code: ticket.code,
        admitCount: ticket.admitCount || 1,
        members:
          Array.isArray(ticket.members) && ticket.members.length
            ? ticket.members.map((m) => ({ name: m.name, phone: m.phone }))
            : [{ name: ticket.holderName, phone: ticket.holderPhone || '' }],
        scanAttempts: ticket.scanAttempts,
      },
    });
  }

  if (ticket.status === 'cancelled' || ticket.status === 'refunded') {
    await ticket.save();
    await ScanLog.create({
      ticketId: ticket._id,
      eventId: ticket.eventId,
      agentId: req.user._id,
      result: 'cancelled',
      holderName: ticket.holderName,
      tierName: ticket.tierName,
      code: ticket.code,
    });
    return res.json({ status: 'invalid', message: `Ticket ${ticket.status}` });
  }

  ticket.status = 'used';
  ticket.scannedAt = new Date();
  ticket.scannedBy = req.user._id;
  await ticket.save();

  await Event.findByIdAndUpdate(ticket.eventId, {
    $inc: { checkInCount: Math.max(1, ticket.admitCount || 1) },
  });

  await ScanLog.create({
    ticketId: ticket._id,
    eventId: ticket.eventId,
    agentId: req.user._id,
    result: 'valid',
    holderName: ticket.holderName,
    tierName: ticket.tierName,
    code: ticket.code,
  });

  const members =
    Array.isArray(ticket.members) && ticket.members.length
      ? ticket.members.map((m) => ({ name: m.name, phone: m.phone }))
      : [{ name: ticket.holderName, phone: ticket.holderPhone || '' }];

  res.json({
    status: 'valid',
    ticket: {
      holderName: ticket.holderName,
      holderEmail: ticket.holderEmail || '',
      holderPhone: ticket.holderPhone || '',
      event: ticket.eventTitle,
      tier: ticket.tierName,
      tierColor: ticket.tierColor || '',
      code: ticket.code,
      admitCount: ticket.admitCount || members.length || 1,
      members,
      scannedAt: ticket.scannedAt,
      scanAttempts: ticket.scanAttempts,
    },
  });
});

export const getEventCheckins = asyncHandler(async (req, res) => {
  const eventId = req.params.eventId;
  const [total, used, recent] = await Promise.all([
    Ticket.countDocuments({ eventId }),
    Ticket.countDocuments({ eventId, status: 'used' }),
    ScanLog.find({ eventId }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);

  res.json({
    eventId,
    total,
    used,
    checkInRate: total ? Math.round((used / total) * 100) : 0,
    recentScans: recent,
  });
});

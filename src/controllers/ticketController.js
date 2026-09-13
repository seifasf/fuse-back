import { Ticket } from '../models/Ticket.js';
import { Event } from '../models/Event.js';
import { ScanLog } from '../models/ScanLog.js';
import { verifyQrPayload } from '../services/qr.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const scanTicket = asyncHandler(async (req, res) => {
  const { qrPayload } = req.body;
  if (!qrPayload) throw new AppError('QR payload required', 400, 'VALIDATION_ERROR');

  const decoded = verifyQrPayload(qrPayload);
  if (!decoded) {
    if (req.user.assignedEventIds?.[0]) {
      await ScanLog.create({
        eventId: req.user.assignedEventIds[0],
        agentId: req.user._id,
        result: 'invalid',
        message: 'Invalid QR signature',
      }).catch(() => {});
    }
    throw new AppError('Invalid QR code', 400, 'INVALID_QR');
  }

  const ticket = await Ticket.findById(decoded.ticketId);
  if (!ticket) throw new AppError('Ticket not found', 404, 'NOT_FOUND');

  const eventId = ticket.eventId;

  if (req.user.role === 'gate_agent') {
    const assigned = req.user.assignedEventIds?.map(String) || [];
    if (assigned.length && !assigned.includes(String(eventId))) {
      await ScanLog.create({
        ticketId: ticket._id,
        eventId,
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
      eventId,
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
        scannedAt: ticket.scannedAt,
        event: ticket.eventTitle,
        tier: ticket.tierName,
        code: ticket.code,
      },
    });
  }

  if (ticket.status === 'cancelled' || ticket.status === 'refunded') {
    await ticket.save();
    await ScanLog.create({
      ticketId: ticket._id,
      eventId,
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

  await Event.findByIdAndUpdate(eventId, { $inc: { checkInCount: 1 } });

  await ScanLog.create({
    ticketId: ticket._id,
    eventId,
    agentId: req.user._id,
    result: 'valid',
    holderName: ticket.holderName,
    tierName: ticket.tierName,
    code: ticket.code,
  });

  res.json({
    status: 'valid',
    ticket: {
      holderName: ticket.holderName,
      event: ticket.eventTitle,
      tier: ticket.tierName,
      code: ticket.code,
      scannedAt: ticket.scannedAt,
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

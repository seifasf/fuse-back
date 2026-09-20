import { Ticket } from '../models/Ticket.js';
import { Event } from '../models/Event.js';
import { ScanLog } from '../models/ScanLog.js';
import { verifyQrPayload } from '../services/qr.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { cacheGet, cacheSet, cacheDel } from '../utils/memoryCache.js';

/** Events available for the current gate agent / admin to scan */
export const listGateEvents = asyncHandler(async (req, res) => {
  const userKey = req.user.role === 'gate_agent' ? String(req.user._id) : 'admin';
  const cacheKey = `gate:events:${userKey}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

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

  const payload = { events };
  cacheSet(cacheKey, payload, 10_000);
  res.set('X-Cache', 'MISS');
  res.json(payload);
});

/** Resolve all guest names on a ticket (party QR). */
function resolveTicketMembers(ticket) {
  if (Array.isArray(ticket.members) && ticket.members.length) {
    return ticket.members.map((m, index) => ({
      index,
      name: String(m.name || '').trim(),
      phone: String(m.phone || '').trim(),
      checkedIn: Boolean(m.checkedIn),
      checkedInAt: m.checkedInAt || null,
    })).filter((m) => m.name);
  }

  const holder = String(ticket.holderName || '').trim();
  if (!holder) return [];

  const parts = holder.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts.map((name, index) => ({
      index,
      name,
      phone: index === 0 ? String(ticket.holderPhone || '').trim() : '',
      checkedIn: false,
      checkedInAt: null,
    }));
  }

  return [
    {
      index: 0,
      name: holder,
      phone: String(ticket.holderPhone || '').trim(),
      checkedIn: ticket.status === 'used',
      checkedInAt: ticket.scannedAt || null,
    },
  ];
}

/** Persist resolved members onto the ticket when missing (legacy tickets). */
function ensureMembersOnTicket(ticket) {
  if (Array.isArray(ticket.members) && ticket.members.length) return;
  const resolved = resolveTicketMembers(ticket);
  if (!resolved.length) {
    ticket.members = [
      {
        name: ticket.holderName || 'Guest',
        phone: ticket.holderPhone || '',
        checkedIn: false,
      },
    ];
    return;
  }
  ticket.members = resolved.map((m) => ({
    name: m.name,
    phone: m.phone || '',
    checkedIn: Boolean(m.checkedIn),
    checkedInAt: m.checkedInAt || undefined,
  }));
}

function serializeTicket(ticket, members) {
  const list = members || resolveTicketMembers(ticket);
  const remaining = list.filter((m) => !m.checkedIn).length;
  const entered = list.filter((m) => m.checkedIn).length;
  return {
    id: String(ticket._id),
    holderName: ticket.holderName,
    holderEmail: ticket.holderEmail || '',
    holderPhone: ticket.holderPhone || '',
    event: ticket.eventTitle,
    tier: ticket.tierName,
    tierColor: ticket.tierColor || '',
    code: ticket.code,
    admitCount: ticket.admitCount || list.length || 1,
    checkedInCount: entered,
    remainingCount: remaining,
    members: list.map((m) => ({
      index: m.index,
      name: m.name,
      phone: m.phone,
      checkedIn: m.checkedIn,
      checkedInAt: m.checkedInAt,
    })),
    scannedAt: ticket.scannedAt,
    scanAttempts: ticket.scanAttempts,
    status: ticket.status,
  };
}

async function findTicketForScan(req) {
  const { qrPayload, code, eventId, ticketId } = req.body;

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

  if (ticketId) {
    ticket = await Ticket.findById(ticketId);
  } else if (qrPayload) {
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
    throw new AppError('QR payload, ticket code, or ticket id required', 400, 'VALIDATION_ERROR');
  }

  if (!ticket) throw new AppError('Ticket not found', 404, 'NOT_FOUND');

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

  return ticket;
}

/**
 * Scan / look up a ticket.
 * Multi-guest QR → returns select_guests so the agent picks who enters.
 * Single remaining guest → auto-admits.
 */
export const scanTicket = asyncHandler(async (req, res) => {
  const ticket = await findTicketForScan(req);

  if (ticket.status === 'cancelled' || ticket.status === 'refunded') {
    ticket.scanAttempts += 1;
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

  ensureMembersOnTicket(ticket);
  ticket.scanAttempts += 1;

  let members = resolveTicketMembers(ticket);
  const remaining = members.filter((m) => !m.checkedIn);

  // Fully checked in
  if (ticket.status === 'used' || remaining.length === 0) {
    // Sync status if members say all in but status wasn't used
    if (ticket.status !== 'used' && members.length && remaining.length === 0) {
      ticket.status = 'used';
      ticket.scannedAt = ticket.scannedAt || new Date();
    }
    await ticket.save();
    await ScanLog.create({
      ticketId: ticket._id,
      eventId: ticket.eventId,
      agentId: req.user._id,
      result: 'already_used',
      holderName: ticket.holderName,
      tierName: ticket.tierName,
      code: ticket.code,
      message: 'All guests already entered',
    });
    return res.json({
      status: 'already_used',
      message: 'All guests on this QR have already entered',
      ticket: serializeTicket(ticket, members),
    });
  }

  // One person left → auto-admit (single ticket, or last guest in a party)
  if (remaining.length === 1) {
    const idx = remaining[0].index;
    const now = new Date();
    ticket.members[idx].checkedIn = true;
    ticket.members[idx].checkedInAt = now;
    ticket.checkedInCount = ticket.members.filter((m) => m.checkedIn).length;
    ticket.status = 'used';
    ticket.scannedAt = now;
    ticket.scannedBy = req.user._id;
    ticket.markModified('members');
    await ticket.save();

    await Event.findByIdAndUpdate(ticket.eventId, { $inc: { checkInCount: 1 } });
    cacheDel('gate:');
    cacheDel('analytics:');

    members = resolveTicketMembers(ticket);
    await ScanLog.create({
      ticketId: ticket._id,
      eventId: ticket.eventId,
      agentId: req.user._id,
      result: 'valid',
      holderName: ticket.holderName,
      tierName: ticket.tierName,
      code: ticket.code,
      message: `Admitted: ${remaining[0].name}`,
      meta: { admittedIndexes: [idx], admittedNames: [remaining[0].name] },
    });

    return res.json({
      status: 'valid',
      message: `${remaining[0].name} entered`,
      admitted: [{ index: idx, name: remaining[0].name }],
      ticket: serializeTicket(ticket, members),
    });
  }

  // Party ticket with people still to enter  -  agent chooses who
  await ticket.save();
  const enteredNames = members.filter((m) => m.checkedIn).map((m) => m.name);
  const leftNames = remaining.map((m) => m.name);

  return res.json({
    status: 'select_guests',
    message:
      enteredNames.length > 0
        ? `${leftNames.length} still to enter · already in: ${enteredNames.join(', ')}`
        : `Select who is entering now (${leftNames.length} on this QR)`,
    ticket: serializeTicket(ticket, members),
  });
});

/**
 * Confirm which party members are entering right now.
 * Body: { eventId, ticketId, memberIndexes: number[] }
 */
export const admitTicketMembers = asyncHandler(async (req, res) => {
  const { memberIndexes } = req.body;
  if (!Array.isArray(memberIndexes) || memberIndexes.length === 0) {
    throw new AppError('Select at least one guest to admit', 400, 'VALIDATION_ERROR');
  }

  const ticket = await findTicketForScan(req);

  if (ticket.status === 'cancelled' || ticket.status === 'refunded') {
    throw new AppError(`Ticket ${ticket.status}`, 400, 'INVALID_TICKET');
  }

  ensureMembersOnTicket(ticket);
  const members = resolveTicketMembers(ticket);
  const indexes = [...new Set(memberIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0))];

  const toAdmit = [];
  for (const idx of indexes) {
    const m = members.find((x) => x.index === idx);
    if (!m) throw new AppError(`Invalid guest index ${idx}`, 400, 'VALIDATION_ERROR');
    if (m.checkedIn) throw new AppError(`${m.name} already entered`, 400, 'ALREADY_IN');
    toAdmit.push(m);
  }

  if (!toAdmit.length) {
    throw new AppError('Select at least one guest who has not entered yet', 400, 'VALIDATION_ERROR');
  }

  const now = new Date();
  for (const m of toAdmit) {
    ticket.members[m.index].checkedIn = true;
    ticket.members[m.index].checkedInAt = now;
  }

  ticket.checkedInCount = ticket.members.filter((m) => m.checkedIn).length;
  ticket.scannedAt = now;
  ticket.scannedBy = req.user._id;
  ticket.scanAttempts = (ticket.scanAttempts || 0) + 1;
  ticket.markModified('members');

  const stillLeft = ticket.members.filter((m) => !m.checkedIn).length;
  if (stillLeft === 0) {
    ticket.status = 'used';
  } else {
    ticket.status = 'valid';
  }

  await ticket.save();

  await Event.findByIdAndUpdate(ticket.eventId, { $inc: { checkInCount: toAdmit.length } });
  cacheDel('gate:');
  cacheDel('analytics:');

  const updated = resolveTicketMembers(ticket);
  const admittedNames = toAdmit.map((m) => m.name);

  await ScanLog.create({
    ticketId: ticket._id,
    eventId: ticket.eventId,
    agentId: req.user._id,
    result: stillLeft === 0 ? 'valid' : 'partial',
    holderName: ticket.holderName,
    tierName: ticket.tierName,
    code: ticket.code,
    message:
      stillLeft === 0
        ? `Admitted: ${admittedNames.join(', ')} · all guests in`
        : `Admitted: ${admittedNames.join(', ')} · ${stillLeft} still left`,
    meta: {
      admittedIndexes: toAdmit.map((m) => m.index),
      admittedNames,
      remainingCount: stillLeft,
    },
  });

  res.json({
    status: stillLeft === 0 ? 'valid' : 'partial',
    message:
      stillLeft === 0
        ? `${admittedNames.join(', ')} entered · party complete`
        : `${admittedNames.join(', ')} entered · ${stillLeft} still to enter`,
    admitted: toAdmit.map((m) => ({ index: m.index, name: m.name })),
    ticket: serializeTicket(ticket, updated),
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

import crypto from 'crypto';
import { env } from '../config/env.js';

function asId(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.toString === 'function') return String(value);
  return String(value);
}

export function signQrPayload(ticketId, bookingId, eventId) {
  const payload = JSON.stringify({
    ticketId: asId(ticketId),
    bookingId: asId(bookingId),
    eventId: asId(eventId),
    ts: Date.now(),
  });
  const sig = crypto.createHmac('sha256', env.qrSecret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64url');
}

export function verifyQrPayload(qrPayload) {
  try {
    const raw = String(qrPayload || '').trim();
    const { payload, sig } = JSON.parse(Buffer.from(raw, 'base64url').toString());
    const expected = crypto.createHmac('sha256', env.qrSecret).update(payload).digest('hex');
    if (sig !== expected) return null;
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

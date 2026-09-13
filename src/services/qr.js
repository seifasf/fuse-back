import crypto from 'crypto';
import { env } from '../config/env.js';

export function signQrPayload(ticketId, bookingId, eventId) {
  const payload = JSON.stringify({ ticketId, bookingId, eventId, ts: Date.now() });
  const sig = crypto.createHmac('sha256', env.qrSecret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64url');
}

export function verifyQrPayload(qrPayload) {
  try {
    const { payload, sig } = JSON.parse(Buffer.from(qrPayload, 'base64url').toString());
    const expected = crypto.createHmac('sha256', env.qrSecret).update(payload).digest('hex');
    if (sig !== expected) return null;
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

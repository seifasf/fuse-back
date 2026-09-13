import QRCode from 'qrcode';
import { signQrPayload } from './qr.js';

export async function generateTicketQrDataUrl(ticketId, bookingId, eventId) {
  const payload = signQrPayload(ticketId, bookingId, eventId);
  return QRCode.toDataURL(payload, { margin: 1, width: 300 });
}

export function getQrPayload(ticketId, bookingId, eventId) {
  return signQrPayload(ticketId, bookingId, eventId);
}

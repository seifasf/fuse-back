import QRCode from 'qrcode';
import { signQrPayload } from './qr.js';

/** Create a signed QR payload string for a ticket. */
export function getQrPayload(ticketId, bookingId, eventId) {
  return signQrPayload(ticketId, bookingId, eventId);
}

/** Encode an existing payload (or freshly signed one) as a PNG data URL. */
export async function generateTicketQrDataUrl(ticketId, bookingId, eventId, existingPayload) {
  const payload = existingPayload || signQrPayload(ticketId, bookingId, eventId);
  return QRCode.toDataURL(payload, { margin: 1, width: 300, errorCorrectionLevel: 'M' });
}

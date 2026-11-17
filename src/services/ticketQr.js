import QRCode from 'qrcode';
import { signQrPayload } from './qr.js';

/** High-res enough to stay sharp when printed ~55-70 mm on the ticket PDF. */
export const TICKET_QR_OPTIONS = {
  margin: 2,
  width: 900,
  errorCorrectionLevel: 'M',
  color: { dark: '#000000', light: '#ffffff' },
};

/** Create a signed QR payload string for a ticket. */
export function getQrPayload(ticketId, bookingId, eventId) {
  return signQrPayload(ticketId, bookingId, eventId);
}

/** Encode an existing payload (or freshly signed one) as a PNG data URL. */
export async function generateTicketQrDataUrl(ticketId, bookingId, eventId, existingPayload) {
  const payload = existingPayload || signQrPayload(ticketId, bookingId, eventId);
  return QRCode.toDataURL(payload, TICKET_QR_OPTIONS);
}

/** PNG buffer for email / server-side ticket PDFs. */
export async function generateTicketQrPng(payload) {
  return QRCode.toBuffer(payload, { type: 'png', ...TICKET_QR_OPTIONS });
}

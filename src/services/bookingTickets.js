import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { Booking } from '../models/Booking.js';
import { Ticket } from '../models/Ticket.js';
import { generateTicketQrDataUrl, getQrPayload } from './ticketQr.js';
import { generateTicketCode } from '../utils/ticketCode.js';
import { colorForTierName, normalizeHexColor } from '../constants/ticketTiers.js';
import { sendTicketsEmail, isEmailConfigured } from './email/index.js';

/** One ticket (QR) per order line, covering every guest and seat on that line. */
export async function createTicketsForBooking(booking) {
  const eventDoc = booking.eventId;
  const eventId = eventDoc?._id || eventDoc;
  const eventTitle = eventDoc?.title || booking.eventSnapshot?.title || 'FUSE Event';

  const tickets = [];
  for (const item of booking.items) {
    const seats = Array.isArray(item.seats) ? item.seats : [];
    const members = (
      Array.isArray(item.members) && item.members.length === item.qty
        ? item.members.map((m) => ({
            name: String(m.name || '').trim(),
            phone: String(m.phone || '').trim(),
          }))
        : Array.from({ length: item.qty }, () => ({
            name: booking.guest.name,
            phone: booking.guest.phone || '',
          }))
    ).map((m, i) => (seats[i] ? { ...m, seat: seats[i] } : m));

    const holderName = members.map((m) => m.name).filter(Boolean).join(', ') || booking.guest.name;
    const holderPhone = members[0]?.phone || booking.guest.phone || '';

    const ticketId = new mongoose.Types.ObjectId();
    const ticket = await Ticket.create({
      _id: ticketId,
      bookingId: booking._id,
      eventId,
      tierId: item.tierId,
      code: generateTicketCode(),
      qrPayload: getQrPayload(ticketId, booking._id, eventId),
      holderName: holderName.slice(0, 120),
      holderEmail: booking.guest.email,
      holderPhone: holderPhone.slice(0, 32),
      members,
      seats,
      admitCount: item.qty,
      tierName: item.tierName,
      tierColor: normalizeHexColor(item.tierColor || colorForTierName(item.tierName)),
      eventTitle,
    });
    tickets.push(ticket);
  }
  return tickets;
}

/** Tickets as the guest pages show them: QR image, tier, seats and guests. */
export async function formatTicketsForClient(ticketDocs) {
  const out = [];
  for (const t of ticketDocs) {
    const qrDataUrl = t.qrPayload
      ? await QRCode.toDataURL(t.qrPayload, { margin: 1, width: 300 })
      : await generateTicketQrDataUrl(t._id, t.bookingId, t.eventId);
    const members =
      Array.isArray(t.members) && t.members.length
        ? t.members.map((m) => ({ name: m.name, phone: m.phone, seat: m.seat || '' }))
        : [{ name: t.holderName, phone: t.holderPhone || '', seat: '' }];
    out.push({
      id: t._id,
      code: t.code,
      status: t.status,
      tierName: t.tierName,
      tierColor: t.tierColor,
      eventTitle: t.eventTitle,
      holderName: t.holderName,
      admitCount: t.admitCount || members.length || 1,
      members,
      seats: Array.isArray(t.seats) ? t.seats : [],
      qrDataUrl,
    });
  }
  return out;
}

/** Guest-facing order page (status, then tickets once approved). Only orders with an access key have one. */
export function orderStatusPath(booking) {
  return booking?.accessKey ? `/booking/${booking._id}/status?key=${booking.accessKey}` : '';
}

/**
 * Emails go out after the response so a slow PDF build or Brevo call never blocks checkout.
 * In-process only: if the server restarts mid-send, emailSentAt stays empty and the next
 * confirm call for that booking (e.g. reopening the confirmation page) sends it again.
 */
const emailsInFlight = new Set();

export function isBookingEmailInFlight(bookingId) {
  return emailsInFlight.has(String(bookingId));
}

export function sendBookingEmailInBackground(booking, tickets) {
  const key = String(booking._id);
  if (booking.emailSentAt || emailsInFlight.has(key) || !tickets.length) return false;
  if (!isEmailConfigured()) {
    console.log('[email] Booking confirmed - Brevo not configured yet (mock).');
    return false;
  }

  emailsInFlight.add(key);
  const eventDoc = booking.eventId && typeof booking.eventId === 'object' ? booking.eventId : null;
  const started = Date.now();
  sendTicketsEmail({
    toEmail: booking.guest.email,
    toName: booking.guest.name,
    eventTitle: tickets[0]?.eventTitle || eventDoc?.title || booking.eventSnapshot?.title,
    eventDescription: eventDoc?.description,
    venue: eventDoc?.venue || booking.eventSnapshot?.venue,
    startsAt: eventDoc?.startsAt || booking.eventSnapshot?.startsAt,
    termsAndConditions: eventDoc?.termsAndConditions,
    tickets,
    complimentary: booking.paymentProvider === 'manual',
    orderPath: orderStatusPath(booking),
  })
    .then(async (mail) => {
      console.log(
        `[timing] email ${key} ${mail.sent ? 'sent' : `not sent (${mail.error || 'unknown'})`} in ${Date.now() - started}ms`
      );
      if (mail.sent) await Booking.updateOne({ _id: booking._id }, { $set: { emailSentAt: new Date() } });
    })
    .catch((err) => console.error('[email] background send failed:', err?.message || err))
    .finally(() => emailsInFlight.delete(key));
  return true;
}

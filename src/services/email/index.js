import { env } from '../../config/env.js';
import { buildTicketPdfBuffer } from '../ticketPdf.js';
import { resolveTerms } from '../resolveTerms.js';
import { sendBrevoEmail, isEmailConfigured } from './brevo.js';
import {
  buildTicketsEmail,
  buildContactNotifyEmail,
  buildContactAckEmail,
} from './templates.js';

/**
 * Branded booking confirmation email.
 * Tickets are PDF attachments only (no ticket-card HTML / QR in the body).
 * Never throws — failures are logged so checkout stays reliable.
 */
export async function sendTicketsEmail({
  toEmail,
  toName,
  eventTitle,
  eventDescription,
  venue,
  startsAt,
  tickets,
  termsAndConditions,
  complimentary = false,
}) {
  try {
    if (!toEmail) return { sent: false, error: 'missing_to' };

    const ready = (tickets || []).filter((t) => t?.qrPayload || t?.qrDataUrl || t?.code);
    if (!ready.length) {
      return { sent: false, error: 'no_tickets' };
    }

    const siteUrl = env.clientUrl || 'https://fuseevents.net';
    const terms = await resolveTerms(termsAndConditions);

    const built = buildTicketsEmail({
      guestName: toName,
      eventTitle: eventTitle || 'FUSE Event',
      eventDescription,
      venue,
      startsAt,
      ticketCount: ready.length,
      termsAndConditions: terms,
      siteUrl,
      complimentary,
    });

    const attachments = [];
    for (const t of ready) {
      try {
        const pdf = await buildTicketPdfBuffer({
          ...t,
          eventTitle: t.eventTitle || eventTitle,
          holderName: t.holderName || toName,
        });
        attachments.push({
          name: pdf.filename,
          content: pdf.contentBase64,
        });
      } catch (pdfErr) {
        console.error(
          `[email] PDF build failed for ${t.code}:`,
          pdfErr?.message || pdfErr
        );
      }
    }

    if (!attachments.length) {
      return { sent: false, error: 'pdf_failed' };
    }

    return sendBrevoEmail({
      to: { email: toEmail, name: toName },
      subject: built.subject,
      htmlContent: built.html,
      textContent: built.text,
      attachments,
      tags: complimentary ? ['fuse-manual-ticket'] : ['fuse-booking-tickets'],
    });
  } catch (err) {
    console.error('[email] sendTicketsEmail failed:', err?.message || err);
    return { sent: false, error: String(err?.message || err) };
  }
}

/** Notify the team + optional auto-ack to the guest. */
export async function sendContactEmails({ name, email, phone, message }) {
  const siteUrl = env.clientUrl || 'https://fuseevents.net';
  const results = { notify: null, ack: null };

  try {
    const notifyTo = env.email.notifyTo || env.email.fromEmail;
    if (notifyTo) {
      const built = buildContactNotifyEmail({ name, email, phone, message, siteUrl });
      results.notify = await sendBrevoEmail({
        to: notifyTo,
        subject: built.subject,
        htmlContent: built.html,
        textContent: built.text,
        replyTo: email,
        tags: ['fuse-contact-notify'],
      });
    }
  } catch (err) {
    console.error('[email] contact notify failed:', err?.message || err);
    results.notify = { sent: false, error: String(err?.message || err) };
  }

  try {
    const built = buildContactAckEmail({ name, siteUrl });
    results.ack = await sendBrevoEmail({
      to: { email, name },
      subject: built.subject,
      htmlContent: built.html,
      textContent: built.text,
      tags: ['fuse-contact-ack'],
    });
  } catch (err) {
    console.error('[email] contact ack failed:', err?.message || err);
    results.ack = { sent: false, error: String(err?.message || err) };
  }

  return results;
}

export { isEmailConfigured };

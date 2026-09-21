import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import { sendBrevoEmail, isEmailConfigured } from './brevo.js';
import {
  buildTicketsEmail,
  buildContactNotifyEmail,
  buildContactAckEmail,
} from './templates.js';

async function qrPngBase64(payload) {
  const dataUrl = await QRCode.toDataURL(payload, {
    margin: 2,
    width: 360,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

/**
 * Send ticket confirmation / complimentary pass email with inline QR images.
 * Never throws — failures are logged so checkout stays reliable.
 */
export async function sendTicketsEmail({
  toEmail,
  toName,
  eventTitle,
  venue,
  startsAt,
  tickets,
  complimentary = false,
}) {
  try {
    if (!toEmail) return { sent: false, error: 'missing_to' };

    const ready = [];
    for (const t of tickets || []) {
      const payload = t.qrPayload;
      if (!payload) continue;
      const content = await qrPngBase64(payload);
      ready.push({
        ...t,
        _qrBase64: content,
      });
    }

    if (!ready.length) {
      return { sent: false, error: 'no_tickets' };
    }

    const siteUrl = env.clientUrl || 'https://fuseevents.net';
    const built = buildTicketsEmail({
      guestName: toName,
      eventTitle: eventTitle || 'FUSE Event',
      venue,
      startsAt,
      tickets: ready,
      siteUrl,
      complimentary,
    });

    const attachments = ready.flatMap((t, i) => [
      {
        name: `fuse-qr-${t.code || i}.png`,
        content: t._qrBase64,
        contentId: `qr${i}`,
      },
      // Also attach as downloadable files (some clients ignore cid)
      {
        name: `${t.code || `ticket-${i}`}.png`,
        content: t._qrBase64,
      },
    ]);

    const result = await sendBrevoEmail({
      to: { email: toEmail, name: toName },
      subject: built.subject,
      htmlContent: built.html,
      textContent: built.text,
      attachments,
      tags: complimentary ? ['fuse-manual-ticket'] : ['fuse-booking-tickets'],
    });

    return result;
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

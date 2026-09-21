import { env } from '../../config/env.js';

/**
 * Low-level Brevo transactional send.
 * Docs: https://developers.brevo.com/reference/sendtransacemail
 *
 * When BREVO_API_KEY is missing, logs a mock and returns { mock: true }
 * so bookings never fail for missing mail config.
 */
export async function sendBrevoEmail({
  to,
  subject,
  htmlContent,
  textContent,
  replyTo,
  attachments = [],
  tags = [],
}) {
  const recipients = (Array.isArray(to) ? to : [to])
    .map((r) => {
      if (typeof r === 'string') return { email: r.trim().toLowerCase() };
      return {
        email: String(r.email || '').trim().toLowerCase(),
        ...(r.name ? { name: String(r.name).slice(0, 120) } : {}),
      };
    })
    .filter((r) => r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));

  if (!recipients.length) {
    return { sent: false, error: 'No valid recipients' };
  }

  if (!env.email.apiKey) {
    console.log(
      `[email mock] To: ${recipients.map((r) => r.email).join(', ')} | ${subject}`
    );
    return { mock: true, sent: false };
  }

  const body = {
    sender: {
      name: env.email.fromName,
      email: env.email.fromEmail,
    },
    to: recipients,
    subject: String(subject).slice(0, 200),
    htmlContent,
    ...(textContent ? { textContent: String(textContent).slice(0, 10000) } : {}),
    ...(replyTo || env.email.replyTo
      ? {
          replyTo: {
            email: (replyTo || env.email.replyTo).trim().toLowerCase(),
            ...(env.email.fromName ? { name: env.email.fromName } : {}),
          },
        }
      : {}),
    ...(attachments.length
      ? {
          attachment: attachments.map((a) => ({
            name: a.name,
            content: a.content,
            ...(a.contentId ? { contentId: a.contentId } : {}),
          })),
        }
      : {}),
    ...(tags.length ? { tags: tags.slice(0, 10) } : {}),
  };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': env.email.apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.message || data?.error || JSON.stringify(data) || res.statusText;
    console.error('[email] Brevo send failed:', err);
    return { sent: false, error: err, status: res.status };
  }

  return { sent: true, messageId: data?.messageId || null };
}

export function isEmailConfigured() {
  return Boolean(env.email.apiKey && env.email.fromEmail);
}

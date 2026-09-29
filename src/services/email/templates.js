/** FUSE transactional email HTML - compact branded confirmation (PDFs attached). */

const BRAND = {
  bg: '#0a0a0f',
  card: '#12121a',
  border: '#2a2a38',
  text: '#f4f4f8',
  muted: '#9a9aab',
  cyan: '#01e7fe',
  pink: '#ea20aa',
  white: '#ffffff',
  soft: '#1a1a24',
};

const PUBLIC_SITE = 'https://fuseevents.net';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function siteOrigin(siteUrl) {
  const raw = String(siteUrl || PUBLIC_SITE).replace(/\/$/, '');
  if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(raw)) {
    return PUBLIC_SITE;
  }
  return raw || PUBLIC_SITE;
}

function logoUrl(siteUrl) {
  return `${siteOrigin(siteUrl)}/logo-white.png`;
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function plainBrief(text, max = 160) {
  const raw = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).trim()}...`;
}

/** Keep terms short in email; full text lives on the site / checkout. */
function compactTerms(terms, max = 520) {
  const text = String(terms || '').trim();
  if (!text) return '';
  const clipped = text.length > max ? `${text.slice(0, max - 1).trim()}...` : text;
  return escapeHtml(clipped).replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/\n/g, '<br/>');
}

function shell({ preheader, title, bodyHtml, siteUrl }) {
  const safePre = escapeHtml(preheader || title || 'FUSE Events');
  const year = new Date().getFullYear();
  const origin = siteOrigin(siteUrl);
  const logo = escapeHtml(logoUrl(origin));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title || 'FUSE')}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePre}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:20px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND.bg};padding:16px 18px 14px;border-bottom:1px solid ${BRAND.border};" align="center">
              <img src="${logo}" width="110" height="30" alt="FUSE" style="display:block;margin:0 auto;border:0;height:30px;width:auto;max-width:120px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:18px 18px 6px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:${BRAND.text};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:6px 18px 16px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;color:${BRAND.muted};" align="center">
              <a href="${escapeHtml(origin)}" style="color:${BRAND.cyan};text-decoration:none;">fuseevents.net</a>
              &nbsp;|&nbsp;(c) ${year} FUSE
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildTicketsEmail({
  guestName,
  eventTitle,
  eventDescription,
  venue,
  startsAt,
  ticketCount = 1,
  termsAndConditions,
  siteUrl,
  complimentary = false,
}) {
  const when = formatWhen(startsAt);
  const place = [venue].filter(Boolean).join(' | ');
  const brief = plainBrief(eventDescription);
  const title = complimentary ? 'Your complimentary FUSE tickets' : 'Your FUSE tickets';
  const greeting = guestName ? `Hi ${escapeHtml(guestName)},` : 'Hi,';
  const welcome = complimentary
    ? 'Your complimentary pass is ready.'
    : 'Your booking is confirmed.';
  const origin = siteOrigin(siteUrl);
  const count = Math.max(1, Number(ticketCount) || 1);
  const termsHtml = compactTerms(termsAndConditions);

  const metaBits = [
    when ? `<span style="color:${BRAND.muted};">When</span> ${escapeHtml(when)}` : '',
    place ? `<span style="color:${BRAND.muted};">Where</span> ${escapeHtml(place)}` : '',
  ].filter(Boolean);

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.cyan};">
      ${complimentary ? 'Complimentary' : 'Confirmed'}
    </p>
    <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:${BRAND.white};">${greeting}</p>
    <p style="margin:0 0 14px;font-size:13px;color:${BRAND.muted};">${welcome}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;background:${BRAND.soft};border:1px solid ${BRAND.border};border-radius:10px;">
      <tr>
        <td style="padding:12px 14px;">
          <p style="margin:0 0 2px;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.pink};">Event</p>
          <p style="margin:0 0 ${brief || metaBits.length ? '6' : '0'}px;font-size:16px;font-weight:700;line-height:1.25;color:${BRAND.white};">
            ${escapeHtml(eventTitle || 'FUSE Event')}
          </p>
          ${
            brief
              ? `<p style="margin:0 0 ${metaBits.length ? '8' : '0'}px;font-size:12px;line-height:1.4;color:${BRAND.muted};">${escapeHtml(brief)}</p>`
              : ''
          }
          ${
            metaBits.length
              ? `<p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.white};">${metaBits.join('<br/>')}</p>`
              : ''
          }
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:10px;">
      <tr>
        <td style="padding:12px 14px;">
          <p style="margin:0 0 2px;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.cyan};">Tickets</p>
          <p style="margin:0;font-size:13px;color:${BRAND.white};">
            <strong>${count} PDF ticket${count > 1 ? 's' : ''}</strong> attached - open to show your QR at the door.
          </p>
        </td>
      </tr>
    </table>

    ${
      termsHtml
        ? `<p style="margin:0 0 6px;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.pink};">Terms</p>
          <p style="margin:0 0 8px;font-size:11px;line-height:1.4;color:${BRAND.muted};">${termsHtml}</p>
          <p style="margin:0 0 10px;font-size:11px;color:${BRAND.muted};">
            Full terms:
            <a href="${escapeHtml(origin)}/about#terms" style="color:${BRAND.cyan};text-decoration:none;">fuseevents.net/about</a>
          </p>`
        : ''
    }

    <p style="margin:0;font-size:12px;color:${BRAND.muted};">
      See you there - <span style="color:${BRAND.white};font-weight:700;">FUSE</span>
    </p>
  `;

  const html = shell({
    preheader: `${eventTitle} - PDF tickets attached`,
    title,
    bodyHtml,
    siteUrl: origin,
  });

  const text = [
    greeting.replace(/<[^>]+>/g, ''),
    welcome,
    '',
    `Event: ${eventTitle || 'FUSE Event'}`,
    brief || '',
    when ? `When: ${when}` : '',
    place ? `Where: ${place}` : '',
    '',
    `${count} PDF ticket(s) attached.`,
    '',
    termsAndConditions ? `Terms: see ${origin}/about#terms` : '',
    origin,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject: `${title}: ${eventTitle}`, html, text };
}

export function buildContactNotifyEmail({ name, email, phone, message, siteUrl }) {
  const bodyHtml = `
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.cyan};">New message</p>
    <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:${BRAND.white};">Contact form</p>
    <p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted};">Name: <span style="color:${BRAND.text};">${escapeHtml(name)}</span></p>
    <p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted};">Email: <a href="mailto:${escapeHtml(email)}" style="color:${BRAND.cyan};text-decoration:none;">${escapeHtml(email)}</a></p>
    ${phone ? `<p style="margin:0 0 10px;font-size:13px;color:${BRAND.muted};">Phone: <span style="color:${BRAND.text};">${escapeHtml(phone)}</span></p>` : ''}
    <div style="padding:10px 12px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:8px;color:${BRAND.text};font-size:13px;white-space:pre-wrap;">${escapeHtml(message)}</div>
  `;

  return {
    subject: `FUSE contact: ${name}`,
    html: shell({
      preheader: `Message from ${name}`,
      title: 'New contact message',
      bodyHtml,
      siteUrl,
    }),
    text: `New contact from ${name} <${email}>\nPhone: ${phone || '-'}\n\n${message}`,
  };
}

export function buildContactAckEmail({ name, siteUrl }) {
  const bodyHtml = `
    <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:${BRAND.white};">
      Thanks${name ? `, ${escapeHtml(name)}` : ''}
    </p>
    <p style="margin:0;font-size:13px;color:${BRAND.muted};">
      We got your message and will reply soon. - FUSE
    </p>
  `;

  return {
    subject: 'We got your message - FUSE Events',
    html: shell({
      preheader: 'Thanks for writing to FUSE',
      title: 'Message received',
      bodyHtml,
      siteUrl,
    }),
    text: `Thanks${name ? `, ${name}` : ''}. We received your message.\n\n- FUSE Events\n${siteUrl}`,
  };
}

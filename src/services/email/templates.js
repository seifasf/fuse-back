/** FUSE transactional email HTML — branded confirmation (tickets live in PDF attachments). */

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

function plainBrief(text, max = 420) {
  const raw = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).trim()}…`;
}

function termsToHtml(terms) {
  const text = String(terms || '').trim();
  if (!text) return '';
  return escapeHtml(text).replace(/\r\n/g, '\n').replace(/\n/g, '<br/>');
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
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${escapeHtml(title || 'FUSE')}</title>
  <!--[if mso]><style>body,table,td{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePre}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:18px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND.bg};padding:28px 28px 22px;border-bottom:1px solid ${BRAND.border};" align="center">
              <img src="${logo}" width="148" height="40" alt="FUSE" style="display:block;margin:0 auto;border:0;outline:none;height:40px;width:auto;max-width:160px;" />
              <div style="margin-top:10px;height:2px;width:56px;background:linear-gradient(90deg,${BRAND.pink},${BRAND.cyan});border-radius:2px;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${BRAND.text};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${BRAND.muted};" align="center">
              <p style="margin:0 0 6px;">Kuwait | Egypt</p>
              <p style="margin:0 0 6px;">
                <a href="${escapeHtml(origin)}" style="color:${BRAND.cyan};text-decoration:none;">${escapeHtml(origin.replace(/^https?:\/\//, ''))}</a>
              </p>
              <p style="margin:0;">(c) ${year} FUSE Events</p>
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
  const greeting = guestName ? `Hi ${escapeHtml(guestName)},` : 'Welcome,';
  const welcome = complimentary
    ? `Welcome to FUSE. Your complimentary pass is ready.`
    : `Welcome to FUSE. Your booking is confirmed.`;
  const origin = siteOrigin(siteUrl);
  const count = Math.max(1, Number(ticketCount) || 1);
  const termsHtml = termsToHtml(termsAndConditions);

  const metaRows = [
    when
      ? `<tr>
          <td style="padding:8px 0;color:${BRAND.muted};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;width:72px;vertical-align:top;">When</td>
          <td style="padding:8px 0;color:${BRAND.white};font-size:14px;">${escapeHtml(when)}</td>
        </tr>`
      : '',
    place
      ? `<tr>
          <td style="padding:8px 0;color:${BRAND.muted};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;vertical-align:top;">Where</td>
          <td style="padding:8px 0;color:${BRAND.white};font-size:14px;">${escapeHtml(place)}</td>
        </tr>`
      : '',
  ].join('');

  const bodyHtml = `
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.cyan};">
      ${complimentary ? 'Complimentary pass' : 'Booking confirmed'}
    </p>
    <p style="margin:0 0 10px;font-size:22px;font-weight:700;line-height:1.25;color:${BRAND.white};">
      ${greeting}
    </p>
    <p style="margin:0 0 22px;font-size:15px;color:${BRAND.muted};">
      ${welcome}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;background:${BRAND.soft};border:1px solid ${BRAND.border};border-radius:14px;">
      <tr>
        <td style="padding:20px 20px 18px;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.pink};">
            Event
          </p>
          <p style="margin:0 0 ${brief || metaRows ? '10' : '0'}px;font-size:20px;font-weight:700;line-height:1.3;color:${BRAND.white};">
            ${escapeHtml(eventTitle || 'FUSE Event')}
          </p>
          ${
            brief
              ? `<p style="margin:0 0 ${metaRows ? '14' : '0'}px;font-size:14px;line-height:1.55;color:${BRAND.muted};">${escapeHtml(brief)}</p>`
              : ''
          }
          ${
            metaRows
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BRAND.border};padding-top:4px;">${metaRows}</table>`
              : ''
          }
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:14px;">
      <tr>
        <td style="padding:18px 20px;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.cyan};">
            Your tickets
          </p>
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:${BRAND.white};">
            ${count} printable PDF ticket${count > 1 ? 's' : ''} attached
          </p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:${BRAND.muted};">
            Open the PDF attachment${count > 1 ? 's' : ''} in this email to view your QR code${count > 1 ? 's' : ''} and ticket details. Present the QR at the entrance, or show the written ticket code if needed.
          </p>
        </td>
      </tr>
    </table>

    ${
      termsHtml
        ? `<p style="margin:0 0 10px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.pink};">
            Terms &amp; conditions
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${BRAND.soft};border:1px solid ${BRAND.border};border-radius:14px;">
            <tr>
              <td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;color:${BRAND.muted};">
                ${termsHtml}
              </td>
            </tr>
          </table>
          <p style="margin:0 0 8px;font-size:12px;color:${BRAND.muted};">
            By attending, you agree to these terms. Full details are also on
            <a href="${escapeHtml(origin)}/about#terms" style="color:${BRAND.cyan};text-decoration:none;">fuseevents.net</a>.
          </p>`
        : ''
    }

    <p style="margin:18px 0 0;font-size:13px;color:${BRAND.muted};">
      See you on the night.<br/>
      <span style="color:${BRAND.white};font-weight:700;">The FUSE team</span>
    </p>
  `;

  const html = shell({
    preheader: `${eventTitle} - your tickets are attached as PDF`,
    title,
    bodyHtml,
    siteUrl: origin,
  });

  const text = [
    greeting.replace(/<[^>]+>/g, ''),
    welcome,
    '',
    `Event: ${eventTitle || 'FUSE Event'}`,
    brief ? brief : '',
    when ? `When: ${when}` : '',
    place ? `Where: ${place}` : '',
    '',
    `${count} printable PDF ticket(s) are attached to this email.`,
    '',
    termsAndConditions ? `Terms & Conditions\n${String(termsAndConditions).trim()}` : '',
    '',
    origin,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject: `${title}: ${eventTitle}`, html, text };
}

export function buildContactNotifyEmail({ name, email, phone, message, siteUrl }) {
  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.cyan};">New website message</p>
    <p style="margin:0 0 18px;font-size:18px;font-weight:700;color:${BRAND.white};">Contact form</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;margin:0 0 18px;">
      <tr><td style="padding:4px 0;color:${BRAND.muted};width:72px;">Name</td><td style="padding:4px 0;color:${BRAND.text};">${escapeHtml(name)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Email</td><td style="padding:4px 0;"><a href="mailto:${escapeHtml(email)}" style="color:${BRAND.cyan};text-decoration:none;">${escapeHtml(email)}</a></td></tr>
      ${phone ? `<tr><td style="padding:4px 0;color:${BRAND.muted};">Phone</td><td style="padding:4px 0;color:${BRAND.text};">${escapeHtml(phone)}</td></tr>` : ''}
    </table>
    <div style="padding:14px 16px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:10px;color:${BRAND.text};white-space:pre-wrap;">${escapeHtml(message)}</div>
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
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:${BRAND.white};">
      Thanks${name ? `, ${escapeHtml(name)}` : ''}
    </p>
    <p style="margin:0 0 12px;color:${BRAND.muted};">
      We received your message and will get back to you soon.
    </p>
    <p style="margin:0;color:${BRAND.muted};">
      - The FUSE team
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
    text: `Thanks${name ? `, ${name}` : ''}. We received your message and will get back to you soon.\n\n- FUSE Events\n${siteUrl}`,
  };
}

/** FUSE transactional email HTML — table-based, dark brand, client-safe. */

const BRAND = {
  bg: '#0a0a0f',
  card: '#12121a',
  border: '#2a2a38',
  text: '#f4f4f8',
  muted: '#9a9aab',
  cyan: '#01e7fe',
  pink: '#ea20aa',
  white: '#ffffff',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function shell({ preheader, title, bodyHtml, siteUrl }) {
  const safePre = escapeHtml(preheader || title || 'FUSE Events');
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${escapeHtml(title || 'FUSE')}</title>
  <!--[if mso]><style>body,table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${safePre}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND.bg};padding:28px 28px 20px;border-bottom:1px solid ${BRAND.border};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:0.18em;color:${BRAND.white};">
                      FUSE
                    </div>
                    <div style="margin-top:6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.cyan};">
                      Events
                    </div>
                  </td>
                  <td align="right" valign="middle">
                    <div style="width:10px;height:10px;border-radius:50%;background:${BRAND.pink};display:inline-block;"></div>
                    <div style="width:10px;height:10px;border-radius:50%;background:${BRAND.cyan};display:inline-block;margin-left:6px;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${BRAND.text};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;border-top:1px solid ${BRAND.border};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${BRAND.muted};">
              <p style="margin:0 0 8px;">Kuwait · Egypt</p>
              <p style="margin:0 0 8px;">
                <a href="${escapeHtml(siteUrl)}" style="color:${BRAND.cyan};text-decoration:none;">${escapeHtml(siteUrl.replace(/^https?:\/\//, ''))}</a>
              </p>
              <p style="margin:0;">© ${year} FUSE Events. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ticketBlock(ticket, index) {
  const cid = `qr${index}`;
  const members = (ticket.members || [])
    .map((m) => escapeHtml(m.name))
    .filter(Boolean);
  const admit = ticket.admitCount || members.length || 1;
  const guestList =
    members.length > 1
      ? `<p style="margin:10px 0 0;font-size:13px;color:${BRAND.muted};"><strong style="color:${BRAND.text};">Guests</strong><br/>${members.join('<br/>')}</p>`
      : members.length === 1
        ? `<p style="margin:10px 0 0;font-size:13px;color:${BRAND.muted};">Guest: <span style="color:${BRAND.text};">${members[0]}</span></p>`
        : '';

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;">
    <tr>
      <td style="padding:18px;" align="center">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.cyan};">
          ${escapeHtml(ticket.tierName || 'Ticket')} · admits ${admit}
        </p>
        <img src="cid:${cid}" width="180" height="180" alt="Ticket QR" style="display:block;margin:12px auto;border:0;border-radius:8px;background:${BRAND.white};padding:8px;" />
        <p style="margin:8px 0 0;font-family:Consolas,Monaco,monospace;font-size:16px;letter-spacing:0.06em;color:${BRAND.white};">
          ${escapeHtml(ticket.code)}
        </p>
        ${guestList}
        <p style="margin:12px 0 0;font-size:12px;color:${BRAND.muted};">
          Show this QR at the door. One code covers everyone listed.
        </p>
      </td>
    </tr>
  </table>`;
}

export function buildTicketsEmail({
  guestName,
  eventTitle,
  venue,
  startsAt,
  tickets,
  siteUrl,
  complimentary = false,
}) {
  const when = formatWhen(startsAt);
  const place = [venue].filter(Boolean).join(' · ');
  const title = complimentary ? 'Your complimentary FUSE tickets' : 'Your FUSE tickets';
  const greeting = guestName ? `Hi ${escapeHtml(guestName)},` : 'Hi,';
  const lead = complimentary
    ? `Your complimentary pass for <strong style="color:${BRAND.white};">${escapeHtml(eventTitle)}</strong> is ready.`
    : `Your booking for <strong style="color:${BRAND.white};">${escapeHtml(eventTitle)}</strong> is confirmed.`;

  const meta = [
    when ? `<tr><td style="padding:4px 0;color:${BRAND.muted};width:88px;">When</td><td style="padding:4px 0;color:${BRAND.text};">${escapeHtml(when)}</td></tr>` : '',
    place ? `<tr><td style="padding:4px 0;color:${BRAND.muted};">Where</td><td style="padding:4px 0;color:${BRAND.text};">${escapeHtml(place)}</td></tr>` : '',
  ].join('');

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:${BRAND.white};">${greeting}</p>
    <p style="margin:0 0 18px;color:${BRAND.muted};">${lead}</p>
    ${
      meta
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;font-size:14px;">${meta}</table>`
        : ''
    }
    <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.pink};">
      Your entry QR${tickets.length > 1 ? 's' : ''}
    </p>
    ${tickets.map((t, i) => ticketBlock(t, i)).join('')}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
      <tr>
        <td style="border-radius:999px;background:${BRAND.cyan};">
          <a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:${BRAND.bg};text-decoration:none;">
            Open FUSE
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:${BRAND.muted};">
      Keep this email handy. You can also download a PDF ticket from the confirmation page on the website.
    </p>
  `;

  const html = shell({
    preheader: `${eventTitle} — your QR is inside`,
    title,
    bodyHtml,
    siteUrl,
  });

  const text = [
    greeting.replace(/<[^>]+>/g, ''),
    lead.replace(/<[^>]+>/g, ''),
    when ? `When: ${when}` : '',
    place ? `Where: ${place}` : '',
    '',
    ...tickets.map(
      (t) =>
        `${t.tierName || 'Ticket'} | ${t.code} | admits ${t.admitCount || 1}`
    ),
    '',
    siteUrl,
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
      — The FUSE team
    </p>
  `;

  return {
    subject: 'We got your message — FUSE Events',
    html: shell({
      preheader: 'Thanks for writing to FUSE',
      title: 'Message received',
      bodyHtml,
      siteUrl,
    }),
    text: `Thanks${name ? `, ${name}` : ''}. We received your message and will get back to you soon.\n\n— FUSE Events\n${siteUrl}`,
  };
}

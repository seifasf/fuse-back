import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

function getTransporter() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function sendTicketEmail({ to, name, eventTitle, tickets }) {
  const transport = getTransporter();
  if (!transport) {
    console.log(`[email mock] To: ${to}, Event: ${eventTitle}, Tickets: ${tickets.length}`);
    return { mock: true };
  }

  const html = `
    <h2>Your FUSE tickets for ${eventTitle}</h2>
    <p>Hi ${name},</p>
    <p>Your booking is confirmed. Present these QR codes at the gate.</p>
    ${tickets
      .map(
        (t, i) => `
      <div style="margin:20px 0;padding:16px;border:1px solid #eee;">
        <p><strong>Ticket ${i + 1}</strong></p>
        <img src="${t.qrDataUrl}" alt="QR Code" width="200" />
      </div>`
      )
      .join('')}
    <p>See you there!</p>
    <p>— FUSE Events</p>
  `;

  await transport.sendMail({
    from: env.emailFrom,
    to,
    subject: `Your tickets for ${eventTitle}`,
    html,
  });

  return { sent: true };
}

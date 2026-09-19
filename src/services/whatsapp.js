import { env } from '../config/env.js';

export async function sendTicketWhatsApp({ phone, name, eventTitle, ticketCount }) {
  if (!env.whatsapp.token || !env.whatsapp.phoneId) {
    console.log(`[whatsapp mock] To: ${phone}, Event: ${eventTitle}, Tickets: ${ticketCount}`);
    return { mock: true };
  }

  const cleanPhone = phone.replace(/\D/g, '');
  const message = `Hi ${name}! Your ${ticketCount} ticket(s) for ${eventTitle} are confirmed. Download your QR from FUSE. See you there!`;

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${env.whatsapp.phoneId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.whatsapp.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: message },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('WhatsApp send failed:', err);
    return { sent: false, error: err };
  }

  return { sent: true };
}

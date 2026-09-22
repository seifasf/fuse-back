import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { colorForTierName, normalizeHexColor } from '../constants/ticketTiers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_WHITE = path.resolve(__dirname, '../../assets/logo-white.png');
const LOGO_COLOR = path.resolve(__dirname, '../../assets/logo-color.png');
const LOGO_PATH = fs.existsSync(LOGO_WHITE) ? LOGO_WHITE : LOGO_COLOR;

function toPdfText(value, fallback = '') {
  return String(value ?? fallback)
    .normalize('NFKD')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hexToRgb(hex) {
  const h = normalizeHexColor(hex).replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function safeFilename(code) {
  return toPdfText(code, 'ticket').replace(/[^\w.-]+/g, '_') || 'ticket';
}

/**
 * Build one printable FUSE ticket PDF (same layout as the website download).
 * Returns { filename, contentBase64, buffer }.
 */
export async function buildTicketPdfBuffer(ticket) {
  const eventTitle = toPdfText(ticket.eventTitle, 'FUSE Event') || 'FUSE Event';
  const holderName = toPdfText(ticket.holderName);
  const tierName = toPdfText(ticket.tierName);
  const code = toPdfText(ticket.code, 'TICKET') || 'TICKET';
  const admitCount = Math.max(1, Number(ticket.admitCount) || ticket.members?.length || 1);
  const memberLines = (ticket.members || [])
    .map((m) => toPdfText(m.name))
    .filter(Boolean)
    .slice(0, 12);

  let qrPng;
  if (ticket.qrDataUrl?.startsWith('data:image')) {
    qrPng = Buffer.from(ticket.qrDataUrl.split(',')[1], 'base64');
  } else if (ticket.qrPayload) {
    qrPng = await QRCode.toBuffer(ticket.qrPayload, {
      type: 'png',
      margin: 2,
      width: 480,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
  } else {
    throw new Error('Ticket missing QR payload');
  }

  const pageW = 105 * 2.83465; // mm ? pt (pdfkit uses pt; 1mm ? 2.83465pt)
  const pageH = 160 * 2.83465;
  const margin = 10 * 2.83465;

  const doc = new PDFDocument({
    size: [pageW, pageH],
    margin: 0,
    info: {
      Title: `FUSE Ticket ${code}`,
      Author: 'FUSE Events',
    },
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // White page
  doc.rect(0, 0, pageW, pageH).fill('#ffffff');

  // Black header
  doc.rect(0, 0, pageW, 30 * 2.83465).fill('#0a0a0f');

  if (fs.existsSync(LOGO_PATH)) {
    const logoW = 52 * 2.83465;
    const logoH = 18 * 2.83465;
    doc.image(LOGO_PATH, (pageW - logoW) / 2, 6 * 2.83465, {
      width: logoW,
      height: logoH,
      fit: [logoW, logoH],
    });
  } else {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18);
    doc.text('FUSE', 0, 14 * 2.83465, { width: pageW, align: 'center' });
  }

  let y = 40 * 2.83465;

  doc.fillColor('#0a0a0f').font('Helvetica-Bold').fontSize(9);
  doc.text('EVENT TICKET', margin, y, { width: pageW - margin * 2, align: 'center' });
  y += 8 * 2.83465;

  doc.fontSize(14);
  doc.text(eventTitle, margin, y, { width: pageW - margin * 2, align: 'center' });
  y = doc.y + 4 * 2.83465;

  doc.font('Helvetica').fontSize(9).fillColor('#50505f');
  if (tierName) {
    const rgb = hexToRgb(colorForTierName(ticket.tierName, ticket.tierColor));
    const label = `${tierName}  |  admits ${admitCount}`;
    const textW = doc.widthOfString(label);
    const startX = pageW / 2 - (textW + 10) / 2;
    doc.circle(startX + 3, y + 3, 3).fill(`rgb(${rgb.r},${rgb.g},${rgb.b})`);
    doc.fillColor('#50505f').text(label, startX + 10, y, { lineBreak: false });
    y += 6 * 2.83465;
  }

  if (memberLines.length) {
    doc.fontSize(8);
    for (const line of memberLines) {
      doc.text(line, margin, y, { width: pageW - margin * 2, align: 'center' });
      y += 4 * 2.83465;
    }
    y += 2 * 2.83465;
  } else if (holderName) {
    doc.text(holderName, margin, y, { width: pageW - margin * 2, align: 'center' });
    y += 5 * 2.83465;
  }

  y += 2 * 2.83465;
  const qrSize = 58 * 2.83465;
  const qrX = (pageW - qrSize) / 2;
  doc
    .roundedRect(qrX - 8, y - 8, qrSize + 16, qrSize + 16, 8)
    .fillAndStroke('#ffffff', '#e6e6eb');
  doc.image(qrPng, qrX, y, { width: qrSize, height: qrSize });
  y += qrSize + 10 * 2.83465;

  // Code box
  const boxH = 18 * 2.83465;
  doc.roundedRect(margin, y, pageW - margin * 2, boxH, 8).fill('#f6f8fb');
  doc.fillColor('#0a0a0f').font('Helvetica-Bold').fontSize(13);
  doc.text(code, margin, y + 11, { width: pageW - margin * 2, align: 'center' });

  y += 24 * 2.83465;
  doc.font('Helvetica').fontSize(7).fillColor('#9696a0');
  doc.text('FUSE Events  |  fuseevents.net', margin, y, {
    width: pageW - margin * 2,
    align: 'center',
  });

  y += 7 * 2.83465;
  doc.fontSize(7.5).fillColor('#6e6e7d');
  doc.text(
    'Present this QR at the entrance. If the scanner fails, gate staff can verify with the written ticket code above.',
    margin,
    y,
    { width: pageW - margin * 2, align: 'center' }
  );

  doc.end();
  const buffer = await done;
  return {
    filename: `fuse-ticket-${safeFilename(code)}.pdf`,
    contentBase64: buffer.toString('base64'),
    buffer,
  };
}

/** Build PDFs for many tickets (one file per QR / tier line). */
export async function buildTicketPdfs(tickets) {
  const out = [];
  for (const t of tickets || []) {
    out.push(await buildTicketPdfBuffer(t));
  }
  return out;
}

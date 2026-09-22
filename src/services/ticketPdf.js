import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { colorForTierName, normalizeHexColor } from '../constants/ticketTiers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, '../../assets');
const LOGO_COLOR = path.join(ASSETS, 'logo-color.png');
const LOGO_WHITE = path.join(ASSETS, 'logo-white.png');
/** Match website download: prefer color logo on the black header. */
const LOGO_PATH = fs.existsSync(LOGO_COLOR) ? LOGO_COLOR : LOGO_WHITE;

/** 1 mm in PDF points */
const MM = 2.834645669;

function mm(n) {
  return n * MM;
}

function toPdfText(value, fallback = '') {
  return String(value ?? fallback)
    .normalize('NFKD')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2022\u00B7]/g, '-')
    .replace(/[\u00A0\u202F\u2007]/g, ' ')
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
 * Printable FUSE ticket PDF — same layout as the website jsPDF download
 * (105 x 160 mm: black logo header, event, tier, QR, code box, footer).
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

  const pageW = mm(105);
  const pageH = mm(160);
  const margin = mm(10);

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

  // Black header behind the company logo (30 mm)
  doc.rect(0, 0, pageW, mm(30)).fill('#0a0a0f');

  if (fs.existsSync(LOGO_PATH)) {
    const logoW = mm(52);
    const logoH = mm(18);
    doc.image(LOGO_PATH, (pageW - logoW) / 2, mm(6), {
      fit: [logoW, logoH],
      align: 'center',
      valign: 'center',
    });
  } else {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18);
    doc.text('FUSE', 0, mm(14), { width: pageW, align: 'center' });
  }

  // Content starts at 40 mm (pdfkit text y is top of line box)
  let y = mm(40);

  doc.fillColor('#0a0a0f').font('Helvetica-Bold').fontSize(9);
  doc.text('EVENT TICKET', margin, y - mm(2.5), {
    width: pageW - margin * 2,
    align: 'center',
    lineBreak: false,
  });
  y += mm(8);

  doc.fontSize(14);
  const titleHeight = doc.heightOfString(eventTitle, {
    width: pageW - margin * 2,
    align: 'center',
  });
  doc.text(eventTitle, margin, y - mm(3.5), {
    width: pageW - margin * 2,
    align: 'center',
  });
  y += Math.max(mm(6), titleHeight) + mm(4);

  doc.font('Helvetica').fontSize(9).fillColor('#50505f');
  if (tierName) {
    const rgb = hexToRgb(colorForTierName(ticket.tierName, ticket.tierColor));
    // Same as website (middle-dot becomes ASCII '-' via toPdfText path; use " - ")
    const label = `${tierName}  -  admits ${admitCount}`;
    const textW = doc.widthOfString(label);
    const gap = mm(3);
    const dot = mm(2.2);
    const totalW = textW + gap + dot;
    const startX = pageW / 2 - totalW / 2;
    doc
      .circle(startX + dot / 2, y - mm(1.1), dot / 2)
      .fill(`rgb(${rgb.r},${rgb.g},${rgb.b})`);
    doc.fillColor('#50505f').text(label, startX + dot + gap, y - mm(3), {
      lineBreak: false,
    });
    y += mm(6);
  }

  if (memberLines.length) {
    doc.fontSize(8);
    for (const line of memberLines) {
      doc.text(line, margin, y - mm(2.5), {
        width: pageW - margin * 2,
        align: 'center',
        lineBreak: false,
      });
      y += mm(4);
    }
    y += mm(2);
  } else if (holderName) {
    doc.text(holderName, margin, y - mm(2.5), {
      width: pageW - margin * 2,
      align: 'center',
      lineBreak: false,
    });
    y += mm(5);
  }

  y += mm(2);

  const qrSize = mm(58);
  const qrX = (pageW - qrSize) / 2;
  // Website: 3 mm padding, 3 mm corner radius
  doc
    .roundedRect(qrX - mm(3), y - mm(3), qrSize + mm(6), qrSize + mm(6), mm(3))
    .fillAndStroke('#ffffff', '#e6e6eb');
  doc.image(qrPng, qrX, y, { width: qrSize, height: qrSize });
  y += qrSize + mm(10);

  // Ticket code box — 18 mm tall, 3 mm radius
  doc.roundedRect(margin, y, pageW - margin * 2, mm(18), mm(3)).fill('#f6f8fb');
  doc.fillColor('#0a0a0f').font('Helvetica-Bold').fontSize(13);
  doc.text(code, margin, y + mm(11.5) - mm(4.5), {
    width: pageW - margin * 2,
    align: 'center',
    lineBreak: false,
  });

  y += mm(24);
  doc.font('Helvetica').fontSize(7).fillColor('#9696a0');
  doc.text('FUSE Events  |  fuseevents.net', margin, y - mm(2), {
    width: pageW - margin * 2,
    align: 'center',
    lineBreak: false,
  });

  y += mm(7);
  doc.fontSize(7.5).fillColor('#6e6e7d');
  doc.text(
    'Present this QR at the entrance. If the scanner fails, gate staff can verify with the written ticket code above.',
    margin,
    y - mm(2),
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

export async function buildTicketPdfs(tickets) {
  const out = [];
  for (const t of tickets || []) {
    out.push(await buildTicketPdfBuffer(t));
  }
  return out;
}

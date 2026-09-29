import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { colorForTierName, normalizeHexColor } from '../constants/ticketTiers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, '../../assets');
const LOGO_PDF = path.join(ASSETS, 'logo-color-pdf.png');
const LOGO_COLOR = path.join(ASSETS, 'logo-color.png');
const LOGO_WHITE = path.join(ASSETS, 'logo-white.png');
/**
 * Match website download: prefer color logo on the black header.
 * Keep the PDF logo small (~800px wide): pdfkit decodes PNG alpha in JS on every
 * document, and the full-size 8k logo made each ticket take over a second of CPU.
 */
const LOGO_PATH = [LOGO_PDF, LOGO_COLOR, LOGO_WHITE].find((p) => fs.existsSync(p)) || null;
const LOGO_BUFFER = LOGO_PATH ? fs.readFileSync(LOGO_PATH) : null;

/** 1 mm in PDF points */
const MM = 2.834645669;
const DOT = '\u00B7';

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

/** Shorten one line with "..." until it fits. */
function ellipsize(text, maxW, measure) {
  if (measure(text) <= maxW) return text;
  let s = text;
  while (s.length > 1 && measure(`${s}...`) > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}...`;
}

/** Word-wrap into at most maxLines lines; the last line gets "..." when text is cut. */
function wrapText(text, maxW, measure, maxLines) {
  const lines = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const test = cur ? `${cur} ${word}` : word;
    if (!cur || measure(test) <= maxW) cur = test;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  const out = lines.slice(0, maxLines);
  if (lines.length > maxLines) out[maxLines - 1] = `${out[maxLines - 1]}...`;
  return out.map((l) => ellipsize(l, maxW, measure));
}

/** Pack items ("Name (SEAT)") into lines joined by sep; overflow becomes "+N more". */
function packItems(items, sep, maxW, measure, maxLines) {
  if (maxLines < 1 || !items.length) return [];
  const lines = [];
  let cur = '';
  let used = 0;
  for (let i = 0; i < items.length; i += 1) {
    const test = cur ? `${cur}${sep}${items[i]}` : items[i];
    if (!cur || measure(test) <= maxW) {
      cur = test;
      used = i + 1;
      continue;
    }
    if (lines.length + 1 >= maxLines) break;
    lines.push(cur);
    cur = items[i];
    used = i + 1;
  }
  if (cur) lines.push(cur);

  let rest = items.length - used;
  if (rest > 0) {
    let last = lines.pop();
    while (measure(`${last}${sep}+${rest} more`) > maxW && last.includes(sep)) {
      last = last.slice(0, last.lastIndexOf(sep));
      rest += 1;
    }
    lines.push(`${last}${sep}+${rest} more`);
  }
  return lines.map((l) => ellipsize(l, maxW, measure));
}

/**
 * Printable FUSE ticket PDF - always exactly one 105 x 160 mm page, same layout as the
 * website jsPDF download. Top block flows down (header, event, tier, seat, guests), the
 * code box / note / brand are pinned to the bottom, and the QR takes the space between.
 */
export async function buildTicketPdfBuffer(ticket) {
  const eventTitle = toPdfText(ticket.eventTitle, 'FUSE Event') || 'FUSE Event';
  const holderName = toPdfText(ticket.holderName);
  const tierName = toPdfText(ticket.tierName);
  const code = toPdfText(ticket.code, 'TICKET') || 'TICKET';
  const admitCount = Math.max(1, Number(ticket.admitCount) || ticket.members?.length || 1);
  const seats = (ticket.seats || []).map((s) => toPdfText(s)).filter(Boolean);
  const members = (ticket.members || [])
    .map((m) => ({ name: toPdfText(m.name), seat: toPdfText(m.seat) }))
    .filter((m) => m.name);

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

  const W = 105;
  const H = 160;
  const M = 9;
  const CW = W - M * 2;
  const HEADER = 28;
  const tierRgb = hexToRgb(colorForTierName(ticket.tierName, ticket.tierColor));
  const tierFill = `rgb(${tierRgb.r},${tierRgb.g},${tierRgb.b})`;

  const doc = new PDFDocument({
    size: [mm(W), mm(H)],
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

  /** Measure / draw in mm; y is the top of the line. */
  const setFont = (bold, size, color) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color);
  };
  const measure = (s) => doc.widthOfString(s) / MM;
  const center = (s, y) => {
    doc.text(s, mm(M), mm(y), { width: mm(CW), align: 'center', lineBreak: false });
  };

  doc.rect(0, 0, mm(W), mm(H)).fill('#ffffff');

  // Header: logo on black, thin tier-color accent underneath
  doc.rect(0, 0, mm(W), mm(HEADER)).fill('#0a0a0f');
  if (LOGO_BUFFER) {
    doc.image(LOGO_BUFFER, mm((W - 50) / 2), mm(6), {
      fit: [mm(50), mm(16)],
      align: 'center',
      valign: 'center',
    });
  } else {
    setFont(true, 18, '#ffffff');
    center('FUSE', 10);
  }
  doc.rect(0, mm(HEADER), mm(W), mm(1.2)).fill(tierFill);

  // Bottom block, pinned from the page bottom up
  setFont(false, 6.5, '#7a7a88');
  const note = wrapText(
    'Present this QR at the entrance. If the scanner fails, gate staff can verify with the ticket code above.',
    CW,
    measure,
    2
  );
  const brandY = H - 7;
  const noteY = brandY - 1.5 - note.length * 3;
  const codeH = 15;
  const codeY = noteY - 3.5 - codeH;
  const qrLimit = codeY - 5;

  // Top block
  let y = HEADER + 7;
  setFont(true, 7.5, '#8a8a99');
  center('EVENT TICKET', y);
  y += 5;

  setFont(true, 15, '#0a0a0f');
  const titleLines = wrapText(eventTitle, CW, measure, 2);
  for (const line of titleLines) {
    center(line, y);
    y += 6.2;
  }
  y += 1.5;

  if (tierName) {
    setFont(false, 9, '#50505f');
    const label = `${tierName}  ${DOT}  Admits ${admitCount}`;
    const dot = 2.2;
    const gap = 2.5;
    const startX = W / 2 - (measure(label) + gap + dot) / 2;
    doc.circle(mm(startX + dot / 2), mm(y + 1.45), mm(dot / 2)).fill(tierFill);
    doc.fillColor('#50505f').text(label, mm(startX + dot + gap), mm(y), { lineBreak: false });
    y += 5.5;
  }

  if (seats.length) {
    setFont(true, 9.5, '#0a0a0f');
    const seatLine = `Tier: ${tierName || '-'}, ${seats.length > 1 ? 'Seats' : 'Seat'}: ${seats.join(', ')}`;
    for (const line of wrapText(seatLine, CW, measure, 2)) {
      center(line, y);
      y += 4.2;
    }
    y += 0.8;
  }

  // Guests: as many lines as fit while keeping the QR at least 40 mm
  const QR_PAD = 2.5;
  const QR_MIN = 40;
  const QR_MAX = 56;
  const guestLineH = 3.5;
  const guestBudget = Math.floor((qrLimit - QR_PAD * 2 - 3 - QR_MIN - y - 1) / guestLineH);
  const guestItems =
    members.length > 1
      ? members.map((m) => (m.seat ? `${m.name} (${m.seat})` : m.name))
      : [members[0]?.name || holderName].filter(Boolean);
  setFont(false, 7.5, '#6e6e7d');
  const guestLines = packItems(guestItems, `   ${DOT}   `, CW, measure, Math.max(0, Math.min(4, guestBudget)));
  for (const line of guestLines) {
    center(line, y);
    y += guestLineH;
  }
  if (guestLines.length) y += 1;

  // QR fills the space between the top and bottom blocks
  const qrTop = y + 3 + QR_PAD;
  const qrSize = Math.max(QR_MIN, Math.min(QR_MAX, qrLimit - QR_PAD - qrTop));
  const qrX = (W - qrSize) / 2;
  doc
    .roundedRect(mm(qrX - QR_PAD), mm(qrTop - QR_PAD), mm(qrSize + QR_PAD * 2), mm(qrSize + QR_PAD * 2), mm(3))
    .fillAndStroke('#ffffff', '#e6e6eb');
  doc.image(qrPng, mm(qrX), mm(qrTop), { width: mm(qrSize), height: mm(qrSize) });

  // Ticket code box
  doc.roundedRect(mm(M), mm(codeY), mm(CW), mm(codeH), mm(3)).fill('#f4f5f8');
  setFont(true, 6, '#8a8a99');
  center('TICKET CODE', codeY + 2.6);
  setFont(true, 13, '#0a0a0f');
  center(code, codeY + 6.8);

  setFont(false, 6.5, '#7a7a88');
  note.forEach((line, i) => center(line, noteY + i * 3));
  setFont(false, 6.5, '#a0a0aa');
  center(`FUSE Events  ${DOT}  fuseevents.net`, brandY);

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

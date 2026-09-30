/** Seat map geometry + auto seat layout. Keep in sync with frontend src/lib/seatLayout.ts */

export const SEAT_CANVAS = { width: 1000, height: 700, headerHeight: 64 };
export const MIN_ZONE_SIZE = 40;
export const MAX_TIERS = 12;
export const MAX_SEATS_PER_TIER = 2000;
export const MAX_SEATS_TOTAL = 5000;
/** Smallest seat radius (canvas units) we allow before a zone counts as too small. */
export const MIN_SEAT_RADIUS = 2.5;
export const MAX_ROWS_PER_TIER = 100;
export const MAX_SEATS_PER_ROW = 200;
const ZONE_PADDING = 8;
/** Width reserved on each side of a row for its name, in seat cells. */
const ROW_LABEL_CELLS = 1.2;

/** "a-1" -> "A1". Row names become part of seat labels (VIP-A-1), so keep them short and plain. */
export function normalizeRowName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
}

/** 0 -> A, 25 -> Z, 26 -> AA ... */
export function defaultRowName(index) {
  let n = index;
  let name = '';
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** "Gold VIP!" -> "GOLDVIP". Used as the seat label prefix, e.g. GOLD-12. */
export function tierPrefix(name) {
  const cleaned = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  return cleaned || 'SEAT';
}

export function isRectInsideCanvas(rect, canvas = SEAT_CANVAS) {
  return (
    rect.x >= 0 &&
    rect.y >= canvas.headerHeight &&
    rect.x + rect.w <= canvas.width &&
    rect.y + rect.h <= canvas.height
  );
}

/**
 * Evenly lay out `count` seats inside `zone` in rows/columns.
 * Picks the column count that gives the largest seats; the last row is centered.
 * Returns seats in label order (row by row, left to right).
 */
export function layoutSeats(zone, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return [];
  const w = Math.max(1, zone.w - ZONE_PADDING * 2);
  const h = Math.max(1, zone.h - ZONE_PADDING * 2);

  let bestCols = 1;
  let bestSize = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const size = Math.min(w / cols, h / rows);
    if (size > bestSize) {
      bestSize = size;
      bestCols = cols;
    }
  }

  const cols = bestCols;
  const rows = Math.ceil(n / cols);
  const cellW = w / cols;
  const cellH = h / rows;
  const r = Math.min(cellW, cellH) * 0.36;

  const seats = [];
  for (let row = 0; row < rows; row++) {
    const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const offset = ((cols - inRow) * cellW) / 2;
    for (let c = 0; c < inRow; c++) {
      seats.push({
        x: round1(zone.x + ZONE_PADDING + offset + cellW * (c + 0.5)),
        y: round1(zone.y + ZONE_PADDING + cellH * (row + 0.5)),
        r: round1(r),
      });
    }
  }
  return seats;
}

/**
 * One line of seats per row, top to bottom in the given order. Shorter rows are centered and
 * every row keeps the same seat size. Row names sit in a gutter at both ends of the row.
 */
export function layoutRows(zone, rows) {
  const list = (rows || []).filter((r) => r.seats > 0);
  if (!list.length) return { seats: [], labels: [] };
  const w = Math.max(1, zone.w - ZONE_PADDING * 2);
  const h = Math.max(1, zone.h - ZONE_PADDING * 2);
  const widest = Math.max(...list.map((r) => r.seats));
  const cellW = w / (widest + ROW_LABEL_CELLS * 2);
  const cellH = h / list.length;
  const r = Math.min(cellW, cellH) * 0.36;
  const gutter = cellW * ROW_LABEL_CELLS;
  const longest = Math.max(1, ...list.map((row) => String(row.name).length));
  const size = round1(Math.min(cellH * 0.55, cellW, (gutter * 0.85) / (longest * 0.62)));

  const seats = [];
  const labels = [];
  list.forEach((row, ri) => {
    const y = round1(zone.y + ZONE_PADDING + cellH * (ri + 0.5));
    const offset = gutter + ((widest - row.seats) * cellW) / 2;
    for (let c = 0; c < row.seats; c++) {
      seats.push({
        row: row.name,
        number: c + 1,
        x: round1(zone.x + ZONE_PADDING + offset + cellW * (c + 0.5)),
        y,
        r: round1(r),
      });
    }
    labels.push(
      { text: row.name, x: round1(zone.x + ZONE_PADDING + gutter / 2), y, size },
      { text: row.name, x: round1(zone.x + zone.w - ZONE_PADDING - gutter / 2), y, size }
    );
  });
  return { seats, labels };
}

/**
 * Build every seat for every tier. Tiers without rows use the auto grid (VIP-1, VIP-2...);
 * tiers with rows are labelled by row (VIP-A-1, VIP-A-2, VIP-B-1...).
 */
export function generateSeatLayout(tiers) {
  const seats = [];
  const rowLabels = [];
  for (const tier of tiers) {
    const prefix = tierPrefix(tier.name);
    if (tier.rows?.length) {
      const laid = layoutRows(tier.zone, tier.rows);
      for (const s of laid.seats) {
        seats.push({ label: `${prefix}-${s.row}-${s.number}`, tierKey: tier.key, x: s.x, y: s.y, r: s.r });
      }
      for (const l of laid.labels) rowLabels.push({ tierKey: tier.key, ...l });
      continue;
    }
    layoutSeats(tier.zone, tier.seatCount).forEach((pos, i) => {
      seats.push({ label: `${prefix}-${i + 1}`, tierKey: tier.key, ...pos });
    });
  }
  return { seats, rowLabels };
}

export function generateSeats(tiers) {
  return generateSeatLayout(tiers).seats;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

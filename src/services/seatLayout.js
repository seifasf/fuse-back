/** Seat map geometry + auto seat layout. Keep in sync with frontend src/lib/seatLayout.ts */

export const SEAT_CANVAS = { width: 1000, height: 700, headerHeight: 64 };
export const MIN_ZONE_SIZE = 40;
export const MAX_TIERS = 12;
export const MAX_SEATS_PER_TIER = 2000;
export const MAX_SEATS_TOTAL = 5000;
/** Smallest seat radius (canvas units) we allow before a zone counts as too small. */
export const MIN_SEAT_RADIUS = 2.5;
const ZONE_PADDING = 8;

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

/** Build every seat for every tier: labels restart at 1 per tier (VIP-1, VIP-2, GOLD-1...). */
export function generateSeats(tiers) {
  const seats = [];
  for (const tier of tiers) {
    const prefix = tierPrefix(tier.name);
    layoutSeats(tier.zone, tier.seatCount).forEach((pos, i) => {
      seats.push({ label: `${prefix}-${i + 1}`, tierKey: tier.key, ...pos });
    });
  }
  return seats;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

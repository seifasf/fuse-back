/** Keep in sync with frontend src/lib/ticketTiers.ts */

export const TIER_PRESETS = [
  { id: 'regular', name: 'Regular', color: '#64748B', priceMultiplier: 1 },
  { id: 'bronze', name: 'Bronze', color: '#CD7F32', priceMultiplier: 1.15 },
  { id: 'silver', name: 'Silver', color: '#94A3B8', priceMultiplier: 1.4 },
  { id: 'gold', name: 'Gold', color: '#D4AF37', priceMultiplier: 1.8 },
  { id: 'platinum', name: 'Platinum', color: '#A8B2C1', priceMultiplier: 2.4 },
  { id: 'diamond', name: 'Diamond', color: '#67E8F9', priceMultiplier: 3.2 },
  { id: 'vip', name: 'VIP', color: '#C026D3', priceMultiplier: 4 },
];

const DEFAULT_COLOR = '#64748B';

export function normalizeHexColor(value, fallback = DEFAULT_COLOR) {
  const raw = String(value || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(raw)) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

export function colorForTierName(name, explicitColor) {
  if (explicitColor) return normalizeHexColor(explicitColor);
  const key = String(name || '')
    .trim()
    .toLowerCase();
  const preset = TIER_PRESETS.find((p) => p.name.toLowerCase() === key || p.id === key);
  return preset?.color || DEFAULT_COLOR;
}

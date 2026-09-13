/** Shared domain enums ù single source of truth for all models */

export const COUNTRIES = ['EG', 'KW'];
export const COUNTRY_OR_ALL = ['EG', 'KW', 'ALL'];

export const CURRENCIES = ['EGP', 'KWD'];

export const USER_ROLES = ['admin', 'gate_agent', 'client'];

export const EVENT_STATUSES = ['draft', 'upcoming', 'live', 'past', 'cancelled'];

export const EVENT_CATEGORIES = [
  'club night',
  'festival',
  'concert',
  'pop-up',
  'pool party',
  'rooftop',
  'private',
  'other',
];

export const BOOKING_STATUSES = ['pending', 'paid', 'cancelled', 'refunded', 'expired'];

export const TICKET_STATUSES = ['valid', 'used', 'cancelled', 'refunded'];

export const PAYMENT_PROVIDERS = ['mock', 'paymob', 'myfatoorah', 'manual'];

export const SECTION_TYPES = [
  'hero',
  'stats',
  'upcoming_events',
  'characters',
  'past_events',
  'about',
  'contact',
  'cta',
  'custom',
];

export const SCAN_RESULTS = ['valid', 'already_used', 'invalid', 'cancelled', 'forbidden'];

/** Country ? default currency */
export function currencyForCountry(country) {
  return country === 'KW' ? 'KWD' : 'EGP';
}

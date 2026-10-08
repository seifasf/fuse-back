/** Shared domain enums  single source of truth for all models */

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

/**
 * pending = waiting for the payment gateway; pending_approval = waiting for an admin to confirm the
 * payment arranged on WhatsApp (PAYMENT_MODE=manual). paid (gateway) and approved (manual) both mean
 * tickets were issued.
 */
export const BOOKING_STATUSES = [
  'pending',
  'pending_approval',
  'paid',
  'approved',
  'rejected',
  'cancelled',
  'refunded',
  'expired',
];

/** Orders whose tickets are issued and count as sales. */
export const SOLD_BOOKING_STATUSES = ['paid', 'approved'];

export const TICKET_STATUSES = ['valid', 'used', 'cancelled', 'refunded'];

/** manual = admin-issued complimentary ticket; offline = paid outside the site, approved by an admin. */
export const PAYMENT_PROVIDERS = ['mock', 'paymob', 'myfatoorah', 'manual', 'offline'];

export const SEAT_MAP_STATUSES = ['draft', 'published'];

export const SEAT_RESERVATION_STATUSES = ['held', 'sold'];

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

export const SCAN_RESULTS = ['valid', 'already_used', 'invalid', 'cancelled', 'forbidden', 'partial'];

/** Country ? default currency */
export function currencyForCountry(country) {
  return country === 'KW' ? 'KWD' : 'EGP';
}

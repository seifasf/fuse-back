import { randomBytes } from 'crypto';

/** Short uppercase ticket code e.g. FUSE-A3K9XQ */
export function generateTicketCode() {
  const raw = randomBytes(4).toString('hex').toUpperCase();
  return `FUSE-${raw}`;
}

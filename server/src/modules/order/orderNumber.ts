import { randomInt } from 'node:crypto';

/**
 * Human-readable, support-friendly order numbers: `PB-YYMMDD-XXXXXX`
 *  - YYMMDD: UTC creation date (no personal data, no sequence that reveals order volume);
 *  - XXXXXX: 6 characters from a 30-character alphabet without look-alikes (no 0/O, 1/I/L, U), drawn with a CSPRNG.
 * That is ~729 million combinations per day. The column is unique; on the (rare) collision the order transaction is
 * retried with a fresh number (see OrderService) - never surfaced as a raw database error.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export type OrderNumberGenerator = (now?: Date) => string;

export const generateOrderNumber: OrderNumberGenerator = (now = new Date()) => {
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `PB-${yy}${mm}${dd}-${suffix}`;
};

let activeGenerator: OrderNumberGenerator = generateOrderNumber;

export function nextOrderNumber(): string {
  return activeGenerator();
}

/** Test seam (deterministic collision tests). Refused in production. */
export function setOrderNumberGenerator(generator: OrderNumberGenerator | null): void {
  if (process.env.NODE_ENV === 'production') throw new Error('The order number generator cannot be replaced in production');
  activeGenerator = generator ?? generateOrderNumber;
}

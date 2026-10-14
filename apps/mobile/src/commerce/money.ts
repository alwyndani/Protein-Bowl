import type { Money } from './types';

/**
 * Presentation-only INR formatting: "₹", Indian digit grouping, always two decimals ("₹299.00", "₹1,249.50").
 *
 * It is NEVER used to compute anything: no summing, multiplying, tax or total derivation exists on the device - the server supplies
 * every figure. Decimal STRINGS are formatted with pure string / integer logic (no float); server NUMBERS (cart, preview) are formatted
 * with toFixed(2), which is allowed for presentation. Anything unparseable renders as a dash, never as a guess.
 */
const DASH = '—';

function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

export function formatInr(value: Money | null | undefined): string {
  if (value === null || value === undefined || value === '') return DASH;
  let plain: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return DASH;
    plain = value.toFixed(2);
  } else {
    plain = value.trim();
    if (!/^-?\d+(\.\d+)?$/.test(plain)) return DASH;
  }
  const negative = plain.startsWith('-');
  const [intRaw, fracRaw = ''] = (negative ? plain.slice(1) : plain).split('.');
  let cents = BigInt(`${intRaw}${(fracRaw + '00').slice(0, 2)}`);
  if (fracRaw.length > 2 && fracRaw[2] >= '5') cents += 1n; // string-exact half-up for any extra digits (the server sends at most 2)
  const digits = cents.toString().padStart(3, '0');
  const rupees = groupIndian(digits.slice(0, -2));
  const paise = digits.slice(-2);
  const isZero = cents === 0n;
  return `${negative && !isZero ? '-' : ''}₹${rupees}.${paise}`;
}

/** Presentation helper: is a server amount zero (so a line such as a deposit can be hidden)? String / number inspection only. */
export function isZeroMoney(value: Money | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'number') return value === 0;
  return /^-?0+(\.0+)?$/.test(value.trim());
}

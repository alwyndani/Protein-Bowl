/**
 * Mobile-number handling for the customer profile. No country code is assumed or added: the number is kept as the customer wrote it,
 * minus separators, so "+91 98765 43210" and "+91-98765-43210" are the same number for the duplicate check.
 */
const SEPARATORS = /[\s\-().]/g;

/** Returns the canonical form (optional leading "+", then 8-15 digits) or null when the input is not a plausible phone number. */
export function normalizePhone(raw: string): string | null {
  const compact = raw.trim().replace(SEPARATORS, '');
  return /^\+?[0-9]{8,15}$/.test(compact) ? compact : null;
}

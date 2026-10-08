import type { Money } from '../services/commerceTypes';

/** Parse a server-provided money value for DISPLAY purposes only. */
export function moneyToNumber(value: Money | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Format a server-provided amount as Indian Rupees. Formatting only - never used to derive authoritative totals. */
export function formatInr(value: Money | null | undefined): string {
  const n = moneyToNumber(value);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

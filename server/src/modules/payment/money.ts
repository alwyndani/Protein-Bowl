import { Decimal } from '@prisma/client/runtime/library';
import { AppError } from '../../middleware/error.middleware.js';

/** Decimal INR amount (2dp) -> integer paise, exactly (no floating-point money maths). */
export function toMinorUnits(amount: Decimal.Value): number {
  const minor = new Decimal(amount).mul(100);
  if (!minor.isFinite() || minor.isNegative() || !minor.isInteger()) {
    throw new AppError('Amount cannot be expressed in whole paise', 422, 'PAYMENT_AMOUNT_INVALID');
  }
  const n = minor.toNumber();
  if (!Number.isSafeInteger(n)) throw new AppError('Amount is too large', 422, 'PAYMENT_AMOUNT_INVALID');
  return n;
}

/** Integer paise -> Decimal INR (exact). */
export function fromMinorUnits(minor: number): Decimal {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new AppError('Invalid provider amount', 422, 'PAYMENT_AMOUNT_INVALID');
  return new Decimal(minor).div(100);
}

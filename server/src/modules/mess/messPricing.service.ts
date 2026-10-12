import { Decimal } from '@prisma/client/runtime/library';
import { AppError } from '../../middleware/error.middleware.js';
import { MAX_PRICE, MESS_PURCHASE_POLICY_ID } from './messPolicy.js';

const money = (d: Decimal): number => Number(d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2));

export interface MessPricing {
  policyId: typeof MESS_PURCHASE_POLICY_ID;
  quantity: 1;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  /** Always 0 for a Mess purchase: no delivery fee, packaging fee, discount or container deposit. */
  deliveryFee: 0;
  packagingFee: 0;
  discountAmount: 0;
  containerDeposit: 0;
}

/**
 * The pricing authority for a Kerala Mess purchase (policy MESS_PURCHASE_V1). It is deliberately independent of the DIRECT-order
 * CommercePolicy (no delivery fee, packaging fee, minimum order or free-delivery threshold can ever leak into a Mess price).
 *
 *   subtotal = plan.basePrice (quantity is always 1)
 *   tax      = subtotal x plan.taxRate, rounded HALF_UP to 2 decimals (EXCLUSIVE, like every other Protein Bowl price)
 *   total    = subtotal + tax
 *
 * Price and tax rate come from the SUPER_ADMIN-managed plan row; there is no default and no fallback for either.
 */
export class MessPricingService {
  public static calculate(plan: { basePrice: Decimal.Value; taxRate: Decimal.Value | null | undefined }): MessPricing {
    if (plan.taxRate === null || plan.taxRate === undefined) throw new AppError('This plan has no tax rate configured', 409, 'PLAN_INCOMPLETE');
    const price = new Decimal(plan.basePrice);
    const rate = new Decimal(plan.taxRate);
    if (!price.isFinite() || !price.greaterThan(0) || price.greaterThan(MAX_PRICE)) throw new AppError('This plan has no valid price', 409, 'PLAN_INCOMPLETE');
    if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(1)) throw new AppError('This plan has an invalid tax rate', 409, 'PLAN_INCOMPLETE');

    const subtotal = price.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const tax = subtotal.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const total = subtotal.add(tax);
    return {
      policyId: MESS_PURCHASE_POLICY_ID,
      quantity: 1,
      subtotal: money(subtotal),
      taxRate: Number(rate.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4)),
      taxAmount: money(tax),
      total: money(total),
      deliveryFee: 0,
      packagingFee: 0,
      discountAmount: 0,
      containerDeposit: 0
    };
  }
}

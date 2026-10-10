import { Decimal } from '@prisma/client/runtime/library';
import { AppError } from '../../middleware/error.middleware.js';
import { CommercePolicy, MAX_MONEY } from '../../config/commercePolicy.js';

/**
 * PricingService is the single pricing authority for checkout preview, cart totals and order creation.
 * Every rule that is a business decision (fees, thresholds, minimum order, quantity caps, tax mode) comes from the
 * CommercePolicy passed in - nothing is hard-coded here and there is deliberately NO default policy, so a caller can
 * never silently price an order with assumed values.
 *
 * Rounding rules (explicit, deterministic):
 *  - prices, deposits and fees are exact 2-decimal amounts;
 *  - tax (EXCLUSIVE mode) is computed per line as lineSubtotal x taxRate and rounded HALF_UP to 2 decimals;
 *  - the order tax is the SUM of the rounded line taxes, so order totals always equal the sum of the persisted lines;
 *  - delivery fee, packaging fee and container deposits are not taxed (policy.deliveryTaxable/packagingTaxable are false);
 *  - all arithmetic is Decimal; no floating-point money maths.
 */

const ROUND_HALF_UP = Decimal.ROUND_HALF_UP;
const round2 = (d: Decimal): Decimal => d.toDecimalPlaces(2, ROUND_HALF_UP);
const num = (d: Decimal): number => Number(round2(d).toFixed(2));

export interface PricingItemInput {
  productId: string;
  variantId?: string | null;
  itemTitle: string;
  variantName?: string | null;
  sku?: string | null;
  unitPrice: Decimal | number | string;
  quantity: number;
  /** Server-controlled rate as a fraction (0.05 = 5 %). Required: there is no fallback rate. */
  taxRate: Decimal | number | string | null | undefined;
  containerDeposit?: Decimal | number | string | null;
}

export interface MinimumOrderResult {
  enabled: boolean;
  requiredAmount: number;
  met: boolean;
  shortfall: number;
}

export interface CalculatedPricingBreakdown {
  items: Array<{
    productId: string;
    variantId: string | null;
    itemTitle: string;
    variantName: string | null;
    sku: string | null;
    unitPrice: number;
    quantity: number;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    containerDeposit: number;
    totalContainerDeposit: number;
    lineTotal: number;
  }>;
  subtotal: number;
  taxAmount: number;
  containerDepositTotal: number;
  packagingFee: number;
  deliveryFee: number;
  discountAmount: number;
  netAmount: number;
  minimumOrder: MinimumOrderResult;
}

export interface QuantityIssue {
  index: number;
  code: 'INVALID_QUANTITY' | 'MAX_LINE_QUANTITY_EXCEEDED' | 'MAX_CART_QUANTITY_EXCEEDED';
}

export class PricingService {
  /**
   * Non-throwing variant of validateQuantities, used ONLY to DESCRIBE problems in an existing cart (so a customer can
   * still open and repair it). Checkout preview and order creation always use the throwing validation.
   */
  public static findQuantityIssues(lines: Array<{ quantity: number }>, policy: CommercePolicy): QuantityIssue[] {
    const issues: QuantityIssue[] = [];
    let totalUnits = 0;
    lines.forEach((line, index) => {
      if (typeof line.quantity !== 'number' || !Number.isInteger(line.quantity) || line.quantity < 1) issues.push({ index, code: 'INVALID_QUANTITY' });
      else if (line.quantity > policy.maxLineQuantity) issues.push({ index, code: 'MAX_LINE_QUANTITY_EXCEEDED' });
      else totalUnits += line.quantity;
    });
    if (totalUnits > policy.maxCartUnits) issues.push({ index: -1, code: 'MAX_CART_QUANTITY_EXCEEDED' });
    return issues;
  }

  /**
   * Reject invalid quantities - never coerce them. Applies to cart mutation, checkout preview and order creation.
   */
  public static validateQuantities(lines: Array<{ quantity: number }>, policy: CommercePolicy): void {
    let totalUnits = 0;
    for (const line of lines) {
      if (typeof line.quantity !== 'number' || !Number.isInteger(line.quantity) || line.quantity < 1) {
        throw new AppError('Quantity must be a whole number of at least 1', 422, 'INVALID_QUANTITY');
      }
      if (line.quantity > policy.maxLineQuantity) {
        throw new AppError(`A single item can be ordered at most ${policy.maxLineQuantity} times`, 422, 'MAX_LINE_QUANTITY_EXCEEDED');
      }
      totalUnits += line.quantity;
    }
    if (totalUnits > policy.maxCartUnits) {
      throw new AppError(`A cart can hold at most ${policy.maxCartUnits} items in total`, 422, 'MAX_CART_QUANTITY_EXCEEDED');
    }
  }

  public static evaluateMinimumOrder(itemsSubtotal: Decimal, policy: CommercePolicy): MinimumOrderResult {
    const required = policy.minimumOrderValue;
    const enabled = required.greaterThan(0);
    const met = !enabled || itemsSubtotal.greaterThanOrEqualTo(required);
    return {
      enabled,
      requiredAmount: num(required),
      met,
      shortfall: met ? 0 : num(required.minus(itemsSubtotal))
    };
  }

  private static toTaxRate(item: PricingItemInput): Decimal {
    const raw = item.taxRate;
    let rate: Decimal | null = null;
    try {
      if (raw !== null && raw !== undefined && String(raw).trim() !== '') rate = new Decimal(raw as Decimal.Value);
    } catch {
      rate = null;
    }
    if (rate === null || !rate.isFinite() || rate.isNegative() || rate.greaterThan(1)) {
      throw new AppError(`Tax rate is not configured for '${item.itemTitle}'`, 409, 'PRODUCT_TAX_NOT_CONFIGURED');
    }
    return rate;
  }

  /**
   * Centralized Decimal-safe, server-authoritative money calculation (used by cart, checkout preview AND order creation).
   */
  public static calculatePricing(
    items: PricingItemInput[],
    policy: CommercePolicy,
    discountAmountInput: Decimal.Value = 0,
    options: { enforceQuantityLimits?: boolean } = {}
  ): CalculatedPricingBreakdown {
    if (options.enforceQuantityLimits !== false) this.validateQuantities(items, policy);

    let subtotalDec = new Decimal(0);
    let taxAmountDec = new Decimal(0);
    let depositDec = new Decimal(0);

    const calculatedItems = items.map((item) => {
      const unitPriceDec = new Decimal(item.unitPrice);
      const taxRateDec = this.toTaxRate(item);
      const depositPerUnitDec = new Decimal(item.containerDeposit ?? 0);

      const lineSubtotalDec = unitPriceDec.mul(item.quantity);
      const lineTaxDec = round2(lineSubtotalDec.mul(taxRateDec));
      const lineDepositDec = depositPerUnitDec.mul(item.quantity);
      const lineTotalDec = lineSubtotalDec.add(lineTaxDec).add(lineDepositDec);

      if (lineTotalDec.greaterThan(MAX_MONEY)) {
        throw new AppError('This order is larger than the supported amount', 422, 'ORDER_TOTAL_TOO_LARGE');
      }

      subtotalDec = subtotalDec.add(lineSubtotalDec);
      taxAmountDec = taxAmountDec.add(lineTaxDec);
      depositDec = depositDec.add(lineDepositDec);

      return {
        productId: item.productId,
        variantId: item.variantId || null,
        itemTitle: item.itemTitle,
        variantName: item.variantName || null,
        sku: item.sku || null,
        unitPrice: num(unitPriceDec),
        quantity: item.quantity,
        subtotal: num(lineSubtotalDec),
        taxRate: Number(taxRateDec.toDecimalPlaces(4, ROUND_HALF_UP).toFixed(4)),
        taxAmount: num(lineTaxDec),
        containerDeposit: num(depositPerUnitDec),
        totalContainerDeposit: num(lineDepositDec),
        lineTotal: num(lineTotalDec)
      };
    });

    const subtotal = round2(subtotalDec);

    let deliveryFee = policy.deliveryFee;
    if (policy.freeDelivery.enabled && policy.freeDelivery.threshold && subtotal.greaterThanOrEqualTo(policy.freeDelivery.threshold)) {
      deliveryFee = new Decimal(0);
    }
    const packagingFee = policy.packagingFee;

    let discount = new Decimal(discountAmountInput);
    if (!discount.isFinite() || discount.isNegative()) discount = new Decimal(0);

    const gross = subtotal.add(taxAmountDec).add(depositDec).add(packagingFee).add(deliveryFee);
    if (gross.greaterThan(MAX_MONEY)) {
      throw new AppError('This order is larger than the supported amount', 422, 'ORDER_TOTAL_TOO_LARGE');
    }
    const net = Decimal.max(0, gross.sub(discount));

    return {
      items: calculatedItems,
      subtotal: num(subtotal),
      taxAmount: num(taxAmountDec),
      containerDepositTotal: num(depositDec),
      packagingFee: num(packagingFee),
      deliveryFee: num(deliveryFee),
      discountAmount: num(Decimal.min(discount, gross)),
      netAmount: num(net),
      minimumOrder: this.evaluateMinimumOrder(subtotal, policy)
    };
  }

  /** Price DB CartItem rows (with product + variant included). */
  public static calculateCartPricing(cartItems: any[], policy: CommercePolicy, discountAmountInput: Decimal.Value = 0, options: { enforceQuantityLimits?: boolean } = {}) {
    const items: PricingItemInput[] = cartItems.map((ci: any) => ({
      productId: ci.productId,
      variantId: ci.variantId || null,
      itemTitle: ci.product?.name || 'Product',
      variantName: ci.variant?.name || null,
      sku: ci.variant?.sku || null,
      unitPrice: ci.variant ? ci.variant.price : (ci.product?.basePrice ?? 0),
      quantity: ci.quantity,
      taxRate: ci.product?.taxRate,
      containerDeposit: ci.variant?.containerDeposit ?? ci.product?.containerDeposit ?? 0
    }));

    const breakdown = this.calculatePricing(items, policy, discountAmountInput, options);

    return {
      lineItems: breakdown.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        title: i.itemTitle,
        variantName: i.variantName,
        sku: i.sku,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        subtotal: i.subtotal,
        taxRate: i.taxRate,
        taxAmount: i.taxAmount,
        containerDeposit: i.containerDeposit,
        totalPrice: i.lineTotal
      })),
      summary: {
        itemsSubtotal: breakdown.subtotal,
        totalTax: breakdown.taxAmount,
        containerDepositTotal: breakdown.containerDepositTotal,
        packagingFee: breakdown.packagingFee,
        deliveryFee: breakdown.deliveryFee,
        discountAmount: breakdown.discountAmount,
        netAmount: breakdown.netAmount
      },
      minimumOrder: breakdown.minimumOrder
    };
  }
}

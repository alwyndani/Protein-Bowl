import { Decimal } from '@prisma/client/runtime/library';

export interface PricingConfig {
  defaultDeliveryFee: number;
  freeDeliveryThreshold: number | null;
  defaultPackagingFee: number;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  defaultDeliveryFee: 40.00,
  freeDeliveryThreshold: 499.00,
  defaultPackagingFee: 0.00,
};

export interface PricingItemInput {
  productId: string;
  variantId?: string | null;
  itemTitle: string;
  variantName?: string | null;
  sku?: string | null;
  unitPrice: Decimal | number;
  quantity: number;
  taxRate?: Decimal | number;
  containerDeposit?: Decimal | number;
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
}

export class PricingService {
  /**
   * Centralized Decimal-safe server-authoritative money calculation
   * Used by BOTH checkout preview and order creation
   */
  public static calculatePricing(
    items: PricingItemInput[],
    config: PricingConfig = DEFAULT_PRICING_CONFIG,
    discountAmountInput: number = 0
  ): CalculatedPricingBreakdown {
    let subtotalDec = new Decimal(0);
    let taxAmountDec = new Decimal(0);
    let containerDepositDec = new Decimal(0);

    const calculatedItems = items.map((item) => {
      const unitPriceDec = new Decimal(item.unitPrice);
      const quantity = Math.max(1, item.quantity);
      const lineSubtotalDec = unitPriceDec.mul(quantity);

      const taxRateDec = new Decimal(item.taxRate !== undefined ? item.taxRate : 0.05);
      const lineTaxDec = lineSubtotalDec.mul(taxRateDec);

      const depositPerUnitDec = new Decimal(item.containerDeposit !== undefined ? item.containerDeposit : 0);
      const lineDepositDec = depositPerUnitDec.mul(quantity);

      const lineTotalDec = lineSubtotalDec.add(lineTaxDec).add(lineDepositDec);

      subtotalDec = subtotalDec.add(lineSubtotalDec);
      taxAmountDec = taxAmountDec.add(lineTaxDec);
      containerDepositDec = containerDepositDec.add(lineDepositDec);

      return {
        productId: item.productId,
        variantId: item.variantId || null,
        itemTitle: item.itemTitle,
        variantName: item.variantName || null,
        sku: item.sku || null,
        unitPrice: Number(unitPriceDec.toFixed(2)),
        quantity,
        subtotal: Number(lineSubtotalDec.toFixed(2)),
        taxRate: Number(taxRateDec.toFixed(4)),
        taxAmount: Number(lineTaxDec.toFixed(2)),
        containerDeposit: Number(depositPerUnitDec.toFixed(2)),
        totalContainerDeposit: Number(lineDepositDec.toFixed(2)),
        lineTotal: Number(lineTotalDec.toFixed(2)),
      };
    });

    const subtotal = Number(subtotalDec.toFixed(2));
    const taxAmount = Number(taxAmountDec.toFixed(2));
    const containerDepositTotal = Number(containerDepositDec.toFixed(2));

    // Calculate delivery fee
    let deliveryFee = config.defaultDeliveryFee;
    if (config.freeDeliveryThreshold !== null && subtotal >= config.freeDeliveryThreshold) {
      deliveryFee = 0;
    }
    const deliveryFeeDec = new Decimal(deliveryFee);
    const packagingFeeDec = new Decimal(config.defaultPackagingFee);
    const discountAmountDec = new Decimal(Math.max(0, discountAmountInput));

    const netAmountDec = subtotalDec
      .add(taxAmountDec)
      .add(containerDepositDec)
      .add(packagingFeeDec)
      .add(deliveryFeeDec)
      .sub(discountAmountDec);

    const finalNetAmount = Math.max(0, Number(netAmountDec.toFixed(2)));

    return {
      items: calculatedItems,
      subtotal,
      taxAmount,
      containerDepositTotal,
      packagingFee: Number(packagingFeeDec.toFixed(2)),
      deliveryFee: Number(deliveryFeeDec.toFixed(2)),
      discountAmount: Number(discountAmountDec.toFixed(2)),
      netAmount: finalNetAmount,
    };
  }

  /**
   * Helper method to calculate pricing directly from DB CartItem rows
   */
  public static calculateCartPricing(cartItems: any[], config: PricingConfig = DEFAULT_PRICING_CONFIG, discountAmountInput: number = 0) {
    const items: PricingItemInput[] = cartItems.map((ci: any) => {
      const unitPrice = ci.variant ? ci.variant.price : (ci.product?.basePrice || 0);
      const itemTitle = ci.product?.name || 'Product';
      const variantName = ci.variant?.name || null;
      const sku = ci.variant?.sku || null;
      const taxRate = ci.variant?.taxRate !== undefined && ci.variant?.taxRate !== null
        ? ci.variant.taxRate
        : (ci.product?.taxRate !== undefined && ci.product?.taxRate !== null ? ci.product.taxRate : 0.05);
      const containerDeposit = ci.variant?.containerDeposit !== undefined && ci.variant?.containerDeposit !== null
        ? ci.variant.containerDeposit
        : (ci.product?.containerDeposit !== undefined && ci.product?.containerDeposit !== null ? ci.product.containerDeposit : 0);

      return {
        productId: ci.productId,
        variantId: ci.variantId || null,
        itemTitle,
        variantName,
        sku,
        unitPrice,
        quantity: ci.quantity,
        taxRate,
        containerDeposit
      };
    });

    const breakdown = this.calculatePricing(items, config, discountAmountInput);

    return {
      lineItems: breakdown.items.map((i: any) => ({
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
      }
    };
  }
}


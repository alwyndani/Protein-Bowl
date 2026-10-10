import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { PricingService } from '../commerce/pricing.service.js';
import { lockCustomerCheckout } from '../commerce/checkoutLock.js';
import { getCommercePolicy } from '../../config/commercePolicy.js';

type Tx = Prisma.TransactionClient;

const CART_INCLUDE = { items: { include: { product: true, variant: true } } } as const;

export class CartService {
  /**
   * Helper: Resolve CustomerProfile for authenticated user ID
   */
  private static async getCustomerProfile(userId: string) {
    const profile = await prisma.customerProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new AppError('Customer profile not found for authenticated user', 404, 'NOT_FOUND');
    }
    return profile;
  }

  /**
   * Helper: Get or create active Cart for customer
   */
  public static async getOrCreateCart(customerProfileId: string, db: Tx | typeof prisma = prisma) {
    const existing = await db.cart.findUnique({ where: { customerProfileId }, include: CART_INCLUDE });
    if (existing) return existing;
    return await db.cart.create({ data: { customerProfileId }, include: CART_INCLUDE });
  }

  /**
   * GET /api/v1/cart
   * Retrieves authenticated customer cart with server-calculated breakdown (same PricingService + policy as checkout).
   */
  public static async getCustomerCart(userId: string) {
    const profile = await this.getCustomerProfile(userId);
    const cart = await this.getOrCreateCart(profile.id);

    // Filter out inactive/unpublished items if any
    const validItems = cart.items.filter(
      (item) => item.product && item.product.isPublished && item.product.isActive
    );

    const policy = getCommercePolicy();
    // Display-only pricing: a legacy cart with an out-of-policy quantity must still be viewable (and repairable).
    // The problems are reported in `quantityIssues`; checkout preview / order creation enforce the limits strictly.
    const quantityIssues = PricingService.findQuantityIssues(validItems, policy);
    const pricing = PricingService.calculateCartPricing(validItems, policy, 0, { enforceQuantityLimits: false });

    const formattedItems = validItems.map((item, idx) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      name: item.product.name,
      variantName: item.variant?.name || null,
      sku: item.variant?.sku || null,
      category: item.product.categoryId,
      image: item.product.image,
      unitPrice: pricing.lineItems[idx].unitPrice,
      quantity: item.quantity,
      subtotal: pricing.lineItems[idx].subtotal,
      taxAmount: pricing.lineItems[idx].taxAmount,
      containerDeposit: pricing.lineItems[idx].containerDeposit,
      lineTotal: pricing.lineItems[idx].totalPrice,
    }));

    const s = pricing.summary;
    return {
      id: cart.id,
      customerProfileId: profile.id,
      items: formattedItems,
      itemsSubtotal: s.itemsSubtotal,
      totalTax: s.totalTax,
      containerDepositTotal: s.containerDepositTotal,
      packagingFee: s.packagingFee,
      deliveryFee: s.deliveryFee,
      discountAmount: s.discountAmount,
      netAmount: s.netAmount,
      minimumOrder: pricing.minimumOrder,
      quantityIssues: quantityIssues.map((i) => ({ itemId: i.index >= 0 ? validItems[i.index].id : null, code: i.code })),
      totals: {
        subtotal: s.itemsSubtotal,
        taxAmount: s.totalTax,
        containerDepositTotal: s.containerDepositTotal,
        packagingFee: s.packagingFee,
        deliveryFee: s.deliveryFee,
        discountAmount: s.discountAmount,
        netAmount: s.netAmount,
      },
    };
  }

  /** Units currently in the cart, optionally excluding one line (the one being changed). */
  private static async cartUnits(tx: Tx, cartId: string, excludeItemId?: string): Promise<number> {
    const agg = await tx.cartItem.aggregate({
      where: { cartId, ...(excludeItemId ? { id: { not: excludeItemId } } : {}) },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  }

  /** The line quantity and the whole-cart unit total must respect the policy for the NEW state; nothing is coerced. */
  private static assertNewQuantity(newLineQuantity: unknown, otherUnits: number) {
    const policy = getCommercePolicy();
    PricingService.validateQuantities([{ quantity: newLineQuantity as number }], policy);
    if (otherUnits + (newLineQuantity as number) > policy.maxCartUnits) {
      throw new AppError(`A cart can hold at most ${policy.maxCartUnits} items in total`, 422, 'MAX_CART_QUANTITY_EXCEEDED');
    }
  }

  /**
   * POST /api/v1/cart/items
   * Adds product/variant to customer cart (merging quantity if existing). Serialized with checkout per customer.
   */
  public static async addItemToCart(userId: string, data: { productId: string; variantId?: string | null; quantity?: unknown }) {
    const profile = await this.getCustomerProfile(userId);
    const requestedQuantity = data.quantity === undefined ? 1 : data.quantity;

    await prisma.$transaction(async (tx) => {
      await lockCustomerCheckout(tx, profile.id);
      const cart = await this.getOrCreateCart(profile.id, tx);

      // Validate Product
      const product = await tx.product.findUnique({ where: { id: data.productId } });
      if (!product || !product.isPublished || !product.isActive) {
        throw new AppError('Product not found or not available for purchase', 400, 'UNAVAILABLE_PRODUCT');
      }

      // Validate Variant if supplied
      if (data.variantId) {
        const variant = await tx.productVariant.findFirst({
          where: { id: data.variantId, productId: product.id, isActive: true },
        });
        if (!variant) {
          throw new AppError('Invalid product variant selected for this product', 400, 'INVALID_VARIANT');
        }
      }

      const requestedVariantId = data.variantId || null;

      // Check if item already exists in cart (logical unique match)
      const existingItem = cart.items.find(
        (i) => i.productId === data.productId && (i.variantId || null) === requestedVariantId
      );

      // Validate the request itself first (non-numeric/zero/negative/fractional), then the resulting line + cart totals.
      PricingService.validateQuantities([{ quantity: requestedQuantity as number }], getCommercePolicy());
      const newLineQuantity = (existingItem?.quantity ?? 0) + (requestedQuantity as number);
      this.assertNewQuantity(newLineQuantity, await this.cartUnits(tx, cart.id, existingItem?.id));

      if (existingItem) {
        await tx.cartItem.update({ where: { id: existingItem.id }, data: { quantity: newLineQuantity } });
      } else {
        await tx.cartItem.create({
          data: { cartId: cart.id, productId: product.id, variantId: requestedVariantId, quantity: newLineQuantity },
        });
      }
    });

    return this.getCustomerCart(userId);
  }

  /**
   * PATCH /api/v1/cart/items/:itemId
   * Updates cart item quantity
   */
  public static async updateCartItemQuantity(userId: string, itemId: string, quantity: unknown) {
    const profile = await this.getCustomerProfile(userId);

    await prisma.$transaction(async (tx) => {
      await lockCustomerCheckout(tx, profile.id);
      const cart = await this.getOrCreateCart(profile.id, tx);

      const item = await tx.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
      if (!item) {
        throw new AppError('Cart item not found', 404, 'NOT_FOUND');
      }

      this.assertNewQuantity(quantity, await this.cartUnits(tx, cart.id, item.id));
      await tx.cartItem.update({ where: { id: itemId }, data: { quantity: quantity as number } });
    });

    return this.getCustomerCart(userId);
  }

  /**
   * DELETE /api/v1/cart/items/:itemId
   * Removes item from customer cart
   */
  public static async removeCartItem(userId: string, itemId: string) {
    const profile = await this.getCustomerProfile(userId);

    await prisma.$transaction(async (tx) => {
      await lockCustomerCheckout(tx, profile.id);
      const cart = await this.getOrCreateCart(profile.id, tx);

      const item = await tx.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
      if (!item) {
        throw new AppError('Cart item not found', 404, 'NOT_FOUND');
      }
      await tx.cartItem.delete({ where: { id: itemId } });
    });

    return this.getCustomerCart(userId);
  }

  /**
   * DELETE /api/v1/cart
   * Clears all items from customer cart
   */
  public static async clearCart(userId: string) {
    const profile = await this.getCustomerProfile(userId);

    await prisma.$transaction(async (tx) => {
      await lockCustomerCheckout(tx, profile.id);
      const cart = await this.getOrCreateCart(profile.id, tx);
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    });

    return this.getCustomerCart(userId);
  }
}

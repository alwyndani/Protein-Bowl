import { PrismaClient } from '@prisma/client';
import { AppError } from '../../middleware/error.middleware.js';
import { PricingService, PricingItemInput } from '../commerce/pricing.service.js';

const prisma = new PrismaClient();

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
  public static async getOrCreateCart(customerProfileId: string) {
    let cart = await prisma.cart.findUnique({
      where: { customerProfileId },
      include: {
        items: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { customerProfileId },
        include: {
          items: {
            include: {
              product: true,
              variant: true,
            },
          },
        },
      });
    }

    return cart;
  }

  /**
   * GET /api/v1/cart
   * Retrieves authenticated customer cart with server-calculated breakdown
   */
  public static async getCustomerCart(userId: string) {
    const profile = await this.getCustomerProfile(userId);
    const cart = await this.getOrCreateCart(profile.id);

    // Filter out inactive/unpublished items if any
    const validItems = cart.items.filter(
      (item) => item.product && item.product.isPublished && item.product.isActive
    );

    const pricingInputs: PricingItemInput[] = validItems.map((item) => {
      const price = item.variant ? Number(item.variant.price) : Number(item.product.basePrice);
      const deposit = item.variant?.containerDeposit !== null && item.variant?.containerDeposit !== undefined
        ? Number(item.variant.containerDeposit)
        : Number(item.product.containerDeposit);

      return {
        productId: item.productId,
        variantId: item.variantId,
        itemTitle: item.product.name,
        variantName: item.variant ? item.variant.name : null,
        sku: item.variant ? item.variant.sku : null,
        unitPrice: price,
        quantity: item.quantity,
        taxRate: Number(item.product.taxRate),
        containerDeposit: deposit,
      };
    });

    const breakdown = PricingService.calculatePricing(pricingInputs);

    const formattedItems = validItems.map((item, idx) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      name: item.product.name,
      variantName: item.variant?.name || null,
      sku: item.variant?.sku || null,
      category: item.product.categoryId,
      image: item.product.image,
      unitPrice: breakdown.items[idx].unitPrice,
      quantity: item.quantity,
      subtotal: breakdown.items[idx].subtotal,
      taxAmount: breakdown.items[idx].taxAmount,
      containerDeposit: breakdown.items[idx].containerDeposit,
      lineTotal: breakdown.items[idx].lineTotal,
    }));

    return {
      id: cart.id,
      customerProfileId: profile.id,
      items: formattedItems,
      itemsSubtotal: breakdown.subtotal,
      totalTax: breakdown.taxAmount,
      containerDepositTotal: breakdown.containerDepositTotal,
      packagingFee: breakdown.packagingFee,
      deliveryFee: breakdown.deliveryFee,
      discountAmount: breakdown.discountAmount,
      netAmount: breakdown.netAmount,
      totals: {
        subtotal: breakdown.subtotal,
        taxAmount: breakdown.taxAmount,
        containerDepositTotal: breakdown.containerDepositTotal,
        packagingFee: breakdown.packagingFee,
        deliveryFee: breakdown.deliveryFee,
        discountAmount: breakdown.discountAmount,
        netAmount: breakdown.netAmount,
      },
    };
  }

  /**
   * POST /api/v1/cart/items
   * Adds product/variant to customer cart (merging quantity if existing)
   */
  public static async addItemToCart(userId: string, data: { productId: string; variantId?: string | null; quantity: number }) {
    const profile = await this.getCustomerProfile(userId);
    const cart = await this.getOrCreateCart(profile.id);

    // Validate Product
    const product = await prisma.product.findUnique({
      where: { id: data.productId },
    });

    if (!product || !product.isPublished || !product.isActive) {
      throw new AppError('Product not found or not available for purchase', 400, 'UNAVAILABLE_PRODUCT');
    }

    // Validate Variant if supplied
    let variant = null;
    if (data.variantId) {
      variant = await prisma.productVariant.findFirst({
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

    if (existingItem) {
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + data.quantity },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId: requestedVariantId,
          quantity: data.quantity,
        },
      });
    }

    return this.getCustomerCart(userId);
  }

  /**
   * PATCH /api/v1/cart/items/:itemId
   * Updates cart item quantity
   */
  public static async updateCartItemQuantity(userId: string, itemId: string, quantity: number) {
    const profile = await this.getCustomerProfile(userId);
    const cart = await this.getOrCreateCart(profile.id);

    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });

    if (!item) {
      throw new AppError('Cart item not found', 404, 'NOT_FOUND');
    }

    await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    return this.getCustomerCart(userId);
  }

  /**
   * DELETE /api/v1/cart/items/:itemId
   * Removes item from customer cart
   */
  public static async removeCartItem(userId: string, itemId: string) {
    const profile = await this.getCustomerProfile(userId);
    const cart = await this.getOrCreateCart(profile.id);

    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });

    if (!item) {
      throw new AppError('Cart item not found', 404, 'NOT_FOUND');
    }

    await prisma.cartItem.delete({
      where: { id: itemId },
    });

    return this.getCustomerCart(userId);
  }

  /**
   * DELETE /api/v1/cart
   * Clears all items from customer cart
   */
  public static async clearCart(userId: string) {
    const profile = await this.getCustomerProfile(userId);
    const cart = await this.getOrCreateCart(profile.id);

    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return this.getCustomerCart(userId);
  }
}

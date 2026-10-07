import { PrismaClient } from '@prisma/client';
import { AppError } from '../../middleware/error.middleware.js';
import { PricingService } from '../commerce/pricing.service.js';
import { CreateOrderDto } from './order.validator.js';

const prisma = new PrismaClient();

export class OrderService {
  /**
   * Calculate authoritative checkout preview for authenticated customer
   */
  public static async checkoutPreview(userId: string, addressId?: string) {
    const profile = await prisma.customerProfile.findUnique({
      where: { userId }
    });
    if (!profile) {
      throw new AppError('Customer profile not found', 404, 'NOT_FOUND');
    }

    const cart = await prisma.cart.findFirst({
      where: { customerProfileId: profile.id },
      include: {
        items: {
          include: {
            product: true,
            variant: true
          }
        }
      }
    });

    if (!cart || cart.items.length === 0) {
      throw new AppError('Cart is empty', 400, 'EMPTY_CART');
    }

    // Validate cart products & variants availability
    for (const item of cart.items) {
      if (!item.product || !item.product.isPublished || !item.product.isActive) {
        throw new AppError(`Product '${item.product?.name || 'Unknown'}' is no longer available`, 400, 'UNAVAILABLE_PRODUCT');
      }
      if (item.variant && !item.variant.isActive) {
        throw new AppError(`Variant '${item.variant.name}' for product '${item.product.name}' is no longer available`, 400, 'UNAVAILABLE_VARIANT');
      }
    }

    let selectedAddress: any = null;
    if (addressId) {
      selectedAddress = await prisma.customerAddress.findFirst({
        where: { id: addressId, customerProfileId: profile.id, isActive: true }
      });
      if (!selectedAddress) {
        throw new AppError('Selected delivery address is invalid or unowned', 400, 'INVALID_ADDRESS');
      }
    } else {
      // Pick default address if available
      selectedAddress = await prisma.customerAddress.findFirst({
        where: { customerProfileId: profile.id, isDefault: true, isActive: true }
      });
    }

    const pricing = PricingService.calculateCartPricing(cart.items);

    return {
      cartId: cart.id,
      items: pricing.lineItems,
      summary: pricing.summary,
      deliveryAddress: selectedAddress ? {
        id: selectedAddress.id,
        title: selectedAddress.title,
        addressLine1: selectedAddress.addressLine1,
        addressLine2: selectedAddress.addressLine2,
        city: selectedAddress.city,
        state: selectedAddress.state,
        postalCode: selectedAddress.postalCode,
        recipientName: profile.fullName
      } : null
    };
  }

  /**
   * Create order transactionally with idempotency & snapshot protection
   */
  public static async createOrder(userId: string, idempotencyKey: string, data: CreateOrderDto) {
    const profile = await prisma.customerProfile.findUnique({
      where: { userId },
      include: { user: { select: { phone: true, email: true } } }
    });

    if (!profile) {
      throw new AppError('Customer profile not found', 404, 'NOT_FOUND');
    }

    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new AppError('Idempotency key is required for order creation', 400, 'MISSING_IDEMPOTENCY_KEY');
    }

    // Check existing order with same idempotency key
    const existingOrder = await prisma.order.findUnique({
      where: { idempotencyKey },
      include: { items: true }
    });

    if (existingOrder) {
      if (existingOrder.customerProfileId !== profile.id) {
        throw new AppError('Idempotency key conflict from another customer account', 409, 'IDEMPOTENCY_CONFLICT');
      }
      // Return existing order for retry with identical key
      return existingOrder;
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch active cart
      const cart = await tx.cart.findFirst({
        where: { customerProfileId: profile.id },
        include: {
          items: {
            include: {
              product: true,
              variant: true
            }
          }
        }
      });

      if (!cart || cart.items.length === 0) {
        throw new AppError('Cannot create order from an empty cart', 400, 'EMPTY_CART');
      }

      // 2. Validate product & variant status
      for (const item of cart.items) {
        if (!item.product || !item.product.isPublished || !item.product.isActive) {
          throw new AppError(`Product '${item.product?.name || 'Unknown'}' is no longer available`, 400, 'UNAVAILABLE_PRODUCT');
        }
        if (item.variant && !item.variant.isActive) {
          throw new AppError(`Variant '${item.variant.name}' is no longer available`, 400, 'UNAVAILABLE_VARIANT');
        }
      }

      // 3. Validate selected address
      const address = await tx.customerAddress.findFirst({
        where: { id: data.addressId, customerProfileId: profile.id, isActive: true }
      });

      if (!address) {
        throw new AppError('Selected delivery address is invalid or inactive', 400, 'INVALID_ADDRESS');
      }

      // 4. Calculate authoritative monetary breakdown
      const pricing = PricingService.calculateCartPricing(cart.items);

      // 5. Build address snapshot
      const deliveryAddressSnapshot = {
        addressId: address.id,
        title: address.title,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        recipientName: profile.fullName,
        phone: profile.user?.phone || null,
        email: profile.user?.email || null
      };

      // 6. Build OrderItem snapshot
      const orderItemsData = pricing.lineItems.map(item => ({
        productId: item.productId,
        variantId: item.variantId || null,
        itemTitle: item.title,
        variantName: item.variantName || null,
        sku: item.sku || null,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        containerDeposit: item.containerDeposit
      }));

      // 7. Generate order number
      const orderNumber = `PB-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

      // 8. Create Order
      const order = await tx.order.create({
        data: {
          orderNumber,
          idempotencyKey,
          customerProfileId: profile.id,
          status: 'PENDING',
          orderType: 'DIRECT',
          totalAmount: pricing.summary.itemsSubtotal,
          taxAmount: pricing.summary.totalTax,
          deliveryFee: pricing.summary.deliveryFee,
          packagingFee: pricing.summary.packagingFee,
          containerDepositTotal: pricing.summary.containerDepositTotal,
          netAmount: pricing.summary.netAmount,
          deliveryAddressSnapshot: deliveryAddressSnapshot as any,
          deliveryAddress: `${address.addressLine1}, ${address.city}, ${address.state} - ${address.postalCode}`,
          paymentStatus: 'PENDING',
          paymentMethod: data.paymentMethod || 'ONLINE',
          isGuest: false,
          items: {
            create: orderItemsData
          }
        },
        include: {
          items: true
        }
      });

      // 9. Clear consumed CartItems
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id }
      });

      return order;
    });
  }

  /**
   * Get all orders belonging to authenticated customer
   */
  public static async getCustomerOrders(userId: string) {
    const profile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      return [];
    }

    return await prisma.order.findMany({
      where: { customerProfileId: profile.id },
      include: {
        items: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get single order detail owned by authenticated customer
   */
  public static async getOrderById(userId: string, orderIdOrNumber: string) {
    const profile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      throw new AppError('Customer profile not found', 404, 'NOT_FOUND');
    }

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: orderIdOrNumber },
          { orderNumber: orderIdOrNumber }
        ],
        customerProfileId: profile.id
      },
      include: {
        items: true
      }
    });

    if (!order) {
      throw new AppError('Order not found or access denied', 404, 'NOT_FOUND');
    }

    return order;
  }
}

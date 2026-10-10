import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { PricingService } from '../commerce/pricing.service.js';
import { lockCustomerCheckout } from '../commerce/checkoutLock.js';
import { buildPricingSnapshot, getCommercePolicy, type PricingSnapshot } from '../../config/commercePolicy.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { CreateOrderDto } from './order.validator.js';
import { computeRequestFingerprint } from './idempotency.js';
import { nextOrderNumber } from './orderNumber.js';
import { toCustomerOrderDto, CustomerOrderDto } from './order.dto.js';

export const PAYMENT_METHODS = ['ONLINE', 'COD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const MAX_ORDER_NUMBER_ATTEMPTS = 5;

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

/** Direct-order payment method: an explicit allow-list (omitted = ONLINE). COD is additionally subject to policy. */
export function normalizePaymentMethod(raw: unknown): PaymentMethod {
  if (raw === undefined || raw === null || raw === '') return 'ONLINE';
  if (typeof raw !== 'string' || !(PAYMENT_METHODS as readonly string[]).includes(raw)) {
    throw new AppError('Unsupported payment method', 422, 'INVALID_PAYMENT_METHOD');
  }
  return raw as PaymentMethod;
}

function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function uniqueTarget(err: Prisma.PrismaClientKnownRequestError): string {
  const t = err.meta?.target;
  return Array.isArray(t) ? t.join(',') : String(t ?? '');
}

function formatInr(n: number): string {
  return `₹${n.toFixed(2)}`;
}

export class OrderService {
  /**
   * Calculate authoritative checkout preview for authenticated customer.
   * Uses the CURRENT commerce policy; nothing is persisted.
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

    this.assertCartAvailable(cart.items);

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

    const policy = getCommercePolicy();
    const pricing = PricingService.calculateCartPricing(cart.items, policy);

    return {
      cartId: cart.id,
      items: pricing.lineItems,
      summary: pricing.summary,
      minimumOrder: pricing.minimumOrder,
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

  private static assertCartAvailable(items: Array<{ product: any; variant: any }>) {
    for (const item of items) {
      if (!item.product || !item.product.isPublished || !item.product.isActive) {
        throw new AppError(`Product '${item.product?.name || 'Unknown'}' is no longer available`, 400, 'UNAVAILABLE_PRODUCT');
      }
      if (item.variant && !item.variant.isActive) {
        throw new AppError(`Variant '${item.variant.name}' for product '${item.product.name}' is no longer available`, 400, 'UNAVAILABLE_VARIANT');
      }
    }
  }

  /**
   * An existing order for (customer, key) is replayed ONLY when the request is the same one that created it.
   * The comparison re-derives the fingerprint from the request body plus the ORDER's OWN stored items and policy
   * snapshot (the cart has been consumed by then), so a genuine retry matches and a changed request does not.
   */
  private static assertReplayMatches(existing: OrderWithItems, customerProfileId: string, data: CreateOrderDto, paymentMethod: PaymentMethod) {
    if (!existing.requestFingerprint) return; // pre-P7A order: no fingerprint was recorded
    const snapshot = existing.pricingSnapshot as unknown as PricingSnapshot | null;
    const expected = computeRequestFingerprint({
      customerProfileId,
      addressId: data.addressId,
      paymentMethod,
      deliveryInstructions: data.deliveryInstructions,
      items: existing.items.map((i) => ({ productId: i.productId ?? '', variantId: i.variantId, quantity: i.quantity })),
      policyHash: snapshot?.policyHash ?? ''
    });
    if (expected !== existing.requestFingerprint) {
      throw new AppError('This idempotency key was already used for a different checkout request', 409, 'IDEMPOTENCY_KEY_REUSED');
    }
  }

  /**
   * Create order transactionally with customer-scoped idempotency, request fingerprinting, per-customer checkout
   * serialization, an immutable pricing snapshot, a creation event and an audit row - all in ONE transaction.
   */
  public static async createOrder(userId: string, idempotencyKey: string, data: CreateOrderDto, context?: AuditContext): Promise<CustomerOrderDto> {
    const paymentMethod = normalizePaymentMethod(data.paymentMethod);

    const profile = await prisma.customerProfile.findUnique({
      where: { userId },
      include: { user: { select: { phone: true, email: true } } }
    });
    if (!profile) {
      throw new AppError('Customer profile not found', 404, 'NOT_FOUND');
    }

    let lastCollision: unknown;
    for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Serialize this customer's checkout/cart state; a waiting duplicate then sees the committed outcome.
          await lockCustomerCheckout(tx, profile.id);

          const existing = await tx.order.findFirst({
            where: { customerProfileId: profile.id, idempotencyKey },
            include: { items: true }
          });
          if (existing) {
            this.assertReplayMatches(existing, profile.id, data, paymentMethod);
            return { order: existing, replay: true };
          }

          const policy = getCommercePolicy();
          if (paymentMethod === 'COD' && !policy.codEnabled) {
            throw new AppError('Cash on delivery is not available', 422, 'COD_NOT_ALLOWED');
          }

          // 1. Fetch active cart (under the checkout lock)
          const cart = await tx.cart.findFirst({
            where: { customerProfileId: profile.id },
            include: { items: { include: { product: true, variant: true } } }
          });
          if (!cart || cart.items.length === 0) {
            throw new AppError('Cannot create order from an empty cart', 400, 'EMPTY_CART');
          }

          // 2. Validate product & variant status
          this.assertCartAvailable(cart.items);

          // 3. Validate selected address
          const address = await tx.customerAddress.findFirst({
            where: { id: data.addressId, customerProfileId: profile.id, isActive: true }
          });
          if (!address) {
            throw new AppError('Selected delivery address is invalid or inactive', 400, 'INVALID_ADDRESS');
          }

          // 4. Calculate authoritative monetary breakdown (quantity limits enforced inside) and enforce the minimum order
          const pricing = PricingService.calculateCartPricing(cart.items, policy);
          if (!pricing.minimumOrder.met) {
            throw new AppError(
              `The minimum order is ${formatInr(pricing.minimumOrder.requiredAmount)}; add ${formatInr(pricing.minimumOrder.shortfall)} more to continue`,
              422,
              'MINIMUM_ORDER_NOT_MET'
            );
          }

          // 5. Immutable policy snapshot + request fingerprint
          const snapshot = buildPricingSnapshot(policy);
          const requestFingerprint = computeRequestFingerprint({
            customerProfileId: profile.id,
            addressId: data.addressId,
            paymentMethod,
            deliveryInstructions: data.deliveryInstructions,
            items: cart.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
            policyHash: snapshot.policyHash
          });

          // 6. Address snapshot
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

          // 7. OrderItem snapshot
          const orderItemsData = pricing.lineItems.map((item) => ({
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

          // 8. Create Order (ONLINE and COD both start PENDING / PENDING: nothing in P7A can confirm or pay an order)
          const order = await tx.order.create({
            data: {
              orderNumber: nextOrderNumber(),
              idempotencyKey,
              requestFingerprint,
              pricingSnapshot: snapshot as unknown as Prisma.InputJsonValue,
              customerProfileId: profile.id,
              status: 'PENDING',
              orderType: 'DIRECT',
              totalAmount: pricing.summary.itemsSubtotal,
              discountAmount: pricing.summary.discountAmount,
              taxAmount: pricing.summary.totalTax,
              deliveryFee: pricing.summary.deliveryFee,
              packagingFee: pricing.summary.packagingFee,
              containerDepositTotal: pricing.summary.containerDepositTotal,
              netAmount: pricing.summary.netAmount,
              deliveryAddressSnapshot: deliveryAddressSnapshot as any,
              deliveryAddress: `${address.addressLine1}, ${address.city}, ${address.state} - ${address.postalCode}`,
              paymentStatus: 'PENDING',
              paymentMethod,
              isGuest: false,
              items: { create: orderItemsData }
            },
            include: { items: true }
          });

          // 9. Creation event + audit (same transaction)
          await tx.orderEvent.create({
            data: { orderId: order.id, fromStatus: null, toStatus: 'PENDING', actorUserId: userId, actorRole: 'CUSTOMER' }
          });
          await AuditService.record(
            {
              actor: { userId, roles: ['CUSTOMER'] },
              action: 'ORDER_CREATED',
              entity: 'Order',
              entityId: order.id,
              payload: {
                orderNumber: order.orderNumber,
                paymentMethod,
                netAmount: pricing.summary.netAmount,
                itemCount: order.items.length,
                policyHash: snapshot.policyHash,
                policySource: snapshot.policySource
              },
              context
            },
            tx
          );

          // 10. Clear exactly the cart lines that were ordered
          await tx.cartItem.deleteMany({ where: { id: { in: cart.items.map((i) => i.id) } } });

          return { order, replay: false };
        }, { maxWait: 10000, timeout: 20000 });

        return await this.present(result.order);
      } catch (err) {
        if (isUniqueViolation(err)) {
          const target = uniqueTarget(err);
          if (target.includes('orderNumber')) {
            lastCollision = err; // extremely rare: draw a new number and retry the whole transaction
            continue;
          }
          if (target.includes('idempotencyKey')) {
            // Defensive: the checkout lock makes this unreachable, but never leak a database error if it ever happens.
            const raced = await prisma.order.findFirst({ where: { customerProfileId: profile.id, idempotencyKey }, include: { items: true } });
            if (raced) {
              this.assertReplayMatches(raced, profile.id, data, paymentMethod);
              return await this.present(raced);
            }
          }
          throw new AppError('The order could not be completed because of a conflicting request. Please retry.', 409, 'CONFLICT');
        }
        throw err;
      }
    }
    void lastCollision;
    throw new AppError('We could not allocate an order number. Please retry.', 503, 'ORDER_NUMBER_UNAVAILABLE');
  }

  private static async present(order: OrderWithItems): Promise<CustomerOrderDto> {
    const events = await prisma.orderEvent.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
      select: { fromStatus: true, toStatus: true, createdAt: true }
    });
    return toCustomerOrderDto(order, events);
  }

  /**
   * Get all orders belonging to authenticated customer (list view: no timeline)
   */
  public static async getCustomerOrders(userId: string): Promise<CustomerOrderDto[]> {
    const profile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      return [];
    }

    const orders = await prisma.order.findMany({
      where: { customerProfileId: profile.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' }
    });
    return orders.map((o) => toCustomerOrderDto(o));
  }

  /**
   * Get single order detail owned by authenticated customer (includes the customer-safe timeline)
   */
  public static async getOrderById(userId: string, orderIdOrNumber: string): Promise<CustomerOrderDto> {
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
      include: { items: true }
    });

    if (!order) {
      throw new AppError('Order not found or access denied', 404, 'NOT_FOUND');
    }

    return await this.present(order);
  }
}

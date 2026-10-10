import type { Order, OrderEvent, OrderItem } from '@prisma/client';

/**
 * Customer-facing order projection. It is an explicit allow-list: internal fields (idempotency key, request
 * fingerprint, pricing snapshot, customer/branch ids, guest fields, cancellation reason, actor ids) are never returned.
 * It is shaped so payment state, allowed actions and refund status can be added by later phases without a breaking change.
 */
export interface CustomerOrderItemDto {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  itemTitle: string;
  variantName: string | null;
  sku: string | null;
  unitPrice: OrderItem['unitPrice'];
  quantity: number;
  totalPrice: OrderItem['totalPrice'];
  taxRate: OrderItem['taxRate'];
  taxAmount: OrderItem['taxAmount'];
  containerDeposit: OrderItem['containerDeposit'];
}

export interface CustomerOrderEventDto {
  fromStatus: string | null;
  toStatus: string;
  at: Date;
}

export interface CustomerOrderDto {
  id: string;
  orderNumber: string;
  status: string;
  orderType: string;
  paymentStatus: string;
  paymentMethod: string | null;
  /** Items subtotal (before tax, fees and deposits) as stored when the order was placed. */
  totalAmount: Order['totalAmount'];
  discountAmount: Order['discountAmount'];
  taxAmount: Order['taxAmount'];
  deliveryFee: Order['deliveryFee'];
  packagingFee: Order['packagingFee'];
  containerDepositTotal: Order['containerDepositTotal'];
  netAmount: Order['netAmount'];
  deliveryAddress: string | null;
  deliveryAddressSnapshot: Order['deliveryAddressSnapshot'];
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: CustomerOrderItemDto[];
  /** Present on the detail view only. */
  timeline?: CustomerOrderEventDto[];
}

export function toCustomerOrderDto(
  order: Order & { items: OrderItem[] },
  events?: Array<Pick<OrderEvent, 'fromStatus' | 'toStatus' | 'createdAt'>>
): CustomerOrderDto {
  const dto: CustomerOrderDto = {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    orderType: order.orderType,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    totalAmount: order.totalAmount,
    discountAmount: order.discountAmount,
    taxAmount: order.taxAmount,
    deliveryFee: order.deliveryFee,
    packagingFee: order.packagingFee,
    containerDepositTotal: order.containerDepositTotal,
    netAmount: order.netAmount,
    deliveryAddress: order.deliveryAddress,
    deliveryAddressSnapshot: order.deliveryAddressSnapshot,
    confirmedAt: order.confirmedAt,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map((i) => ({
      id: i.id,
      orderId: i.orderId,
      productId: i.productId,
      variantId: i.variantId,
      itemTitle: i.itemTitle,
      variantName: i.variantName,
      sku: i.sku,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      totalPrice: i.totalPrice,
      taxRate: i.taxRate,
      taxAmount: i.taxAmount,
      containerDeposit: i.containerDeposit
    }))
  };
  if (events) {
    dto.timeline = events.map((e) => ({ fromStatus: e.fromStatus, toStatus: e.toStatus, at: e.createdAt }));
  }
  return dto;
}

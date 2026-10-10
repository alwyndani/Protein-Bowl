import { RoleEnum } from '@prisma/client';

/**
 * Typed order-status catalogue (the DB column stays a String so no enum migration is needed).
 * The vocabulary is the approved one - there is intentionally no OUT_FOR_DELIVERY.
 */
export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['DELIVERED', 'CANCELLED'];

/** Statuses that mean "the business has committed to fulfil this order": they require payment eligibility. */
export const OPERATIONAL_ORDER_STATUSES: readonly OrderStatus[] = ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED'];

/** Statuses at which a kitchen branch must already be assigned (the kitchen cannot start work without one). */
export const KITCHEN_BRANCH_REQUIRED_FOR: readonly OrderStatus[] = ['ACCEPTED', 'PREPARING'];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** The ONLY legal moves. Anything not listed here is impossible, whoever asks. */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ACCEPTED', 'PREPARING', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: []
});

/** Who may perform an edge. 'SYSTEM' = trusted server flows (payment verification/expiry); 'CUSTOMER_OWNER' = the order's own customer. */
export type TransitionParty = RoleEnum | 'SYSTEM' | 'CUSTOMER_OWNER';

export const TRANSITION_PARTIES: Readonly<Record<string, readonly TransitionParty[]>> = Object.freeze({
  // Confirmation is never a human/customer action: only the trusted payment path (P7B) may confirm an ONLINE order.
  'PENDING->CONFIRMED': ['SYSTEM'],
  'PENDING->CANCELLED': ['SYSTEM', 'CUSTOMER_OWNER', RoleEnum.SUPER_ADMIN],
  // P7C approved policy: the owning customer may cancel until the kitchen accepts (PENDING, CONFIRMED). ACCEPTED and later: SUPER_ADMIN only.
  // A PAID order can only be cancelled together with a registered refund intent (see PAID_CANCELLATION_REQUIRES_REFUND_INTENT).
  'CONFIRMED->CANCELLED': ['CUSTOMER_OWNER', RoleEnum.SUPER_ADMIN],
  'ACCEPTED->CANCELLED': [RoleEnum.SUPER_ADMIN],
  'PREPARING->CANCELLED': [RoleEnum.SUPER_ADMIN],
  'READY->CANCELLED': [RoleEnum.SUPER_ADMIN],
  'CONFIRMED->ACCEPTED': [RoleEnum.CHEF, RoleEnum.SUPER_ADMIN],
  'CONFIRMED->PREPARING': [RoleEnum.CHEF, RoleEnum.SUPER_ADMIN],
  'ACCEPTED->PREPARING': [RoleEnum.CHEF, RoleEnum.SUPER_ADMIN],
  'PREPARING->READY': [RoleEnum.CHEF, RoleEnum.SUPER_ADMIN],
  'READY->DISPATCHED': [RoleEnum.DELIVERY, RoleEnum.SUPER_ADMIN],
  'DISPATCHED->DELIVERED': [RoleEnum.DELIVERY, RoleEnum.SUPER_ADMIN]
});

export function transitionKey(from: OrderStatus, to: OrderStatus): string {
  return `${from}->${to}`;
}

/**
 * P7C: cancelling an order whose money has been received is only possible through the cancellation service, which creates the
 * full Refund intent in the SAME transaction and passes its id to the transition. The transition verifies that intent really
 * exists (REQUESTED, same order) and that the order is CONFIRMED or ACCEPTED. PREPARING/READY (and later) stay blocked for paid
 * orders: their financial handling belongs to P8/P9. There is no flag, role or test bypass.
 */
export const PAID_CANCELLATION_REQUIRES_REFUND_INTENT = true;

/** Payment statuses meaning money has been received for the order. */
export const PAID_PAYMENT_STATUSES: readonly string[] = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];

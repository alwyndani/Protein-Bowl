/**
 * Explicit frontend types for the server commerce API contracts (Phase 4B backend).
 *
 * Prisma `Decimal` columns are serialized as strings by the API ("120.00"); server-computed cart/checkout
 * figures arrive as numbers. `Money` accepts both. These values are DISPLAY-ONLY on the client - the backend is
 * the authority for every monetary figure, and no client-side price/total is ever sent to it.
 */
export type Money = string | number;

export interface ApiProductCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  displayOrder: number;
  isActive: boolean;
}

export interface ApiProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  price: Money;
  containerDeposit: Money | null;
  stockQuantity: number;
  isActive: boolean;
  isDefault: boolean;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface ApiProduct {
  id: string;
  categoryId: string;
  recipeId: string | null;
  name: string;
  slug: string;
  description: string;
  image: string | null;
  isFMCG: boolean;
  isTepache: boolean;
  isPublished: boolean;
  isActive: boolean;
  basePrice: Money;
  containerDeposit: Money;
  taxRate: Money;
  category: ApiProductCategory;
  variants: ApiProductVariant[];
}

/** GET /cart, and the response of every cart mutation. */
export interface ServerCartItem {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  sku: string | null;
  category: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  taxAmount: number;
  containerDeposit: number;
  lineTotal: number;
}

export interface ServerCart {
  id: string;
  customerProfileId: string;
  items: ServerCartItem[];
  itemsSubtotal: number;
  totalTax: number;
  containerDepositTotal: number;
  packagingFee: number;
  deliveryFee: number;
  discountAmount: number;
  netAmount: number;
}

export interface CheckoutPreviewLineItem {
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  containerDeposit: number;
  totalPrice: number;
}

export interface CheckoutPreviewSummary {
  itemsSubtotal: number;
  totalTax: number;
  containerDepositTotal: number;
  packagingFee: number;
  deliveryFee: number;
  discountAmount: number;
  netAmount: number;
}

export interface CheckoutPreviewAddress {
  id: string;
  title: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  recipientName: string;
}

/** Server-evaluated minimum-order rule for the current cart (display only; the server enforces it on order creation). */
export interface MinimumOrderStatus {
  enabled: boolean;
  requiredAmount: number;
  met: boolean;
  shortfall: number;
}

/** POST /checkout/preview */
export interface CheckoutPreview {
  cartId: string;
  items: CheckoutPreviewLineItem[];
  summary: CheckoutPreviewSummary;
  minimumOrder?: MinimumOrderStatus;
  deliveryAddress: CheckoutPreviewAddress | null;
}

export interface ApiOrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  itemTitle: string;
  variantName: string | null;
  sku: string | null;
  unitPrice: Money;
  quantity: number;
  totalPrice: Money;
  taxRate: Money;
  taxAmount: Money;
  containerDeposit: Money;
}

export interface ApiOrderAddressSnapshot {
  addressId?: string;
  title?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  postalCode?: string;
  recipientName?: string;
  phone?: string | null;
  email?: string | null;
}

/** Persisted Order (POST /orders, GET /orders/my-orders, GET /orders/:idOrNumber). */
export interface ApiOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  /** Items subtotal (before tax/fees) as stored by the server. */
  totalAmount: Money;
  discountAmount: Money;
  taxAmount: Money;
  deliveryFee: Money;
  packagingFee: Money;
  containerDepositTotal: Money;
  netAmount: Money;
  deliveryAddress: string | null;
  deliveryAddressSnapshot: ApiOrderAddressSnapshot | null;
  confirmedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  items: ApiOrderItem[];
  /** Customer-safe status history (detail view only). */
  timeline?: Array<{ fromStatus: string | null; toStatus: string; at: string }>;
  /** P7C (server-derived): whether the owner may cancel. The UI follows this, it never re-implements the policy. */
  cancellation?: { state: CancellationState; allowed: boolean };
  /** P7C (server-derived): refund state, separate from the order and payment states. */
  refund?: { state: RefundState };
  /** P7D-G1 (server-derived): payment summary. canStartPayment is AUTHORITATIVE: the UI may disable more, never enable. */
  payment?: PaymentSummary;
  /** P9C (server-derived label, NOT an order status): present once the order was dispatched (or cancelled as undeliverable). Never carries reasons, notes or driver data. */
  delivery?: { state: CustomerDeliveryState; attemptNumber: number; maxAttempts: number };
}

export type CustomerDeliveryState = 'ON_THE_WAY' | 'DELIVERY_ISSUE' | 'RETRY_PLANNED' | 'UNDELIVERABLE_REFUND_PENDING' | 'DELIVERED';

export type CancellationState = 'CANCELLATION_AVAILABLE' | 'CANCELLATION_NOT_ALLOWED' | 'CANCELLED';
export type RefundState = 'NO_REFUND' | 'REFUND_PENDING' | 'REFUND_PROCESSING' | 'REFUNDED' | 'REFUND_REVIEW_REQUIRED';
export type PaymentSummaryState = 'NOT_STARTED' | 'AWAITING_PAYMENT' | 'CONFIRMING' | 'PAID';

export interface PaymentSummary {
  state: PaymentSummaryState;
  canStartPayment: boolean;
}

/** POST /orders/:orderId/payment-attempts: only what is needed to open the provider checkout (no secrets). */
export interface CheckoutSession {
  attemptId: string;
  provider: string;
  /** Public provider key id (safe for the browser). */
  keyId: string;
  providerOrderId: string;
  /** Display only: the amount was fixed by the server when the provider order was created. */
  amountMinor: number;
  currency: string;
  orderNumber: string;
  expiresAt: string;
  status: string;
}

/** POST /orders/:orderId/payment-attempts/:attemptId/verify (200 = PAID, 202 = PENDING). */
export interface VerifyPaymentResult {
  result: 'PAID' | 'PENDING';
  orderStatus: string;
  orderPaymentStatus: string;
}

/** The evidence returned by the provider checkout handler; sent to the server verification endpoint and nowhere else. */
export interface CheckoutEvidence {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export const CUSTOMER_CANCEL_REASON_CODES = ['CHANGED_MIND', 'ORDERED_BY_MISTAKE', 'WRONG_ORDER', 'DELIVERY_TOO_LATE', 'OTHER'] as const;
export type CustomerCancelReasonCode = (typeof CUSTOMER_CANCEL_REASON_CODES)[number];

/** POST /orders/:orderId/cancel */
export interface CancelOrderResult {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  cancelledAt: string | null;
  alreadyCancelled: boolean;
  cancellation: { state: CancellationState; allowed: boolean };
  refund: { state: RefundState };
  payment?: PaymentSummary;
}

/** GET /orders/:orderId/refunds (safe fields only). */
export interface OrderRefundsView {
  orderId: string;
  cancellation: { state: CancellationState; allowed: boolean };
  refund: { state: RefundState };
  payment?: PaymentSummary;
  refunds: Array<{ id: string; state: RefundState; amount: Money; currency: string; requestedAt: string; processedAt: string | null }>;
}

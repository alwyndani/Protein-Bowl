/**
 * Strict DTOs for the REAL backend commerce API (audited against server/src, P11B).
 *
 * ALLOW-LIST: only the fields the customer app renders or needs are declared. The public product API returns raw rows that also carry
 * recipeId, taxRate, stockQuantity, sku, rating (a constant placeholder) and reviewsCount - those are deliberately NOT modelled, so they
 * can never be rendered by accident.
 *
 * MONEY: the server sends two representations. Cart / checkout-preview figures are JS numbers (rupees, 2 dp); products and orders are
 * Prisma Decimal STRINGS (e.g. "299", "40.5"). `Money` accepts both and is NEVER used in arithmetic on the device - display only.
 */
export type Money = string | number;

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  displayOrder: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  price: Money;
  containerDeposit: Money | null;
  isActive: boolean;
  isDefault: boolean;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  image: string | null;
  basePrice: Money;
  containerDeposit: Money;
  category: { id: string; name: string; slug: string };
  variants: ProductVariant[];
}

export interface MinimumOrder {
  enabled: boolean;
  requiredAmount: number;
  met: boolean;
  shortfall: number;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  image: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  taxAmount: number;
  containerDeposit: number;
  lineTotal: number;
}

export interface QuantityIssue {
  itemId: string | null;
  code: string;
}

export interface Cart {
  id: string;
  items: CartItem[];
  itemsSubtotal: number;
  totalTax: number;
  containerDepositTotal: number;
  packagingFee: number;
  deliveryFee: number;
  discountAmount: number;
  netAmount: number;
  minimumOrder: MinimumOrder;
  quantityIssues: QuantityIssue[];
}

export interface Address {
  id: string;
  title: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}

export interface AddressInput {
  title?: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state?: string;
  postalCode: string;
  isDefault?: boolean;
}

export interface CheckoutLineItem {
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  taxAmount: number;
  containerDeposit: number;
  totalPrice: number;
}

export interface CheckoutSummary {
  itemsSubtotal: number;
  totalTax: number;
  containerDepositTotal: number;
  packagingFee: number;
  deliveryFee: number;
  discountAmount: number;
  netAmount: number;
}

export interface CheckoutPreview {
  cartId: string;
  items: CheckoutLineItem[];
  summary: CheckoutSummary;
  minimumOrder: MinimumOrder;
  deliveryAddress: (Omit<Address, 'isDefault'> & { recipientName: string }) | null;
}

export type PaymentState = 'NOT_STARTED' | 'AWAITING_PAYMENT' | 'CONFIRMING' | 'PAID';
export type CancellationState = 'CANCELLATION_AVAILABLE' | 'CANCELLATION_NOT_ALLOWED' | 'CANCELLED';
export type RefundState = 'NO_REFUND' | 'REFUND_PENDING' | 'REFUND_PROCESSING' | 'REFUNDED' | 'REFUND_REVIEW_REQUIRED';
export type DeliveryState = 'ON_THE_WAY' | 'DELIVERY_ISSUE' | 'RETRY_PLANNED' | 'UNDELIVERABLE_REFUND_PENDING' | 'DELIVERED';

export interface OrderItem {
  id: string;
  itemTitle: string;
  variantName: string | null;
  unitPrice: Money;
  quantity: number;
  totalPrice: Money;
}

/** The owner's delivery address snapshot. Email and phone exist on the server object but are NOT modelled (never rendered). */
export interface OrderAddressSnapshot {
  title?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  postalCode?: string;
  recipientName?: string;
  deliveryInstructions?: string;
}

export interface TimelineEntry {
  fromStatus: string | null;
  toStatus: string;
  at: string;
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: Money;
  discountAmount: Money;
  taxAmount: Money;
  deliveryFee: Money;
  packagingFee: Money;
  containerDepositTotal: Money;
  netAmount: Money;
  deliveryAddressSnapshot: OrderAddressSnapshot | null;
  createdAt: string;
  items: OrderItem[];
  timeline?: TimelineEntry[];
  cancellation?: { state: CancellationState; allowed: boolean };
  refund?: { state: RefundState };
  payment?: { state: PaymentState; canStartPayment: boolean };
  delivery?: { state: DeliveryState; attemptNumber: number; maxAttempts: number };
}

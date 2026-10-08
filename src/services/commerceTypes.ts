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

/** POST /checkout/preview */
export interface CheckoutPreview {
  cartId: string;
  items: CheckoutPreviewLineItem[];
  summary: CheckoutPreviewSummary;
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
  createdAt: string;
  items: ApiOrderItem[];
}

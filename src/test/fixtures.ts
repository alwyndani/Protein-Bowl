import type {
  ApiOrder,
  ApiProduct,
  ApiProductVariant,
  CheckoutPreview,
  ServerCart,
  ServerCartItem
} from '../services/commerceTypes';

export const CATEGORY = {
  id: 'cat-1',
  name: 'Server Granola',
  slug: 'server-granola',
  description: null,
  image: null,
  displayOrder: 1,
  isActive: true
};

export function variant(overrides: Partial<ApiProductVariant> = {}): ApiProductVariant {
  return {
    id: 'var-1',
    productId: 'prod-1',
    name: '250g Pouch',
    sku: 'SKU-250',
    price: '199.00',
    containerDeposit: null,
    stockQuantity: 100,
    isActive: true,
    isDefault: true,
    calories: 420,
    protein: 12,
    carbs: 55,
    fat: 14,
    ...overrides
  };
}

export function product(overrides: Partial<ApiProduct> = {}): ApiProduct {
  return {
    id: 'prod-1',
    categoryId: CATEGORY.id,
    recipeId: null,
    name: 'Server Almond Granola',
    slug: 'server-almond-granola',
    description: 'Slow baked granola from the server catalog',
    image: null,
    isFMCG: true,
    isTepache: false,
    isPublished: true,
    isActive: true,
    basePrice: '199.00',
    containerDeposit: '0.00',
    taxRate: '0.0500',
    category: CATEGORY,
    variants: [variant()],
    ...overrides
  };
}

export function cartItem(overrides: Partial<ServerCartItem> = {}): ServerCartItem {
  return {
    id: 'ci-1',
    productId: 'prod-1',
    variantId: 'var-1',
    name: 'Server Almond Granola',
    variantName: '250g Pouch',
    sku: 'SKU-250',
    category: CATEGORY.id,
    image: null,
    unitPrice: 199,
    quantity: 1,
    subtotal: 199,
    taxAmount: 9.95,
    containerDeposit: 0,
    lineTotal: 208.95,
    ...overrides
  };
}

export function serverCart(items: ServerCartItem[] = [cartItem()]): ServerCart {
  const itemsSubtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  return {
    id: 'cart-1',
    customerProfileId: 'cp-1',
    items,
    itemsSubtotal,
    totalTax: 0,
    containerDepositTotal: items.reduce((sum, i) => sum + i.containerDeposit * i.quantity, 0),
    packagingFee: 0,
    deliveryFee: 0,
    discountAmount: 0,
    netAmount: itemsSubtotal
  };
}

/** Deliberately "odd" numbers so tests can prove the UI shows server figures instead of recomputing them. */
export function preview(overrides: Partial<CheckoutPreview> = {}): CheckoutPreview {
  return {
    cartId: 'cart-1',
    items: [
      {
        productId: 'prod-1',
        variantId: 'var-1',
        title: 'Server Almond Granola',
        variantName: '250g Pouch',
        sku: 'SKU-250',
        unitPrice: 199,
        quantity: 1,
        subtotal: 199,
        taxRate: 0.05,
        taxAmount: 9.95,
        containerDeposit: 0,
        totalPrice: 208.95
      }
    ],
    summary: {
      itemsSubtotal: 199,
      totalTax: 11.11,
      containerDepositTotal: 0,
      packagingFee: 7.77,
      deliveryFee: 33.33,
      discountAmount: 0,
      netAmount: 251.21
    },
    deliveryAddress: {
      id: 'addr-1',
      title: 'Home',
      addressLine1: '12 Marine Drive',
      addressLine2: null,
      city: 'Kochi',
      state: 'Kerala',
      postalCode: '682031',
      recipientName: 'Test Customer'
    },
    ...overrides
  };
}

export function order(overrides: Partial<ApiOrder> = {}): ApiOrder {
  return {
    id: 'order-uuid-1',
    orderNumber: 'PB-123456-789',
    status: 'PENDING',
    paymentStatus: 'PENDING',
    paymentMethod: 'ONLINE',
    totalAmount: '199.00',
    discountAmount: '0.00',
    taxAmount: '11.11',
    deliveryFee: '33.33',
    packagingFee: '7.77',
    containerDepositTotal: '0.00',
    netAmount: '251.21',
    deliveryAddress: '12 Marine Drive, Kochi, Kerala - 682031',
    deliveryAddressSnapshot: {
      addressId: 'addr-1',
      title: 'Home',
      addressLine1: '12 Marine Drive',
      city: 'Kochi',
      state: 'Kerala',
      postalCode: '682031',
      recipientName: 'Test Customer'
    },
    createdAt: '2026-10-08T10:00:00.000Z',
    items: [
      {
        id: 'oi-1',
        orderId: 'order-uuid-1',
        productId: 'prod-1',
        variantId: 'var-1',
        itemTitle: 'Server Almond Granola',
        variantName: '250g Pouch',
        sku: 'SKU-250',
        unitPrice: '199.00',
        quantity: 1,
        totalPrice: '208.95',
        taxRate: '0.0500',
        taxAmount: '9.95',
        containerDeposit: '0.00'
      }
    ],
    ...overrides
  };
}

export const ADDRESS = {
  id: 'addr-1',
  customerProfileId: 'cp-1',
  title: 'Home',
  addressLine1: '12 Marine Drive',
  addressLine2: null,
  city: 'Kochi',
  state: 'Kerala',
  postalCode: '682031',
  isDefault: true,
  isActive: true
};

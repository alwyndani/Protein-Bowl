import type { ApiClient } from '../api/apiClient';
import type { Address, AddressInput, Cart, Category, CheckoutPreview, CustomerOrder, Product } from './types';

/**
 * The commerce API surface of P11B, over the typed ApiClient (Bearer + single-flight refresh come from there).
 * EXACTLY these backend endpoints and nothing else: no payment-attempt, verify, cancel, refund, delivery-code or payment-method
 * request exists in this module (a static guard enforces it). Prices are never sent; the server prices everything.
 */
export class CommerceApi {
  constructor(private readonly client: ApiClient) {}

  // ----- catalog (public on the server; sent with the session like every call) -----
  categories = (): Promise<Category[]> => this.client.request('/products/categories');

  products = (categoryId?: string): Promise<Product[]> => this.client.request(`/products${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ''}`);

  product = (slug: string): Promise<Product> => this.client.request(`/products/${encodeURIComponent(slug)}`);

  // ----- server cart -----
  cart = (): Promise<Cart> => this.client.request('/cart');

  addToCart = (input: { productId: string; variantId: string | null; quantity: number }): Promise<Cart> =>
    this.client.request('/cart/items', { method: 'POST', body: input });

  setQuantity = (itemId: string, quantity: number): Promise<Cart> =>
    this.client.request(`/cart/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: { quantity } });

  removeItem = (itemId: string): Promise<Cart> => this.client.request(`/cart/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });

  clearCart = (): Promise<Cart> => this.client.request('/cart', { method: 'DELETE' });

  // ----- addresses (owner-scoped on the server) -----
  addresses = (): Promise<Address[]> => this.client.request('/customers/me/addresses');

  createAddress = (input: AddressInput): Promise<Address> => this.client.request('/customers/me/addresses', { method: 'POST', body: input });

  updateAddress = (id: string, input: Partial<AddressInput>): Promise<Address> =>
    this.client.request(`/customers/me/addresses/${encodeURIComponent(id)}`, { method: 'PUT', body: input });

  deleteAddress = (id: string): Promise<unknown> => this.client.request(`/customers/me/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });

  // ----- checkout / orders -----
  previewCheckout = (addressId?: string): Promise<CheckoutPreview> =>
    this.client.request('/checkout/preview', { method: 'POST', body: addressId ? { addressId } : {} });

  /**
   * ONLINE order. NO paymentMethod is sent (omitted = ONLINE on the server). The idempotency key is REQUIRED and is supplied by the
   * checkout attempt; a failed or ambiguous call is never retried here.
   */
  createOrder = (input: { addressId: string; deliveryInstructions?: string; idempotencyKey: string }): Promise<CustomerOrder> =>
    this.client.request('/orders', {
      method: 'POST',
      headers: { 'x-idempotency-key': input.idempotencyKey },
      body: { addressId: input.addressId, ...(input.deliveryInstructions ? { deliveryInstructions: input.deliveryInstructions } : {}) }
    });

  orders = (): Promise<CustomerOrder[]> => this.client.request('/orders/my-orders');

  order = (idOrNumber: string): Promise<CustomerOrder> => this.client.request(`/orders/${encodeURIComponent(idOrNumber)}`);
}

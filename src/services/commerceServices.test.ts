import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiRequestError } from './apiClient';
import { ProductService } from './productService';
import { CartService } from './cartService';
import { OrderService } from './orderService';
import { AddressService } from './addressService';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('commerce services (HTTP contract)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    ApiClient.setAccessToken('test-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    ApiClient.setAccessToken(null);
  });

  it('CartService.addItem sends only productId, variantId and quantity (never a price) with the bearer token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'cart-1', items: [] } }, 201));
    await CartService.addItem('prod-1', 'var-1', 2);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/cart\/items$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({ productId: 'prod-1', variantId: 'var-1', quantity: 2 });
  });

  it('CartService quantity update and removal use the backend item endpoints', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { id: 'cart-1', items: [] } }));
    await CartService.updateItemQuantity('ci-1', 3);
    await CartService.removeItem('ci-1');

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/cart\/items\/ci-1$/);
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ quantity: 3 });
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });

  it('OrderService.createOrder sends the idempotency header and no prices or totals', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'o1' } }, 201));
    await OrderService.createOrder({ addressId: 'addr-1', idempotencyKey: 'IK-abc' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/orders$/);
    expect(init.headers['x-idempotency-key']).toBe('IK-abc');
    expect(JSON.parse(init.body)).toEqual({ addressId: 'addr-1' });
  });

  it('services throw ApiRequestError on API failure instead of returning undefined data', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, error: 'EMPTY_CART', message: 'Cart is empty' }, 400));
    await expect(OrderService.checkoutPreview({ addressId: 'a' })).rejects.toMatchObject({ code: 'EMPTY_CART', status: 400, message: 'Cart is empty' });

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, error: 'FORBIDDEN', message: 'Access denied' }, 403));
    await expect(CartService.getCart()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('a network failure surfaces as an ApiRequestError (no fake success)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    await expect(ProductService.getProducts()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('ProductService builds the catalog query from filters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));
    await ProductService.getProducts(undefined, undefined, true);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/products\?isTepache=true$/);
  });

  it('AddressService failures throw', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'bad address' }, 422));
    await expect(AddressService.createAddress({ addressLine1: 'x', city: 'y', postalCode: '1' })).rejects.toBeInstanceOf(ApiRequestError);
  });
});

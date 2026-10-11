import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiRequestError } from './apiClient';
import { OrderService } from './orderService';
import { PaymentService } from './paymentService';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function mockFetch(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return responder(url, init);
    })
  );
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const financial: Array<[string, () => Promise<unknown>, string]> = [
  ['create order', () => OrderService.createOrder({ addressId: 'a1', idempotencyKey: 'IK-test-key-1234' }), '/orders'],
  ['create payment session', () => PaymentService.createSession('o1'), '/orders/o1/payment-attempts'],
  ['verify payment', () => PaymentService.verify('o1', 'att1', { providerOrderId: 'order_1', providerPaymentId: 'pay_1', signature: 'sigvalue' }), '/orders/o1/payment-attempts/att1/verify'],
  ['cancel order', () => OrderService.cancelOrder('o1', 'CHANGED_MIND', 'note'), '/orders/o1/cancel']
];

beforeEach(() => ApiClient.setAccessToken('token-for-tests'));
afterEach(() => {
  vi.unstubAllGlobals();
  ApiClient.setAccessToken(null);
});

describe('financial POSTs are never retried automatically', () => {
  for (const [label, run, path] of financial) {
    it(`${label}: a 500 is sent exactly ONCE and surfaces as an error`, async () => {
      mockFetch(() => json(500, { success: false, error: 'INTERNAL_SERVER_ERROR', message: 'boom' }));
      await expect(run()).rejects.toBeInstanceOf(ApiRequestError);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain(path);
      expect(calls[0].init.method).toBe('POST');
    });

    it(`${label}: a network failure is sent exactly ONCE`, async () => {
      mockFetch(() => {
        throw new TypeError('Failed to fetch');
      });
      await expect(run()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
      expect(calls).toHaveLength(1);
    });

    it(`${label}: a 401 whose token refresh FAILS is not repeated (the original request is not resent)`, async () => {
      mockFetch((url) => (url.endsWith('/auth/refresh') ? json(401, { success: false, error: 'UNAUTHORIZED' }) : json(401, { success: false, error: 'UNAUTHORIZED', message: 'expired' })));
      await expect(run()).rejects.toMatchObject({ status: 401 });
      expect(calls.filter((c) => !c.url.endsWith('/auth/refresh'))).toHaveLength(1);
    });
  }

  it('the only automatic repeat is the documented single retry AFTER a successful token refresh (the first attempt was rejected before any business logic)', async () => {
    let first = true;
    mockFetch((url) => {
      if (url.endsWith('/auth/refresh')) return json(200, { success: true, data: { accessToken: 'new-token' } });
      if (first) {
        first = false;
        return json(401, { success: false, error: 'UNAUTHORIZED' });
      }
      return json(200, { success: true, data: { orderId: 'o1' } });
    });
    await PaymentService.createSession('o1');
    expect(calls.filter((c) => !c.url.endsWith('/auth/refresh'))).toHaveLength(2);
  });
});

describe('request bodies carry no financial authority', () => {
  const body = (i: number) => JSON.parse(String(calls[i].init.body));

  it('session creation sends an EMPTY body; verification sends exactly the three evidence fields; cancellation only reasonCode (+ note)', async () => {
    mockFetch(() => json(200, { success: true, data: {} }));
    await PaymentService.createSession('o1');
    await PaymentService.verify('o1', 'att1', { providerOrderId: 'order_1', providerPaymentId: 'pay_1', signature: 'sigvalue' });
    await OrderService.cancelOrder('o1', 'OTHER', '  a note  ');
    await OrderService.cancelOrder('o1', 'WRONG_ORDER');
    expect(body(0)).toEqual({});
    expect(Object.keys(body(1)).sort()).toEqual(['providerOrderId', 'providerPaymentId', 'signature']);
    expect(body(2)).toEqual({ reasonCode: 'OTHER', note: 'a note' });
    expect(body(3)).toEqual({ reasonCode: 'WRONG_ORDER' });
    for (let i = 0; i < 4; i++) {
      const text = JSON.stringify(body(i));
      expect(text).not.toMatch(/amount|currency|customerId|"status"|paymentStatus|refund/i);
    }
  });

  it('order creation sends only the address (and optional method/instructions) in the body, the idempotency key as a HEADER', async () => {
    mockFetch(() => json(200, { success: true, data: {} }));
    await OrderService.createOrder({ addressId: 'a1', idempotencyKey: 'IK-test-key-1234' });
    expect(body(0)).toEqual({ addressId: 'a1' });
    expect((calls[0].init.headers as Record<string, string>)['x-idempotency-key']).toBe('IK-test-key-1234');
  });

  it('ids are URL-encoded into the path (no path injection through an order id)', async () => {
    mockFetch(() => json(200, { success: true, data: {} }));
    await PaymentService.createSession('a/../b?x=1');
    expect(calls[0].url).toContain('/orders/a%2F..%2Fb%3Fx%3D1/payment-attempts');
  });
});

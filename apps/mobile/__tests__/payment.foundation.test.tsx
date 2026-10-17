import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ApiClient } from '../src/api/apiClient';
import { ApiError } from '../src/api/ApiError';
import { PaymentApi } from '../src/payments/paymentApi';
import { paymentErrorInfo, PAYMENT_ERROR_CODES } from '../src/payments/paymentErrors';
import { buildCheckoutOptions } from '../src/payments/checkoutMapping';
import { PaymentEvidenceProvider, PaymentEvidenceStore, usePaymentEvidenceStore } from '../src/payments/paymentEvidenceStore';
import type { CheckoutSession } from '../src/payments/paymentTypes';

const res = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }) as unknown as Response;

function make(fetchImpl: jest.Mock, extra: Partial<ConstructorParameters<typeof ApiClient>[0]> = {}) {
  const client = new ApiClient({
    baseUrl: 'https://api.test/api/v1',
    clientHeader: 'protein-bowl-mobile/1.0.0 (android)',
    timeoutMs: 40,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    getAccessToken: () => 'tok',
    refreshSession: async () => {
      throw new Error('no refresh');
    },
    ...extra
  });
  return new PaymentApi(client);
}

const SESSION: CheckoutSession = {
  attemptId: 'att-1',
  provider: 'razorpay',
  keyId: 'public_key_id_1',
  providerOrderId: 'order_ABC123',
  amountMinor: 33900,
  currency: 'INR',
  orderNumber: 'PB-261017-ABC123',
  expiresAt: '2026-10-17T10:00:00.000Z',
  status: 'PENDING'
};
const EVIDENCE = { providerOrderId: 'order_ABC123', providerPaymentId: 'pay_ABC123', signature: 'a'.repeat(64) };

describe('PaymentApi (existing ApiClient, exact endpoints and bodies)', () => {
  it('createAttempt: POST, no body, no amount / currency / method / provider order', async () => {
    const f = jest.fn(async () => res(200, { success: true, data: SESSION }));
    expect(await make(f).createAttempt('ord 1')).toEqual(SESSION);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://api.test/api/v1/orders/ord%201/payment-attempts');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.credentials).toBe('omit');
  });

  it('getAttempt: GET on the attempt', async () => {
    const status = { attemptId: 'att-1', status: 'PENDING', expiresAt: null, lastError: null, orderStatus: 'PENDING', orderPaymentStatus: 'PENDING' };
    const f = jest.fn(async () => res(200, { success: true, data: status }));
    expect(await make(f).getAttempt('o1', 'att-1')).toEqual(status);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/v1/orders/o1/payment-attempts/att-1');
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('verifyPayment: POST with EXACTLY providerOrderId, providerPaymentId and signature', async () => {
    const f = jest.fn(async () => res(200, { success: true, data: { result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' } }));
    const out = await make(f).verifyPayment('o1', 'att-1', { ...EVIDENCE, amount: 1, currency: 'USD', status: 'PAID' } as typeof EVIDENCE);
    expect(out).toEqual({ result: 'PAID', orderStatus: 'CONFIRMED', orderPaymentStatus: 'PAID' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/v1/orders/o1/payment-attempts/att-1/verify');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ providerOrderId: 'order_ABC123', providerPaymentId: 'pay_ABC123', signature: 'a'.repeat(64) });
  });

  it('a 202 PENDING answer is returned as typed data (not an error, not PAID)', async () => {
    const f = jest.fn(async () => res(202, { success: true, data: { result: 'PENDING', orderStatus: 'PENDING', orderPaymentStatus: 'PENDING' } }));
    expect((await make(f).verifyPayment('o1', 'att-1', EVIDENCE)).result).toBe('PENDING');
  });

  it.each([
    ['createAttempt', (a: PaymentApi) => a.createAttempt('o1')],
    ['verifyPayment', (a: PaymentApi) => a.verifyPayment('o1', 'att-1', EVIDENCE)]
  ])('%s: a financial POST is sent ONCE and never retried (timeout, network, 5xx, malformed)', async (_n, call) => {
    for (const f of [
      jest.fn((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted'))))),
      jest.fn(async () => {
        throw new TypeError('Network request failed');
      }),
      jest.fn(async () => res(503, { success: false, error: 'PAYMENT_PROVIDER_UNAVAILABLE' })),
      jest.fn(async () => res(200, '<html>'))
    ]) {
      await expect(call(make(f as unknown as jest.Mock))).rejects.toBeInstanceOf(ApiError);
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it('refreshes once on a 401 through the existing client behaviour (not a second client)', async () => {
    let n = 0;
    const f = jest.fn(async () => (n++ === 0 ? res(401, { success: false, error: 'TOKEN_EXPIRED' }) : res(200, { success: true, data: SESSION })));
    const refresh = jest.fn(async () => 'fresh');
    expect(await make(f, { refreshSession: refresh }).createAttempt('o1')).toEqual(SESSION);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('payment error contract (named, never concluded)', () => {
  const fail = (status: number, code: string) => make(jest.fn(async () => res(status, { success: false, message: 'server text', error: code }))).createAttempt('o1').catch((e) => e);

  it.each([
    [409, 'PAYMENT_ALREADY_COMPLETED'],
    [409, 'ORDER_NOT_PAYABLE'],
    [409, 'PAYMENT_ATTEMPT_IN_PROGRESS'],
    [422, 'PAYMENT_AMOUNT_TOO_SMALL'],
    [422, 'PAYMENT_AMOUNT_MISMATCH'],
    [422, 'PAYMENT_CURRENCY_MISMATCH'],
    [400, 'PAYMENT_VERIFICATION_FAILED'],
    [404, 'PAYMENT_ATTEMPT_NOT_FOUND']
  ])('%i %s is a known, DEFINITE (non-ambiguous) refusal', async (status, code) => {
    const info = paymentErrorInfo(await fail(status, code));
    expect(info).toEqual({ code, status, ambiguous: false });
  });

  it('503 PAYMENT_PROVIDER_UNAVAILABLE is known and flagged ambiguous (the flow layer decides; no conclusion here)', async () => {
    expect(paymentErrorInfo(await fail(503, 'PAYMENT_PROVIDER_UNAVAILABLE'))).toEqual({ code: 'PAYMENT_PROVIDER_UNAVAILABLE', status: 503, ambiguous: true });
  });

  it('network and timeout stay distinguishable from definitive refusals; unknown codes are null; non-API errors are not payment errors', async () => {
    const net = await make(jest.fn(async () => { throw new TypeError('x'); })).createAttempt('o1').catch((e) => e);
    expect(paymentErrorInfo(net)).toEqual({ code: null, status: 0, ambiguous: true });
    expect(paymentErrorInfo(await fail(400, 'SOMETHING_ELSE'))?.code).toBeNull();
    expect(paymentErrorInfo(new Error('x'))).toBeNull();
    expect(PAYMENT_ERROR_CODES).toContain('PAYMENT_PROVIDER_UNAVAILABLE');
  });

  it('no raw server text is kept on the error', async () => {
    const e = (await fail(409, 'ORDER_NOT_PAYABLE')) as ApiError;
    expect(e.message).not.toMatch(/server text/);
  });
});

describe('PaymentEvidenceStore (memory only)', () => {
  it('sets, gets and clears one entry; unknown keys are null', () => {
    const s = new PaymentEvidenceStore();
    expect(s.getEvidence('o1', 'a1')).toBeNull();
    s.setEvidence('o1', 'a1', EVIDENCE);
    expect(s.getEvidence('o1', 'a1')).toEqual(EVIDENCE);
    s.clearEvidence('o1', 'a1');
    expect(s.getEvidence('o1', 'a1')).toBeNull();
  });

  it('isolates by order AND attempt (no ambiguous key joins)', () => {
    const s = new PaymentEvidenceStore();
    const other = { ...EVIDENCE, providerPaymentId: 'pay_OTHER' };
    s.setEvidence('o1', 'a1', EVIDENCE);
    s.setEvidence('o1', 'a2', other);
    s.setEvidence('o2', 'a1', { ...EVIDENCE, providerPaymentId: 'pay_THIRD' });
    s.setEvidence('o', '1a1', { ...EVIDENCE, providerPaymentId: 'pay_FOURTH' });
    expect(s.getEvidence('o1', 'a1')).toEqual(EVIDENCE);
    expect(s.getEvidence('o1', 'a2')).toEqual(other);
    expect(s.getEvidence('o2', 'a1')?.providerPaymentId).toBe('pay_THIRD');
    expect(s.getEvidence('o', '1a1')?.providerPaymentId).toBe('pay_FOURTH');
    s.clearEvidence('o1', 'a1');
    expect(s.getEvidence('o1', 'a2')).toEqual(other);
  });

  it('clearAllEvidence removes everything (sign-out)', () => {
    const s = new PaymentEvidenceStore();
    s.setEvidence('o1', 'a1', EVIDENCE);
    s.setEvidence('o2', 'a2', EVIDENCE);
    s.clearAllEvidence();
    expect(s.getEvidence('o1', 'a1')).toBeNull();
    expect(s.getEvidence('o2', 'a2')).toBeNull();
  });

  it('keeps a frozen private copy: later mutation of the caller object changes nothing', () => {
    const s = new PaymentEvidenceStore();
    const mutable = { ...EVIDENCE };
    s.setEvidence('o1', 'a1', mutable);
    mutable.signature = 'b'.repeat(64);
    const got = s.getEvidence('o1', 'a1')!;
    expect(got.signature).toBe('a'.repeat(64));
    expect(Object.isFrozen(got)).toBe(true);
  });

  it('findForOrder returns the most recent attempt of THAT order only; epoch changes on clearAll', () => {
    const s = new PaymentEvidenceStore();
    expect(s.findForOrder('o1')).toBeNull();
    s.setEvidence('o1', 'a1', EVIDENCE);
    s.setEvidence('o2', 'a9', { ...EVIDENCE, providerPaymentId: 'pay_OTHER' });
    const newer = { ...EVIDENCE, providerPaymentId: 'pay_NEWER' };
    s.setEvidence('o1', 'a2', newer);
    expect(s.findForOrder('o1')).toEqual({ attemptId: 'a2', evidence: newer });
    expect(s.findForOrder('o2')?.attemptId).toBe('a9');
    expect(s.findForOrder('o3')).toBeNull();
    s.clearEvidence('o1', 'a2');
    expect(s.findForOrder('o1')?.attemptId).toBe('a1');
    const before = s.epoch();
    s.clearAllEvidence();
    expect(s.epoch()).toBe(before + 1);
    expect(s.findForOrder('o1')).toBeNull();
  });

  it('is available through its provider, and a missing provider fails loudly', () => {
    const s = new PaymentEvidenceStore();
    const Probe = () => <Text>{usePaymentEvidenceStore() === s ? 'same-store' : 'other'}</Text>;
    render(
      <PaymentEvidenceProvider store={s}>
        <Probe />
      </PaymentEvidenceProvider>
    );
    expect(screen.getByText('same-store')).toBeTruthy();
    const spy = jest.spyOn(global.console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/PaymentEvidenceProvider/);
    spy.mockRestore();
  });
});

describe('session -> native checkout options (backend values only, fail closed)', () => {
  it('maps the backend values exactly, with safe display text', () => {
    expect(buildCheckoutOptions(SESSION)).toEqual({
      ok: true,
      options: { key: 'public_key_id_1', order_id: 'order_ABC123', amount: 33900, currency: 'INR', name: 'Protein Bowl', description: 'Order PB-261017-ABC123' }
    });
  });

  it('an unexpected order number falls back to fixed wording (nothing odd is displayed)', () => {
    const m = buildCheckoutOptions({ ...SESSION, orderNumber: 'whatever <b>' });
    expect(m.ok && m.options.description).toBe('Protein Bowl order');
  });

  it.each([
    ['unsupported provider', { provider: 'mock' }, 'UNSUPPORTED_PROVIDER'],
    ['empty key', { keyId: '' }, 'INVALID_KEY'],
    ['key with illegal characters', { keyId: 'bad key!' }, 'INVALID_KEY'],
    ['missing provider order', { providerOrderId: '' }, 'INVALID_PROVIDER_ORDER'],
    ['provider order with illegal characters', { providerOrderId: 'order 1;' }, 'INVALID_PROVIDER_ORDER'],
    ['zero amount', { amountMinor: 0 }, 'INVALID_AMOUNT'],
    ['negative amount', { amountMinor: -100 }, 'INVALID_AMOUNT'],
    ['fractional amount', { amountMinor: 339.5 }, 'INVALID_AMOUNT'],
    ['NaN amount', { amountMinor: NaN }, 'INVALID_AMOUNT'],
    ['unsafe-integer amount', { amountMinor: 2 ** 60 }, 'INVALID_AMOUNT'],
    ['string amount', { amountMinor: '33900' as unknown as number }, 'INVALID_AMOUNT'],
    ['unsupported currency', { currency: 'USD' }, 'UNSUPPORTED_CURRENCY'],
    ['lower-case currency', { currency: 'inr' }, 'UNSUPPORTED_CURRENCY'],
    ['session not open for payment', { status: 'EXPIRED' as const }, 'SESSION_NOT_PAYABLE']
  ])('%s is refused (no checkout would open)', (_n, patch, reason) => {
    expect(buildCheckoutOptions({ ...SESSION, ...patch })).toEqual({ ok: false, reason });
  });

  it('takes no locally supplied amount: the mapping function accepts only the session', () => {
    expect(buildCheckoutOptions.length).toBe(1);
  });
});

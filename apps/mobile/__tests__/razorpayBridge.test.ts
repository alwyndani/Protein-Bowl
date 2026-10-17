import { NativeModules } from 'react-native';

/**
 * Production Razorpay bridge (P11C-2 step 3). Jest cannot prove the native module builds or runs (that was the physical-device work of
 * P11C-1 / step 2); these tests prove the JavaScript boundary: a minimal typed result, no provider text, one checkout at a time.
 */
const mockOpen = jest.fn();
jest.mock('react-native-razorpay', () => ({ __esModule: true, default: { open: (...a: unknown[]) => mockOpen(...a) } }));

import { isRazorpayNativeAvailable, isNativeCheckoutOpen, onNativeCheckoutSettled, openCheckout, CheckoutOptions } from '../src/payments/razorpayBridge';

const OPTIONS: CheckoutOptions = { key: 'public_key_id', order_id: 'order_ABC123', amount: 33900, currency: 'INR', name: 'Protein Bowl' };
const GOOD = { razorpay_payment_id: 'pay_ABC123', razorpay_order_id: 'order_ABC123', razorpay_signature: 'a'.repeat(64) };

const setNative = (on: boolean) => {
  if (on) (NativeModules as Record<string, unknown>).RNRazorpayCheckout = {};
  else delete (NativeModules as Record<string, unknown>).RNRazorpayCheckout;
};

beforeEach(() => {
  mockOpen.mockReset();
  setNative(true);
});
afterEach(() => setNative(false));

describe('capability boundary (Expo Go / no native module)', () => {
  it('is UNAVAILABLE without the native module and never calls the package', async () => {
    setNative(false);
    expect(isRazorpayNativeAvailable()).toBe(false);
    await expect(openCheckout(OPTIONS)).resolves.toEqual({ kind: 'UNAVAILABLE' });
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('a package that fails to load is UNAVAILABLE, not a crash', async () => {
    jest.resetModules();
    jest.doMock('react-native-razorpay', () => {
      throw new Error('native module missing');
    });
    const fresh = require('../src/payments/razorpayBridge') as typeof import('../src/payments/razorpayBridge');
    (NativeModules as Record<string, unknown>).RNRazorpayCheckout = {};
    await expect(fresh.openCheckout(OPTIONS)).resolves.toEqual({ kind: 'UNAVAILABLE' });
    jest.doMock('react-native-razorpay', () => ({ __esModule: true, default: { open: (...a: unknown[]) => mockOpen(...a) } }));
  });
});

describe('a complete callback is EVIDENCE (never "payment success")', () => {
  it('passes the exact options to the module and returns the three evidence fields', async () => {
    mockOpen.mockResolvedValue(GOOD);
    const out = await openCheckout(OPTIONS);
    expect(mockOpen).toHaveBeenCalledWith(OPTIONS);
    expect(out).toEqual({ kind: 'EVIDENCE', evidence: { providerPaymentId: 'pay_ABC123', providerOrderId: 'order_ABC123', signature: 'a'.repeat(64) } });
  });

  it('extra provider fields never reach the result', async () => {
    mockOpen.mockResolvedValue({ ...GOOD, razorpay_extra: 'x', metadata: { a: 1 }, description: 'text' });
    const out = await openCheckout(OPTIONS);
    expect(Object.keys((out as { evidence: object }).evidence).sort()).toEqual(['providerOrderId', 'providerPaymentId', 'signature']);
    expect(JSON.stringify(out)).not.toMatch(/razorpay_extra|metadata|text/);
  });
});

describe('an incomplete or malformed callback is AMBIGUOUS (money may have moved), never success or failure', () => {
  it.each([
    ['missing signature', { razorpay_payment_id: 'pay_1', razorpay_order_id: 'order_ABC123' }],
    ['missing payment id', { razorpay_order_id: 'order_ABC123', razorpay_signature: 'b'.repeat(64) }],
    ['missing order id', { razorpay_payment_id: 'pay_1', razorpay_signature: 'b'.repeat(64) }],
    ['order-less success (payment id only)', { razorpay_payment_id: 'pay_1' }],
    ['non-hex signature', { ...GOOD, razorpay_signature: 'z'.repeat(64) }],
    ['short signature', { ...GOOD, razorpay_signature: 'a'.repeat(63) }],
    ['payment id with illegal characters', { ...GOOD, razorpay_payment_id: 'pay 1;' }],
    ['non-string field', { ...GOOD, razorpay_order_id: 12 }],
    ['evidence for a DIFFERENT provider order', { ...GOOD, razorpay_order_id: 'order_OTHER9' }],
    ['null payload', null],
    ['undefined payload', undefined],
    ['string payload', 'success']
  ])('%s', async (_n, payload) => {
    mockOpen.mockResolvedValue(payload);
    await expect(openCheckout(OPTIONS)).resolves.toEqual({ kind: 'AMBIGUOUS' });
  });
});

describe('an error callback of ANY cause is one neutral NOT_COMPLETED', () => {
  const NESTED = JSON.stringify({ error: { code: 'BAD_REQUEST_ERROR', source: 'customer', step: 'payment_authentication', reason: 'payment_error', metadata: { payment_id: 'pay_LEAK1234' } } });
  it.each([
    ['dismissal-shaped payload (observed on device)', { code: 0, description: NESTED, error: { code: 'BAD_REQUEST_ERROR', metadata: {} } }],
    ['card failure with a payment_id metadata key (observed)', { code: 0, description: NESTED, error: { metadata: { payment_id: 'pay_LEAK1234' } } }],
    ['plain code and description', { code: 2, description: 'Payment cancelled by user' }],
    ['undefined', undefined],
    ['string', 'boom'],
    ['number', 42],
    ['null', null]
  ])('%s', async (_n, raw) => {
    mockOpen.mockRejectedValue(raw);
    const out = await openCheckout(OPTIONS);
    expect(out).toEqual({ kind: 'NOT_COMPLETED' });
    expect(JSON.stringify(out)).not.toMatch(/LEAK|BAD_REQUEST|cancelled|description|code/);
  });

  it('a synchronous throw from the module is NOT_COMPLETED, not a crash, and the bridge stays usable', async () => {
    mockOpen.mockImplementationOnce(() => {
      throw new Error('native crash');
    });
    await expect(openCheckout(OPTIONS)).resolves.toEqual({ kind: 'NOT_COMPLETED' });
    mockOpen.mockResolvedValue(GOOD);
    expect((await openCheckout(OPTIONS)).kind).toBe('EVIDENCE');
  });
});

describe('one native checkout at a time', () => {
  it('a second open while one is pending is ALREADY_OPEN and never reaches the module', async () => {
    let finish!: (v: unknown) => void;
    mockOpen.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const first = openCheckout(OPTIONS);
    await expect(openCheckout(OPTIONS)).resolves.toEqual({ kind: 'ALREADY_OPEN' });
    expect(mockOpen).toHaveBeenCalledTimes(1);
    finish(GOOD);
    expect((await first).kind).toBe('EVIDENCE');
    mockOpen.mockResolvedValue(GOOD);
    expect((await openCheckout(OPTIONS)).kind).toBe('EVIDENCE'); // the slot is released
  });

  it('the slot is released after a rejection too', async () => {
    mockOpen.mockRejectedValueOnce({ code: 0 });
    expect((await openCheckout(OPTIONS)).kind).toBe('NOT_COMPLETED');
    mockOpen.mockResolvedValue(GOOD);
    expect((await openCheckout(OPTIONS)).kind).toBe('EVIDENCE');
  });

  it('many simultaneous callers open exactly one native checkout', async () => {
    let finish!: (v: unknown) => void;
    mockOpen.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const all = [openCheckout(OPTIONS), openCheckout(OPTIONS), openCheckout(OPTIONS), openCheckout(OPTIONS)];
    await Promise.resolve();
    expect(mockOpen).toHaveBeenCalledTimes(1);
    finish(GOOD);
    const kinds = (await Promise.all(all)).map((r) => r.kind).sort();
    expect(kinds).toEqual(['ALREADY_OPEN', 'ALREADY_OPEN', 'ALREADY_OPEN', 'EVIDENCE']);
  });
});

describe('the native lock: a promise that never settles fails closed (only settling releases it)', () => {
  afterEach(() => jest.useRealTimers());

  it('stays locked, whatever time passes and however many callers (or "screens") try, and never reaches the module again', async () => {
    jest.useFakeTimers();
    let finish!: (v: unknown) => void;
    mockOpen.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const stuck = openCheckout(OPTIONS);
    expect(isNativeCheckoutOpen()).toBe(true);
    await jest.advanceTimersByTimeAsync(24 * 3_600_000);
    expect(isNativeCheckoutOpen()).toBe(true); // no timer releases it
    for (let i = 0; i < 3; i++) await expect(openCheckout(OPTIONS)).resolves.toEqual({ kind: 'ALREADY_OPEN' });
    expect(mockOpen).toHaveBeenCalledTimes(1);
    // only the native promise settling releases it
    finish(GOOD);
    expect((await stuck).kind).toBe('EVIDENCE');
    expect(isNativeCheckoutOpen()).toBe(false);
    mockOpen.mockResolvedValue(GOOD);
    expect((await openCheckout(OPTIONS)).kind).toBe('EVIDENCE');
  });

  it('notifies settle listeners exactly when the lock is released (also after a rejection), and a throwing listener cannot break the checkout', async () => {
    const seen: boolean[] = [];
    const off = onNativeCheckoutSettled(() => seen.push(isNativeCheckoutOpen()));
    const off2 = onNativeCheckoutSettled(() => {
      throw new Error('listener bug');
    });
    mockOpen.mockRejectedValueOnce({ code: 0 });
    await expect(openCheckout(OPTIONS)).resolves.toEqual({ kind: 'NOT_COMPLETED' });
    expect(seen).toEqual([false]); // already released when listeners run
    off();
    off2();
    mockOpen.mockResolvedValue(GOOD);
    await openCheckout(OPTIONS);
    expect(seen).toEqual([false]);
  });

  it('the lock lives in the native layer and has no timer-based release', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'payments', 'razorpayNative.ts'), 'utf8') as string;
    expect(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).not.toMatch(/setTimeout|setInterval|Promise\.race|AbortController/);
  });
});

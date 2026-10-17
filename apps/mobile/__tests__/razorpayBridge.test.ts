import { NativeModules } from 'react-native';

/**
 * P11C-1: capability detection and result normalisation of the thin Razorpay bridge. Jest can NOT prove the native module builds or runs
 * (that needs a development build on a device: an external gate); these tests prove only the JavaScript boundary.
 */
const mockOpen = jest.fn();
jest.mock('react-native-razorpay', () => ({ __esModule: true, default: { open: (...a: unknown[]) => mockOpen(...a) } }));

import { isRazorpayNativeAvailable, openRazorpayCheckout, openRazorpayCheckoutWithPresence, RazorpayOpenOptions } from '../src/payments/razorpayBridge';

const OPTIONS: RazorpayOpenOptions = { key: 'public_key_id', order_id: 'order_ABC123', amount: 33900, currency: 'INR', name: 'Protein Bowl' };
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
  it('reports unavailable without the native module and NEVER calls the package or fakes a result', async () => {
    setNative(false);
    expect(isRazorpayNativeAvailable()).toBe(false);
    await expect(openRazorpayCheckout(OPTIONS)).resolves.toEqual({ kind: 'UNAVAILABLE' });
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('reports available only when the native module is registered', () => {
    expect(isRazorpayNativeAvailable()).toBe(true);
  });

  it('a package that fails to load (native module missing at require time) is UNAVAILABLE, not a crash', async () => {
    jest.resetModules();
    jest.doMock('react-native-razorpay', () => {
      throw new Error('native module missing');
    });
    const fresh = require('../src/payments/razorpayBridge') as typeof import('../src/payments/razorpayBridge');
    (NativeModules as Record<string, unknown>).RNRazorpayCheckout = {};
    await expect(fresh.openRazorpayCheckout(OPTIONS)).resolves.toEqual({ kind: 'UNAVAILABLE' });
    // restore the shared mock for the remaining tests
    jest.doMock('react-native-razorpay', () => ({ __esModule: true, default: { open: (...a: unknown[]) => mockOpen(...a) } }));
  });
});

describe('success normalisation (client evidence only)', () => {
  it('passes the exact options to the module and returns typed evidence for a complete payload', async () => {
    mockOpen.mockResolvedValue(GOOD);
    const out = await openRazorpayCheckout(OPTIONS);
    expect(mockOpen).toHaveBeenCalledWith(OPTIONS);
    expect(out).toEqual({ kind: 'SUCCESS', evidence: { razorpayPaymentId: 'pay_ABC123', razorpayOrderId: 'order_ABC123', razorpaySignature: 'a'.repeat(64) } });
  });

  it.each([
    ['missing signature', { razorpay_payment_id: 'pay_1', razorpay_order_id: 'order_1' }],
    ['missing payment id', { razorpay_order_id: 'order_1', razorpay_signature: 'b'.repeat(64) }],
    ['non-hex signature', { ...GOOD, razorpay_signature: 'z'.repeat(64) }],
    ['short signature', { ...GOOD, razorpay_signature: 'a'.repeat(63) }],
    ['payment id with illegal characters', { ...GOOD, razorpay_payment_id: 'pay 1;' }],
    ['non-string field', { ...GOOD, razorpay_order_id: 12 }],
    ['null payload', null],
    ['undefined payload', undefined],
    ['string payload', 'success']
  ])('%s is MALFORMED_RESULT, never SUCCESS', async (_n, payload) => {
    mockOpen.mockResolvedValue(payload);
    await expect(openRazorpayCheckout(OPTIONS)).resolves.toEqual({ kind: 'MALFORMED_RESULT' });
  });
});

describe('failure normalisation', () => {
  it('maps a rejection to a typed ERROR with a numeric code and bounded description', async () => {
    mockOpen.mockRejectedValue({ code: 2, description: 'Payment cancelled by user' });
    await expect(openRazorpayCheckout(OPTIONS)).resolves.toEqual({ kind: 'ERROR', code: 2, description: 'Payment cancelled by user' });
  });

  it('bounds an oversized description and ignores non-numeric codes', async () => {
    mockOpen.mockRejectedValue({ code: 'BAD', description: 'x'.repeat(500) });
    const out = await openRazorpayCheckout(OPTIONS);
    expect(out).toEqual({ kind: 'ERROR', code: null, description: 'x'.repeat(200) });
  });

  it.each([[undefined], ['boom'], [42], [null]])('an unusable rejection (%p) is ERROR with no code and no description', async (raw) => {
    mockOpen.mockRejectedValue(raw);
    await expect(openRazorpayCheckout(OPTIONS)).resolves.toEqual({ kind: 'ERROR', code: null, description: null });
  });

  it('a synchronous throw from the module is an ERROR, not a crash, and the bridge stays usable', async () => {
    mockOpen.mockImplementationOnce(() => {
      throw new Error('native crash');
    });
    await expect(openRazorpayCheckout(OPTIONS)).resolves.toEqual({ kind: 'ERROR', code: null, description: null });
    mockOpen.mockResolvedValue(GOOD);
    expect((await openRazorpayCheckout(OPTIONS)).kind).toBe('SUCCESS');
  });
});

describe('single checkout at a time', () => {
  it('a second open while one is pending is IN_PROGRESS and never reaches the module', async () => {
    let finish!: (v: unknown) => void;
    mockOpen.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const first = openRazorpayCheckout(OPTIONS);
    await expect(openRazorpayCheckout(OPTIONS)).resolves.toEqual({ kind: 'IN_PROGRESS' });
    expect(mockOpen).toHaveBeenCalledTimes(1);
    finish(GOOD);
    expect((await first).kind).toBe('SUCCESS');
    mockOpen.mockResolvedValue(GOOD);
    expect((await openRazorpayCheckout(OPTIONS)).kind).toBe('SUCCESS');
  });
});

describe('field presence for the dev-only harness (booleans only)', () => {
  it('an order-less success payload (payment id only) is MALFORMED_RESULT with presence yes/no/no', async () => {
    mockOpen.mockResolvedValue({ razorpay_payment_id: 'pay_ABC123' });
    const r = await openRazorpayCheckoutWithPresence({ ...OPTIONS, order_id: undefined });
    expect(r.outcome).toEqual({ kind: 'MALFORMED_RESULT' });
    expect(r.presence).toEqual({ paymentIdPresent: true, orderIdPresent: false, signaturePresent: false });
  });

  it('a complete payload is SUCCESS with all three present, and the presence object holds booleans only (no values)', async () => {
    mockOpen.mockResolvedValue(GOOD);
    const r = await openRazorpayCheckoutWithPresence(OPTIONS);
    expect(r.outcome.kind).toBe('SUCCESS');
    expect(r.presence).toEqual({ paymentIdPresent: true, orderIdPresent: true, signaturePresent: true });
    expect(Object.values(r.presence!).every((v) => typeof v === 'boolean')).toBe(true);
    expect(JSON.stringify(r.presence)).not.toMatch(/pay_ABC123|order_ABC123|aaaa/);
  });

  it('an error callback and an unavailable module have no presence, and the plain API is unchanged', async () => {
    mockOpen.mockRejectedValue({ code: 2, description: 'cancelled' });
    expect(await openRazorpayCheckoutWithPresence(OPTIONS)).toEqual({ outcome: { kind: 'ERROR', code: 2, description: 'cancelled' }, presence: null });
    setNative(false);
    expect(await openRazorpayCheckoutWithPresence(OPTIONS)).toEqual({ outcome: { kind: 'UNAVAILABLE' }, presence: null });
    setNative(true);
    mockOpen.mockResolvedValue(GOOD);
    expect((await openRazorpayCheckout(OPTIONS)).kind).toBe('SUCCESS');
  });
});

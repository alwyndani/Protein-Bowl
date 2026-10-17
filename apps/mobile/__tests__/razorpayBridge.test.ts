import { NativeModules } from 'react-native';

/**
 * P11C-1: capability detection and result normalisation of the thin Razorpay bridge. Jest can NOT prove the native module builds or runs
 * (that needs a development build on a device: an external gate); these tests prove only the JavaScript boundary.
 */
const mockOpen = jest.fn();
jest.mock('react-native-razorpay', () => ({ __esModule: true, default: { open: (...a: unknown[]) => mockOpen(...a) } }));

import { isRazorpayNativeAvailable, openRazorpayCheckout, openRazorpayCheckoutWithPresence, openRazorpayCheckoutDiagnostic, describeErrorShape, RazorpayOpenOptions } from '../src/payments/razorpayBridge';

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

describe('error SHAPE description (diagnostic only; names and allow-listed enum values, never ids or free text)', () => {
  const NESTED_JSON = JSON.stringify({
    error: { code: 'BAD_REQUEST_ERROR', description: 'Payment processing cancelled by user pay_ABCDEF123456', source: 'customer', step: 'payment_authentication', reason: 'payment_cancelled', metadata: { payment_id: 'pay_SECRETID123456', order_id: 'order_SECRETID654321' } }
  });

  it('Android layout: payment data merged with code and a JSON description string', () => {
    const shape = describeErrorShape({ code: 2, description: NESTED_JSON, razorpay_payment_id: 'pay_SECRETID123456' });
    expect(shape.topLevelKeys).toEqual(['code', 'description', 'razorpay_payment_id']);
    expect(shape.code).toEqual({ type: 'number', value: 2 });
    expect(shape.descriptionKind).toBe('json');
    expect(shape.descriptionText).toBeNull();
    expect(shape.nested).toMatchObject({ code: 'BAD_REQUEST_ERROR', source: 'customer', step: 'payment_authentication', reason: 'payment_cancelled', metadataKeys: ['payment_id', 'order_id'] });
    expect(shape.nested!.descriptionText).toContain('<id>');
    const serialized = JSON.stringify(shape);
    expect(serialized).not.toMatch(/SECRETID|ABCDEF123456/); // no identifier value ever appears
  });

  it('iOS layout: code and description with the payment data under details', () => {
    const shape = describeErrorShape({ code: 0, description: 'Payment Cancelled', details: { error: { code: 'GATEWAY_ERROR', source: 'bank', step: 'payment_authorization', reason: 'authentication_failed', metadata: {} } } });
    expect(shape.descriptionKind).toBe('text');
    expect(shape.descriptionText).toBe('Payment Cancelled');
    expect(shape.detailsKeys).toEqual(['error']);
    expect(shape.nested).toMatchObject({ code: 'GATEWAY_ERROR', source: 'bank', step: 'payment_authorization', reason: 'authentication_failed', metadataKeys: [] });
  });

  it('unstructured, odd or hostile payloads degrade safely', () => {
    expect(describeErrorShape(undefined)).toMatchObject({ topLevelKeys: [], code: { type: 'absent', value: null }, descriptionKind: 'absent', nested: null });
    expect(describeErrorShape('boom')).toMatchObject({ topLevelKeys: [], nested: null });
    const odd = describeErrorShape({ 'weird key with spaces': 1, code: 'pay_LEAK1234567890', description: 'order_LEAK1234567890 and ' + 'a'.repeat(64) });
    expect(odd.topLevelKeys).toEqual(['<odd-key>', 'code', 'description']);
    expect(odd.code).toEqual({ type: 'string', value: null }); // an id-shaped code is never echoed
    expect(JSON.stringify(odd)).not.toMatch(/LEAK/);
    expect(describeErrorShape({ description: '{not json' }).descriptionKind).toBe('text');
    expect(describeErrorShape({ code: 1, description: 'x'.repeat(5000) }).descriptionText!.length).toBeLessThanOrEqual(120);
  });

  it('the diagnostic entry returns the shape for a rejection only; the existing entries are unchanged', async () => {
    mockOpen.mockRejectedValue({ code: 2, description: 'Payment cancelled by user' });
    const failed = await openRazorpayCheckoutDiagnostic(OPTIONS);
    expect(failed.outcome).toEqual({ kind: 'ERROR', code: 2, description: 'Payment cancelled by user' });
    expect(failed.errorShape).toMatchObject({ topLevelKeys: ['code', 'description'], descriptionKind: 'text' });
    mockOpen.mockResolvedValue(GOOD);
    const ok = await openRazorpayCheckoutDiagnostic(OPTIONS);
    expect(ok.outcome.kind).toBe('SUCCESS');
    expect(ok.errorShape).toBeNull();
    mockOpen.mockRejectedValue({ code: 2, description: 'cancelled' });
    expect(await openRazorpayCheckoutWithPresence(OPTIONS)).toEqual({ outcome: { kind: 'ERROR', code: 2, description: 'cancelled' }, presence: null });
  });
});

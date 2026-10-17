import { NativeModules } from 'react-native';

/**
 * DEV-ONLY diagnostic module (moved out of the production bridge in P11C-2 step 3). It keeps the capability to inspect the native error
 * SHAPE after an SDK upgrade or on iOS; production code never imports it.
 */
const mockOpen = jest.fn();
jest.mock('react-native-razorpay', () => ({ __esModule: true, default: { open: (...a: unknown[]) => mockOpen(...a) } }));

import { describeErrorShape, openRazorpayCheckoutDiagnostic, isRazorpayNativeAvailable, RazorpayOpenOptions } from '../src/payments/dev/razorpayDiagnostic';

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

describe('diagnostic outcomes, presence and shape (dev only)', () => {
  it('unavailable module: nothing is opened', async () => {
    setNative(false);
    expect(isRazorpayNativeAvailable()).toBe(false);
    expect(await openRazorpayCheckoutDiagnostic(OPTIONS)).toEqual({ outcome: { kind: 'UNAVAILABLE' }, presence: null, errorShape: null });
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('a complete payload is SUCCESS with all-true presence (booleans only)', async () => {
    mockOpen.mockResolvedValue(GOOD);
    const r = await openRazorpayCheckoutDiagnostic(OPTIONS);
    expect(r.outcome.kind).toBe('SUCCESS');
    expect(r.presence).toEqual({ paymentIdPresent: true, orderIdPresent: true, signaturePresent: true });
    expect(r.errorShape).toBeNull();
  });

  it('an order-less payload is MALFORMED_RESULT with presence yes/no/no', async () => {
    mockOpen.mockResolvedValue({ razorpay_payment_id: 'pay_ABC123' });
    const r = await openRazorpayCheckoutDiagnostic({ ...OPTIONS, order_id: undefined });
    expect(r.outcome).toEqual({ kind: 'MALFORMED_RESULT' });
    expect(r.presence).toEqual({ paymentIdPresent: true, orderIdPresent: false, signaturePresent: false });
  });

  it('a rejection returns the ERROR outcome (bounded description) and the safe shape', async () => {
    mockOpen.mockRejectedValue({ code: 2, description: 'Payment cancelled by user' });
    const r = await openRazorpayCheckoutDiagnostic(OPTIONS);
    expect(r.outcome).toEqual({ kind: 'ERROR', code: 2, description: 'Payment cancelled by user' });
    expect(r.presence).toBeNull();
    expect(r.errorShape).toMatchObject({ topLevelKeys: ['code', 'description'], descriptionKind: 'text' });
  });

  it('shares the one-checkout-at-a-time protection', async () => {
    let finish!: (v: unknown) => void;
    mockOpen.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const first = openRazorpayCheckoutDiagnostic(OPTIONS);
    expect((await openRazorpayCheckoutDiagnostic(OPTIONS)).outcome).toEqual({ kind: 'IN_PROGRESS' });
    finish(GOOD);
    await first;
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

});

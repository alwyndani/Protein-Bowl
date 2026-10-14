import { ApiError } from '../src/api/ApiError';
import { CheckoutAttemptStore } from '../src/commerce/checkoutAttempt';
import { commerceMessage, isAmbiguousOutcome, isOfflineError } from '../src/commerce/commerceErrors';
import { formatIstDateTime } from '../src/commerce/dates';
import { IDEMPOTENCY_KEY_PATTERN, newIdempotencyKey } from '../src/commerce/idempotencyKey';
import { cancellationNotice, deliveryNotice, orderBadge, paymentBadge, refundBadge } from '../src/commerce/labels';
import { formatInr, isZeroMoney } from '../src/commerce/money';
import { previewSignature } from '../src/commerce/previewSignature';
import type { CheckoutPreview } from '../src/commerce/types';
import { isSafeImageUrl } from '../src/ui/commerceUi';

const http = (status: number, code: string) => new ApiError('http', status, code);

describe('P11B money formatting (presentation only)', () => {
  it.each([
    ['299', '₹299.00'],
    ['40.5', '₹40.50'],
    ['1249.5', '₹1,249.50'],
    ['1249.50', '₹1,249.50'],
    ['0', '₹0.00'],
    ['0.5', '₹0.50'],
    ['100000', '₹1,00,000.00'],
    ['12345678.9', '₹1,23,45,678.90'],
    ['999', '₹999.00'],
    ['1000', '₹1,000.00'],
    ['-40', '-₹40.00']
  ])('formats the Decimal string %s as %s', (input, out) => {
    expect(formatInr(input)).toBe(out);
  });

  it.each([
    [299, '₹299.00'],
    [1249.5, '₹1,249.50'],
    [40, '₹40.00'],
    [0.1 + 0.2, '₹0.30'], // the classic float sum is only ever formatted, never computed on the device
    [1234567.891, '₹12,34,567.89']
  ])('formats the server number %s as %s', (input, out) => {
    expect(formatInr(input)).toBe(out);
  });

  it('never invents a value: junk, empty and non-finite input render a dash', () => {
    for (const v of [null, undefined, '', 'abc', '1e5', '12,3', NaN, Infinity, '--5']) expect(formatInr(v as never)).toBe('—');
  });

  it('rounds half-up string-exactly when a value has more than two decimals (the server sends at most two)', () => {
    expect(formatInr('10.005')).toBe('₹10.01');
    expect(formatInr('10.004')).toBe('₹10.00');
    expect(formatInr('0.999')).toBe('₹1.00');
  });

  it('isZeroMoney recognises zero in every server representation and nothing else', () => {
    for (const z of [0, '0', '0.00', '00.0', null, undefined, '']) expect(isZeroMoney(z as never)).toBe(true);
    for (const n of [1, '0.01', '10', 0.5]) expect(isZeroMoney(n as never)).toBe(false);
  });
});

describe('P11B IST time formatting', () => {
  it('shows server UTC timestamps in Asia/Kolkata (UTC+05:30) regardless of the device zone', () => {
    expect(formatIstDateTime('2026-10-13T10:15:00.000Z')).toBe('13 Oct 2026, 3:45 pm IST');
    expect(formatIstDateTime('2026-10-13T00:00:00Z')).toBe('13 Oct 2026, 5:30 am IST');
  });
  it('date boundaries: 18:30 UTC is already the next IST day; year, month and 12-hour edges', () => {
    expect(formatIstDateTime('2026-10-13T18:29:59Z')).toBe('13 Oct 2026, 11:59 pm IST');
    expect(formatIstDateTime('2026-10-13T18:30:00Z')).toBe('14 Oct 2026, 12:00 am IST');
    expect(formatIstDateTime('2026-12-31T18:30:00Z')).toBe('1 Jan 2027, 12:00 am IST');
    expect(formatIstDateTime('2026-10-13T06:30:00Z')).toBe('13 Oct 2026, 12:00 pm IST');
    expect(formatIstDateTime('2026-02-28T20:00:00Z')).toBe('1 Mar 2026, 1:30 am IST');
  });
  it('invalid or missing timestamps render a dash and the input is never mutated', () => {
    expect(formatIstDateTime(null)).toBe('—');
    expect(formatIstDateTime('not a date')).toBe('—');
    const iso = '2026-10-13T10:15:00.000Z';
    formatIstDateTime(iso);
    expect(iso).toBe('2026-10-13T10:15:00.000Z');
  });
});

describe('P11B idempotency key and checkout attempt', () => {
  it('keys come from the secure UUID source, match the backend format and are unique', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(50);
    for (const k of keys) {
      expect(k).toMatch(IDEMPOTENCY_KEY_PATTERN);
      expect(k.startsWith('IK-')).toBe(true);
      expect(k.length).toBeGreaterThanOrEqual(8);
      expect(k.length).toBeLessThanOrEqual(128);
    }
  });

  it('a malformed or failing generator result never becomes a key (no weak fallback)', () => {
    const crypto = require('expo-crypto');
    const spy = jest.spyOn(crypto, 'randomUUID');
    try {
      spy.mockReturnValueOnce('x');
      expect(() => newIdempotencyKey()).toThrow('IDEMPOTENCY_KEY_GENERATION_FAILED');
      spy.mockImplementationOnce(() => {
        throw new Error('native generator missing');
      });
      expect(() => newIdempotencyKey()).toThrow('native generator missing');
    } finally {
      spy.mockRestore();
    }
  });

  it('the attempt reuses its key for the same request and issues a new one only for a changed request', () => {
    let n = 0;
    const store = new CheckoutAttemptStore(() => `IK-test-key-${++n}`);
    const a = store.prepare('addr-1', '');
    expect(store.prepare('addr-1', '')).toBe(a);
    expect(a.key).toBe('IK-test-key-1');
    const b = store.prepare('addr-2', '');
    expect(b.key).toBe('IK-test-key-2');
  });

  it('an AMBIGUOUS attempt is frozen: same key, address and instructions whatever is asked afterwards (never regenerated)', () => {
    let n = 0;
    const store = new CheckoutAttemptStore(() => `IK-test-key-${++n}`);
    store.prepare('addr-1', 'ring twice');
    store.markAmbiguous();
    const again = store.prepare('addr-9', 'something else');
    expect(again.key).toBe('IK-test-key-1');
    expect(again.addressId).toBe('addr-1');
    expect(again.deliveryInstructions).toBe('ring twice');
    expect(again.ambiguous).toBe(true);
    expect(n).toBe(1);
  });

  it('the attempt ends only on clear() (success, abandonment or session end) and notifies subscribers', () => {
    const store = new CheckoutAttemptStore(() => 'IK-test-key-xyz');
    const seen: Array<string | null> = [];
    store.subscribe(() => seen.push(store.get()?.key ?? null));
    store.prepare('a', '');
    store.markAmbiguous();
    store.clear();
    expect(store.get()).toBeNull();
    expect(seen).toEqual(['IK-test-key-xyz', 'IK-test-key-xyz', null]);
  });
});

describe('P11B backend error mapping (only codes the backend really emits)', () => {
  it.each([
    ['UNAVAILABLE_PRODUCT', 400, /no longer available/],
    ['INVALID_VARIANT', 400, /option/],
    ['UNAVAILABLE_VARIANT', 400, /no longer available/],
    ['EMPTY_CART', 400, /empty/],
    ['INVALID_ADDRESS', 400, /address/],
    ['IDEMPOTENCY_KEY_REQUIRED', 400, /safely/],
    ['INVALID_IDEMPOTENCY_KEY', 400, /safely/],
    ['IDEMPOTENCY_KEY_REUSED', 409, /My orders/],
    ['CONFLICT', 409, /conflicted/],
    ['PRODUCT_TAX_NOT_CONFIGURED', 409, /cannot be ordered/],
    ['INVALID_QUANTITY', 422, /whole quantity/],
    ['MAX_LINE_QUANTITY_EXCEEDED', 422, /single item/],
    ['MAX_CART_QUANTITY_EXCEEDED', 422, /in total/],
    ['MINIMUM_ORDER_NOT_MET', 422, /minimum order/],
    ['ORDER_TOTAL_TOO_LARGE', 422, /too large/],
    ['COD_NOT_ALLOWED', 422, /online payment/],
    ['INVALID_PAYMENT_METHOD', 422, /online payment/],
    ['VALIDATION_ERROR', 422, /check what you entered/],
    ['ORDER_NUMBER_UNAVAILABLE', 503, /try again/]
  ])('%s (%s) has customer-safe copy', (code, status, re) => {
    const msg = commerceMessage(http(status as number, code as string));
    if ((status as number) >= 500) expect(msg).toMatch(/trouble|try again/i);
    else expect(msg).toMatch(re as RegExp);
    expect(msg).not.toContain(code as string);
  });

  it('401 / 403 / 404 / 429 / 5xx and transport failures use the shared safe copy', () => {
    expect(commerceMessage(http(401, 'INVALID_TOKEN'))).toMatch(/session/);
    expect(commerceMessage(http(403, 'FORBIDDEN'))).toMatch(/not available/);
    expect(commerceMessage(http(404, 'NOT_FOUND'))).toMatch(/could not find/);
    expect(commerceMessage(http(404, 'UNKNOWN_ERROR'))).toMatch(/could not find/); // the product 404 carries no code
    expect(commerceMessage(http(429, 'TOO_MANY_REQUESTS'))).toMatch(/wait/);
    expect(commerceMessage(http(500, 'INTERNAL_SERVER_ERROR'))).toMatch(/trouble/);
    expect(commerceMessage(new ApiError('network', 0, 'NETWORK_ERROR'))).toMatch(/offline/);
    expect(commerceMessage(new ApiError('timeout', 0, 'TIMEOUT'))).toMatch(/too long/);
  });

  it('does not map serviceability, stock or price-change codes (the backend emits none)', () => {
    for (const code of ['NOT_SERVICEABLE', 'OUT_OF_STOCK', 'PRICE_CHANGED', 'SERVICE_UNAVAILABLE', 'BRANCH_UNAVAILABLE']) {
      const msg = commerceMessage(http(409, code));
      expect(msg).not.toContain(code);
      expect(msg).not.toMatch(/stock|serviceab|price|branch/i);
    }
  });

  it('classifies ambiguity and offline correctly', () => {
    expect(isAmbiguousOutcome(new ApiError('network', 0, 'N'))).toBe(true);
    expect(isAmbiguousOutcome(new ApiError('timeout', 0, 'T'))).toBe(true);
    expect(isAmbiguousOutcome(new ApiError('malformed', 201, 'M'))).toBe(true);
    expect(isAmbiguousOutcome(http(502, 'X'))).toBe(true);
    expect(isAmbiguousOutcome(http(422, 'MINIMUM_ORDER_NOT_MET'))).toBe(false);
    expect(isAmbiguousOutcome(http(429, 'TOO_MANY_REQUESTS'))).toBe(false);
    expect(isOfflineError(new ApiError('network', 0, 'N'))).toBe(true);
    expect(isOfflineError(http(500, 'X'))).toBe(false);
  });
});

describe('P11B labels (read-only presentation of server states)', () => {
  it('an unpaid new order is "Payment required" and never "Paid" or "Confirmed"', () => {
    const order = { status: 'PENDING', paymentStatus: 'PENDING', payment: { state: 'NOT_STARTED' as const, canStartPayment: true } };
    expect(paymentBadge(order).label).toBe('Payment required');
    expect(orderBadge(order).label).toBe('Order placed');
  });
  it('maps the other server states without deriving any', () => {
    expect(paymentBadge({ status: 'CONFIRMED', paymentStatus: 'PAID', payment: { state: 'PAID', canStartPayment: false } }).label).toBe('Paid');
    expect(paymentBadge({ status: 'CANCELLED', paymentStatus: 'PENDING' }).label).toBe('No payment taken');
    expect(paymentBadge({ status: 'CANCELLED', paymentStatus: 'REFUNDED', payment: { state: 'PAID', canStartPayment: false } }).label).toBe('Refunded');
    expect(refundBadge({ refund: { state: 'NO_REFUND' } })).toBeNull();
    expect(refundBadge({ refund: { state: 'REFUND_PROCESSING' } })?.label).toBe('Refund processing');
    expect(cancellationNotice({ cancellation: { state: 'CANCELLED', allowed: false } })).toMatch(/cancelled/);
    expect(cancellationNotice({ cancellation: { state: 'CANCELLATION_AVAILABLE', allowed: true } })).toBeNull();
    expect(deliveryNotice({ delivery: { state: 'ON_THE_WAY', attemptNumber: 1, maxAttempts: 3 } })?.title).toBe('Out for delivery');
    expect(deliveryNotice({})).toBeNull();
  });
  it('delivery copy never mentions a delivery code (that belongs to a later subphase)', () => {
    for (const state of ['ON_THE_WAY', 'DELIVERY_ISSUE', 'RETRY_PLANNED', 'UNDELIVERABLE_REFUND_PENDING', 'DELIVERED'] as const) {
      const n = deliveryNotice({ delivery: { state, attemptNumber: 2, maxAttempts: 3 } })!;
      expect(`${n.title} ${n.body}`).not.toMatch(/code/i);
    }
  });
});

describe('P11B product image safety', () => {
  it('accepts https URLs only', () => {
    expect(isSafeImageUrl('https://images.example.test/a.jpg')).toBe(true);
    for (const u of ['http://x.test/a.jpg', 'file:///etc/passwd', 'data:image/png;base64,AAAA', 'javascript:alert(1)', '//x.test/a.jpg', '', null, undefined, 'https://']) {
      expect(isSafeImageUrl(u as never)).toBe(false);
    }
  });
});

describe('P11B previewSignature (presentation-safe equality of server values)', () => {
  const base = (): CheckoutPreview => ({
    cartId: 'c1',
    items: [{ productId: 'p-1', variantId: 'v-1', title: 'Bowl', variantName: null, unitPrice: 299, quantity: 2, subtotal: 598, taxAmount: 29.9, containerDeposit: 0, totalPrice: 627.9 }],
    summary: { itemsSubtotal: 598, totalTax: 29.9, containerDepositTotal: 0, packagingFee: 0, deliveryFee: 40, discountAmount: 0, netAmount: 667.9 },
    minimumOrder: { enabled: true, requiredAmount: 100, met: true, shortfall: 0 },
    deliveryAddress: null
  });

  it('is identical for the same preview', () => {
    expect(previewSignature(base())).toBe(previewSignature(base()));
  });

  it('a changed net total differs', () => {
    const b = base();
    b.summary.netAmount = 700;
    expect(previewSignature(b)).not.toBe(previewSignature(base()));
  });

  it('number representation noise that DISPLAYS identically is not a change (0.1 + 0.2 vs 0.3)', () => {
    const a = base();
    a.summary.netAmount = 0.3;
    const b = base();
    b.summary.netAmount = 0.1 + 0.2;
    expect(b.summary.netAmount).not.toBe(a.summary.netAmount); // the raw doubles differ ...
    expect(previewSignature(b)).toBe(previewSignature(a)); // ... the customer-visible values do not
  });

  it('a fee changing while the net total stays the same is a change', () => {
    const b = base();
    b.summary.deliveryFee = 50; // net untouched
    expect(previewSignature(b)).not.toBe(previewSignature(base()));
  });

  it('tax changing while the net total stays the same is a change', () => {
    const b = base();
    b.summary.totalTax = 35; // net untouched
    expect(previewSignature(b)).not.toBe(previewSignature(base()));
  });

  it('discount, deposit, packaging, a line price / quantity / variant and the minimum-order state each change it', () => {
    const mutations: Array<(p: CheckoutPreview) => void> = [
      (p) => (p.summary.discountAmount = 10),
      (p) => (p.summary.containerDepositTotal = 20),
      (p) => (p.summary.packagingFee = 5),
      (p) => (p.items[0].unitPrice = 300),
      (p) => (p.items[0].totalPrice = 630),
      (p) => (p.items[0].quantity = 3),
      (p) => (p.items[0].variantId = 'v-2'),
      (p) => (p.minimumOrder.met = false)
    ];
    for (const m of mutations) {
      const b = base();
      m(b);
      expect(previewSignature(b)).not.toBe(previewSignature(base()));
    }
  });

  it('does no arithmetic: the signature is built from the individual server values only', () => {
    const b = base();
    b.summary.netAmount = 1; // inconsistent with the lines on purpose
    expect(previewSignature(b)).toContain('₹1.00');
  });
});

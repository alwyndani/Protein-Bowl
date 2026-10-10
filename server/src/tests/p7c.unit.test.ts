import { describe, it, expect } from 'vitest';
import { RazorpayPaymentProvider } from '../modules/payment/razorpay.provider.js';
import { MockPaymentProvider } from '../modules/payment/mock.provider.js';
import { ProviderDefiniteError, ProviderUnknownError } from '../modules/payment/provider.types.js';
import { normalizeRazorpayRefund, parseRazorpayWebhook } from '../modules/payment/razorpayWebhook.js';
import { REFUND_STATUS, REFUND_TRANSITIONS, publicRefundState, refundMayMove } from '../modules/refund/refundStatus.js';
import {
  ADMIN_CANCELLABLE_STATES,
  ADMIN_REASON_CODES,
  CUSTOMER_CANCELLABLE_STATES,
  CUSTOMER_REASON_CODES,
  NOTE_MAX_LENGTH,
  adminCancelBodySchema,
  customerCancelBodySchema,
  refundApprovalBodySchema,
  sanitizeNote
} from '../modules/refund/cancellationPolicy.js';

const KEY_SECRET = 'unit_secret_never_logged';
const cfg = { keyId: 'rzp_test_unit', keySecret: KEY_SECRET, webhookSecret: 'wh_unit', previousWebhookSecret: null, apiBase: 'https://api.test.invalid/v1' };

function mkFetch(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responder(url, init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const refundEntity = (over: Record<string, unknown> = {}) => ({ id: 'rfnd_1', entity: 'refund', payment_id: 'pay_1', amount: 14550, currency: 'INR', status: 'pending', receipt: 'rcpt-1', speed_processed: null, notes: { secret: 'x' }, acquirer_data: { arn: 'A' }, ...over });
const input = { providerPaymentId: 'pay_1', amountMinor: 14550, currency: 'INR' as const, receipt: 'rcpt-1', notes: { pbRefundId: 'rcpt-1' } };

describe('P7C unit — refund state machine', () => {
  it('has exactly the approved PB states and NO FAILED state', () => {
    expect(Object.keys(REFUND_STATUS).sort()).toEqual(['ABANDONED', 'PROCESSED', 'PROCESSING', 'REQUESTED', 'REVIEW', 'SUBMITTING', 'UNKNOWN']);
    expect(Object.keys(REFUND_TRANSITIONS)).not.toContain('FAILED');
  });

  it('allows only the approved moves; PROCESSED and ABANDONED are terminal', () => {
    expect(REFUND_TRANSITIONS).toEqual({
      REQUESTED: ['SUBMITTING'],
      SUBMITTING: ['PROCESSING', 'PROCESSED', 'UNKNOWN', 'REVIEW'],
      UNKNOWN: ['PROCESSING', 'PROCESSED', 'REVIEW'],
      PROCESSING: ['PROCESSED', 'REVIEW'],
      REVIEW: ['PROCESSING', 'PROCESSED', 'ABANDONED'],
      PROCESSED: [],
      ABANDONED: []
    });
    for (const from of ['PROCESSED', 'ABANDONED']) for (const to of Object.values(REFUND_STATUS)) expect(refundMayMove(from, to)).toBe(false);
    expect(refundMayMove('PROCESSED', 'PROCESSING')).toBe(false); // PROCESSED never regresses
    expect(refundMayMove('REQUESTED', 'PROCESSED')).toBe(false); // nothing is final before it was submitted
    expect(refundMayMove('UNKNOWN', 'REQUESTED')).toBe(false); // never back to "create again"
    expect(refundMayMove('REVIEW', 'SUBMITTING')).toBe(false);
  });

  it('maps PB states to the public customer states (ABANDONED is internal)', () => {
    expect(['REQUESTED', 'SUBMITTING', 'UNKNOWN'].map(publicRefundState)).toEqual(['REFUND_PENDING', 'REFUND_PENDING', 'REFUND_PENDING']);
    expect(publicRefundState('PROCESSING')).toBe('REFUND_PROCESSING');
    expect(publicRefundState('PROCESSED')).toBe('REFUNDED');
    expect(publicRefundState('REVIEW')).toBe('REFUND_REVIEW_REQUIRED');
    expect(publicRefundState('ABANDONED')).toBeNull();
  });
});

describe('P7C unit — cancellation policy, reason codes and notes', () => {
  it('encodes the approved state rules', () => {
    expect([...CUSTOMER_CANCELLABLE_STATES]).toEqual(['PENDING', 'CONFIRMED']);
    expect([...ADMIN_CANCELLABLE_STATES]).toEqual(['PENDING', 'CONFIRMED', 'ACCEPTED']);
  });

  it('accepts only the approved reason codes per role, and rejects cross-role codes', () => {
    for (const reasonCode of CUSTOMER_REASON_CODES) expect(customerCancelBodySchema.safeParse({ reasonCode }).success).toBe(true);
    for (const reasonCode of ADMIN_REASON_CODES) expect(adminCancelBodySchema.safeParse({ reasonCode }).success).toBe(true);
    expect(customerCancelBodySchema.safeParse({ reasonCode: 'ITEM_UNAVAILABLE' }).success).toBe(false);
    expect(adminCancelBodySchema.safeParse({ reasonCode: 'CHANGED_MIND' }).success).toBe(false);
    expect(customerCancelBodySchema.safeParse({ reasonCode: 'because' }).success).toBe(false);
    expect(customerCancelBodySchema.safeParse({}).success).toBe(false);
    expect(adminCancelBodySchema.safeParse({ reasonCode: 'other' }).success).toBe(false); // exact, case-sensitive
  });

  it('rejects any authoritative field a client might try to send (amount, currency, payment, customer, status)', () => {
    for (const extra of [{ amount: 1 }, { currency: 'INR' }, { providerPaymentId: 'pay_x' }, { paymentId: 'x' }, { customerId: 'x' }, { status: 'REFUNDED' }, { refundAmount: 1 }]) {
      expect(customerCancelBodySchema.safeParse({ reasonCode: 'OTHER', ...extra }).success, JSON.stringify(extra)).toBe(false);
      expect(adminCancelBodySchema.safeParse({ reasonCode: 'OTHER', ...extra }).success, JSON.stringify(extra)).toBe(false);
      expect(refundApprovalBodySchema.safeParse(extra).success, JSON.stringify(extra)).toBe(false);
    }
    expect(refundApprovalBodySchema.safeParse({}).success).toBe(true);
  });

  it('sanitizes notes: trims, strips control and invisible characters, collapses spaces, bounds the length', () => {
    expect(sanitizeNote('  hello   world  ')).toBe('hello world');
    expect(sanitizeNote('line1\nline2\t\ttab\r\nend')).toBe('line1 line2 tab end');
    expect(sanitizeNote('a' + String.fromCharCode(0) + 'b' + String.fromCharCode(0x202e) + 'c' + String.fromCharCode(0x200b) + 'd')).toBe('a b c d');
    expect(sanitizeNote('x'.repeat(500))).toHaveLength(NOTE_MAX_LENGTH);
    expect(sanitizeNote('   ')).toBeNull();
    expect(sanitizeNote(String.fromCharCode(1, 2, 3))).toBeNull();
    expect(sanitizeNote(undefined)).toBeNull();
    expect(customerCancelBodySchema.parse({ reasonCode: 'OTHER', note: ' ok\nnote ' }).note).toBe('ok note');
    expect(customerCancelBodySchema.parse({ reasonCode: 'OTHER' }).note).toBeNull();
    expect(customerCancelBodySchema.safeParse({ reasonCode: 'OTHER', note: 'z'.repeat(1001) }).success).toBe(false); // transport bound
  });
});

describe('P7C unit — Razorpay refund adapter (injected fetch, no network)', () => {
  it('creates a FULL refund with an explicit paise amount, speed normal, the receipt, and Basic auth', async () => {
    const { impl, calls } = mkFetch(() => json(200, refundEntity()));
    const p = new RazorpayPaymentProvider(cfg, 2000, impl);
    const r = await p.createRefund(input);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.test.invalid/v1/payments/pay_1/refund');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ amount: 14550, speed: 'normal', receipt: 'rcpt-1', notes: { pbRefundId: 'rcpt-1' } });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`${cfg.keyId}:${KEY_SECRET}`).toString('base64')}`);
    expect(r).toEqual({ providerRefundId: 'rfnd_1', providerPaymentId: 'pay_1', amountMinor: 14550, currency: 'INR', status: 'PENDING', receipt: 'rcpt-1', speedProcessed: null });
    expect(JSON.stringify(r)).not.toMatch(/arn|secret|notes/i); // only the normalized, safe fields survive
  });

  it('normalizes provider statuses pending / processed / failed and refuses an unknown status as an UNKNOWN outcome', async () => {
    for (const [raw, want] of [['pending', 'PENDING'], ['processed', 'PROCESSED'], ['failed', 'FAILED']] as const) {
      const { impl } = mkFetch(() => json(200, refundEntity({ status: raw })));
      expect((await new RazorpayPaymentProvider(cfg, 2000, impl).createRefund(input)).status).toBe(want);
    }
    const { impl } = mkFetch(() => json(200, refundEntity({ status: 'mystery' })));
    await expect(new RazorpayPaymentProvider(cfg, 2000, impl).createRefund(input)).rejects.toBeInstanceOf(ProviderUnknownError);
  });

  it('treats ONLY an explicit 4xx answer with a provider error body as a DEFINITE rejection (and keeps a safe detail)', async () => {
    const { impl } = mkFetch(() => json(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The refund amount provided is greater than amount captured.' } }));
    const err = await new RazorpayPaymentProvider(cfg, 2000, impl).createRefund(input).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderDefiniteError);
    expect(err.code).toBe('BAD_REQUEST_ERROR');
    expect(err.detail).toContain('greater than amount captured');
    expect(JSON.stringify(err)).not.toContain(KEY_SECRET);
  });

  it('treats 5xx, 429, bodiless 4xx, garbage, timeouts and network errors as UNKNOWN - and never retries the create', async () => {
    const cases: Array<() => Response | Promise<Response>> = [
      () => json(500, { error: { code: 'SERVER_ERROR' } }),
      () => json(502, {}),
      () => json(429, { error: { code: 'BAD_REQUEST_ERROR' } }),
      () => new Response('not json', { status: 400 }),
      () => json(400, { nothing: true }),
      () => new Response('<html>', { status: 200 }),
      () => json(200, { id: 'rfnd_1' }),
      () => {
        throw new TypeError('connection reset');
      }
    ];
    for (const c of cases) {
      const { impl, calls } = mkFetch(c);
      await expect(new RazorpayPaymentProvider(cfg, 2000, impl).createRefund(input)).rejects.toBeInstanceOf(ProviderUnknownError);
      expect(calls).toHaveLength(1); // a second create could create a second refund
    }
  });

  it('times out as UNKNOWN (bounded) without retrying', async () => {
    const { impl, calls } = mkFetch((_u, init) => new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    await expect(new RazorpayPaymentProvider(cfg, 30, impl).createRefund(input)).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    expect(calls).toHaveLength(1);
  });

  it('fetchRefund: 404 is "no such refund"; listPaymentRefunds: a missing payment is NOT an empty list', async () => {
    const p404 = new RazorpayPaymentProvider(cfg, 2000, mkFetch(() => json(404, { error: { code: 'BAD_REQUEST_ERROR' } })).impl);
    expect(await p404.fetchRefund('rfnd_x')).toBeNull();
    await expect(p404.listPaymentRefunds('pay_x')).rejects.toBeInstanceOf(ProviderUnknownError);
    const ok = new RazorpayPaymentProvider(cfg, 2000, mkFetch(() => json(200, { entity: 'collection', count: 2, items: [refundEntity(), refundEntity({ id: 'rfnd_2', status: 'processed', receipt: null })] })).impl);
    const list = await ok.listPaymentRefunds('pay_1');
    expect(list.map((x) => [x.providerRefundId, x.status, x.receipt])).toEqual([['rfnd_1', 'PENDING', 'rcpt-1'], ['rfnd_2', 'PROCESSED', null]]);
    const bad = new RazorpayPaymentProvider(cfg, 2000, mkFetch(() => json(200, { items: [{ id: 'x' }] })).impl);
    await expect(bad.listPaymentRefunds('pay_1')).rejects.toBeInstanceOf(ProviderUnknownError);
  });

  it('read calls retry a bounded number of times; the create call is never in that path', async () => {
    let n = 0;
    const { impl, calls } = mkFetch(() => (++n < 3 ? json(503, {}) : json(200, refundEntity())));
    const r = await new RazorpayPaymentProvider(cfg, 2000, impl).fetchRefund('rfnd_1');
    expect(r?.providerRefundId).toBe('rfnd_1');
    expect(calls).toHaveLength(3);
  });
});

describe('P7C unit — refund webhook normalization', () => {
  it('extracts only safe refund fields and drops notes / acquirer data', () => {
    expect(normalizeRazorpayRefund(refundEntity({ status: 'processed', speed_processed: 'normal' }))).toEqual({
      providerRefundId: 'rfnd_1',
      providerPaymentId: 'pay_1',
      amountMinor: 14550,
      currency: 'INR',
      status: 'PROCESSED',
      receipt: 'rcpt-1',
      speedProcessed: 'normal'
    });
    expect(normalizeRazorpayRefund({ id: 'r' })).toBeNull();
    expect(normalizeRazorpayRefund(refundEntity({ status: 'weird' }))).toBeNull();
  });

  it('parses refund.* events into kind REFUND with the normalized refund and the payment id', () => {
    const body = Buffer.from(JSON.stringify({ event: 'refund.processed', created_at: 1, payload: { refund: { entity: refundEntity({ status: 'processed' }) } } }));
    const parsed = parseRazorpayWebhook(body, { 'x-razorpay-event-id': 'evt_1' });
    expect(parsed).toMatchObject({ kind: 'REFUND', eventType: 'refund.processed', eventId: 'evt_1', providerPaymentId: 'pay_1' });
    expect(parsed?.refund).toMatchObject({ providerRefundId: 'rfnd_1', status: 'PROCESSED' });
    expect(JSON.stringify(parsed)).not.toMatch(/acquirer|arn|secret/);
    const noEntity = parseRazorpayWebhook(Buffer.from(JSON.stringify({ event: 'refund.created', payload: {} })), {});
    expect(noEntity).toMatchObject({ kind: 'REFUND', refund: null });
  });
});

describe('P7C unit — mock provider refunds', () => {
  const setup = () => {
    const m = new MockPaymentProvider();
    return m;
  };
  const capturedPayment = async (m: MockPaymentProvider) => {
    const order = await m.createOrder({ receipt: 'r1', amountMinor: 20000, currency: 'INR', notes: {} });
    return m.simulatePayment(order.providerOrderId, { status: 'CAPTURED' });
  };

  it('creates, fetches and lists refunds deterministically; a full processed refund marks the payment REFUNDED', async () => {
    const m = setup();
    const pay = await capturedPayment(m);
    const refund = await m.createRefund({ providerPaymentId: pay.providerPaymentId, amountMinor: 20000, currency: 'INR', receipt: 'rc-1', notes: {} });
    expect(refund).toMatchObject({ status: 'PENDING', receipt: 'rc-1', amountMinor: 20000 });
    expect(await m.fetchRefund(refund.providerRefundId)).toEqual(refund);
    expect(await m.listPaymentRefunds(pay.providerPaymentId)).toEqual([refund]);
    m.setRefundStatus(refund.providerRefundId, 'PROCESSED');
    expect(m.payments.get(pay.providerPaymentId)?.status).toBe('REFUNDED');
    expect(m.refundCreateCalls).toBe(1);
  });

  it('rejects like the provider documents: not captured, duplicate receipt, over-refund, below minimum', async () => {
    const m = setup();
    const pay = await capturedPayment(m);
    await m.createRefund({ providerPaymentId: pay.providerPaymentId, amountMinor: 5000, currency: 'INR', receipt: 'rc-1', notes: {} });
    const attempt = (over: Record<string, unknown>) => m.createRefund({ providerPaymentId: pay.providerPaymentId, amountMinor: 5000, currency: 'INR', receipt: 'rc-x', notes: {}, ...over });
    await expect(attempt({ receipt: 'rc-1' })).rejects.toBeInstanceOf(ProviderDefiniteError); // duplicate receipt
    await expect(attempt({ amountMinor: 20000 })).rejects.toBeInstanceOf(ProviderDefiniteError); // exceeds what is left
    await expect(attempt({ amountMinor: 50 })).rejects.toBeInstanceOf(ProviderDefiniteError);
    await expect(attempt({ providerPaymentId: 'pay_unknown' })).rejects.toBeInstanceOf(ProviderDefiniteError);
  });

  it('simulates uncertain outcomes: unknown, unknown-after-create (the refund EXISTS), definite, hidden listing, read failure', async () => {
    const m = setup();
    const pay = await capturedPayment(m);
    m.failNextRefund('unknown');
    await expect(m.createRefund({ providerPaymentId: pay.providerPaymentId, amountMinor: 20000, currency: 'INR', receipt: 'a', notes: {} })).rejects.toBeInstanceOf(ProviderUnknownError);
    expect(m.refunds.size).toBe(0);
    m.failNextRefund('unknown-after-create');
    await expect(m.createRefund({ providerPaymentId: pay.providerPaymentId, amountMinor: 20000, currency: 'INR', receipt: 'b', notes: {} })).rejects.toBeInstanceOf(ProviderUnknownError);
    expect(m.refunds.size).toBe(1);
    m.setRefundListingHidden(true);
    expect(await m.listPaymentRefunds(pay.providerPaymentId)).toEqual([]);
    m.setReadFailure(true);
    await expect(m.listPaymentRefunds(pay.providerPaymentId)).rejects.toBeInstanceOf(ProviderUnknownError);
    m.failNextRefund('definite');
    await expect(m.createRefund({ providerPaymentId: pay.providerPaymentId, amountMinor: 20000, currency: 'INR', receipt: 'c', notes: {} })).rejects.toBeInstanceOf(ProviderDefiniteError);
  });

  it('builds a validly signed refund webhook and can create an EXTERNAL refund (no receipt)', async () => {
    const m = setup();
    const pay = await capturedPayment(m);
    const ext = m.externalRefund(pay.providerPaymentId, 2500, 'PROCESSED');
    expect(ext.receipt).toBeNull();
    const { raw, headers } = m.buildRefundWebhook('refund.processed', ext, { eventId: 'evt_x' });
    expect(m.verifyWebhookSignature(raw, headers['x-razorpay-signature'])).toBe(true);
    expect(parseRazorpayWebhook(raw, headers)?.refund).toMatchObject({ providerRefundId: ext.providerRefundId, status: 'PROCESSED', receipt: null });
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentConfigError, parsePaymentConfig, resetPaymentConfig, setPaymentConfigForTests } from '../config/paymentConfig.js';
import { fromMinorUnits, toMinorUnits } from '../modules/payment/money.js';
import { hmacSha256Hex, safeEqualStrings, verifyHmacSignature } from '../modules/payment/signatures.js';
import { RazorpayPaymentProvider } from '../modules/payment/razorpay.provider.js';
import { MOCK_WEBHOOK_SECRET, MockPaymentProvider } from '../modules/payment/mock.provider.js';
import { ProviderDefiniteError, ProviderUnknownError } from '../modules/payment/provider.types.js';
import { PROVIDER_STATUS_RANK, ProviderPaymentStatus, providerStatusMayAdvance } from '../modules/payment/paymentStatus.js';
import { backoffMs, safeCode } from '../modules/payment/paymentOps.js';
import { parseRazorpayWebhook } from '../modules/payment/razorpayWebhook.js';
import { getPaymentProvider, setPaymentProviderForTests } from '../modules/payment/providerRegistry.js';

const SRC = join(__dirname, '..');
const RZP = { PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'rzp_test_unit', RAZORPAY_KEY_SECRET: 'unit-key-secret', RAZORPAY_WEBHOOK_SECRET: 'unit-webhook-secret' };
const parse = (raw: Record<string, string | undefined>, env = 'production') => parsePaymentConfig(raw, env);

// ------------------------------------------------------------------------------------------------ configuration
describe('P7B payment configuration', () => {
  it('production fails closed: the provider must be named explicitly', () => {
    expect(() => parse({})).toThrow(/must be set explicitly in production/);
  });

  it('production REFUSES the mock provider, development and test allow it (and default to it)', () => {
    expect(() => parse({ PAYMENT_PROVIDER: 'mock' })).toThrow(/mock is refused in production/);
    expect(parse({ PAYMENT_PROVIDER: 'mock' }, 'development').provider).toBe('mock');
    expect(parse({}, 'development').provider).toBe('mock');
    expect(parse({}, 'test').provider).toBe('mock');
  });

  it('razorpay requires key id, key secret and webhook secret (each one)', () => {
    for (const missing of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) {
      const raw: Record<string, string | undefined> = { ...RZP, [missing]: undefined };
      expect(() => parse(raw), missing).toThrow(new RegExp(missing));
      expect(() => parse({ ...RZP, [missing]: '   ' }), missing).toThrow(new RegExp(missing));
    }
  });

  it('a complete production configuration is accepted with the approved defaults (15 min / 120 s / 7 days / 12 retries)', () => {
    const c = parse(RZP);
    expect(c.provider).toBe('razorpay');
    expect(c.razorpay).toMatchObject({ keyId: 'rzp_test_unit', apiBase: 'https://api.razorpay.com/v1', previousWebhookSecret: null });
    expect(c.sessionTtlMs).toBe(15 * 60_000);
    expect(c.unknownGraceMs).toBe(120_000);
    expect(c.oldOrderWatchMs).toBe(7 * 86_400_000);
    expect(c.retry.maxAttempts).toBe(12);
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('every timing is configurable and range-checked', () => {
    const c = parse({ ...RZP, PAYMENT_SESSION_TTL_MINUTES: '30', PAYMENT_UNKNOWN_GRACE_SECONDS: '60', PAYMENT_OLD_ORDER_WATCH_DAYS: '14', PAYMENT_RETRY_MAX_ATTEMPTS: '5', RAZORPAY_WEBHOOK_SECRET_PREVIOUS: 'old-secret' });
    expect([c.sessionTtlMs, c.unknownGraceMs, c.oldOrderWatchMs, c.retry.maxAttempts]).toEqual([30 * 60_000, 60_000, 14 * 86_400_000, 5]);
    expect(c.razorpay!.previousWebhookSecret).toBe('old-secret');
    for (const bad of [['PAYMENT_SESSION_TTL_MINUTES', '0'], ['PAYMENT_SESSION_TTL_MINUTES', 'abc'], ['PAYMENT_RETRY_MAX_ATTEMPTS', '-1'], ['PAYMENT_OLD_ORDER_WATCH_DAYS', '1000'], ['PAYMENT_PROVIDER_TIMEOUT_MS', '10']]) {
      expect(() => parse({ ...RZP, [bad[0]]: bad[1] }), bad.join('=')).toThrow(PaymentConfigError);
    }
    expect(() => parse({ ...RZP, PAYMENT_RETRY_BASE_SECONDS: '100', PAYMENT_RETRY_MAX_SECONDS: '10' })).toThrow(/must not be smaller/);
  });

  it('unsupported providers fail; the API base cannot be overridden in production', () => {
    expect(() => parse({ PAYMENT_PROVIDER: 'stripe' }, 'development')).toThrow(/not supported/);
    expect(() => parse({ ...RZP, RAZORPAY_API_BASE: 'http://evil.example/v1' })).toThrow(/may not be overridden in production/);
    expect(parse({ ...RZP, RAZORPAY_API_BASE: 'http://localhost:9999/v1' }, 'test').razorpay!.apiBase).toBe('http://localhost:9999/v1');
    expect(() => parse({ ...RZP, RAZORPAY_API_BASE: 'not a url' }, 'test')).toThrow(/valid URL/);
  });

  it('the configuration cannot be swapped at runtime in production, and the mock provider cannot be created or injected there', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => setPaymentConfigForTests(parse({}, 'test'))).toThrow(/cannot be replaced in production/);
      expect(() => resetPaymentConfig()).toThrow(/cannot be replaced in production/);
      expect(() => new MockPaymentProvider()).toThrow(/cannot be instantiated in production/);
      expect(() => setPaymentProviderForTests(null)).toThrow(/cannot be replaced in production/);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('loading the config module in production without a provider fails at startup; a valid production environment loads', async () => {
    const saved = { ...process.env };
    try {
      delete process.env.PAYMENT_PROVIDER;
      process.env.NODE_ENV = 'production';
      vi.resetModules();
      await expect(import('../config/paymentConfig.js')).rejects.toThrow(/must be set explicitly in production/);
      Object.assign(process.env, RZP, { NODE_ENV: 'production' });
      vi.resetModules();
      const mod = await import('../config/paymentConfig.js');
      expect(mod.getPaymentConfig().provider).toBe('razorpay');
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
      vi.resetModules();
    }
  });
});

// ------------------------------------------------------------------------------------------------ money
describe('P7B money conversion (Decimal -> integer paise, no floating point)', () => {
  it('converts exactly, including values that break binary floating point', () => {
    expect(toMinorUnits('145.50')).toBe(14550);
    expect(toMinorUnits(new Decimal('1.15'))).toBe(115); // 1.15 * 100 === 114.99999999999999 in floating point
    expect(toMinorUnits(0.07)).toBe(7);
    expect(toMinorUnits('99999999.99')).toBe(9999999999);
    expect(toMinorUnits(0)).toBe(0);
  });

  it('rejects amounts that are not whole paise, negative, or unsafe', () => {
    for (const bad of ['1.005', '-1.00', 'NaN', '1e20']) expect(() => toMinorUnits(bad), bad).toThrowError(expect.objectContaining({ errorCode: 'PAYMENT_AMOUNT_INVALID' }));
  });

  it('converts back exactly and rejects invalid minor units', () => {
    expect(fromMinorUnits(14550).toFixed(2)).toBe('145.50');
    expect(fromMinorUnits(1).toFixed(2)).toBe('0.01');
    for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => fromMinorUnits(bad)).toThrow();
  });
});

// ------------------------------------------------------------------------------------------------ signatures
describe('P7B signatures', () => {
  it('HMAC-SHA256 hex over the exact message, verified in constant time', () => {
    const expected = createHmac('sha256', 's3cret').update('order_X|pay_Y').digest('hex');
    expect(hmacSha256Hex('s3cret', 'order_X|pay_Y')).toBe(expected);
    expect(verifyHmacSignature('s3cret', 'order_X|pay_Y', expected)).toBe(true);
    expect(verifyHmacSignature('s3cret', 'order_X|pay_Y', expected.toUpperCase())).toBe(true); // hex is case-insensitive
    expect(verifyHmacSignature('s3cret', 'order_X|pay_Z', expected)).toBe(false);
    expect(verifyHmacSignature('other', 'order_X|pay_Y', expected)).toBe(false);
    expect(verifyHmacSignature('s3cret', 'order_X|pay_Y', undefined)).toBe(false);
    expect(verifyHmacSignature('s3cret', 'order_X|pay_Y', '')).toBe(false);
  });

  it('safeEqualStrings never throws on different lengths and compares exactly', () => {
    expect(safeEqualStrings('abc', 'abc')).toBe(true);
    expect(safeEqualStrings('abc', 'abd')).toBe(false);
    expect(safeEqualStrings('abc', 'abcd')).toBe(false);
    expect(safeEqualStrings('', 'a')).toBe(false);
  });

  it('signature checks use timingSafeEqual and never a plain comparison (static guard)', () => {
    const sig = readFileSync(join(SRC, 'modules', 'payment', 'signatures.ts'), 'utf8');
    expect(sig).toContain('timingSafeEqual');
    const rzp = readFileSync(join(SRC, 'modules', 'payment', 'razorpay.provider.ts'), 'utf8');
    expect(rzp).not.toMatch(/signature\s*===|===\s*signature|expected\s*===|===\s*expected/);
    expect(rzp).toContain('verifyHmacSignature');
    expect(rzp).toContain('safeEqualStrings');
  });
});

// ------------------------------------------------------------------------------------------------ razorpay adapter (injected fetch)
function jsonRes(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}
const ORDER = { id: 'order_ABC123', entity: 'order', amount: 14550, currency: 'INR', receipt: 'rcpt-1', status: 'created', notes: [] };
const PAYMENT = { id: 'pay_XYZ789', order_id: 'order_ABC123', amount: 14550, currency: 'INR', status: 'captured', method: 'upi', email: 'a@b.c', contact: '+911234567890', vpa: 'x@upi', card_id: 'card_1', bank: 'HDFC', error_code: null, error_description: null };

function makeProvider(fetchImpl: typeof fetch, timeoutMs = 2000) {
  const cfg = parse({ ...RZP, RAZORPAY_API_BASE: 'http://rzp.test/v1' }, 'test').razorpay!;
  return new RazorpayPaymentProvider(cfg, timeoutMs, fetchImpl);
}

describe('P7B Razorpay adapter (direct HTTPS, no SDK)', () => {
  it('creates an order with integer paise, the receipt, notes and HTTP Basic auth - and does not leak secrets in its own state', async () => {
    const fetchMock = vi.fn(async () => jsonRes(200, ORDER));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const order = await p.createOrder({ receipt: 'rcpt-1', amountMinor: 14550, currency: 'INR', notes: { pbAttemptId: 'a' } });
    expect(order).toMatchObject({ providerOrderId: 'order_ABC123', amountMinor: 14550, currency: 'INR', receipt: 'rcpt-1', status: 'created' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('http://rzp.test/v1/orders');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('rzp_test_unit:unit-key-secret').toString('base64')}`);
    expect(JSON.parse(init.body as string)).toEqual({ amount: 14550, currency: 'INR', receipt: 'rcpt-1', notes: { pbAttemptId: 'a' } });
    expect(Number.isInteger(JSON.parse(init.body as string).amount)).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/unit-key-secret|unit-webhook-secret/);
    expect(String(Object.keys(p))).not.toMatch(/config|secret/i);
  });

  it('classifies create failures: only an explicit 4xx provider error is DEFINITE; everything else is UNKNOWN; create is never retried', async () => {
    const run = async (res: () => Promise<Response>) => {
      const calls = { n: 0 };
      const p = makeProvider((async () => { calls.n++; return res(); }) as unknown as typeof fetch);
      const err = await p.createOrder({ receipt: 'r', amountMinor: 100, currency: 'INR', notes: {} }).catch((e) => e);
      return { err, calls: calls.n };
    };
    const definite = await run(async () => jsonRes(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'secret internal text' } }));
    expect(definite.err).toBeInstanceOf(ProviderDefiniteError);
    expect(definite.err.code).toBe('BAD_REQUEST_ERROR');
    expect(definite.err.message).not.toContain('secret internal text');
    expect((await run(async () => jsonRes(401, { error: { code: 'BAD_REQUEST_ERROR' } }))).err).toBeInstanceOf(ProviderDefiniteError);

    for (const res of [async () => jsonRes(500, { error: {} }), async () => jsonRes(502, null), async () => jsonRes(429, { error: { code: 'X' } }), async () => jsonRes(400, { nonsense: true }), async () => jsonRes(200, { not: 'an order' }), async () => { throw new TypeError('fetch failed'); }]) {
      const r = await run(res);
      expect(r.err).toBeInstanceOf(ProviderUnknownError);
      expect(r.calls).toBe(1); // NEVER auto-retried
    }
  });

  it('a request that exceeds the timeout is an UNKNOWN outcome (PROVIDER_TIMEOUT)', async () => {
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    const p = makeProvider(hang, 30);
    const err = await p.createOrder({ receipt: 'r', amountMinor: 100, currency: 'INR', notes: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderUnknownError);
    expect(err.code).toBe('PROVIDER_TIMEOUT');
  });

  it('reads: 404 is a definite "not found"; 400/5xx are NOT assumed to mean not-found; reads are retried a bounded number of times', async () => {
    expect(await makeProvider((async () => jsonRes(404, {})) as unknown as typeof fetch).fetchOrder('order_x')).toBeNull();
    expect(await makeProvider((async () => jsonRes(404, {})) as unknown as typeof fetch).fetchPayment('pay_x')).toBeNull();
    const n = { c: 0 };
    const p5 = makeProvider((async () => { n.c++; return jsonRes(500, {}); }) as unknown as typeof fetch);
    await expect(p5.fetchOrder('order_x')).rejects.toBeInstanceOf(ProviderUnknownError);
    expect(n.c).toBe(3); // 1 try + 2 bounded retries
    await expect(makeProvider((async () => jsonRes(400, { error: {} })) as unknown as typeof fetch).fetchPayment('pay_x')).rejects.toBeInstanceOf(ProviderUnknownError);
  });

  it('normalizes orders (Razorpay returns [] for empty notes) and payments - dropping every PII / instrument field', async () => {
    const p = makeProvider((async (url: string) => (String(url).includes('/payments') ? jsonRes(200, PAYMENT) : jsonRes(200, ORDER))) as unknown as typeof fetch);
    expect((await p.fetchOrder('order_ABC123'))!.notes).toEqual({});
    const info = await p.fetchPayment('pay_XYZ789');
    expect(info).toEqual({ providerPaymentId: 'pay_XYZ789', providerOrderId: 'order_ABC123', amountMinor: 14550, currency: 'INR', status: 'CAPTURED', method: 'upi', errorCode: null, errorReason: null });
    expect(JSON.stringify(info)).not.toMatch(/a@b\.c|\+9112|x@upi|card_1|HDFC/);
  });

  it('lists orders by receipt and payments of an order with bounded, validated responses', async () => {
    const calls: string[] = [];
    const p = makeProvider((async (url: string) => {
      calls.push(String(url));
      return String(url).includes('/orders?') ? jsonRes(200, { entity: 'collection', items: [ORDER] }) : jsonRes(200, { entity: 'collection', items: [PAYMENT] });
    }) as unknown as typeof fetch);
    const orders = await p.findOrdersByReceipt('rcpt-1', 1700000000);
    expect(orders).toHaveLength(1);
    expect(calls[0]).toContain('receipt=rcpt-1');
    expect(calls[0]).toContain('from=1700000000');
    expect(calls[0]).toContain('count=100');
    expect(await p.listOrderPayments('order_ABC123')).toHaveLength(1);
    const bad = makeProvider((async () => jsonRes(200, { entity: 'collection', items: [{ id: 'pay_1', status: 'weird' }] })) as unknown as typeof fetch);
    await expect(bad.listOrderPayments('order_x')).rejects.toBeInstanceOf(ProviderUnknownError);
  });

  it('verifies the checkout signature as HMAC_SHA256(order_id|payment_id, key_secret) - wrong order, wrong payment or wrong secret fail', () => {
    const p = makeProvider(vi.fn() as unknown as typeof fetch);
    const sig = createHmac('sha256', 'unit-key-secret').update('order_ABC123|pay_XYZ789').digest('hex');
    expect(p.verifyCheckoutSignature({ providerOrderId: 'order_ABC123', providerPaymentId: 'pay_XYZ789', signature: sig })).toBe(true);
    expect(p.verifyCheckoutSignature({ providerOrderId: 'order_OTHER', providerPaymentId: 'pay_XYZ789', signature: sig })).toBe(false);
    expect(p.verifyCheckoutSignature({ providerOrderId: 'order_ABC123', providerPaymentId: 'pay_OTHER', signature: sig })).toBe(false);
    const wrongSecret = createHmac('sha256', 'not-the-secret').update('order_ABC123|pay_XYZ789').digest('hex');
    expect(p.verifyCheckoutSignature({ providerOrderId: 'order_ABC123', providerPaymentId: 'pay_XYZ789', signature: wrongSecret })).toBe(false);
    expect(p.verifyCheckoutSignature({ providerOrderId: 'order_ABC123', providerPaymentId: 'pay_XYZ789', signature: sig.slice(0, 20) })).toBe(false);
  });

  it('verifies webhooks over the RAW bytes with the current secret, accepts the previous secret during rotation, rejects everything else', () => {
    const cfg = parse({ ...RZP, RAZORPAY_WEBHOOK_SECRET_PREVIOUS: 'previous-secret', RAZORPAY_API_BASE: 'http://rzp.test/v1' }, 'test').razorpay!;
    const p = new RazorpayPaymentProvider(cfg, 1000, vi.fn() as unknown as typeof fetch);
    const raw = Buffer.from('{"event":"payment.captured",  "payload":{}}'); // deliberately non-canonical whitespace
    const sign = (secret: string, body: Buffer) => createHmac('sha256', secret).update(body).digest('hex');
    expect(p.verifyWebhookSignature(raw, sign('unit-webhook-secret', raw))).toBe(true);
    expect(p.verifyWebhookSignature(raw, sign('previous-secret', raw))).toBe(true);
    expect(p.verifyWebhookSignature(raw, sign('some-other-secret', raw))).toBe(false);
    // a signature over a re-serialized (canonical) body must NOT verify the original bytes
    expect(p.verifyWebhookSignature(raw, sign('unit-webhook-secret', Buffer.from(JSON.stringify(JSON.parse(raw.toString())))))).toBe(false);
    expect(p.verifyWebhookSignature(Buffer.from(`${raw.toString()} `), sign('unit-webhook-secret', raw))).toBe(false); // one extra byte
    expect(p.verifyWebhookSignature(raw, undefined)).toBe(false);
    expect(p.verifyWebhookSignature(raw, '')).toBe(false);
  });

  it('exposes only the public key id for checkout and has no refund/capture methods yet', () => {
    const p = makeProvider(vi.fn() as unknown as typeof fetch);
    expect(p.getPublicCheckoutConfig()).toEqual({ keyId: 'rzp_test_unit' });
    expect(p.minAmountMinor).toBe(100);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(p))).not.toEqual(expect.arrayContaining(['createRefund', 'capturePayment']));
  });
});

// ------------------------------------------------------------------------------------------------ webhook parsing
describe('P7B webhook parsing (normalization, PII-free)', () => {
  const body = (event: string, payload: unknown, createdAt = 1760000000) => Buffer.from(JSON.stringify({ entity: 'event', account_id: 'acc_1', event, contains: ['payment'], payload, created_at: createdAt }));

  it('normalizes payment events and keeps only safe fields', () => {
    const parsed = parseRazorpayWebhook(body('payment.captured', { payment: { entity: PAYMENT } }), { 'x-razorpay-event-id': 'evt_1' })!;
    expect(parsed).toMatchObject({ kind: 'PAYMENT', eventType: 'payment.captured', eventId: 'evt_1', providerOrderId: 'order_ABC123', providerPaymentId: 'pay_XYZ789' });
    expect(parsed.payment).toMatchObject({ status: 'CAPTURED', amountMinor: 14550, currency: 'INR', method: 'upi' });
    expect(JSON.stringify(parsed)).not.toMatch(/a@b\.c|\+9112|x@upi|card_1|HDFC/);
    expect(parsed.eventCreatedAt).toEqual(new Date(1760000000 * 1000));
  });

  it('handles order.paid, refund events, unrelated events and an unrecognised payment status', () => {
    const paid = parseRazorpayWebhook(body('order.paid', { payment: { entity: PAYMENT }, order: { entity: { id: 'order_ABC123' } } }), {})!;
    expect(paid).toMatchObject({ kind: 'PAYMENT', providerOrderId: 'order_ABC123', eventId: null });
    expect(parseRazorpayWebhook(body('refund.processed', { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_XYZ789' } } }), {})).toMatchObject({ kind: 'REFUND', providerPaymentId: 'pay_XYZ789', payment: null });
    expect(parseRazorpayWebhook(body('payment.downtime.started', {}), {})!.kind).toBe('OTHER');
    expect(parseRazorpayWebhook(body('settlement.processed', {}), {})!.kind).toBe('OTHER');
    const weird = parseRazorpayWebhook(body('payment.pending', { payment: { entity: { ...PAYMENT, status: 'brand_new_status' } } }), {})!;
    expect(weird.payment).toBeNull();
    expect(weird.providerPaymentId).toBe('pay_XYZ789'); // ids survive so the worker can ask the provider for the truth
  });

  it('returns null for invalid JSON or an invalid envelope', () => {
    expect(parseRazorpayWebhook(Buffer.from('not json'), {})).toBeNull();
    expect(parseRazorpayWebhook(Buffer.from('{"no":"event"}'), {})).toBeNull();
    expect(parseRazorpayWebhook(Buffer.from('[]'), {})).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ mock provider
describe('P7B mock provider', () => {
  it('uses the same interface, builds correctly signed webhooks and never exposes a secret via the public config', () => {
    const mock = new MockPaymentProvider();
    const { raw, headers } = mock.buildWebhook('payment.captured', { providerPaymentId: 'pay_m', providerOrderId: 'order_m', amountMinor: 100, currency: 'INR', status: 'CAPTURED', method: 'upi', errorCode: null, errorReason: null });
    expect(mock.verifyWebhookSignature(raw, headers['x-razorpay-signature'])).toBe(true);
    expect(mock.verifyWebhookSignature(Buffer.concat([raw, Buffer.from(' ')]), headers['x-razorpay-signature'])).toBe(false);
    expect(hmacSha256Hex(MOCK_WEBHOOK_SECRET, raw)).toBe(headers['x-razorpay-signature']);
    expect(mock.getPublicCheckoutConfig()).toEqual({ keyId: 'mock_key_id' });
    expect(mock.parseWebhook(raw, headers)!.payment!.status).toBe('CAPTURED');
  });

  it('simulates definite, unknown and unknown-after-create failures and a hidden receipt lookup', async () => {
    const mock = new MockPaymentProvider();
    mock.failNextCreate('definite');
    await expect(mock.createOrder({ receipt: 'r1', amountMinor: 100, currency: 'INR', notes: {} })).rejects.toBeInstanceOf(ProviderDefiniteError);
    mock.failNextCreate('unknown');
    await expect(mock.createOrder({ receipt: 'r2', amountMinor: 100, currency: 'INR', notes: {} })).rejects.toBeInstanceOf(ProviderUnknownError);
    expect(mock.orders.size).toBe(0);
    mock.failNextCreate('unknown-after-create');
    await expect(mock.createOrder({ receipt: 'r3', amountMinor: 100, currency: 'INR', notes: {} })).rejects.toBeInstanceOf(ProviderUnknownError);
    expect(mock.orders.size).toBe(1); // created at the provider although the answer was lost
    expect((await mock.findOrdersByReceipt('r3')).length).toBe(1);
    mock.setReceiptLookupHidden(true);
    expect(await mock.findOrdersByReceipt('r3')).toEqual([]);
  });

  it('is the provider selected in tests, and the registry caches one instance', () => {
    expect(getPaymentProvider().name).toBe('mock');
    expect(getPaymentProvider()).toBe(getPaymentProvider());
  });
});

// ------------------------------------------------------------------------------------------------ ledger vocabulary + backoff
describe('P7B status vocabulary and backoff', () => {
  afterEach(() => resetPaymentConfig());

  it('provider status moves only forward: CAPTURED can never regress to FAILED/AUTHORIZED/CREATED', () => {
    const all = Object.keys(PROVIDER_STATUS_RANK) as ProviderPaymentStatus[];
    for (const from of all) for (const to of all) expect(providerStatusMayAdvance(from, to), `${from}->${to}`).toBe(PROVIDER_STATUS_RANK[to] > PROVIDER_STATUS_RANK[from]);
    expect(providerStatusMayAdvance('CAPTURED', 'FAILED')).toBe(false);
    expect(providerStatusMayAdvance('CAPTURED', 'AUTHORIZED')).toBe(false);
    expect(providerStatusMayAdvance('AUTHORIZED', 'CAPTURED')).toBe(true);
    expect(providerStatusMayAdvance('whatever', 'CREATED')).toBe(true);
  });

  it('backoff grows exponentially with jitter and is bounded by the configured maximum', () => {
    setPaymentConfigForTests(parse({ PAYMENT_RETRY_BASE_SECONDS: '10', PAYMENT_RETRY_MAX_SECONDS: '100' }, 'test'));
    const full = (n: number) => backoffMs(n, () => 1);
    const half = (n: number) => backoffMs(n, () => 0);
    expect([full(0), full(1), full(2), full(3)]).toEqual([10_000, 20_000, 40_000, 80_000]);
    expect(full(4)).toBe(100_000); // capped
    expect(full(40)).toBe(100_000);
    expect(half(2)).toBe(20_000); // jitter floor is 50 %
    for (let i = 0; i < 50; i++) expect(backoffMs(i % 8)).toBeLessThanOrEqual(100_000);
  });

  it('safeCode strips everything except a short identifier', () => {
    expect(safeCode({ code: 'BAD_REQUEST_ERROR' })).toBe('BAD_REQUEST_ERROR');
    expect(safeCode({ code: 'has spaces & <script>' })).toBe('hasspacesscript');
    expect(safeCode('x'.repeat(200)).length).toBe(60);
    expect(safeCode(undefined, 'FALLBACK')).toBe('FALLBACK');
  });
});

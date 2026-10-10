import { z } from 'zod';
import type { PaymentConfig } from '../../config/paymentConfig.js';
import {
  CreateProviderOrderInput,
  ParsedWebhook,
  PaymentProvider,
  ProviderDefiniteError,
  ProviderOrder,
  ProviderPaymentInfo,
  ProviderUnknownError
} from './provider.types.js';
import { normalizeRazorpayPayment, parseRazorpayWebhook } from './razorpayWebhook.js';
import { hmacSha256Hex, safeEqualStrings, verifyHmacSignature } from './signatures.js';

/**
 * Razorpay over direct HTTPS (global fetch) + node:crypto. No SDK (reviewed decision P7B-D3).
 *
 * Only behaviour verified against the official documentation is used: Orders API (amount in paise, receipt <= 40 chars,
 * notes), Fetch Order, Fetch Orders (receipt filter), Fetch Payments of an Order, Fetch Payment, checkout signature
 * HMAC_SHA256(order_id|payment_id, key_secret) and webhook signature HMAC_SHA256(raw_body, webhook_secret).
 * Anything the documentation does not settle FAILS SAFE: only an explicit 4xx answer with a provider error body is a
 * DEFINITE create failure; everything else (timeouts, network, 5xx, 429, unparseable answers) is an UNKNOWN outcome.
 * Secrets, signatures and provider payloads are never logged.
 */

const orderSchema = z
  .object({
    id: z.string().min(1).max(64),
    amount: z.number().int().nonnegative(),
    currency: z.string().min(3).max(3),
    receipt: z.string().max(100).nullable().optional(),
    status: z.string().min(1).max(32),
    notes: z.union([z.record(z.string(), z.any()), z.array(z.any())]).optional()
  })
  .passthrough();

const collectionSchema = z.object({ items: z.array(z.any()) }).passthrough();
const errorBodySchema = z.object({ error: z.object({ code: z.string().max(100).optional() }).passthrough() }).passthrough();

function normalizeOrder(raw: unknown): ProviderOrder {
  const parsed = orderSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderUnknownError('PROVIDER_BAD_RESPONSE');
  const o = parsed.data;
  const notes: Record<string, string> = {};
  if (o.notes && !Array.isArray(o.notes)) {
    for (const [k, v] of Object.entries(o.notes)) if (typeof v === 'string') notes[k] = v;
  }
  return { providerOrderId: o.id, amountMinor: o.amount, currency: o.currency.toUpperCase(), receipt: o.receipt ?? null, notes, status: o.status };
}

const DEFINITE_CREATE_STATUSES = new Set([400, 401, 403, 422]);
const READ_RETRIES = 2;

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;
  /** Razorpay Orders API (Create an Order, error table): "The amount must be at least INR 1.00" = 100 paise. Re-verified 2026-10-10 against razorpay.com/docs/api/orders/create. Provider limit only; Protein Bowl's own minimum-order policy is separate (CommercePolicy). */
  readonly minAmountMinor = 100;

  // ES private fields: secrets never appear in JSON.stringify(provider), console output or object spreads.
  readonly #config: NonNullable<PaymentConfig['razorpay']>;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(config: NonNullable<PaymentConfig['razorpay']>, timeoutMs: number, fetchImpl: typeof fetch = fetch) {
    this.#config = config;
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetchImpl;
  }

  // ------------------------------------------------------------------ HTTP
  private async http(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const res = await this.#fetch(`${this.#config.apiBase}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.#config.keyId}:${this.#config.keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    } catch (err) {
      const aborted = (err as { name?: string })?.name === 'AbortError';
      throw new ProviderUnknownError(aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK');
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET with bounded retries (reads are safe to repeat). 404 -> null. Any other non-2xx is an UNKNOWN outcome. */
  private async read(path: string): Promise<unknown | null> {
    let last: ProviderUnknownError = new ProviderUnknownError('PROVIDER_UNAVAILABLE');
    for (let i = 0; i <= READ_RETRIES; i++) {
      try {
        const { status, json } = await this.http('GET', path);
        if (status >= 200 && status < 300) return json;
        if (status === 404) return null;
        last = new ProviderUnknownError(`PROVIDER_HTTP_${status}`);
      } catch (err) {
        if (!(err instanceof ProviderUnknownError)) throw err;
        last = err;
      }
      if (i < READ_RETRIES) await new Promise((r) => setTimeout(r, 150 * 2 ** i));
    }
    throw last;
  }

  // ------------------------------------------------------------------ orders
  async createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder> {
    // NEVER retried: a second attempt could create a second provider order.
    const { status, json } = await this.http('POST', '/orders', {
      amount: input.amountMinor,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes
    });
    if (status >= 200 && status < 300) return normalizeOrder(json);
    if (DEFINITE_CREATE_STATUSES.has(status)) {
      const err = errorBodySchema.safeParse(json);
      if (err.success) throw new ProviderDefiniteError(err.data.error.code?.replace(/[^A-Za-z0-9_]/g, '').slice(0, 60) || 'PROVIDER_REJECTED');
    }
    throw new ProviderUnknownError(`PROVIDER_HTTP_${status}`);
  }

  async fetchOrder(providerOrderId: string): Promise<ProviderOrder | null> {
    const json = await this.read(`/orders/${encodeURIComponent(providerOrderId)}`);
    return json === null ? null : normalizeOrder(json);
  }

  async findOrdersByReceipt(receipt: string, fromEpochSeconds: number): Promise<ProviderOrder[]> {
    const qs = new URLSearchParams({ receipt, from: String(Math.max(0, Math.floor(fromEpochSeconds))), count: '100' });
    const json = await this.read(`/orders?${qs.toString()}`);
    const col = collectionSchema.safeParse(json);
    if (!col.success) throw new ProviderUnknownError('PROVIDER_BAD_RESPONSE');
    return col.data.items.map(normalizeOrder);
  }

  async listOrderPayments(providerOrderId: string): Promise<ProviderPaymentInfo[]> {
    const json = await this.read(`/orders/${encodeURIComponent(providerOrderId)}/payments`);
    if (json === null) return [];
    const col = collectionSchema.safeParse(json);
    if (!col.success) throw new ProviderUnknownError('PROVIDER_BAD_RESPONSE');
    const out: ProviderPaymentInfo[] = [];
    for (const item of col.data.items) {
      const info = normalizeRazorpayPayment(item);
      if (!info) throw new ProviderUnknownError('PROVIDER_BAD_RESPONSE');
      out.push(info);
    }
    return out;
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentInfo | null> {
    const json = await this.read(`/payments/${encodeURIComponent(providerPaymentId)}`);
    if (json === null) return null;
    const info = normalizeRazorpayPayment(json);
    if (!info) throw new ProviderUnknownError('PROVIDER_BAD_RESPONSE');
    return info;
  }

  // ------------------------------------------------------------------ signatures
  verifyCheckoutSignature(input: { providerOrderId: string; providerPaymentId: string; signature: string }): boolean {
    // Documented message: order_id + "|" + razorpay_payment_id, with the order id STORED on our server.
    return verifyHmacSignature(this.#config.keySecret, `${input.providerOrderId}|${input.providerPaymentId}`, input.signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (typeof signature !== 'string' || signature.length === 0) return false;
    const candidate = signature.trim().toLowerCase();
    const secrets = [this.#config.webhookSecret, ...(this.#config.previousWebhookSecret ? [this.#config.previousWebhookSecret] : [])];
    let ok = false;
    for (const secret of secrets) ok = safeEqualStrings(hmacSha256Hex(secret, rawBody), candidate) || ok; // no short-circuit
    return ok;
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParsedWebhook | null {
    return parseRazorpayWebhook(rawBody, headers);
  }

  getPublicCheckoutConfig(): { keyId: string } {
    return { keyId: this.#config.keyId };
  }
}

import { randomUUID } from 'node:crypto';
import {
  CreateProviderOrderInput,
  ParsedWebhook,
  PaymentProvider,
  ProviderDefiniteError,
  ProviderOrder,
  ProviderPaymentInfo,
  ProviderUnknownError
} from './provider.types.js';
import type { ProviderPaymentStatus } from './paymentStatus.js';
import { parseRazorpayWebhook } from './razorpayWebhook.js';
import { hmacSha256Hex, verifyHmacSignature } from './signatures.js';

/** Fixed, PUBLIC test-only secrets. They protect nothing real and the mock provider cannot exist in production. */
export const MOCK_KEY_ID = 'mock_key_id';
export const MOCK_KEY_SECRET = 'mock_key_secret_test_only';
export const MOCK_WEBHOOK_SECRET = 'mock_webhook_secret_test_only';

export type MockCreateFailure = 'definite' | 'unknown' | 'unknown-after-create';

/**
 * In-memory provider for development and automated tests. It uses the same PaymentProvider interface and the same
 * settlement paths as the real adapter. It is controlled ONLY in-process (tests, or scripts importing it): there is no
 * HTTP endpoint anywhere that can simulate a payment. It refuses to exist when NODE_ENV=production.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  readonly minAmountMinor = 100;

  readonly orders = new Map<string, ProviderOrder>();
  readonly payments = new Map<string, ProviderPaymentInfo>();
  createCalls = 0;
  private nextCreateFailure: MockCreateFailure | null = null;
  private readFailure = false;
  private hideFromReceiptLookup = false;

  constructor() {
    if (process.env.NODE_ENV === 'production') throw new Error('MockPaymentProvider cannot be instantiated in production');
  }

  // ----------------------------------------------------------- test controls
  failNextCreate(mode: MockCreateFailure | null): void {
    this.nextCreateFailure = mode;
  }
  setReadFailure(on: boolean): void {
    this.readFailure = on;
  }
  setReceiptLookupHidden(on: boolean): void {
    this.hideFromReceiptLookup = on;
  }
  reset(): void {
    this.orders.clear();
    this.payments.clear();
    this.createCalls = 0;
    this.nextCreateFailure = null;
    this.readFailure = false;
    this.hideFromReceiptLookup = false;
  }

  /** Simulate a customer payment attempt on a provider order. */
  simulatePayment(
    providerOrderId: string,
    opts: { status: ProviderPaymentStatus; providerPaymentId?: string; amountMinor?: number; currency?: string; method?: string; errorCode?: string } = { status: 'CAPTURED' }
  ): ProviderPaymentInfo {
    const order = this.orders.get(providerOrderId);
    const info: ProviderPaymentInfo = {
      providerPaymentId: opts.providerPaymentId ?? `pay_mock_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      providerOrderId,
      amountMinor: opts.amountMinor ?? order?.amountMinor ?? 0,
      currency: opts.currency ?? order?.currency ?? 'INR',
      status: opts.status,
      method: opts.method ?? 'upi',
      errorCode: opts.errorCode ?? null,
      errorReason: opts.errorCode ? 'mock failure' : null
    };
    this.payments.set(info.providerPaymentId, info);
    if (order && info.status === 'CAPTURED') this.orders.set(providerOrderId, { ...order, status: 'paid' });
    else if (order && order.status === 'created') this.orders.set(providerOrderId, { ...order, status: 'attempted' });
    return info;
  }

  signCheckout(providerOrderId: string, providerPaymentId: string): string {
    return hmacSha256Hex(MOCK_KEY_SECRET, `${providerOrderId}|${providerPaymentId}`);
  }

  /** Build a correctly signed webhook delivery (Razorpay-format body). */
  buildWebhook(eventType: string, payment: ProviderPaymentInfo | null, opts: { eventId?: string; extra?: Record<string, unknown> } = {}): { raw: Buffer; headers: Record<string, string> } {
    const payload: Record<string, unknown> = {};
    if (payment) {
      payload.payment = {
        entity: {
          id: payment.providerPaymentId,
          entity: 'payment',
          order_id: payment.providerOrderId,
          amount: payment.amountMinor,
          currency: payment.currency,
          status: payment.status.toLowerCase(),
          method: payment.method,
          error_code: payment.errorCode,
          error_description: payment.errorReason
        }
      };
    }
    const body = { entity: 'event', account_id: 'acc_mock', event: eventType, contains: Object.keys(payload), payload: { ...payload, ...(opts.extra ?? {}) }, created_at: Math.floor(Date.now() / 1000) };
    const raw = Buffer.from(JSON.stringify(body), 'utf8');
    return { raw, headers: { 'x-razorpay-signature': this.signWebhook(raw), 'x-razorpay-event-id': opts.eventId ?? `evt_mock_${randomUUID().replace(/-/g, '').slice(0, 16)}`, 'content-type': 'application/json' } };
  }

  signWebhook(raw: Buffer): string {
    return hmacSha256Hex(MOCK_WEBHOOK_SECRET, raw);
  }

  // ----------------------------------------------------------- PaymentProvider
  private assertReadable(): void {
    if (this.readFailure) throw new ProviderUnknownError('MOCK_READ_FAILURE');
  }

  async createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder> {
    this.createCalls++;
    const failure = this.nextCreateFailure;
    this.nextCreateFailure = null;
    if (failure === 'definite') throw new ProviderDefiniteError('BAD_REQUEST_ERROR');
    if (failure === 'unknown') throw new ProviderUnknownError('PROVIDER_TIMEOUT');
    const order: ProviderOrder = {
      providerOrderId: `order_mock_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      amountMinor: input.amountMinor,
      currency: input.currency,
      receipt: input.receipt,
      notes: { ...input.notes },
      status: 'created'
    };
    this.orders.set(order.providerOrderId, order);
    if (failure === 'unknown-after-create') throw new ProviderUnknownError('PROVIDER_TIMEOUT'); // created at the provider, answer lost
    return order;
  }

  async fetchOrder(providerOrderId: string): Promise<ProviderOrder | null> {
    this.assertReadable();
    return this.orders.get(providerOrderId) ?? null;
  }

  async findOrdersByReceipt(receipt: string): Promise<ProviderOrder[]> {
    this.assertReadable();
    if (this.hideFromReceiptLookup) return [];
    return [...this.orders.values()].filter((o) => (o.receipt ?? '').includes(receipt)); // "contains" semantics, like the documented filter
  }

  async listOrderPayments(providerOrderId: string): Promise<ProviderPaymentInfo[]> {
    this.assertReadable();
    return [...this.payments.values()].filter((p) => p.providerOrderId === providerOrderId);
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentInfo | null> {
    this.assertReadable();
    return this.payments.get(providerPaymentId) ?? null;
  }

  verifyCheckoutSignature(input: { providerOrderId: string; providerPaymentId: string; signature: string }): boolean {
    return verifyHmacSignature(MOCK_KEY_SECRET, `${input.providerOrderId}|${input.providerPaymentId}`, input.signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    return verifyHmacSignature(MOCK_WEBHOOK_SECRET, rawBody, signature);
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParsedWebhook | null {
    return parseRazorpayWebhook(rawBody, headers);
  }

  getPublicCheckoutConfig(): { keyId: string } {
    return { keyId: MOCK_KEY_ID };
  }
}

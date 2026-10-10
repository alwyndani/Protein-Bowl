import type { ProviderPaymentStatus } from './paymentStatus.js';

/** Provider order (a checkout "intent" at the provider). */
export interface ProviderOrder {
  providerOrderId: string;
  amountMinor: number;
  currency: string;
  receipt: string | null;
  notes: Record<string, string>;
  /** Provider order status as reported (Razorpay: created | attempted | paid). */
  status: string;
}

/** Normalized provider payment: only fields Protein Bowl may keep. No instrument details, no PII. */
export interface ProviderPaymentInfo {
  providerPaymentId: string;
  providerOrderId: string | null;
  amountMinor: number;
  currency: string;
  status: ProviderPaymentStatus;
  /** Instrument TYPE only (card, upi, netbanking, wallet). */
  method: string | null;
  errorCode: string | null;
  errorReason: string | null;
}

export type WebhookKind = 'PAYMENT' | 'REFUND' | 'OTHER';

/** Normalized, PII-free view of a verified webhook. The raw body is never kept. */
export interface ParsedWebhook {
  kind: WebhookKind;
  eventType: string;
  /** Provider event id (header) or null when the provider did not send one. */
  eventId: string | null;
  eventCreatedAt: Date | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  payment: ProviderPaymentInfo | null;
}

/** The provider definitively rejected the request: nothing was created. */
export class ProviderDefiniteError extends Error {
  constructor(public readonly code: string, message = 'Provider rejected the request') {
    super(message);
    this.name = 'ProviderDefiniteError';
  }
}

/** The outcome is not known (timeout, network, 5xx, unparseable answer...). The operation MAY have happened. */
export class ProviderUnknownError extends Error {
  constructor(public readonly code: string, message = 'Provider outcome unknown') {
    super(message);
    this.name = 'ProviderUnknownError';
  }
}

export interface CreateProviderOrderInput {
  receipt: string;
  amountMinor: number;
  currency: 'INR';
  notes: Record<string, string>;
}

/**
 * The only surface business logic uses to talk to a payment provider.
 * Create is NEVER retried automatically. Reads throw ProviderUnknownError on any uncertainty.
 */
export interface PaymentProvider {
  readonly name: 'razorpay' | 'mock';
  /** Smallest amount the provider accepts, in minor units. */
  readonly minAmountMinor: number;
  createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder>;
  /** null = the provider definitively says the order does not exist. */
  fetchOrder(providerOrderId: string): Promise<ProviderOrder | null>;
  /** Orders whose receipt contains the value (the CALLER must compare receipts exactly). */
  findOrdersByReceipt(receipt: string, fromEpochSeconds: number): Promise<ProviderOrder[]>;
  listOrderPayments(providerOrderId: string): Promise<ProviderPaymentInfo[]>;
  /** null = the provider definitively says the payment does not exist. */
  fetchPayment(providerPaymentId: string): Promise<ProviderPaymentInfo | null>;
  /** Constant-time check of the checkout result signature. */
  verifyCheckoutSignature(input: { providerOrderId: string; providerPaymentId: string; signature: string }): boolean;
  /** Constant-time check of the webhook signature over the RAW body. */
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
  /** Parse an ALREADY-VERIFIED webhook body. Returns null when it is not valid JSON of the expected shape. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParsedWebhook | null;
  /** Public (non-secret) data the client needs to open checkout. */
  getPublicCheckoutConfig(): { keyId: string };
}

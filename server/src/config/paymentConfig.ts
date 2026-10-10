import dotenv from 'dotenv';

// Make sure a local .env is loaded before the configuration is validated (does not override variables already set).
dotenv.config();

/**
 * Typed, validated payment configuration (P7B). Production FAILS CLOSED: the provider must be named explicitly, `mock`
 * is refused, and Razorpay credentials/webhook secret must be present. Nothing here is a secret default - secrets only
 * ever come from the environment and are never logged or returned by any API.
 */

export type PaymentProviderName = 'razorpay' | 'mock';

export interface PaymentConfig {
  readonly provider: PaymentProviderName;
  readonly razorpay: null | {
    readonly keyId: string;
    readonly keySecret: string;
    readonly webhookSecret: string;
    readonly previousWebhookSecret: string | null;
    readonly apiBase: string;
  };
  /** Application payment-session TTL. NOT the provider order expiry (Razorpay documents none). */
  readonly sessionTtlMs: number;
  /** An UNKNOWN provider-order creation younger than this is "in progress"; elapsing it NEVER proves the order unusable. */
  readonly unknownGraceMs: number;
  /** An UNKNOWN attempt older than this is flagged for operator review (it is still never auto-abandoned). */
  readonly unknownReviewMs: number;
  /** Old/superseded/expired sessions stay under reconciliation watch this long. */
  readonly oldOrderWatchMs: number;
  readonly retry: { readonly maxAttempts: number; readonly baseMs: number; readonly maxMs: number };
  readonly providerTimeoutMs: number;
  readonly leaseMs: number;
  readonly batchSize: number;
}

export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(`Invalid payment configuration: ${message}`);
    this.name = 'PaymentConfigError';
  }
}

type Raw = Record<string, string | undefined>;

const INT_RE = /^\d{1,9}$/;

function int(raw: Raw, key: string, fallback: number, min: number, max: number): number {
  const v = raw[key];
  if (v === undefined || v.trim() === '') return fallback;
  if (!INT_RE.test(v.trim())) throw new PaymentConfigError(`${key} must be a whole number (got "${v}")`);
  const n = Number(v.trim());
  if (n < min || n > max) throw new PaymentConfigError(`${key} must be between ${min} and ${max} (got ${n})`);
  return n;
}

function required(raw: Raw, key: string): string {
  const v = raw[key]?.trim();
  if (!v) throw new PaymentConfigError(`${key} must be set when PAYMENT_PROVIDER=razorpay`);
  return v;
}

/** Pure parser (tests pass their own raw object). */
export function parsePaymentConfig(raw: Raw, nodeEnv: string): PaymentConfig {
  const production = nodeEnv === 'production';
  const chosen = raw.PAYMENT_PROVIDER?.trim();

  if (!chosen && production) {
    throw new PaymentConfigError("PAYMENT_PROVIDER must be set explicitly in production (supported: 'razorpay')");
  }
  const provider = (chosen || 'mock') as string;
  if (provider !== 'razorpay' && provider !== 'mock') {
    throw new PaymentConfigError(`PAYMENT_PROVIDER "${provider}" is not supported (supported: razorpay, mock)`);
  }
  if (provider === 'mock' && production) {
    throw new PaymentConfigError('PAYMENT_PROVIDER=mock is refused in production: the mock provider can never be enabled there');
  }

  let razorpay: PaymentConfig['razorpay'] = null;
  if (provider === 'razorpay') {
    const apiBase = (raw.RAZORPAY_API_BASE?.trim() || 'https://api.razorpay.com/v1').replace(/\/+$/, '');
    let url: URL;
    try {
      url = new URL(apiBase);
    } catch {
      throw new PaymentConfigError('RAZORPAY_API_BASE must be a valid URL');
    }
    if (production && (url.protocol !== 'https:' || url.origin !== 'https://api.razorpay.com')) {
      throw new PaymentConfigError('RAZORPAY_API_BASE may not be overridden in production (must be https://api.razorpay.com/v1)');
    }
    razorpay = Object.freeze({
      keyId: required(raw, 'RAZORPAY_KEY_ID'),
      keySecret: required(raw, 'RAZORPAY_KEY_SECRET'),
      webhookSecret: required(raw, 'RAZORPAY_WEBHOOK_SECRET'),
      previousWebhookSecret: raw.RAZORPAY_WEBHOOK_SECRET_PREVIOUS?.trim() || null,
      apiBase
    });
  }

  const baseSeconds = int(raw, 'PAYMENT_RETRY_BASE_SECONDS', 30, 1, 3600);
  const maxSeconds = int(raw, 'PAYMENT_RETRY_MAX_SECONDS', 3600, 1, 7 * 86400);
  if (maxSeconds < baseSeconds) throw new PaymentConfigError('PAYMENT_RETRY_MAX_SECONDS must not be smaller than PAYMENT_RETRY_BASE_SECONDS');

  return Object.freeze({
    provider,
    razorpay,
    sessionTtlMs: int(raw, 'PAYMENT_SESSION_TTL_MINUTES', 15, 1, 24 * 60) * 60_000,
    unknownGraceMs: int(raw, 'PAYMENT_UNKNOWN_GRACE_SECONDS', 120, 1, 86400) * 1000,
    unknownReviewMs: int(raw, 'PAYMENT_UNKNOWN_REVIEW_MINUTES', 30, 1, 7 * 24 * 60) * 60_000,
    oldOrderWatchMs: int(raw, 'PAYMENT_OLD_ORDER_WATCH_DAYS', 7, 1, 90) * 86_400_000,
    retry: Object.freeze({ maxAttempts: int(raw, 'PAYMENT_RETRY_MAX_ATTEMPTS', 12, 1, 100), baseMs: baseSeconds * 1000, maxMs: maxSeconds * 1000 }),
    providerTimeoutMs: int(raw, 'PAYMENT_PROVIDER_TIMEOUT_MS', 8000, 500, 60_000),
    leaseMs: int(raw, 'PAYMENT_RECONCILE_LEASE_SECONDS', 120, 5, 3600) * 1000,
    batchSize: int(raw, 'PAYMENT_RECONCILE_BATCH_SIZE', 25, 1, 200)
  }) as PaymentConfig;
}

// Validated at import time so an invalid/incomplete production configuration fails the process at startup.
let active: PaymentConfig = parsePaymentConfig(process.env, process.env.NODE_ENV ?? 'development');

export function getPaymentConfig(): PaymentConfig {
  return active;
}

/** Test seam. Refused in production so configuration can never be swapped at runtime there. */
export function setPaymentConfigForTests(config: PaymentConfig): void {
  if (process.env.NODE_ENV === 'production') throw new Error('Payment configuration cannot be replaced in production');
  active = config;
}

export function resetPaymentConfig(): void {
  if (process.env.NODE_ENV === 'production') throw new Error('Payment configuration cannot be replaced in production');
  active = parsePaymentConfig(process.env, process.env.NODE_ENV ?? 'development');
}

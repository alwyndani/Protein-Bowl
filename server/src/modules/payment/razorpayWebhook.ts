import { z } from 'zod';
import type { ParsedWebhook, ProviderPaymentInfo } from './provider.types.js';
import type { ProviderPaymentStatus } from './paymentStatus.js';

/**
 * Parser for Razorpay-format webhook bodies (envelope: entity, account_id, event, contains, payload, created_at).
 * Used by the Razorpay provider AND the mock provider so both exercise the same normalization.
 * Only the minimum safe fields are extracted: no email/contact/vpa/card/bank/wallet, no raw payload is returned.
 */

const STATUS_MAP: Record<string, ProviderPaymentStatus> = {
  created: 'CREATED',
  authorized: 'AUTHORIZED',
  captured: 'CAPTURED',
  failed: 'FAILED',
  refunded: 'REFUNDED'
};

export function mapProviderPaymentStatus(raw: string): ProviderPaymentStatus | null {
  return STATUS_MAP[raw.toLowerCase()] ?? null;
}

const safeShort = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);

export const razorpayPaymentEntitySchema = z
  .object({
    id: z.string().min(1).max(64),
    order_id: z.string().max(64).nullable().optional(),
    amount: z.number().int().nonnegative(),
    currency: z.string().min(3).max(3),
    status: z.string().min(1).max(32),
    method: z.string().max(32).nullable().optional(),
    error_code: z.string().max(100).nullable().optional(),
    error_description: z.string().max(1000).nullable().optional()
  })
  .passthrough();

/** Normalize a Razorpay payment entity (webhook payload OR API response). null when the status is not a known one. */
export function normalizeRazorpayPayment(entity: unknown): ProviderPaymentInfo | null {
  const parsed = razorpayPaymentEntitySchema.safeParse(entity);
  if (!parsed.success) return null;
  const p = parsed.data;
  const status = mapProviderPaymentStatus(p.status);
  if (!status) return null;
  return {
    providerPaymentId: p.id,
    providerOrderId: p.order_id ?? null,
    amountMinor: p.amount,
    currency: p.currency.toUpperCase(),
    status,
    method: safeShort(p.method, 32),
    errorCode: safeShort(p.error_code, 100),
    errorReason: safeShort(p.error_description, 200)
  };
}

const envelopeSchema = z
  .object({
    event: z.string().min(1).max(100),
    created_at: z.number().int().nonnegative().optional(),
    payload: z.record(z.string(), z.any()).optional()
  })
  .passthrough();

/** Ids of a payment entity even when its status is not one we recognise (so the worker can ask the provider for the truth). */
function peekIds(entity: unknown): { paymentId: string | null; orderId: string | null } {
  const e = (entity ?? {}) as { id?: unknown; order_id?: unknown };
  return { paymentId: typeof e.id === 'string' ? e.id.slice(0, 64) : null, orderId: typeof e.order_id === 'string' ? e.order_id.slice(0, 64) : null };
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const v = headers[name];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim().length > 0 ? s.trim().slice(0, 128) : null;
}

export function parseRazorpayWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParsedWebhook | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }
  const env = envelopeSchema.safeParse(json);
  if (!env.success) return null;

  const eventType = env.data.event;
  const base = {
    eventType,
    eventId: header(headers, 'x-razorpay-event-id'),
    eventCreatedAt: env.data.created_at ? new Date(env.data.created_at * 1000) : null
  };
  const payload = env.data.payload ?? {};

  if (eventType.startsWith('payment.') && !eventType.startsWith('payment.downtime')) {
    const entity = (payload.payment as { entity?: unknown } | undefined)?.entity;
    const payment = normalizeRazorpayPayment(entity);
    const ids = peekIds(entity);
    return { ...base, kind: 'PAYMENT', providerOrderId: payment?.providerOrderId ?? ids.orderId, providerPaymentId: payment?.providerPaymentId ?? ids.paymentId, payment };
  }
  if (eventType === 'order.paid') {
    const entity = (payload.payment as { entity?: unknown } | undefined)?.entity;
    const payment = normalizeRazorpayPayment(entity);
    const orderEntity = (payload.order as { entity?: { id?: unknown } } | undefined)?.entity;
    const orderId = typeof orderEntity?.id === 'string' ? orderEntity.id.slice(0, 64) : payment?.providerOrderId ?? peekIds(entity).orderId;
    return { ...base, kind: 'PAYMENT', providerOrderId: orderId, providerPaymentId: payment?.providerPaymentId ?? peekIds(entity).paymentId, payment };
  }
  if (eventType.startsWith('refund.')) {
    const refund = (payload.refund as { entity?: { payment_id?: unknown } } | undefined)?.entity;
    const paymentId = typeof refund?.payment_id === 'string' ? refund.payment_id.slice(0, 64) : null;
    return { ...base, kind: 'REFUND', providerOrderId: null, providerPaymentId: paymentId, payment: null };
  }
  return { ...base, kind: 'OTHER', providerOrderId: null, providerPaymentId: null, payment: null };
}

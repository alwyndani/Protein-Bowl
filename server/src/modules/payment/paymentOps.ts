import { Prisma } from '@prisma/client';
import { getPaymentConfig } from '../../config/paymentConfig.js';

export type Tx = Prisma.TransactionClient;

/**
 * Fixed lock order used EVERYWHERE payment state changes (prevents deadlocks): Order -> Payment session -> ProviderPayment.
 */
export async function lockOrder(tx: Tx, orderId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`;
}

export async function lockSession(tx: Tx, paymentId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${paymentId} FOR UPDATE`;
}

export async function lockProviderPayment(tx: Tx, provider: string, providerPaymentId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "provider_payments" WHERE "provider" = ${provider} AND "providerPaymentId" = ${providerPaymentId} FOR UPDATE`;
}

/** Short, safe error code for persistence/audit: never a provider message, never a stack. */
export function safeCode(value: unknown, fallback = 'ERROR'): string {
  const code = (value as { code?: unknown } | undefined)?.code;
  const text = typeof code === 'string' ? code : typeof value === 'string' ? value : fallback;
  return text.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 60) || fallback;
}

/**
 * Exponential backoff with full jitter, bounded: min(max, base * 2^attempt) scaled into [50%, 100%].
 * `random` is injectable so tests are deterministic.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const { baseMs, maxMs } = getPaymentConfig().retry;
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, Math.min(attempt, 30)));
  return Math.round(exp * (0.5 + random() * 0.5));
}

/**
 * Structured operational alert (ids/codes only - never secrets, signatures or provider payloads). The reconciliation CLI
 * and the review flags in the database are the durable alerting surface; this line is for log shippers.
 */
export function paymentAlert(event: string, fields: Record<string, string | number | null | undefined>): void {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'alert', area: 'payments', event, ...fields }));
}

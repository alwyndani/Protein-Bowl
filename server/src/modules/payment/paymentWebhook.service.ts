import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { getPaymentConfig } from '../../config/paymentConfig.js';
import { AppError } from '../../middleware/error.middleware.js';
import { adoptProviderOrder } from './paymentRecovery.ops.js';
import { PaymentSettlementService } from './paymentSettlement.service.js';
import { backoffMs, paymentAlert, safeCode } from './paymentOps.js';
import { EVENT_STATUS, ProviderPaymentStatus } from './paymentStatus.js';
import { getPaymentProvider } from './providerRegistry.js';
import { ParsedWebhook, PaymentProvider, ProviderPaymentInfo, ProviderUnknownError, WebhookKind } from './provider.types.js';

/** What is persisted about a delivery: normalized, PII-free. NEVER the raw body or the provider payload. */
interface NormalizedEvent {
  kind: WebhookKind;
  eventType: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  status: ProviderPaymentStatus | null;
  amountMinor: number | null;
  currency: string | null;
  method: string | null;
  errorCode: string | null;
  errorReason: string | null;
}

export interface IngestResult {
  httpStatus: 200 | 400 | 500;
  error?: 'INVALID_SIGNATURE' | 'INVALID_PAYLOAD' | 'INGEST_FAILED';
  duplicate?: boolean;
}

export type ProcessOutcome = 'PROCESSED' | 'IGNORED' | 'RETRY_PENDING' | 'FAILED' | 'NOT_CLAIMED';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toNormalized(parsed: ParsedWebhook): NormalizedEvent {
  const p = parsed.payment;
  return {
    kind: parsed.kind,
    eventType: parsed.eventType.slice(0, 100),
    providerOrderId: parsed.providerOrderId,
    providerPaymentId: parsed.providerPaymentId,
    status: p?.status ?? null,
    amountMinor: p?.amountMinor ?? null,
    currency: p?.currency ?? null,
    method: p?.method ?? null,
    errorCode: p?.errorCode ?? null,
    errorReason: p?.errorReason ?? null
  };
}

function infoFromNormalized(n: NormalizedEvent): ProviderPaymentInfo | null {
  if (!n.providerPaymentId || !n.status || n.amountMinor === null || !n.currency) return null;
  return {
    providerPaymentId: n.providerPaymentId,
    providerOrderId: n.providerOrderId,
    amountMinor: n.amountMinor,
    currency: n.currency,
    status: n.status,
    method: n.method,
    errorCode: n.errorCode,
    errorReason: n.errorReason
  };
}

export class PaymentWebhookService {
  // ================================================================================================ ingestion (HTTP)
  /**
   * 1. verify the signature over the RAW body (before trusting anything, before touching the database);
   * 2. normalize; 3. durably persist (the acknowledgement point); 4. best-effort inline processing (DB only).
   * A failure to persist returns 500 so the provider retries; once persisted we return 200 and the worker owns recovery.
   */
  public static async ingest(rawBody: unknown, headers: Record<string, string | string[] | undefined>): Promise<IngestResult> {
    const provider = getPaymentProvider();
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return { httpStatus: 400, error: 'INVALID_PAYLOAD' };
    const signature = Array.isArray(headers['x-razorpay-signature']) ? headers['x-razorpay-signature'][0] : headers['x-razorpay-signature'];
    if (!provider.verifyWebhookSignature(rawBody, signature)) return { httpStatus: 400, error: 'INVALID_SIGNATURE' };

    const parsed = provider.parseWebhook(rawBody, headers);
    if (!parsed) return { httpStatus: 400, error: 'INVALID_PAYLOAD' };

    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    // Prefer the verified provider event id; the body hash is the deterministic fallback (an identical redelivery hashes identically).
    const eventId = parsed.eventId ?? `sha256:${payloadHash}`;

    let eventRowId: string;
    try {
      const row = await prisma.paymentWebhookEvent.create({
        data: {
          provider: provider.name,
          eventId,
          eventType: parsed.eventType.slice(0, 100),
          eventCreatedAt: parsed.eventCreatedAt,
          payloadHash,
          providerOrderId: parsed.providerOrderId,
          providerPaymentId: parsed.providerPaymentId,
          normalized: toNormalized(parsed) as unknown as Prisma.InputJsonValue,
          status: EVENT_STATUS.RECEIVED,
          nextAttemptAt: new Date()
        },
        select: { id: true }
      });
      eventRowId = row.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { httpStatus: 200, duplicate: true }; // harmless redelivery
      return { httpStatus: 500, error: 'INGEST_FAILED' };
    }

    try {
      await this.processEvent(eventRowId, { workerId: 'inline', allowProviderCalls: false });
    } catch {
      /* the event is durable: the reconciliation worker will pick it up */
    }
    return { httpStatus: 200 };
  }

  // ================================================================================================ processing (inline + worker)
  /** Claim (lease) then process one event. Idempotent: a PROCESSED/IGNORED/FAILED event is never touched. */
  public static async processEvent(eventRowId: string, opts: { workerId: string; allowProviderCalls: boolean }): Promise<ProcessOutcome> {
    const cfg = getPaymentConfig();
    const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "payment_webhook_events"
      SET "lockedUntil" = (now() AT TIME ZONE 'UTC') + (${cfg.leaseMs} * interval '1 millisecond'), "lockedBy" = ${opts.workerId}
      WHERE "id" = ${eventRowId} AND "status" IN ('RECEIVED', 'RETRY_PENDING') AND ("lockedUntil" IS NULL OR "lockedUntil" < (now() AT TIME ZONE 'UTC'))
      RETURNING "id"`;
    if (claimed.length === 0) return 'NOT_CLAIMED';
    return await this.processClaimed(eventRowId, opts);
  }

  /** Process an event whose lease the caller already holds (used by the reconciliation worker after its SKIP LOCKED claim). */
  public static async processClaimed(eventRowId: string, opts: { workerId: string; allowProviderCalls: boolean }): Promise<ProcessOutcome> {
    const event = await prisma.paymentWebhookEvent.findUnique({ where: { id: eventRowId } });
    if (!event || (event.status !== EVENT_STATUS.RECEIVED && event.status !== EVENT_STATUS.RETRY_PENDING)) return 'NOT_CLAIMED';
    const n = (event.normalized ?? {}) as unknown as NormalizedEvent;
    const provider = getPaymentProvider();

    const finish = async (status: 'PROCESSED' | 'IGNORED' | 'FAILED', extra: { ignoredReason?: string; lastError?: string } = {}): Promise<ProcessOutcome> => {
      await prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { status, processedAt: new Date(), lockedUntil: null, lockedBy: null, ignoredReason: extra.ignoredReason ?? null, lastError: extra.lastError ?? null, nextAttemptAt: null }
      });
      if (status === 'FAILED') paymentAlert('webhook.event_failed', { eventRowId: event.id, eventType: event.eventType, reason: extra.lastError ?? null });
      return status;
    };
    const retry = async (reason: string): Promise<ProcessOutcome> => {
      const attempts = event.attemptCount + 1;
      if (attempts >= getPaymentConfig().retry.maxAttempts) return await finish('FAILED', { lastError: `RETRIES_EXHAUSTED:${reason}`.slice(0, 120) });
      await prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { status: EVENT_STATUS.RETRY_PENDING, attemptCount: attempts, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)), lastError: reason.slice(0, 120), lockedUntil: null, lockedBy: null }
      });
      return 'RETRY_PENDING';
    };

    try {
      if (n.kind === 'REFUND') return await finish('IGNORED', { ignoredReason: 'DEFERRED_P7C' }); // refunds are recovered from the provider in P7C
      if (n.kind !== 'PAYMENT') return await finish('IGNORED', { ignoredReason: 'UNSUPPORTED_EVENT_TYPE' });

      let info = infoFromNormalized(n);
      let providerOrderId = n.providerOrderId;
      if (!info || !providerOrderId) {
        // Unrecognised payment status or missing ids: ask the provider for the truth (worker only).
        if (!opts.allowProviderCalls || !n.providerPaymentId) return await retry('NEEDS_PROVIDER_LOOKUP');
        const fetched = await provider.fetchPayment(n.providerPaymentId);
        if (!fetched || !fetched.providerOrderId) return await retry('PAYMENT_NOT_VISIBLE_AT_PROVIDER');
        info = fetched;
        providerOrderId = fetched.providerOrderId;
      }

      let session = await prisma.payment.findFirst({ where: { provider: provider.name, providerOrderId }, select: { id: true } });
      if (!session) {
        if (!opts.allowProviderCalls) return await retry('UNMATCHED_PROVIDER_ORDER');
        const resolved = await this.resolveUnmatched(provider, providerOrderId, event.id);
        if (resolved.kind === 'RETRY') return await retry(resolved.reason);
        if (resolved.kind === 'IGNORE') return await finish('IGNORED', { ignoredReason: 'UNRELATED_PROVIDER_ORDER' });
        if (resolved.kind === 'FAIL') return await finish('FAILED', { lastError: resolved.reason });
        session = { id: resolved.sessionId };
      }

      const sessionId = session.id;
      const effectiveInfo = info;
      const result = await prisma.$transaction(
        async (tx) => {
          const r = await PaymentSettlementService.settle({ paymentId: sessionId, payment: effectiveInfo, provider: provider.name, via: 'WEBHOOK' }, tx);
          await tx.paymentWebhookEvent.update({
            where: { id: event.id },
            data: { status: EVENT_STATUS.PROCESSED, processedAt: new Date(), lockedUntil: null, lockedBy: null, lastError: null, ignoredReason: null, nextAttemptAt: null }
          });
          return r;
        },
        { maxWait: 10000, timeout: 20000 }
      );
      PaymentSettlementService.alertIfFlagged(result, { paymentId: sessionId });
      return 'PROCESSED';
    } catch (err) {
      if (err instanceof AppError && err.errorCode === 'PAYMENT_ORDER_MISMATCH') return await finish('FAILED', { lastError: 'PAYMENT_ORDER_MISMATCH' }); // deterministic anomaly: a human must look
      if (err instanceof ProviderUnknownError) return await retry(safeCode(err));
      return await retry(safeCode(err, 'PROCESSING_ERROR'));
    }
  }

  /**
   * An event whose provider order matches no local session. It may be OURS (the local write of the provider order id has not
   * happened yet) or belong to something else on the same provider account. Ask the provider; ignore ONLY when definitively unrelated.
   */
  private static async resolveUnmatched(provider: PaymentProvider, providerOrderId: string, eventRowId: string): Promise<
    { kind: 'ADOPTED'; sessionId: string } | { kind: 'RETRY'; reason: string } | { kind: 'IGNORE' } | { kind: 'FAIL'; reason: string }
  > {
    let order;
    try {
      order = await provider.fetchOrder(providerOrderId);
    } catch (err) {
      if (err instanceof ProviderUnknownError) return { kind: 'RETRY', reason: safeCode(err) };
      throw err;
    }
    if (!order) return { kind: 'RETRY', reason: 'PROVIDER_ORDER_NOT_VISIBLE' };

    const ours = order.notes.source === 'protein-bowl' || (order.receipt !== null && UUID_RE.test(order.receipt));
    if (!ours) return { kind: 'IGNORE' };
    if (!order.receipt || !UUID_RE.test(order.receipt)) return { kind: 'FAIL', reason: 'OURS_WITHOUT_VALID_RECEIPT' };

    const session = await prisma.payment.findUnique({ where: { id: order.receipt }, select: { id: true, providerOrderId: true } });
    if (!session) {
      paymentAlert('webhook.unknown_intent', { eventRowId, providerOrderId });
      return { kind: 'FAIL', reason: 'OURS_BUT_NO_LOCAL_INTENT' };
    }
    if (session.providerOrderId === providerOrderId) return { kind: 'ADOPTED', sessionId: session.id };
    const adopt = await adoptProviderOrder(session.id, order, provider.name, { auditAction: 'PAYMENT_ATTEMPT_RECOVERED', reason: 'webhook-before-persistence' });
    if (adopt.adopted || (!adopt.adopted && adopt.reason === 'ALREADY_SET')) {
      const fresh = await prisma.payment.findUnique({ where: { id: session.id }, select: { providerOrderId: true } });
      if (fresh?.providerOrderId === providerOrderId) return { kind: 'ADOPTED', sessionId: session.id };
    }
    return { kind: 'FAIL', reason: adopt.adopted ? 'ADOPT_INCONSISTENT' : `ADOPT_${adopt.reason}` };
  }
}

import { Payment, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { getPaymentConfig } from '../../config/paymentConfig.js';
import { toMinorUnits } from './money.js';
import { adoptProviderOrder, lookupProviderOrderByReceipt } from './paymentRecovery.ops.js';
import { PaymentSettlementService } from './paymentSettlement.service.js';
import { backoffMs, paymentAlert, safeCode } from './paymentOps.js';
import { FLAGGED_RECON, SESSION_STATUS } from './paymentStatus.js';
import { getPaymentProvider } from './providerRegistry.js';
import { PaymentProvider, ProviderUnknownError } from './provider.types.js';
import { PaymentWebhookService } from './paymentWebhook.service.js';

export interface ReconcileStats {
  workerId: string;
  eventsClaimed: number;
  eventsProcessed: number;
  eventsRetried: number;
  eventsFailed: number;
  eventsIgnored: number;
  sessionsClaimed: number;
  sessionsAdopted: number;
  sessionsSettled: number;
  sessionsExpired: number;
  sessionsUnknownStillOpen: number;
  providerErrors: number;
  ledgerApplied: number;
}

export interface ReviewReport {
  failedEvents: number;
  retryPendingEvents: number;
  flaggedSessions: number;
  flaggedLedgerRows: number;
  unknownSessions: number;
  total: number;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

export class PaymentReconciliationService {
  // ================================================================================================ claiming (multi-instance safe)
  /**
   * Claim due webhook events with `FOR UPDATE SKIP LOCKED` + a lease. Two workers never receive the same row; a crashed
   * worker's lease simply expires. `db` may be a transaction (tests hold one open to prove SKIP LOCKED semantics).
   */
  public static async claimEvents(db: DbClient, workerId: string, limit: number): Promise<string[]> {
    const leaseMs = getPaymentConfig().leaseMs;
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      WITH picked AS (
        SELECT "id" FROM "payment_webhook_events"
        WHERE (
                ("status" = 'RETRY_PENDING' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= (now() AT TIME ZONE 'UTC')))
             OR ("status" = 'RECEIVED' AND "receivedAt" < (now() AT TIME ZONE 'UTC') - interval '60 seconds')
              )
          AND ("lockedUntil" IS NULL OR "lockedUntil" < (now() AT TIME ZONE 'UTC'))
        ORDER BY COALESCE("nextAttemptAt", "receivedAt") ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "payment_webhook_events" e
      SET "lockedUntil" = (now() AT TIME ZONE 'UTC') + (${leaseMs} * interval '1 millisecond'), "lockedBy" = ${workerId}
      FROM picked WHERE e."id" = picked."id"
      RETURNING e."id"`;
    return rows.map((r) => r.id);
  }

  public static async claimSessions(db: DbClient, workerId: string, limit: number): Promise<string[]> {
    const leaseMs = getPaymentConfig().leaseMs;
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      WITH picked AS (
        SELECT "id" FROM "payments"
        WHERE "status" IN ('CREATED', 'UNKNOWN', 'PENDING', 'EXPIRED')
          AND "provider" IS NOT NULL
          AND "nextAttemptAt" IS NOT NULL AND "nextAttemptAt" <= (now() AT TIME ZONE 'UTC')
          AND ("lockedUntil" IS NULL OR "lockedUntil" < (now() AT TIME ZONE 'UTC'))
        ORDER BY "nextAttemptAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "payments" p
      SET "lockedUntil" = (now() AT TIME ZONE 'UTC') + (${leaseMs} * interval '1 millisecond'), "lockedBy" = ${workerId}
      FROM picked WHERE p."id" = picked."id"
      RETURNING p."id"`;
    return rows.map((r) => r.id);
  }

  // ================================================================================================ one pass
  /** Scheduler-ready: one bounded pass. Safe to run concurrently from many instances and to repeat at any time. */
  public static async runOnce(opts: { workerId?: string; limit?: number } = {}): Promise<ReconcileStats> {
    const cfg = getPaymentConfig();
    const workerId = opts.workerId ?? `worker-${process.pid}`;
    const limit = Math.min(opts.limit ?? cfg.batchSize, cfg.batchSize);
    const provider = getPaymentProvider();
    const stats: ReconcileStats = {
      workerId,
      eventsClaimed: 0,
      eventsProcessed: 0,
      eventsRetried: 0,
      eventsFailed: 0,
      eventsIgnored: 0,
      sessionsClaimed: 0,
      sessionsAdopted: 0,
      sessionsSettled: 0,
      sessionsExpired: 0,
      sessionsUnknownStillOpen: 0,
      providerErrors: 0,
      ledgerApplied: 0
    };

    // 1) webhook events (retry-pending, or received but never finished)
    const eventIds = await this.claimEvents(prisma, workerId, limit);
    stats.eventsClaimed = eventIds.length;
    for (const id of eventIds) {
      const outcome = await PaymentWebhookService.processClaimed(id, { workerId, allowProviderCalls: true });
      if (outcome === 'PROCESSED') stats.eventsProcessed++;
      else if (outcome === 'RETRY_PENDING') stats.eventsRetried++;
      else if (outcome === 'FAILED') stats.eventsFailed++;
      else if (outcome === 'IGNORED') stats.eventsIgnored++;
    }

    // 2) payment sessions (stale CREATED, UNKNOWN, expired/stale PENDING, watched EXPIRED)
    const sessionIds = await this.claimSessions(prisma, workerId, limit);
    stats.sessionsClaimed = sessionIds.length;
    for (const id of sessionIds) await this.reconcileSession(id, provider, stats);

    // 3) captured ledger rows that were never applied (an earlier apply failed): decide them from stored evidence, no provider call
    const pending = await prisma.providerPayment.findMany({ where: { providerStatus: 'CAPTURED', reconciliationStatus: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: limit });
    for (const row of pending) {
      try {
        const res = await PaymentSettlementService.settle({
          paymentId: row.paymentId,
          provider: row.provider,
          via: 'RECONCILIATION',
          payment: {
            providerPaymentId: row.providerPaymentId,
            providerOrderId: row.providerOrderId,
            amountMinor: toMinorUnits(row.amount),
            currency: row.currency,
            status: 'CAPTURED',
            method: row.method,
            errorCode: null,
            errorReason: null
          }
        });
        if (res.outcome === 'APPLIED') stats.ledgerApplied++;
      } catch {
        stats.providerErrors++;
      }
    }
    return stats;
  }

  // ================================================================================================ one session
  private static async releaseAndSchedule(session: Payment, data: Prisma.PaymentUpdateInput, delayMs: number | null): Promise<void> {
    await prisma.payment.update({
      where: { id: session.id },
      data: { ...data, lockedUntil: null, lockedBy: null, nextAttemptAt: delayMs === null ? null : new Date(Date.now() + delayMs) }
    });
  }

  private static async reconcileSession(sessionId: string, provider: PaymentProvider, stats: ReconcileStats): Promise<void> {
    const cfg = getPaymentConfig();
    const session = await prisma.payment.findUnique({ where: { id: sessionId } });
    if (!session) return;
    const attempt = session.attemptCount + 1;
    const ageMs = Date.now() - session.createdAt.getTime();
    const withinWatch = ageMs <= cfg.oldOrderWatchMs;

    try {
      // ---- provider order not known locally yet: CREATED / UNKNOWN
      if (!session.providerOrderId) {
        if (session.status === SESSION_STATUS.CREATED && ageMs < cfg.unknownGraceMs) {
          await this.releaseAndSchedule(session, {}, cfg.unknownGraceMs - ageMs + 1000); // may still be mid-call: look again after the grace
          return;
        }
        const lookup = await lookupProviderOrderByReceipt(provider, session);
        if (lookup.kind === 'FOUND') {
          const res = await adoptProviderOrder(session.id, lookup.order, provider.name, { auditAction: 'PAYMENT_ATTEMPT_RECOVERED', reason: 'reconciliation' });
          if (res.adopted) stats.sessionsAdopted++;
          await prisma.payment.update({ where: { id: session.id }, data: { lockedUntil: null, lockedBy: null, nextAttemptAt: new Date(Date.now() + 1000) } });
          return;
        }
        // NONE proves nothing and AMBIGUOUS needs a human: stay UNKNOWN (never FAILED, never replaced).
        stats.sessionsUnknownStillOpen++;
        const review = ageMs >= cfg.unknownReviewMs || lookup.kind === 'AMBIGUOUS';
        const flag = lookup.kind === 'AMBIGUOUS' ? 'AMBIGUOUS_PROVIDER_LOOKUP' : 'UNKNOWN_OUTCOME_UNRESOLVED';
        if (review && session.reviewFlag !== flag) paymentAlert('session.unknown_unresolved', { paymentId: session.id, flag });
        await this.releaseAndSchedule(
          session,
          { status: SESSION_STATUS.UNKNOWN, attemptCount: attempt, lastError: lookup.kind === 'NONE' ? 'AWAITING_PROVIDER_LOOKUP' : 'AMBIGUOUS_PROVIDER_LOOKUP', ...(review ? { reviewFlag: flag } : {}) },
          backoffMs(attempt)
        );
        return;
      }

      // ---- provider order known: pull its payments and converge each into the ledger (idempotent settle)
      const payments = await provider.listOrderPayments(session.providerOrderId);
      let settledNow = false;
      for (const p of payments) {
        if (p.providerOrderId !== session.providerOrderId) continue;
        const res = await PaymentSettlementService.settle({ paymentId: session.id, payment: p, provider: provider.name, via: 'RECONCILIATION' });
        if (res.outcome === 'APPLIED') settledNow = true;
      }
      if (settledNow) stats.sessionsSettled++;

      const fresh = await prisma.payment.findUnique({ where: { id: session.id } });
      if (!fresh) return;
      if (fresh.status === SESSION_STATUS.SUCCESS) {
        await this.releaseAndSchedule(fresh, {}, null);
        return;
      }
      let status = fresh.status;
      if (status === SESSION_STATUS.PENDING && fresh.expiresAt && fresh.expiresAt <= new Date()) {
        status = SESSION_STATUS.EXPIRED; // application TTL only; the provider order is NOT assumed to be closed
        stats.sessionsExpired++;
      }
      // keep watching old/expired sessions for the configured window (late captures are still ledgered), then stop
      const delay = withinWatch ? Math.max(backoffMs(attempt), cfg.retry.baseMs) : null;
      // AUTHORIZED but never CAPTURED: almost always an account capture-mode misconfiguration (auto-capture is a deployment prerequisite). Never PAID; surfaced for operators.
      const stuckAuthorized = payments.some((p) => p.providerOrderId === session.providerOrderId && p.status === 'AUTHORIZED') && ageMs >= cfg.unknownReviewMs;
      if (stuckAuthorized && fresh.reviewFlag !== 'AUTHORIZED_NOT_CAPTURED') paymentAlert('session.authorized_not_captured', { paymentId: session.id, orderId: session.orderId });
      await this.releaseAndSchedule(fresh, { status, attemptCount: attempt, lastError: null, ...(stuckAuthorized ? { reviewFlag: 'AUTHORIZED_NOT_CAPTURED' } : {}) }, delay);
    } catch (err) {
      stats.providerErrors++;
      const transient = err instanceof ProviderUnknownError;
      await prisma.payment
        .update({
          where: { id: session.id },
          data: { attemptCount: attempt, lastError: safeCode(err, transient ? 'PROVIDER_UNAVAILABLE' : 'RECONCILE_ERROR'), lockedUntil: null, lockedBy: null, nextAttemptAt: new Date(Date.now() + backoffMs(attempt)) }
        })
        .catch(() => undefined);
    }
  }

  // ================================================================================================ reporting
  public static async reviewReport(): Promise<ReviewReport> {
    const [failedEvents, retryPendingEvents, flaggedSessions, flaggedLedgerRows, unknownSessions] = await Promise.all([
      prisma.paymentWebhookEvent.count({ where: { status: 'FAILED' } }),
      prisma.paymentWebhookEvent.count({ where: { status: 'RETRY_PENDING' } }),
      prisma.payment.count({ where: { reviewFlag: { not: null } } }),
      prisma.providerPayment.count({ where: { reconciliationStatus: { in: [...FLAGGED_RECON] } } }),
      prisma.payment.count({ where: { status: SESSION_STATUS.UNKNOWN } })
    ]);
    return { failedEvents, retryPendingEvents, flaggedSessions, flaggedLedgerRows, unknownSessions, total: failedEvents + flaggedSessions + flaggedLedgerRows };
  }
}


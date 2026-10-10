import { prisma } from '../../config/database.js';
import { getPaymentConfig } from '../../config/paymentConfig.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { toMinorUnits } from './money.js';
import { Tx, backoffMs, lockOrder, lockSession } from './paymentOps.js';
import { DEFAULT_CURRENCY, SESSION_STATUS } from './paymentStatus.js';
import type { PaymentProvider, ProviderOrder } from './provider.types.js';

export type LookupResult =
  | { kind: 'FOUND'; order: ProviderOrder }
  | { kind: 'NONE' }
  | { kind: 'AMBIGUOUS'; count: number };

/**
 * Receipt lookup (documented `receipt` query filter, "contains" semantics). We NEVER trust it:
 * the full session UUID is the receipt, every returned receipt is compared for EXACT equality, and amount/currency
 * are cross-checked. An empty answer proves nothing (listing consistency is not documented) - the caller must keep the
 * session UNKNOWN rather than treat "nothing found" as "nothing exists".
 */
export async function lookupProviderOrderByReceipt(provider: PaymentProvider, session: { id: string; createdAt: Date; amount: unknown }): Promise<LookupResult> {
  const fromEpoch = Math.floor(session.createdAt.getTime() / 1000) - 60;
  const expectedMinor = toMinorUnits(session.amount as never);
  const candidates = await provider.findOrdersByReceipt(session.id, fromEpoch);
  const exact = candidates.filter((o) => o.receipt === session.id);
  const valid = exact.filter((o) => o.amountMinor === expectedMinor && o.currency === DEFAULT_CURRENCY);
  if (exact.length === 0) return { kind: 'NONE' };
  if (valid.length === 1 && exact.length === 1) return { kind: 'FOUND', order: valid[0] };
  return { kind: 'AMBIGUOUS', count: exact.length };
}

export type AdoptResult = { adopted: true; superseded: boolean; reason?: undefined } | { adopted: false; reason: 'ALREADY_SET' | 'RECEIPT_MISMATCH' | 'AMOUNT_MISMATCH' | 'CURRENCY_MISMATCH' | 'PROVIDER_ORDER_IN_USE' | 'NOT_ADOPTABLE' };

/**
 * Attach a provider order to a session whose creation outcome was unknown / whose local persistence failed.
 * The provider order must carry THIS session's UUID as its receipt and the same amount/currency.
 * A session that has already been superseded is adopted for WATCH ONLY (status EXPIRED): it is never exposed to a customer.
 */
export async function adoptProviderOrder(
  sessionId: string,
  providerOrder: ProviderOrder,
  providerName: string,
  opts: { auditAction?: string; actor?: { userId: string | null; roles: readonly string[] } | null; context?: AuditContext; reason?: string } = {},
  outer?: Tx
): Promise<AdoptResult> {
  const run = async (tx: Tx): Promise<AdoptResult> => {
    const peek = await tx.payment.findUnique({ where: { id: sessionId }, select: { orderId: true } });
    if (!peek) throw new AppError('Payment session not found', 404, 'PAYMENT_ATTEMPT_NOT_FOUND');
    await lockOrder(tx, peek.orderId);
    await lockSession(tx, sessionId);
    const session = await tx.payment.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError('Payment session not found', 404, 'PAYMENT_ATTEMPT_NOT_FOUND');

    if (session.providerOrderId) return { adopted: false, reason: 'ALREADY_SET' };
    if (session.status === SESSION_STATUS.SUCCESS || session.status === SESSION_STATUS.ABANDONED) return { adopted: false, reason: 'NOT_ADOPTABLE' };
    if (providerOrder.receipt !== session.id) return { adopted: false, reason: 'RECEIPT_MISMATCH' };
    if (providerOrder.currency !== DEFAULT_CURRENCY) return { adopted: false, reason: 'CURRENCY_MISMATCH' };
    if (providerOrder.amountMinor !== toMinorUnits(session.amount)) return { adopted: false, reason: 'AMOUNT_MISMATCH' };
    const clash = await tx.payment.findFirst({ where: { provider: providerName, providerOrderId: providerOrder.providerOrderId }, select: { id: true } });
    if (clash) return { adopted: false, reason: 'PROVIDER_ORDER_IN_USE' };

    const cfg = getPaymentConfig();
    const now = Date.now();
    const superseded = session.supersededById !== null;
    await tx.payment.update({
      where: { id: session.id },
      data: {
        providerOrderId: providerOrder.providerOrderId,
        providerStatus: providerOrder.status,
        status: superseded ? SESSION_STATUS.EXPIRED : SESSION_STATUS.PENDING,
        expiresAt: new Date(now + cfg.sessionTtlMs),
        reviewFlag: superseded ? 'SUPERSEDED_ORDER_ADOPTED' : null,
        lastError: null,
        attemptCount: 0,
        nextAttemptAt: new Date(now + 120_000), // check again soon for a missed webhook
        lockedUntil: null,
        lockedBy: null
      }
    });
    await AuditService.record(
      {
        actor: opts.actor ?? null,
        action: opts.auditAction ?? 'PAYMENT_ATTEMPT_RECOVERED',
        entity: 'Payment',
        entityId: session.id,
        payload: { providerOrderId: providerOrder.providerOrderId, superseded, reason: opts.reason },
        context: opts.context
      },
      tx
    );
    return { adopted: true, superseded };
  };
  return outer ? await run(outer) : await prisma.$transaction(run, { maxWait: 10000, timeout: 20000 });
}

/** Mark a CREATED session UNKNOWN (outcome not known) and schedule reconciliation. Idempotent. */
export async function markSessionUnknown(sessionId: string, lastError: string): Promise<void> {
  await prisma.payment.updateMany({
    where: { id: sessionId, providerOrderId: null, status: { in: [SESSION_STATUS.CREATED, SESSION_STATUS.UNKNOWN] } },
    data: { status: SESSION_STATUS.UNKNOWN, lastError: lastError.slice(0, 60), nextAttemptAt: new Date(Date.now() + backoffMs(0)) }
  });
}


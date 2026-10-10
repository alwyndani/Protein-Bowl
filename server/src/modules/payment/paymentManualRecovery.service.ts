import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditService } from '../audit/audit.service.js';
import { adoptProviderOrder } from './paymentRecovery.ops.js';
import { lockOrder, lockSession } from './paymentOps.js';
import { EVENT_STATUS, SESSION_STATUS } from './paymentStatus.js';
import { getPaymentProvider } from './providerRegistry.js';
import { ProviderUnknownError } from './provider.types.js';

/**
 * Operational (CLI-only) recovery actions. There is NO HTTP surface for these. Every action:
 *  - requires an explicit reason and an operator label,
 *  - re-verifies provider state where it matters,
 *  - writes an AuditLog row,
 *  - can NEVER set Order.paymentStatus = PAID (only PaymentSettlementService does, from trusted captured evidence).
 */
export interface Operator {
  operator: string;
  reason: string;
}

function requireOperator(op: Operator): void {
  if (!op.operator || op.operator.trim().length < 2) throw new AppError('An operator name is required', 422, 'OPERATOR_REQUIRED');
  if (!op.reason || op.reason.trim().length < 5) throw new AppError('A reason of at least 5 characters is required', 422, 'REASON_REQUIRED');
}

const actorOf = (op: Operator) => ({ userId: null, roles: [`CLI:${op.operator.trim().slice(0, 40)}`] });

export class PaymentManualRecoveryService {
  /** Attach a provider order to an unresolved session after re-verifying receipt, amount and currency with the provider. */
  public static async adoptProviderOrder(sessionId: string, providerOrderId: string, op: Operator) {
    requireOperator(op);
    const provider = getPaymentProvider();
    let providerOrder;
    try {
      providerOrder = await provider.fetchOrder(providerOrderId);
    } catch (err) {
      if (err instanceof ProviderUnknownError) throw new AppError('The provider could not be reached; nothing was changed', 503, 'PAYMENT_PROVIDER_UNAVAILABLE');
      throw err;
    }
    if (!providerOrder) throw new AppError('The provider reports no such order', 404, 'PROVIDER_ORDER_NOT_FOUND');
    const result = await adoptProviderOrder(sessionId, providerOrder, provider.name, { auditAction: 'PAYMENT_MANUAL_ADOPTED', actor: actorOf(op), reason: op.reason.trim().slice(0, 200) });
    if (!result.adopted) throw new AppError(`The provider order cannot be adopted (${result.reason})`, 409, 'ADOPT_REFUSED');
    return result;
  }

  /**
   * Close an unresolved/unusable session so a fresh one may be created. Refused while any captured/authorized provider payment
   * exists (those must be settled, not abandoned). For a session with NO known provider order the operator is asserting - after
   * checking the provider dashboard - that none exists; that explicit, audited assertion is the documented manual resolution.
   */
  public static async abandonSession(sessionId: string, op: Operator) {
    requireOperator(op);
    const provider = getPaymentProvider();
    const peek = await prisma.payment.findUnique({ where: { id: sessionId }, select: { orderId: true, providerOrderId: true } });
    if (!peek) throw new AppError('Payment session not found', 404, 'PAYMENT_ATTEMPT_NOT_FOUND');

    if (peek.providerOrderId) {
      try {
        const payments = await provider.listOrderPayments(peek.providerOrderId);
        const live = payments.filter((p) => p.status === 'CAPTURED' || p.status === 'AUTHORIZED');
        if (live.length > 0) throw new AppError('The provider shows captured/authorized payments for this session; settle them instead of abandoning', 409, 'ABANDON_REFUSED');
      } catch (err) {
        if (err instanceof ProviderUnknownError) throw new AppError('The provider could not be reached; nothing was changed', 503, 'PAYMENT_PROVIDER_UNAVAILABLE');
        throw err;
      }
    }

    return await prisma.$transaction(async (tx) => {
      await lockOrder(tx, peek.orderId);
      await lockSession(tx, sessionId);
      const session = await tx.payment.findUniqueOrThrow({ where: { id: sessionId } });
      const live = await tx.providerPayment.count({ where: { paymentId: sessionId, providerStatus: { in: ['CAPTURED', 'AUTHORIZED'] } } });
      if (live > 0 || session.status === SESSION_STATUS.SUCCESS) throw new AppError('This session has captured/authorized payments and cannot be abandoned', 409, 'ABANDON_REFUSED');
      if (session.status === SESSION_STATUS.ABANDONED) return { abandoned: false, alreadyAbandoned: true };
      await tx.payment.update({ where: { id: sessionId }, data: { status: SESSION_STATUS.ABANDONED, nextAttemptAt: null, lockedUntil: null, lockedBy: null, reviewFlag: null } });
      await AuditService.record(
        { actor: actorOf(op), action: 'PAYMENT_MANUAL_ABANDONED', entity: 'Payment', entityId: sessionId, payload: { reason: op.reason.trim().slice(0, 200), previousStatus: session.status, hadProviderOrder: !!session.providerOrderId } },
        tx
      );
      return { abandoned: true, alreadyAbandoned: false };
    });
  }

  /** Put a FAILED (or stuck) webhook event back into the retry queue. */
  public static async replayEvent(eventRowId: string, op: Operator) {
    requireOperator(op);
    return await prisma.$transaction(async (tx) => {
      const event = await tx.paymentWebhookEvent.findUnique({ where: { id: eventRowId } });
      if (!event) throw new AppError('Webhook event not found', 404, 'EVENT_NOT_FOUND');
      if (event.status !== EVENT_STATUS.FAILED && event.status !== EVENT_STATUS.RETRY_PENDING) {
        throw new AppError(`Only FAILED or RETRY_PENDING events can be replayed (this one is ${event.status})`, 409, 'REPLAY_REFUSED');
      }
      await tx.paymentWebhookEvent.update({
        where: { id: eventRowId },
        data: { status: EVENT_STATUS.RETRY_PENDING, attemptCount: 0, nextAttemptAt: new Date(), lockedUntil: null, lockedBy: null, lastError: null, processedAt: null }
      });
      await AuditService.record(
        { actor: actorOf(op), action: 'PAYMENT_EVENT_REPLAYED', entity: 'PaymentWebhookEvent', entityId: eventRowId, payload: { reason: op.reason.trim().slice(0, 200), previousStatus: event.status } },
        tx
      );
      return { replayed: true };
    });
  }
}

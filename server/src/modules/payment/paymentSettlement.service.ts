import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { OrderTransitionService } from '../order/orderTransition.service.js';
import { fromMinorUnits } from './money.js';
import { Tx, lockOrder, lockProviderPayment, lockSession, paymentAlert } from './paymentOps.js';
import { DECIDED_RECON, DEFAULT_CURRENCY, FirstSeenVia, FLAGGED_RECON, RECON, SESSION_STATUS, providerStatusMayAdvance } from './paymentStatus.js';
import type { ProviderPaymentInfo } from './provider.types.js';

export type SettleOutcome =
  | 'APPLIED' // first valid capture: PAID (+ CONFIRMED)
  | 'ALREADY_APPLIED' // idempotent repeat of an applied capture
  | 'DUPLICATE' // a second captured provider payment: kept, flagged
  | 'AFTER_CANCELLATION' // captured after the order was cancelled: kept, flagged
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'NOT_CAPTURED'; // authorized / failed / created: recorded in the ledger only

export interface SettleInput {
  paymentId: string; // the Protein Bowl payment SESSION
  payment: ProviderPaymentInfo; // normalized, trusted provider evidence
  provider: string;
  via: FirstSeenVia;
  actor?: { userId: string; roles: readonly string[] } | null;
  context?: AuditContext;
}

export interface SettleResult {
  outcome: SettleOutcome;
  ledgerId: string;
  orderId: string;
  orderNumber: string;
  flagged: boolean;
  /** Order state AFTER settlement (for the caller's response). */
  orderStatus: string;
  orderPaymentStatus: string;
}

const flaggedOutcome = (o: string): boolean => FLAGGED_RECON.includes(o);

/**
 * THE ONLY path that converts trusted provider evidence into Protein Bowl payment success.
 * One transaction, fixed lock order (Order -> Payment session -> ProviderPayment), idempotent.
 */
export class PaymentSettlementService {
  public static async settle(input: SettleInput, tx?: Tx): Promise<SettleResult> {
    if (tx) return await this.run(input, tx);
    const result = await prisma.$transaction((inner) => this.run(input, inner), { maxWait: 10000, timeout: 20000 });
    this.alertIfFlagged(result, input);
    return result;
  }

  /** Call after the surrounding transaction COMMITTED when settle() was given the caller's tx. */
  public static alertIfFlagged(result: SettleResult, input: Pick<SettleInput, 'paymentId'>): void {
    if (result.flagged) paymentAlert('payment.flagged', { outcome: result.outcome, orderId: result.orderId, paymentId: input.paymentId, ledgerId: result.ledgerId });
  }

  private static async run(input: SettleInput, tx: Tx): Promise<SettleResult> {
    const info = input.payment;
    const peek = await tx.payment.findUnique({ where: { id: input.paymentId }, select: { orderId: true } });
    if (!peek) throw new AppError('Payment session not found', 404, 'PAYMENT_ATTEMPT_NOT_FOUND');

    await lockOrder(tx, peek.orderId);
    await lockSession(tx, input.paymentId);
    await lockProviderPayment(tx, input.provider, info.providerPaymentId);

    const session = await tx.payment.findUnique({ where: { id: input.paymentId } });
    const order = await tx.order.findUnique({
      where: { id: peek.orderId },
      select: { id: true, orderNumber: true, status: true, paymentStatus: true, netAmount: true, paidByProviderPaymentId: true }
    });
    if (!session || !order) throw new AppError('Payment session not found', 404, 'PAYMENT_ATTEMPT_NOT_FOUND');

    // The provider payment must belong to THIS session's provider order.
    if (!session.providerOrderId || info.providerOrderId !== session.providerOrderId) {
      throw new AppError('The provider payment does not belong to this payment session', 409, 'PAYMENT_ORDER_MISMATCH');
    }

    const amount = fromMinorUnits(info.amountMinor);
    const now = new Date();
    let ledger = await tx.providerPayment.findUnique({ where: { provider_providerPaymentId: { provider: input.provider, providerPaymentId: info.providerPaymentId } } });
    let becameFailed = false;

    if (ledger && (ledger.paymentId !== session.id || ledger.orderId !== order.id)) {
      throw new AppError('The provider payment is already recorded against another payment session', 409, 'PAYMENT_ORDER_MISMATCH');
    }

    if (!ledger) {
      ledger = await tx.providerPayment.create({
        data: {
          provider: input.provider,
          providerPaymentId: info.providerPaymentId,
          providerOrderId: session.providerOrderId,
          paymentId: session.id,
          orderId: order.id,
          amount,
          currency: info.currency,
          providerStatus: info.status,
          method: info.method,
          errorCode: info.errorCode,
          errorReason: info.errorReason,
          firstCapturedSeenAt: info.status === 'CAPTURED' ? now : null,
          firstSeenVia: input.via
        }
      });
      becameFailed = info.status === 'FAILED';
    } else if (providerStatusMayAdvance(ledger.providerStatus, info.status)) {
      // Monotonic: the status can only move forward (CAPTURED can never become FAILED / AUTHORIZED).
      becameFailed = info.status === 'FAILED';
      ledger = await tx.providerPayment.update({
        where: { id: ledger.id },
        data: {
          providerStatus: info.status,
          method: info.method ?? ledger.method,
          errorCode: info.errorCode ?? ledger.errorCode,
          errorReason: info.errorReason ?? ledger.errorReason,
          firstCapturedSeenAt: info.status === 'CAPTURED' && !ledger.firstCapturedSeenAt ? now : ledger.firstCapturedSeenAt
        }
      });
    }

    const result = (outcome: SettleOutcome, over: Partial<SettleResult> = {}): SettleResult => ({
      outcome,
      ledgerId: ledger!.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      flagged: flaggedOutcome(outcome),
      orderStatus: order.status,
      orderPaymentStatus: order.paymentStatus,
      ...over
    });

    // Decided outcomes are never re-decided (idempotency).
    if (DECIDED_RECON.includes(ledger.reconciliationStatus)) {
      const map: Record<string, SettleOutcome> = {
        [RECON.APPLIED]: 'ALREADY_APPLIED',
        [RECON.DUPLICATE]: 'DUPLICATE',
        [RECON.AFTER_CANCELLATION]: 'AFTER_CANCELLATION',
        [RECON.AMOUNT_MISMATCH]: 'AMOUNT_MISMATCH',
        [RECON.CURRENCY_MISMATCH]: 'CURRENCY_MISMATCH',
        [RECON.REVIEWED]: 'ALREADY_APPLIED'
      };
      const outcome = map[ledger.reconciliationStatus] ?? 'ALREADY_APPLIED';
      return result(outcome, { flagged: false });
    }

    if (ledger.providerStatus !== 'CAPTURED') {
      if (becameFailed) {
        await tx.payment.update({ where: { id: session.id }, data: { lastError: (info.errorCode ?? 'PAYMENT_FAILED').slice(0, 60) } });
        await AuditService.record(
          {
            actor: input.actor ?? null,
            action: 'PAYMENT_FAILED',
            entity: 'Payment',
            entityId: session.id,
            payload: { orderNumber: order.orderNumber, providerPaymentId: info.providerPaymentId, errorCode: info.errorCode, via: input.via },
            context: input.context
          },
          tx
        );
      }
      return result('NOT_CAPTURED');
    }

    // ------------------------------------------------------------------ a captured provider payment: decide it
    const flag = async (status: 'DUPLICATE' | 'AFTER_CANCELLATION' | 'AMOUNT_MISMATCH' | 'CURRENCY_MISMATCH', markSessionSuccess: boolean): Promise<SettleResult> => {
      await tx.providerPayment.update({ where: { id: ledger!.id }, data: { reconciliationStatus: status } });
      await tx.payment.update({
        where: { id: session.id },
        data: {
          reviewFlag: status === 'DUPLICATE' ? 'DUPLICATE_CAPTURE' : status,
          ...(markSessionSuccess && session.status !== SESSION_STATUS.SUCCESS ? { status: SESSION_STATUS.SUCCESS } : {}),
          nextAttemptAt: null
        }
      });
      await AuditService.record(
        {
          actor: input.actor ?? null,
          action: 'PAYMENT_FLAGGED',
          entity: 'Payment',
          entityId: session.id,
          payload: { reason: status, orderNumber: order.orderNumber, providerPaymentId: info.providerPaymentId, amountMinor: info.amountMinor, currency: info.currency, via: input.via },
          context: input.context
        },
        tx
      );
      return result(status);
    };

    if (info.currency !== DEFAULT_CURRENCY || session.currency !== DEFAULT_CURRENCY) return await flag('CURRENCY_MISMATCH', false);
    if (!amount.equals(session.amount) || !amount.equals(order.netAmount)) return await flag('AMOUNT_MISMATCH', false);

    if (order.paidByProviderPaymentId && order.paidByProviderPaymentId !== ledger.id) return await flag('DUPLICATE', true);
    if (order.status === 'CANCELLED') return await flag('AFTER_CANCELLATION', true);

    // First valid capture: compare-and-set the one-effective-payment reference, then mark PAID.
    // Concurrency note (final review): the order row lock above (every writer of paidByProviderPaymentId/paymentStatus takes it)
    // plus the in-lock pre-check already make a race unreachable. This CAS is DEFENSE-IN-DEPTH: it keeps correctness if a future
    // writer ever skips the lock or the pre-check is edited. The UNIQUE column separately guarantees a ledger row can be the
    // effective payment of at most one order. It is not independently mutation-testable while the lock exists.
    const cas = await tx.order.updateMany({
      where: { id: order.id, paidByProviderPaymentId: null },
      data: { paymentStatus: 'PAID', paidByProviderPaymentId: ledger.id }
    });
    if (cas.count !== 1) return await flag('DUPLICATE', true); // lost a race with another capture

    await tx.providerPayment.update({ where: { id: ledger.id }, data: { reconciliationStatus: RECON.APPLIED, appliedAt: now } });
    await tx.payment.update({
      where: { id: session.id },
      data: { status: SESSION_STATUS.SUCCESS, providerStatus: 'paid', reviewFlag: null, nextAttemptAt: null, lockedUntil: null, lockedBy: null }
    });
    await AuditService.record(
      {
        actor: input.actor ?? null,
        action: 'PAYMENT_VERIFIED',
        entity: 'Payment',
        entityId: session.id,
        payload: {
          orderNumber: order.orderNumber,
          providerPaymentId: info.providerPaymentId,
          amountMinor: info.amountMinor,
          currency: info.currency,
          via: input.via,
          actorKind: input.actor ? 'USER' : 'SYSTEM'
        },
        context: input.context
      },
      tx
    );

    let orderStatus = order.status;
    if (order.status === 'PENDING') {
      // The ONLY confirmation path: through the central transition service, as the trusted payment-verification actor.
      const t = await OrderTransitionService.transition({ orderId: order.id, to: 'CONFIRMED', actor: { kind: 'SYSTEM', source: 'PAYMENT_VERIFICATION' }, context: input.context }, tx);
      orderStatus = t.order.status;
    }
    return result('APPLIED', { orderStatus, orderPaymentStatus: 'PAID', flagged: false });
  }
}


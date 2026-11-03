import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { lockOrder, lockSession } from '../payment/paymentOps.js';
import { OrderTransitionService } from './orderTransition.service.js';

export const UNPAID_EXPIRY_REASON = 'UNPAID_EXPIRED';

export interface ExpiryStats {
  considered: number;
  expired: number;
  skipped: number;
  failed: number;
}

/**
 * Cancels abandoned UNPAID online food orders (DIRECT + ONLINE + PENDING + PENDING payment).
 *
 * An order is only expired when there is no sign that money may be on its way:
 *  - no ProviderPayment row of any status exists for it,
 *  - no checkout session carries an error marker (PROVIDER_STATE_UNVERIFIED / VERIFY_FETCH_UNAVAILABLE ...),
 *  - nothing has happened for the whole timeout: neither the order nor any payment session was created within it, and no session is still inside
 *    its own application TTL (`expiresAt`). Session `updatedAt` is deliberately NOT used: reconciliation rewrites it on every poll.
 * All of it is re-checked under the order row lock, in the same transaction as the cancellation, through OrderTransitionService
 * (SYSTEM / PAYMENT_EXPIRY, the existing allow-listed PENDING -> CANCELLED edge). Open sessions become EXPIRED (kept for history and
 * late-capture reconciliation). No refund is involved because nothing was paid. A payment that nevertheless arrives later is kept
 * and flagged AFTER_CANCELLATION by the existing settlement rules (never lost, never auto-refunded).
 * Idempotent and safe to run concurrently (row locks + compare-and-set); Kerala Mess purchases are never touched.
 */
export class OrderExpiryService {
  public static async runOnce(opts: { now?: Date; limit?: number; minutes?: number } = {}): Promise<ExpiryStats> {
    const minutes = opts.minutes ?? env.UNPAID_ORDER_EXPIRY_MINUTES;
    const stats: ExpiryStats = { considered: 0, expired: 0, skipped: 0, failed: 0 };
    if (minutes <= 0) return stats; // expiry disabled

    const now = opts.now ?? new Date();
    const cutoff = new Date(now.getTime() - minutes * 60_000);
    const candidates = await prisma.order.findMany({
      where: {
        orderType: 'DIRECT',
        paymentMethod: 'ONLINE',
        status: 'PENDING',
        paymentStatus: 'PENDING',
        paidByProviderPaymentId: null,
        createdAt: { lt: cutoff },
        // No checkout session was created within the timeout and none is still inside its own application TTL (the customer may be paying right now).
        // NOT updatedAt: the reconciliation worker touches that column on every poll, which says nothing about the customer.
        payments: { none: { OR: [{ createdAt: { gte: cutoff } }, { expiresAt: { gt: now } }] } },
        providerPayments: { none: {} }
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: opts.limit ?? 100
    });

    for (const { id } of candidates) {
      stats.considered++;
      try {
        const done = await prisma.$transaction(async (tx) => {
          await lockOrder(tx, id);
          const order = await tx.order.findUnique({
            where: { id },
            select: { id: true, orderNumber: true, status: true, paymentStatus: true, paymentMethod: true, orderType: true, paidByProviderPaymentId: true, createdAt: true }
          });
          if (!order || order.status !== 'PENDING' || order.paymentStatus !== 'PENDING' || order.orderType !== 'DIRECT' || order.paymentMethod !== 'ONLINE' || order.paidByProviderPaymentId || order.createdAt >= cutoff) return false;

          const sessions = await tx.payment.findMany({ where: { orderId: id }, select: { id: true, status: true, lastError: true, createdAt: true, expiresAt: true, provider: true }, orderBy: { id: 'asc' } });
          for (const s of sessions) await lockSession(tx, s.id);
          if (sessions.some((s) => s.lastError || s.createdAt >= cutoff || (s.expiresAt !== null && s.expiresAt > now))) return false;
          if ((await tx.providerPayment.count({ where: { orderId: id } })) > 0) return false;

          const open = sessions.filter((s) => s.provider !== null && s.status !== 'EXPIRED' && s.status !== 'SUCCESS');
          await tx.payment.updateMany({ where: { id: { in: open.map((s) => s.id) } }, data: { status: 'EXPIRED', expiresAt: now } });
          await OrderTransitionService.transition({ orderId: id, to: 'CANCELLED', actor: { kind: 'SYSTEM', source: 'PAYMENT_EXPIRY' }, reason: UNPAID_EXPIRY_REASON }, tx);
          await AuditService.record({ actor: null, action: 'ORDER_UNPAID_EXPIRED', entity: 'Order', entityId: id, payload: { orderNumber: order.orderNumber, minutes, sessionsClosed: open.length } }, tx);
          return true;
        });
        if (done) stats.expired++;
        else stats.skipped++;
      } catch {
        stats.failed++; // another request changed the order, or a transient database error: it is simply retried on the next run
      }
    }
    return stats;
  }
}

import { prisma } from '../../config/database.js';
import { toMinorUnits } from './money.js';
import { getPaymentProvider } from './providerRegistry.js';

/**
 * P7D-G1: a customer-safe, SERVER-DERIVED payment summary for the customer order DTO. No stored state, no migration: it is computed
 * from the existing trusted Order / Payment (session) / ProviderPayment (ledger) rows.
 *
 *   state:             NOT_STARTED | AWAITING_PAYMENT | CONFIRMING | PAID
 *   canStartPayment:   true ONLY when the approved payment flow may safely be started or re-used.
 *
 * `canStartPayment` is AUTHORITATIVE for the web UI (it may disable more, it may never turn false into true). The rule is
 * deliberately conservative: whenever trusted state says money may be in flight or payment truth is unresolved, it is false.
 * Nothing about providers (ids, flags, leases, attempts, failure details) is exposed here.
 *
 * DERIVATION TABLE (first matching row wins):
 *   1. Order.paymentStatus PAID / PARTIALLY_REFUNDED / REFUNDED ............................ PAID,            false
 *   2. Order not payable online: status != PENDING, not DIRECT, method != ONLINE,
 *      or total below the provider minimum ................................................ NOT_STARTED,     false
 *   3. Unresolved evidence: any ledger row AUTHORIZED, or CAPTURED/REFUNDED but not APPLIED
 *      (mismatch / duplicate / pending settlement), OR any session UNKNOWN or CREATED
 *      (provider order being created / outcome unknown), OR any session carrying a review flag ... CONFIRMING,  false
 *   4. A current (not superseded) session that has a provider order and is PENDING or EXPIRED
 *      (the server re-checks the provider before re-using or renewing it) ................. AWAITING_PAYMENT, true
 *   5. Otherwise (no session, or only FAILED / ABANDONED / superseded ones) ................. NOT_STARTED,     true
 */
export type PaymentSummaryState = 'NOT_STARTED' | 'AWAITING_PAYMENT' | 'CONFIRMING' | 'PAID';

export interface PaymentSummary {
  state: PaymentSummaryState;
  canStartPayment: boolean;
}

export interface SummaryOrderInput {
  id: string;
  status: string;
  orderType: string;
  paymentStatus: string;
  paymentMethod: string | null;
  netAmount: unknown;
}

export interface SummarySession {
  status: string;
  providerOrderId: string | null;
  supersededById: string | null;
  reviewFlag: string | null;
}

export interface SummaryLedgerRow {
  providerStatus: string;
  reconciliationStatus: string;
}

const PAID_STATUSES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];

/** Pure derivation (unit-testable). `minAmountMinor` is the provider's minimum for an online payment. */
export function derivePaymentSummary(order: SummaryOrderInput, sessions: SummarySession[], ledger: SummaryLedgerRow[], minAmountMinor: number): PaymentSummary {
  if (PAID_STATUSES.includes(order.paymentStatus)) return { state: 'PAID', canStartPayment: false };

  let belowMinimum = false;
  try {
    belowMinimum = toMinorUnits(order.netAmount as never) < minAmountMinor;
  } catch {
    belowMinimum = true; // an amount that cannot be expressed in whole paise can never be paid online
  }
  if (order.status !== 'PENDING' || order.orderType !== 'DIRECT' || order.paymentMethod !== 'ONLINE' || belowMinimum) {
    return { state: 'NOT_STARTED', canStartPayment: false };
  }

  const evidence = ledger.some((r) => r.providerStatus === 'AUTHORIZED' || ((r.providerStatus === 'CAPTURED' || r.providerStatus === 'REFUNDED') && r.reconciliationStatus !== 'APPLIED'));
  const unresolvedSession = sessions.some((s) => s.status === 'UNKNOWN' || s.status === 'CREATED' || s.reviewFlag !== null);
  if (evidence || unresolvedSession) return { state: 'CONFIRMING', canStartPayment: false };

  const live = sessions.some((s) => s.supersededById === null && s.providerOrderId !== null && (s.status === 'PENDING' || s.status === 'EXPIRED'));
  return live ? { state: 'AWAITING_PAYMENT', canStartPayment: true } : { state: 'NOT_STARTED', canStartPayment: true };
}

export class PaymentSummaryService {
  /** Two batched queries for any number of orders. Read-only. */
  public static async deriveForOrders(orders: SummaryOrderInput[]): Promise<Map<string, PaymentSummary>> {
    const out = new Map<string, PaymentSummary>();
    if (orders.length === 0) return out;
    const ids = orders.map((o) => o.id);
    const [sessions, ledger] = await Promise.all([
      prisma.payment.findMany({ where: { orderId: { in: ids }, provider: { not: null } }, select: { orderId: true, status: true, providerOrderId: true, supersededById: true, reviewFlag: true } }),
      prisma.providerPayment.findMany({ where: { orderId: { in: ids } }, select: { orderId: true, providerStatus: true, reconciliationStatus: true } })
    ]);
    const min = getPaymentProvider().minAmountMinor;
    for (const o of orders) {
      out.set(
        o.id,
        derivePaymentSummary(
          o,
          sessions.filter((s) => s.orderId === o.id),
          ledger.filter((l) => l.orderId === o.id),
          min
        )
      );
    }
    return out;
  }
}

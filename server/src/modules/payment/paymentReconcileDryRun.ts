import { prisma } from '../../config/database.js';
import { toMinorUnits } from './money.js';
import { getPaymentProvider } from './providerRegistry.js';

export type DryRunClass =
  | 'WOULD_SETTLE' // a matching captured payment exists at the provider and is not yet applied
  | 'ALREADY_SETTLED' // everything captured at the provider is already in the ledger and applied
  | 'NOTHING_AT_PROVIDER' // no payment on the provider order yet (customer has not paid / delayed)
  | 'AUTHORIZED_ONLY' // authorised but not captured (account capture-mode problem); never treated as paid
  | 'FAILED_ONLY' // only failed attempts
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'DUPLICATE_CAPTURE' // more than one captured payment for one order (second one would be flagged, never auto-refunded)
  | 'NEEDS_LOOKUP' // provider order not known locally (a receipt lookup would run)
  | 'PROVIDER_ERROR'; // the provider could not be asked

export interface DryRunReport {
  mode: 'DRY_RUN';
  provider: string;
  dueEvents: number;
  dueRefunds: number;
  capturedLedgerRowsNotApplied: number;
  sessions: Array<{ sessionId: string; orderNumber: string; classification: DryRunClass }>;
  counts: Record<DryRunClass, number>;
}

const EMPTY_COUNTS = (): Record<DryRunClass, number> => ({
  WOULD_SETTLE: 0, ALREADY_SETTLED: 0, NOTHING_AT_PROVIDER: 0, AUTHORIZED_ONLY: 0, FAILED_ONLY: 0, AMOUNT_MISMATCH: 0, CURRENCY_MISMATCH: 0, DUPLICATE_CAPTURE: 0, NEEDS_LOOKUP: 0, PROVIDER_ERROR: 0
});

/**
 * READ-ONLY preview of what one reconciliation pass would do. It takes no lease, writes nothing (no ledger, order, payment, refund, audit or schedule change)
 * and only performs provider READS (listing the payments of a provider order). It prints identifiers of OUR records and classification codes - never
 * provider payloads, signatures, card/VPA data or secrets.
 */
export async function reconcileDryRun(opts: { limit?: number } = {}): Promise<DryRunReport> {
  const limit = opts.limit ?? 50;
  const provider = getPaymentProvider();
  const counts = EMPTY_COUNTS();
  const sessions: DryRunReport['sessions'] = [];

  const due = await prisma.payment.findMany({
    where: { status: { in: ['CREATED', 'UNKNOWN', 'PENDING', 'EXPIRED'] }, provider: { not: null }, nextAttemptAt: { not: null, lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    select: { id: true, amount: true, currency: true, status: true, providerOrderId: true, order: { select: { orderNumber: true, paymentStatus: true, paidByProviderPaymentId: true } } }
  });

  for (const s of due) {
    let cls: DryRunClass;
    try {
      if (!s.providerOrderId) {
        cls = 'NEEDS_LOOKUP';
      } else {
        const payments = (await provider.listOrderPayments(s.providerOrderId)).filter((p) => p.providerOrderId === s.providerOrderId);
        const captured = payments.filter((p) => p.status === 'CAPTURED');
        if (payments.length === 0) cls = 'NOTHING_AT_PROVIDER';
        else if (captured.length === 0) cls = payments.some((p) => p.status === 'AUTHORIZED') ? 'AUTHORIZED_ONLY' : 'FAILED_ONLY';
        else if (captured.some((p) => p.currency !== s.currency)) cls = 'CURRENCY_MISMATCH';
        else if (captured.some((p) => p.amountMinor !== toMinorUnits(s.amount))) cls = 'AMOUNT_MISMATCH';
        else {
          const ledger = await prisma.providerPayment.findMany({ where: { providerPaymentId: { in: captured.map((p) => p.providerPaymentId) } }, select: { providerPaymentId: true, reconciliationStatus: true } });
          const applied = new Set(ledger.filter((l) => l.reconciliationStatus !== 'PENDING').map((l) => l.providerPaymentId));
          const unapplied = captured.filter((p) => !applied.has(p.providerPaymentId));
          if (unapplied.length === 0) cls = 'ALREADY_SETTLED';
          else if (captured.length > 1 || s.order.paymentStatus === 'PAID') cls = 'DUPLICATE_CAPTURE';
          else cls = 'WOULD_SETTLE';
        }
      }
    } catch {
      cls = 'PROVIDER_ERROR';
    }
    counts[cls]++;
    sessions.push({ sessionId: s.id, orderNumber: s.order.orderNumber, classification: cls });
  }

  const [dueEvents, dueRefunds, capturedLedgerRowsNotApplied] = await Promise.all([
    prisma.paymentWebhookEvent.count({ where: { status: 'RETRY_PENDING', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] } }),
    prisma.refund.count({ where: { status: { in: ['REQUESTED', 'SUBMITTING', 'UNKNOWN', 'PROCESSING'] }, nextAttemptAt: { not: null, lte: new Date() } } }),
    prisma.providerPayment.count({ where: { providerStatus: 'CAPTURED', reconciliationStatus: 'PENDING' } })
  ]);

  return { mode: 'DRY_RUN', provider: provider.name, dueEvents, dueRefunds, capturedLedgerRowsNotApplied, sessions, counts };
}

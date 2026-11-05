/**
 * Payment reconciliation, production entry point. SAFE BY DEFAULT: without --apply it is a read-only DRY RUN.
 *
 *   npx tsx scripts/reconcilePaymentsProd.ts                          dry run (reads only; provider READ calls; nothing is written)
 *   npx tsx scripts/reconcilePaymentsProd.ts --apply                  one real pass, then exit
 *   npx tsx scripts/reconcilePaymentsProd.ts --apply --loop --interval 60
 *   npx tsx scripts/reconcilePaymentsProd.ts --limit 25               bound the batch (never above PAYMENT_BATCH_SIZE)
 *
 * What a real pass does is the existing, tested PaymentReconciliationService.runOnce: rows are claimed with FOR UPDATE SKIP LOCKED + leases
 * (several instances may run), every provider payment is fetched from the provider and settled through PaymentSettlementService
 * (idempotent; amount/currency/capture verified; duplicates and late captures kept and flagged, never lost or auto-refunded), refunds are
 * submitted/resolved, and a PAYMENT_RECONCILIATION_RUN audit row records the counts. No mock provider is allowed in production (config).
 * Output: counts only - never secrets, signatures or provider payloads.
 * Exit codes: 0 = nothing needs attention, 2 = review items exist, 1 = the run failed, 4 = REFUSED (production --apply is gated by reconcileApplyGate.ts
 * and stays disabled until the reconciliation tests have passed on the isolated database).
 *
 * The older scripts/reconcilePayments.ts keeps its TEMPORARY-H1 target guard and is NOT used for production scheduling until this entry point
 * has been verified on the isolated database and approved.
 */
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { reconcileDryRun } from '../src/modules/payment/paymentReconcileDryRun.js';
import { applyDecision } from '../src/modules/payment/reconcileApplyGate.js';
import { PaymentReconciliationService } from '../src/modules/payment/paymentReconciliation.service.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
if (apply) {
  const decision = applyDecision(env.NODE_ENV);
  if (!decision.allowed) {
    console.error(`REFUSED: ${decision.reason}`);
    process.exit(4);
  }
}
const loop = apply && args.includes('--loop');
const num = (flag: string, fallback: number) => {
  const i = args.indexOf(flag);
  const n = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};
const limit = num('--limit', 50);
const intervalMs = Math.max(10, num('--interval', 60)) * 1000;
let stop = false;
process.on('SIGINT', () => { stop = true; });
process.on('SIGTERM', () => { stop = true; });

async function pass(): Promise<number> {
  if (!apply) {
    const report = await reconcileDryRun({ limit });
    console.log(JSON.stringify({ area: 'payments', job: 'reconcile', env: env.NODE_ENV, ...report }));
    return 0;
  }
  const stats = await PaymentReconciliationService.runOnce({ limit, workerId: `prod-${process.pid}` });
  await AuditService.recordSafe({ actor: null, action: 'PAYMENT_RECONCILIATION_RUN', entity: 'PaymentReconciliation', entityId: stats.workerId, payload: stats });
  const review = await PaymentReconciliationService.reviewReport();
  console.log(JSON.stringify({ area: 'payments', job: 'reconcile', mode: 'APPLY', env: env.NODE_ENV, stats, review }));
  return review.total > 0 ? 2 : 0;
}

async function main(): Promise<number> {
  let code = 0;
  do {
    code = await pass();
    if (loop && !stop) await new Promise((r) => setTimeout(r, intervalMs));
  } while (loop && !stop);
  return code;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error('reconcile failed:', e instanceof Error ? e.name : 'Error');
    await prisma.$disconnect();
    process.exit(1);
  });

/**
 * Payment reconciliation worker (CLI). Scheduler-ready: run it from cron / a job runner, or keep it looping.
 *
 *   npm run payments:reconcile                       one safe pass, then exit
 *   npm run payments:reconcile -- --loop --interval 60   keep running every 60s until Ctrl+C / SIGTERM
 *
 * Safe to run on several machines at once (rows are claimed with FOR UPDATE SKIP LOCKED + leases) and to repeat at any time
 * (settlement is idempotent). Exit code: 0 = nothing needs attention, 2 = review items exist (failed events, flagged
 * payments/sessions), 1 = the run itself failed. It prints counts only - never secrets, signatures or provider payloads.
 *
 * TEMPORARY-H1-DO-NOT-MERGE: this entry point is wrapped in a temporary guard that REFUSES (exit 3) unless the PROCESS environment
 * (not a .env file) holds PAYMENTS_RECONCILE_EXPECT_DATABASE and a DATABASE_URL for the one disposable reconciliation-test database,
 * and the connected server proves the same identity. Configuration and Prisma are imported dynamically, only after those pre-checks.
 * See src/modules/payment/reconcileCli.ts. Never merge this version.
 */
// The FIRST import must stay the CLI module (it loads the guard, which snapshots the process environment before config/env.ts runs dotenv).
import { bootstrapReconcile } from '../src/modules/payment/reconcileCli.js';

void bootstrapReconcile({
  proc: process,
  console,
  load: async () => ({
    db: (await import('../src/config/database.js')).prisma,
    service: (await import('../src/modules/payment/paymentReconciliation.service.js')).PaymentReconciliationService
  })
});

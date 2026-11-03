/**
 * TEMPORARY-H1-DO-NOT-MERGE
 *
 * TEST-ONLY entry point. It is NEVER used by Pass B or by `npm run payments:reconcile`; only the subprocess tests in
 * p11c2.reconcileGuard.test.ts run it, always together with the stub Prisma preload (reconcileStubPrisma.cjs).
 *
 * It is identical to scripts/reconcilePayments.ts except for ONE argument: `target`. The real entry point pins the process DATABASE_URL to
 * localhost:5432 / the disposable database, so a subprocess that reaches the identity query with the real entry would be aimed at the real
 * local cluster. This fixture injects an already-passed URL check instead, so the stub (and a loopback tripwire) can stand in for the
 * database. The expectation is still read from the PROCESS environment (before any config import), exactly as in the real entry.
 */
import { RECONCILE_EXPECTED_DATABASE_ENV } from '../../modules/payment/reconcileTargetGuard.js';
import { bootstrapReconcile } from '../../modules/payment/reconcileCli.js';

void bootstrapReconcile({
  proc: process,
  console,
  target: { expectation: process.env[RECONCILE_EXPECTED_DATABASE_ENV], urlCheck: { ok: true }, urlUnchanged: () => true },
  load: async () => ({
    db: (await import('../../config/database.js')).prisma,
    service: (await import('../../modules/payment/paymentReconciliation.service.js')).PaymentReconciliationService
  })
});

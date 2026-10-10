/**
 * Payment reconciliation worker (CLI). Scheduler-ready: run it from cron / a job runner, or keep it looping.
 *
 *   npm run payments:reconcile                       one safe pass, then exit
 *   npm run payments:reconcile -- --loop --interval 60   keep running every 60s until Ctrl+C / SIGTERM
 *
 * Safe to run on several machines at once (rows are claimed with FOR UPDATE SKIP LOCKED + leases) and to repeat at any time
 * (settlement is idempotent). Exit code: 0 = nothing needs attention, 2 = review items exist (failed events, flagged
 * payments/sessions), 1 = the run itself failed. It prints counts only - never secrets, signatures or provider payloads.
 */
import { prisma } from '../src/config/database.js';
import { PaymentReconciliationService } from '../src/modules/payment/paymentReconciliation.service.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true; });

async function sleepInterruptible(ms: number) {
  const end = Date.now() + ms;
  while (!stopping && Date.now() < end) await new Promise((r) => setTimeout(r, Math.min(500, end - Date.now())));
}

async function main(): Promise<number> {
  const workerId = arg('worker') ?? `cli-${process.pid}`;
  const limit = arg('limit') ? Number(arg('limit')) : undefined;
  const loop = flag('loop');
  const intervalMs = Math.max(5, Number(arg('interval') ?? 60)) * 1000;
  let exit = 0;

  do {
    const stats = await PaymentReconciliationService.runOnce({ workerId, limit });
    const report = await PaymentReconciliationService.reviewReport();
    console.log(JSON.stringify({ at: new Date().toISOString(), stats, review: report }));
    if (report.total > 0) exit = 2;
    if (!loop) break;
    await sleepInterruptible(intervalMs);
  } while (!stopping);
  return exit;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error('payments:reconcile failed:', (err as Error).message);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });

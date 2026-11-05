/**
 * Unpaid-order expiry job (CLI). Idempotent; schedule every minute (see docs/OPERATIONS.md).
 *
 *   npm run orders:expire-unpaid                     one pass, then exit
 *   npm run orders:expire-unpaid -- --loop --interval 60
 *
 * Timeout: UNPAID_ORDER_EXPIRY_MINUTES (default 15; 0 disables). Prints counts only. Exit 0 = ok, 1 = the run failed.
 */
import { OrderExpiryService } from '../src/modules/order/orderExpiry.service.js';
import { prisma } from '../src/config/database.js';

const loop = process.argv.includes('--loop');
const idx = process.argv.indexOf('--interval');
const intervalMs = Math.max(10, idx >= 0 ? Number(process.argv[idx + 1]) || 60 : 60) * 1000;
let stop = false;
process.on('SIGINT', () => { stop = true; });
process.on('SIGTERM', () => { stop = true; });

async function pass(): Promise<void> {
  const s = await OrderExpiryService.runOnce();
  console.log(JSON.stringify({ area: 'orders', job: 'expire-unpaid', ...s }));
}

async function main() {
  do {
    await pass();
    if (loop && !stop) await new Promise((r) => setTimeout(r, intervalMs));
  } while (loop && !stop);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('expire-unpaid failed:', e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });

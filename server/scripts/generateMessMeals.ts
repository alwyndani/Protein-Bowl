/**
 * Kerala Mess meal-entitlement backfill (CLI only; there is NO HTTP endpoint for it). P10B.
 *
 *   npm run mess:generate-meals -- --subscription <id>   backfill ONE ACTIVE subscription
 *   npm run mess:generate-meals -- --all-active          every ACTIVE subscription that has no complete meal set yet
 *
 * Only meant for subscriptions activated BEFORE P10B (no slot-time snapshot, no meals). The plan's CURRENT valid slot times are copied into the
 * subscription ONCE (never overwritten), then the complete meal set is generated. It never touches money (price, tax, payment, refund) and refuses
 * when the plan has no valid service times. Row-locked, audited and idempotent: re-running creates nothing. Exit 0 = ok, 2 = something was refused, 1 = failed.
 */
import { prisma } from '../src/config/database.js';
import { MessMealService } from '../src/modules/mess/messMeal.service.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const one = arg('subscription');
  const all = process.argv.includes('--all-active');
  if ((!one && !all) || (one && all)) {
    console.error('Use exactly one of: --subscription <id> | --all-active');
    return 1;
  }
  const ids = one ? [one] : await MessMealService.listBackfillCandidates();
  let refused = 0;
  for (const id of ids) {
    try {
      const r = await MessMealService.backfillSubscription(id);
      console.log(JSON.stringify({ subscriptionId: id, ...r }));
    } catch (err) {
      refused += 1;
      console.log(JSON.stringify({ subscriptionId: id, refused: (err as { errorCode?: string }).errorCode ?? 'ERROR', message: (err as Error).message }));
    }
  }
  console.log(JSON.stringify({ processed: ids.length, refused }));
  return refused > 0 ? 2 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error('mess:generate-meals failed:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

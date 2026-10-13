/**
 * Kerala Mess day-close (CLI only; no HTTP endpoint). P10C.
 *
 *   npm run mess:close-day
 *
 * Idempotent and safe to re-run at any time: (1) every PENDING / FAILED delivery stop of a FINISHED business day (Asia/Kolkata) becomes CLOSED_UNDELIVERED and exactly its
 * still-unfulfilled meals become NOT_DELIVERED; (2) expired meals that never reached a delivery stop become NOT_DELIVERED; (3) every subscription whose meals are all terminal
 * is COMPLETED. It never touches money, a future meal, a paused / cancelled / fulfilled meal or any meal of today. Correctness does not depend on running it on a schedule
 * (completion is also attempted after each handover); it only guarantees that nothing stays unresolved after a day ends.
 */
import { prisma } from '../src/config/database.js';
import { MessCompletionService } from '../src/modules/mess/messCompletion.service.js';

MessCompletionService.closeDay()
  .then((r) => {
    console.log(JSON.stringify(r));
  })
  .catch((err) => {
    console.error('mess:close-day failed:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

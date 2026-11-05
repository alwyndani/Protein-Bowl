import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * READ-ONLY evidence, against the isolated test database only (the suite refuses any other target, see src/tests/testDatabase.ts):
 * the database every other server test runs on was built from exactly the migration files in this repository (same names, same SHA-256
 * checksums, none failed or rolled back), and the two prepared migrations really produced the objects they describe. Nothing is written.
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const MIGRATIONS = path.join(process.cwd(), 'prisma', 'migrations');
const folders = fs.readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort();
/** Prepared migrations that may legitimately not be on the test database yet (applied by the user with `prisma migrate deploy`). */
const PENDING = ['20261101120000_health_exercise_unanswered'];
const sha = (dir: string) => crypto.createHash('sha256').update(fs.readFileSync(path.join(MIGRATIONS, dir, 'migration.sql'))).digest('hex');

afterAll(async () => {
  await prisma.$disconnect();
});

describe('the isolated test database was built from this repository\'s migrations', () => {
  it('every APPLIED migration is recorded as finished with the same checksum as its file, nothing unknown is recorded, and only the documented prepared tail is pending', async () => {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
      SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
    // the database holds an exact PREFIX of the repository's chain; what follows is prepared-but-not-yet-applied (never applied by this suite)
    expect(rows.map((r) => r.migration_name)).toEqual(folders.slice(0, rows.length));
    expect(folders.slice(rows.length)).toEqual(folders.slice(rows.length).filter((f) => PENDING.includes(f)));
    for (const r of rows) {
      expect(r.finished_at, r.migration_name).not.toBeNull();
      expect(r.rolled_back_at, r.migration_name).toBeNull();
      expect(r.checksum, r.migration_name).toBe(sha(r.migration_name));
    }
  });

  it('migration 20261020100000: the 7 nullable columns, the index and the 7 CHECK constraints exist', async () => {
    const cols = await prisma.$queryRaw<Array<{ table_name: string; column_name: string; is_nullable: string }>>`
      SELECT table_name, column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema() AND (table_name, column_name) IN (
        ('delivery_assignments','operatedByUserId'), ('delivery_assignments','takenOverFromDriverId'), ('delivery_proofs','verifiedByUserId'),
        ('delivery_attempts','operatedByUserId'), ('mess_delivery_runs','claimedByUserId'), ('mess_delivery_runs','takenOverFromEmployeeId'),
        ('mess_delivery_stops','handedOverByUserId'))`;
    expect(cols).toHaveLength(7);
    for (const c of cols) expect(c.is_nullable, `${c.table_name}.${c.column_name}`).toBe('YES');
    const idx = await prisma.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'delivery_assignments_operatedByUserId_idx'`;
    expect(idx).toHaveLength(1);
    const checks = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname IN ('delivery_assignments_one_owner_ck','delivery_assignments_takeover_ck','delivery_attempts_one_owner_ck','mess_runs_takeover_ck','delivery_proofs_pin_ck','mess_runs_claim_ck','mess_stops_handed_ck')`;
    expect(checks).toHaveLength(7);
  });

  it('migration 20261031120000: the 9 tables, the partial unique index and the status CHECKs exist', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN
      ('trainer_assignments','workout_logs','suppliers','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines','cancellation_requests','password_reset_tokens')`;
    expect(tables).toHaveLength(9);
    const partial = await prisma.$queryRaw<Array<{ indexdef: string }>>`SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'cancellation_requests_one_pending_per_order'`;
    expect(partial).toHaveLength(1);
    expect(partial[0].indexdef).toMatch(/UNIQUE/i);
    expect(partial[0].indexdef).toMatch(/PENDING/);
    const checks = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname IN ('trainer_assignments_status_ck','purchase_orders_status_ck','cancellation_requests_status_ck','cancellation_requests_decision_ck','purchase_order_lines_qty_ck','goods_receipt_lines_qty_ck','workout_logs_effort_ck')`;
    expect(checks).toHaveLength(7);
  });
});

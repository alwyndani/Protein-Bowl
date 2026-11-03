import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ADMIN_URL, urlOf } from './migrationDb.js';

/**
 * FRESH-DATABASE REPLAY of the whole migration chain, including the three prepared (unapplied) migrations, followed by a schema comparison.
 * Opt-in (`npm run test:migrations`), and ONLY on a disposable PostgreSQL instance named by PB_MIGRATION_PG_ADMIN_URL (see server/TESTING.md and
 * src/tests/migrationDb.ts: local host, maintenance database `postgres`, port 5432 refused). It creates its own temporary database, replays every
 * migration folder in order with `prisma migrate deploy`, checks what that produced, compares the result with schema.prisma with `prisma migrate diff`,
 * and drops ONLY its own database. It never touches any other database.
 *
 * `migrate diff` lists what would have to change for the database to equal schema.prisma. Only unmodelled INDEXES may appear (Prisma cannot express the
 * partial unique index of cancellation_requests, and CHECK constraints are invisible to it); any CREATE / ALTER TABLE / COLUMN statement means the SQL and
 * the schema disagree and fails the test.
 */
const SERVER_ROOT = join(__dirname, '..', '..');
const PRISMA_CLI = join(SERVER_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const db = `pb_prepared_mig_${Date.now()}`;
const folders = readdirSync(join(SERVER_ROOT, 'prisma', 'migrations'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const sha = (name: string) => createHash('sha256').update(readFileSync(join(SERVER_ROOT, 'prisma', 'migrations', name, 'migration.sql'))).digest('hex');
const prisma = (args: string[], url: string) =>
  execFileSync(process.execPath, [PRISMA_CLI, ...args], { cwd: SERVER_ROOT, stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } }).toString('utf8');

describe('fresh-database replay of the full migration chain + schema comparison (disposable instance only)', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let target: PrismaClient;
  const url = urlOf(db);

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${db}"`);
    prisma(['migrate', 'deploy'], url);
    target = new PrismaClient({ datasources: { db: { url } } });
  }, 240000);

  afterAll(async () => {
    await target?.$disconnect();
    try {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
    } finally {
      await admin.$disconnect();
    }
  }, 60000);

  it('every migration folder (including the three prepared ones) was applied, in order, finished, with the repository checksum', async () => {
    expect(folders).toEqual(expect.arrayContaining(['20261020100000_role_simplification_admin_actors', '20261031120000_trainer_procurement_foundation', '20261101120000_health_exercise_unanswered']));
    const rows = await target.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
      SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
    expect(rows.map((r) => r.migration_name)).toEqual(folders);
    for (const r of rows) {
      expect(r.finished_at, r.migration_name).not.toBeNull();
      expect(r.rolled_back_at, r.migration_name).toBeNull();
      expect(r.checksum, r.migration_name).toBe(sha(r.migration_name));
    }
  });

  it('the objects of the three prepared migrations exist in the fresh database', async () => {
    const n = async (q: Promise<Array<{ c: bigint }>>) => Number((await q)[0].c);
    expect(await n(target.$queryRaw`SELECT count(*) AS c FROM information_schema.columns WHERE table_schema = current_schema() AND (table_name, column_name) IN (('delivery_assignments','operatedByUserId'),('delivery_assignments','takenOverFromDriverId'),('delivery_proofs','verifiedByUserId'),('delivery_attempts','operatedByUserId'),('mess_delivery_runs','claimedByUserId'),('mess_delivery_runs','takenOverFromEmployeeId'),('mess_delivery_stops','handedOverByUserId'))`)).toBe(7);
    expect(await n(target.$queryRaw`SELECT count(*) AS c FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('trainer_assignments','workout_logs','suppliers','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines','cancellation_requests','password_reset_tokens')`)).toBe(9);
    expect(await n(target.$queryRaw`SELECT count(*) AS c FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'cancellation_requests_one_pending_per_order'`)).toBe(1);
  });

  it('health_biometrics.hasExercise is nullable with NO default (unanswered is representable)', async () => {
    const col = await target.$queryRaw<Array<{ is_nullable: string; column_default: string | null }>>`
      SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'health_biometrics' AND column_name = 'hasExercise'`;
    expect(col[0]).toEqual({ is_nullable: 'YES', column_default: null });
  });

  it('migrate diff against schema.prisma: the database equals the schema except unmodelled indexes (no CREATE / ALTER TABLE / COLUMN statement)', () => {
    const script = prisma(['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], url);
    const statements = script.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('--'));
    const unexpected = statements.filter((l) => !/^DROP INDEX "[^"]+";$/.test(l));
    expect(unexpected, `unexpected schema differences:\n${unexpected.join('\n')}`).toEqual([]);
  });
});

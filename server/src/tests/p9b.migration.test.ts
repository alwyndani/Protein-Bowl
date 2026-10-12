import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Replays the REAL migration files into a throwaway database (the shared test DB is never touched):
 *  1. applies every migration BEFORE P9B,
 *  2. inserts P9A-era rows (a DISPATCHED order with an IN_TRANSIT assignment),
 *  3. applies the P9B migration,
 *  4. checks every existing row survived byte-for-byte, nothing was backfilled or delivered, and the delivery_proofs guarantees hold.
 * Needs the local `postgres` superuser (same requirement as p7a.migration / p7c.migration).
 */
const SERVER_ROOT = join(__dirname, '..', '..');
const PRISMA_CLI = join(SERVER_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
const dbName = `pb_p9b_mig_${Date.now()}`;
const dbUrl = `postgresql://postgres:postgres@localhost:5432/${dbName}?schema=public`;

const migrations = readdirSync(join(SERVER_ROOT, 'prisma', 'migrations'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const P9B = migrations.findIndex((m) => m.includes('p9b_delivery_proof'));
const applyFile = (file: string) => execFileSync(process.execPath, [PRISMA_CLI, 'db', 'execute', '--url', dbUrl, '--file', file], { cwd: SERVER_ROOT, stdio: 'pipe' });

describe('P9B migration: one additive migration (#14), no backfill, and the DeliveryProof guarantees hold in PostgreSQL', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let scratch: PrismaClient;
  let tmp: string;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'pb-p9b-'));
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  }, 60000);

  afterAll(async () => {
    await scratch?.$disconnect();
    try {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    } finally {
      await admin.$disconnect();
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);

  it('the P9B migration is the 14th of the chain (later migrations such as P9C #15 follow it), sorting directly after P7C', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(14);
    expect(P9B).toBe(13);
    expect(migrations[P9B - 1]).toContain('p7c_refunds');
    expect(migrations[P9B] > migrations[P9B - 1]).toBe(true);
  });

  it('is purely additive: it creates delivery_proofs and touches no existing table', () => {
    const sql = readFileSync(join(SERVER_ROOT, 'prisma', 'migrations', migrations[P9B], 'migration.sql'), 'utf8').replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"(?!delivery_proofs")/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+"|\bINSERT\s+INTO\b/i);
    expect(sql).toMatch(/CREATE TABLE "delivery_proofs"/);
    expect(sql).not.toMatch(/"plaintext|"code"\s/i); // no plaintext code column
  });

  it('existing DISPATCHED orders are untouched and get NO proof row (no backfill, nothing auto-delivered); the table guarantees work', async () => {
    for (const m of migrations.slice(0, P9B)) {
      const file = join(SERVER_ROOT, 'prisma', 'migrations', m, 'migration.sql');
      expect(existsSync(file)).toBe(true);
      applyFile(file);
    }
    const legacy = join(tmp, 'p9a-rows.sql');
    writeFileSync(
      legacy,
      `
      INSERT INTO "users" ("id","email","passwordHash","updatedAt") VALUES ('u-1','mig@p9b.test','x',now()), ('u-2','admin@p9b.test','x',now());
      INSERT INTO "customer_profiles" ("id","userId","fullName","referralCode","updatedAt") VALUES ('cp-1','u-1','Mig','PB-MIG9B',now());
      INSERT INTO "employee_profiles" ("id","userId","employeeCode","fullName","designation","updatedAt") VALUES ('ep-1','u-2','EMP-MIG','Driver','Driver',now());
      INSERT INTO "orders" ("id","orderNumber","status","paymentStatus","paymentMethod","orderType","totalAmount","netAmount","customerProfileId","updatedAt") VALUES ('ord-1','P9A-LEGACY-1','DISPATCHED','PAID','ONLINE','DIRECT',100,145.50,'cp-1',now()), ('ord-2','P9A-LEGACY-2','DISPATCHED','PAID','ONLINE','DIRECT',100,145.50,'cp-1',now());
      INSERT INTO "delivery_assignments" ("id","orderId","driverId","status") VALUES ('da-1','ord-1','ep-1','IN_TRANSIT');
      `
    );
    applyFile(legacy);

    scratch = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    const snapshot = async () => ({
      orders: await scratch.$queryRawUnsafe(`SELECT * FROM "orders" ORDER BY "id"`),
      assignments: await scratch.$queryRawUnsafe(`SELECT * FROM "delivery_assignments" ORDER BY "id"`),
      users: await scratch.$queryRawUnsafe(`SELECT * FROM "users" ORDER BY "id"`)
    });
    const before = JSON.stringify(await snapshot());
    applyFile(join(SERVER_ROOT, 'prisma', 'migrations', migrations[P9B], 'migration.sql'));
    expect(JSON.stringify(await snapshot())).toBe(before);
    expect(Number((await scratch.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) n FROM "delivery_proofs"`))[0].n)).toBe(0);
    const statuses = await scratch.$queryRawUnsafe<Array<{ status: string }>>(`SELECT status FROM "orders" ORDER BY "id"`);
    expect(statuses.map((s) => s.status)).toEqual(['DISPATCHED', 'DISPATCHED']);

    const insert = (cols: string, vals: string) => scratch.$executeRawUnsafe(`INSERT INTO "delivery_proofs" (${cols}) VALUES (${vals})`);
    // one proof per order (unique orderId)
    await insert(`"id","orderId","updatedAt"`, `'p-1','ord-1',now()`);
    await expect(insert(`"id","orderId","updatedAt"`, `'p-dup','ord-1',now()`)).rejects.toThrow();
    // CHECK constraints
    for (const [name, set] of [
      ['regeneration count above the cap', `"regenerationCount" = 11`],
      ['window counter above 3', `"regenerationCount" = 5, "regenerationsInWindow" = 4, "regenerationWindowStartedAt" = now()`],
      ['window counter above the lifetime count', `"regenerationCount" = 1, "regenerationsInWindow" = 2, "regenerationWindowStartedAt" = now()`],
      ['window counter without a window start', `"regenerationCount" = 2, "regenerationsInWindow" = 1, "regenerationWindowStartedAt" = NULL`],
      ['negative window counter', `"regenerationsInWindow" = -1`],
      ['negative regeneration count', `"regenerationCount" = -1`],
      ['more than five attempts in a window', `"failedAttempts" = 6`],
      ['more than three lock cycles', `"lockCycles" = 4`],
      ['blocked without three lock cycles', `"blockedAt" = now(), "lockCycles" = 2`],
      ['code version zero', `"codeVersion" = 0`],
      ['unknown method', `"method" = 'MAGIC', "verifiedAt" = now()`],
      ['method without verifiedAt', `"method" = 'PIN'`],
      ['verifiedAt without method', `"verifiedAt" = now()`],
      ['PIN completion without a hash and a verifying employee', `"method" = 'PIN', "verifiedAt" = now()`],
      ['override without operator / reason / note', `"method" = 'ADMIN_OVERRIDE', "verifiedAt" = now()`],
      ['override with a too-short note', `"method" = 'ADMIN_OVERRIDE', "verifiedAt" = now(), "overrideByUserId" = 'u-2', "overrideReasonCode" = 'OTHER', "overrideNote" = 'short'`]
    ] as const) {
      await expect(scratch.$executeRawUnsafe(`UPDATE "delivery_proofs" SET ${set} WHERE "id" = 'p-1'`), name).rejects.toThrow();
    }
    // valid completions are accepted
    await scratch.$executeRawUnsafe(`UPDATE "delivery_proofs" SET "codeHash" = '${'a'.repeat(64)}', "method" = 'PIN', "verifiedAt" = now(), "verifiedByEmployeeId" = 'ep-1' WHERE "id" = 'p-1'`);
    await insert(`"id","orderId","method","verifiedAt","overrideByUserId","overrideReasonCode","overrideNote","updatedAt"`, `'p-2','ord-2','ADMIN_OVERRIDE',now(),'u-2','OTHER','Customer confirmed by phone call',now()`);
    // RESTRICT: proof evidence blocks deleting its order / employee / operator
    await expect(scratch.$executeRawUnsafe(`DELETE FROM "orders" WHERE "id" = 'ord-1'`)).rejects.toThrow();
    await expect(scratch.$executeRawUnsafe(`DELETE FROM "users" WHERE "id" = 'u-2'`)).rejects.toThrow();

    const indexes = await scratch.$queryRawUnsafe<Array<{ indexname: string }>>(`SELECT indexname FROM pg_indexes WHERE tablename = 'delivery_proofs' ORDER BY indexname`);
    expect(indexes.map((i) => i.indexname)).toEqual(['delivery_proofs_orderId_key', 'delivery_proofs_pkey']);
    const fks = await scratch.$queryRawUnsafe<Array<{ conname: string; def: string }>>(`SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid = 'delivery_proofs'::regclass AND contype = 'f' ORDER BY conname`);
    expect(fks.map((f) => f.conname)).toEqual(['delivery_proofs_orderId_fkey', 'delivery_proofs_overrideByUserId_fkey', 'delivery_proofs_verifiedByEmployeeId_fkey']);
    for (const f of fks) expect(f.def).toMatch(/ON DELETE RESTRICT/);
    const checks = await scratch.$queryRawUnsafe<Array<{ conname: string }>>(`SELECT conname FROM pg_constraint WHERE conrelid = 'delivery_proofs'::regclass AND contype = 'c' ORDER BY conname`);
    expect(checks.map((c) => c.conname)).toEqual([
      'delivery_proofs_attempts_ck',
      'delivery_proofs_blocked_ck',
      'delivery_proofs_cycles_ck',
      'delivery_proofs_method_ck',
      'delivery_proofs_override_ck',
      'delivery_proofs_pin_ck',
      'delivery_proofs_regen_ck',
      'delivery_proofs_regen_window_ck',
      'delivery_proofs_verified_ck',
      'delivery_proofs_version_ck'
    ]);
  }, 180000);
});

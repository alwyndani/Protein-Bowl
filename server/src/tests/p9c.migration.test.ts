import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ATTEMPT_OUTCOMES, MAX_DELIVERY_ATTEMPTS } from '../modules/delivery/deliveryAttemptPolicy.js';

/**
 * Replays the REAL migration files into a throwaway database (the shared test DB is never touched):
 *  1. applies every migration BEFORE P9C (1-14),
 *  2. inserts P9B-era rows (a DISPATCHED order with an IN_TRANSIT assignment and one with a FAILED assignment),
 *  3. applies the P9C migration (#15),
 *  4. checks every existing row survived, nothing was backfilled, existing assignments are attempt 1 with failedAt = NULL, and the
 *     delivery_attempts guarantees (unique, allow-list, caps, RESTRICT FKs) hold in PostgreSQL.
 * Needs the local `postgres` superuser (same requirement as the earlier migration suites).
 */
const SERVER_ROOT = join(__dirname, '..', '..');
const PRISMA_CLI = join(SERVER_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
const dbName = `pb_p9c_mig_${Date.now()}`;
const dbUrl = `postgresql://postgres:postgres@localhost:5432/${dbName}?schema=public`;

const migrations = readdirSync(join(SERVER_ROOT, 'prisma', 'migrations'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const P9C = migrations.findIndex((m) => m.includes('p9c_delivery_attempts'));
const applyFile = (file: string) => execFileSync(process.execPath, [PRISMA_CLI, 'db', 'execute', '--url', dbUrl, '--file', file], { cwd: SERVER_ROOT, stdio: 'pipe' });

describe('P9C migration (#15): additive, no backfill, and the DeliveryAttempt guarantees hold in PostgreSQL', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let scratch: PrismaClient;
  let tmp: string;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'pb-p9c-'));
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

  it('the chain has at least 15 migrations and #15 sorts directly after the P9B migration', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(15); // later phases append (P10A adds #16)
    expect(P9C).toBe(14);
    expect(migrations[P9C - 1]).toContain('p9b_delivery_proof');
    expect(migrations[P9C] > migrations[P9C - 1]).toBe(true);
  });

  it('is purely additive: adds two columns to delivery_assignments and creates delivery_attempts; the 3 mirrors MAX_DELIVERY_ATTEMPTS; no append-only trigger', () => {
    const sql = readFileSync(join(SERVER_ROOT, 'prisma', 'migrations', migrations[P9C], 'migration.sql'), 'utf8').replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"(?!delivery_assignments"|delivery_attempts")/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+"|\bINSERT\s+INTO\b/i);
    expect(sql).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER)/i); // decision B3: no database trigger, append-only is an application guarantee
    expect(sql).toMatch(/CREATE TABLE "delivery_attempts"/);
    expect(sql).toContain(`"attemptNumber" BETWEEN 1 AND ${MAX_DELIVERY_ATTEMPTS}`);
    expect(sql).toContain(`"attemptNumber" < ${MAX_DELIVERY_ATTEMPTS}`);
    for (const o of ATTEMPT_OUTCOMES) expect(sql).toContain(`'${o}'`);
  });

  it('existing assignments become attempt 1 with failedAt NULL, nothing is backfilled or delivered, and the table guarantees work', async () => {
    for (const m of migrations.slice(0, P9C)) {
      const file = join(SERVER_ROOT, 'prisma', 'migrations', m, 'migration.sql');
      expect(existsSync(file)).toBe(true);
      applyFile(file);
    }
    const legacy = join(tmp, 'p9b-rows.sql');
    writeFileSync(
      legacy,
      `
      INSERT INTO "users" ("id","email","passwordHash","updatedAt") VALUES ('u-1','mig@p9c.test','x',now()), ('u-2','admin@p9c.test','x',now());
      INSERT INTO "customer_profiles" ("id","userId","fullName","referralCode","updatedAt") VALUES ('cp-1','u-1','Mig','PB-MIG9C',now());
      INSERT INTO "employee_profiles" ("id","userId","employeeCode","fullName","designation","updatedAt") VALUES ('ep-1','u-2','EMP-MIG','Driver','Driver',now());
      INSERT INTO "kitchen_branches" ("id","code","name","address","city","updatedAt") VALUES ('kb-1','mig-kb','Mig Branch','A','Kochi',now());
      INSERT INTO "orders" ("id","orderNumber","status","paymentStatus","paymentMethod","orderType","totalAmount","netAmount","customerProfileId","updatedAt") VALUES ('ord-1','P9B-LEGACY-1','DISPATCHED','PAID','ONLINE','DIRECT',100,145.50,'cp-1',now()), ('ord-2','P9B-LEGACY-2','DISPATCHED','PAID','ONLINE','DIRECT',100,145.50,'cp-1',now());
      INSERT INTO "delivery_assignments" ("id","orderId","driverId","status","deliveryNotes") VALUES ('da-1','ord-1','ep-1','IN_TRANSIT',NULL), ('da-2','ord-2','ep-1','FAILED','PBFAIL1:{"reasonCode":"OTHER"}');
      `
    );
    applyFile(legacy);

    scratch = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    const snapshot = async () => ({
      orders: await scratch.$queryRawUnsafe(`SELECT * FROM "orders" ORDER BY "id"`),
      assignments: await scratch.$queryRawUnsafe(`SELECT "id","orderId","driverId","branchId","status","pickupTime","deliveryTime","deliveryNotes","podImageUrl","temperatureC","createdAt" FROM "delivery_assignments" ORDER BY "id"`),
      users: await scratch.$queryRawUnsafe(`SELECT * FROM "users" ORDER BY "id"`)
    });
    const before = JSON.stringify(await snapshot());
    applyFile(join(SERVER_ROOT, 'prisma', 'migrations', migrations[P9C], 'migration.sql'));
    expect(JSON.stringify(await snapshot())).toBe(before);
    const live = await scratch.$queryRawUnsafe<Array<{ attemptNumber: number; failedAt: Date | null; status: string }>>(`SELECT "attemptNumber","failedAt",status FROM "delivery_assignments" ORDER BY "id"`);
    expect(live.map((r) => r.attemptNumber)).toEqual([1, 1]);
    expect(live.map((r) => r.failedAt)).toEqual([null, null]); // never fabricated
    expect(live.map((r) => r.status)).toEqual(['IN_TRANSIT', 'FAILED']);
    expect(Number((await scratch.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) n FROM "delivery_attempts"`))[0].n)).toBe(0); // no backfill
    expect((await scratch.$queryRawUnsafe<Array<{ status: string }>>(`SELECT status FROM "orders" ORDER BY "id"`)).map((s) => s.status)).toEqual(['DISPATCHED', 'DISPATCHED']);

    // assignment CHECK: attemptNumber 1..3
    for (const v of [0, 4]) await expect(scratch.$executeRawUnsafe(`UPDATE "delivery_assignments" SET "attemptNumber" = ${v} WHERE "id" = 'da-1'`), `assignment attempt ${v}`).rejects.toThrow();

    const attempt = (over: Record<string, string>) => {
      const row: Record<string, string> = {
        id: `'a-${Math.random().toString(36).slice(2)}'`,
        orderId: `'ord-1'`,
        attemptNumber: '1',
        driverId: `'ep-1'`,
        branchId: `'kb-1'`,
        failureReasonCode: `'OTHER'`,
        proofCodeVersion: '1',
        outcome: `'RETRY_SAME_DRIVER'`,
        resolvedByUserId: `'u-2'`,
        resolutionReasonCode: `'OPERATIONAL_RETRY'`,
        ...over
      };
      return scratch.$executeRawUnsafe(`INSERT INTO "delivery_attempts" (${Object.keys(row).map((k) => `"${k}"`).join(',')}) VALUES (${Object.values(row).join(',')})`);
    };
    await attempt({ id: `'a-ok'` });
    await expect(attempt({}), 'unique (orderId, attemptNumber)').rejects.toThrow();
    await expect(attempt({ attemptNumber: '0' }), 'attempt 0').rejects.toThrow();
    await expect(attempt({ attemptNumber: '4' }), 'attempt 4').rejects.toThrow();
    await expect(attempt({ attemptNumber: '2', outcome: `'MAGIC'` }), 'unknown outcome').rejects.toThrow();
    await expect(attempt({ attemptNumber: '3', outcome: `'RETRY_SAME_DRIVER'` }), 'retry archived at attempt 3').rejects.toThrow();
    await expect(attempt({ attemptNumber: '3', outcome: `'REASSIGNED'` }), 'reassign archived at attempt 3').rejects.toThrow();
    await expect(attempt({ attemptNumber: '2', proofCodeVersion: '0' }), 'proof version 0').rejects.toThrow();
    await expect(attempt({ attemptNumber: '2', failureReasonCode: `''` }), 'empty failure reason').rejects.toThrow();
    await expect(attempt({ attemptNumber: '2', resolutionReasonCode: `''` }), 'empty resolution reason').rejects.toThrow();
    await expect(attempt({ attemptNumber: '2', failureNote: `'${'x'.repeat(201)}'` }), 'long failure note').rejects.toThrow();
    await expect(attempt({ attemptNumber: '2', resolutionNote: `'${'x'.repeat(201)}'` }), 'long resolution note').rejects.toThrow();
    await expect(attempt({ attemptNumber: '2', orderId: `'missing-order'` }), 'order FK').rejects.toThrow();
    await expect(attempt({ attemptNumber: '2', resolvedByUserId: `'missing-user'` }), 'user FK').rejects.toThrow();
    // the end states that ARE allowed at attempt 3
    await attempt({ attemptNumber: '3', outcome: `'UNDELIVERABLE_CANCELLED'`, resolutionReasonCode: `'CUSTOMER_REFUSED'` });
    await attempt({ orderId: `'ord-2'`, attemptNumber: '3', outcome: `'ADMIN_OVERRIDE_DELIVERED'`, resolutionReasonCode: `'OTHER'` });

    // RESTRICT: attempt evidence blocks deleting its order / employee / branch / resolver
    for (const stmt of [`DELETE FROM "orders" WHERE "id" = 'ord-1'`, `DELETE FROM "employee_profiles" WHERE "id" = 'ep-1'`, `DELETE FROM "kitchen_branches" WHERE "id" = 'kb-1'`, `DELETE FROM "users" WHERE "id" = 'u-2'`]) {
      await expect(scratch.$executeRawUnsafe(stmt), stmt).rejects.toThrow();
    }

    const indexes = await scratch.$queryRawUnsafe<Array<{ indexname: string }>>(`SELECT indexname FROM pg_indexes WHERE tablename = 'delivery_attempts' ORDER BY indexname`);
    expect(indexes.map((i) => i.indexname)).toEqual(['delivery_attempts_orderId_attemptNumber_key', 'delivery_attempts_pkey']);
    const fks = await scratch.$queryRawUnsafe<Array<{ conname: string; def: string }>>(`SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid = 'delivery_attempts'::regclass AND contype = 'f' ORDER BY conname`);
    expect(fks.map((f) => f.conname)).toEqual(['delivery_attempts_branchId_fkey', 'delivery_attempts_driverId_fkey', 'delivery_attempts_orderId_fkey', 'delivery_attempts_resolvedByUserId_fkey']);
    for (const f of fks) expect(f.def).toMatch(/ON DELETE RESTRICT/);
    const checks = await scratch.$queryRawUnsafe<Array<{ conname: string }>>(`SELECT conname FROM pg_constraint WHERE conrelid = 'delivery_attempts'::regclass AND contype = 'c' ORDER BY conname`);
    expect(checks.map((c) => c.conname)).toEqual([
      'delivery_attempts_attempt_ck',
      'delivery_attempts_failure_ck',
      'delivery_attempts_outcome_ck',
      'delivery_attempts_resolution_ck',
      'delivery_attempts_retry_cap_ck',
      'delivery_attempts_version_ck'
    ]);
    const triggers = await scratch.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) n FROM pg_trigger WHERE tgrelid = 'delivery_attempts'::regclass AND NOT tgisinternal`);
    expect(Number(triggers[0].n)).toBe(0); // append-only is enforced by the application, not by a database trigger
  }, 240000);
});

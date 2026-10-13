import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Replays the REAL migration files into a throwaway database (the shared test DB is never touched): #1-#17 + P10B-era data (an ACTIVE subscription whose meal sits in a
 * READY batch), then #18 -> the data survives untouched and every P10C guarantee holds in PostgreSQL. Needs the local `postgres` superuser (as the other migration tests).
 */
const SERVER_ROOT = join(__dirname, '..', '..');
const PRISMA_CLI = join(SERVER_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
const dbA = `pb_p10c_mig_a_${Date.now()}`;
const urlOf = (db: string) => `postgresql://postgres:postgres@localhost:5432/${db}?schema=public`;

const migrations = readdirSync(join(SERVER_ROOT, 'prisma', 'migrations'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const P10C = migrations.findIndex((m) => m.includes('p10c_mess_delivery'));
const applyFile = (url: string, file: string) => execFileSync(process.execPath, [PRISMA_CLI, 'db', 'execute', '--url', url, '--file', file], { cwd: SERVER_ROOT, stdio: 'pipe' });
const migrationFile = (name: string) => join(SERVER_ROOT, 'prisma', 'migrations', name, 'migration.sql');
const sha = (name: string) => createHash('sha256').update(readFileSync(migrationFile(name))).digest('hex');

const SEED_SQL = `
  INSERT INTO "users" ("id","email","passwordHash","updatedAt") VALUES ('u-1','mig@p10c.test','x',now());
  INSERT INTO "customer_profiles" ("id","userId","fullName","referralCode","updatedAt") VALUES ('cp-1','u-1','Mig','PB-MIG10C',now());
  INSERT INTO "employee_profiles" ("id","userId","employeeCode","fullName","designation","updatedAt") VALUES ('ep-1','u-1','E-MIG','Mig','Driver',now());
  INSERT INTO "kitchen_branches" ("id","code","name","address","city","updatedAt") VALUES ('kb-1','mig-kb','Mig Branch','A','Kochi',now());
  INSERT INTO "mess_service_points" ("id","code","name","addressLine","city","postalCode","branchId","updatedAt") VALUES ('sp-1','SP-MIG','S','a','c','1','kb-1',now());
  INSERT INTO "mess_accounts" ("id","customerProfileId","collegeHostelName","roomNumber","approvalStatus","servicePointId","reviewedAt","reviewedByUserId","updatedAt") VALUES ('ma-1','cp-1','S','12','APPROVED','sp-1',now(),'u-1',now());
  INSERT INTO "mess_subscription_plans" ("id","name","code","durationDays","mealsPerDay","basePrice") VALUES ('pl-1','Plan','PL-MIG',30,2,100.00);
  INSERT INTO "mess_subscriptions" ("id","messAccountId","planId","status","startDate","endDate","totalMealsAllowed","mealsRemaining","activatedAt","updatedAt") VALUES ('ms-1','ma-1','pl-1','ACTIVE','2026-11-01','2026-11-30',60,60,now(),now());
  INSERT INTO "mess_meal_batches" ("id","branchId","mealDate","slot","status","mealCount","startedByUserId","readyAt","readyByUserId") VALUES ('b-1','kb-1','2026-11-01','LUNCH','READY',1,'u-1',now(),'u-1');
  INSERT INTO "mess_daily_orders" ("id","messSubscriptionId","date","slot","branchId","servicePointId","serviceAt","batchId") VALUES ('m-1','ms-1','2026-11-01','LUNCH','kb-1','sp-1',now(),'b-1');
`;

describe('P10C migration (#18): additive bulk-delivery model, replaced meal CHECKs, integrity guarantees in PostgreSQL', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let a: PrismaClient;
  let tmp: string;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'pb-p10c-'));
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbA}"`);
  }, 60000);

  afterAll(async () => {
    await a?.$disconnect();
    try {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbA}" WITH (FORCE)`);
    } finally {
      await admin.$disconnect();
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);

  it('the chain has at least 18 migrations, #18 sorts directly after the P10B migration, and #14 / #16 / #17 are untouched', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(18);
    expect(P10C).toBe(17);
    expect(migrations[P10C - 1]).toContain('p10b_mess_meals');
    expect(migrations[P10C] > migrations[P10C - 1]).toBe(true);
    expect(sha('20261011180025_p9b_delivery_proof')).toBe('e7d60224084ebd55c644ff8ba31776377d50c2c6450d3056c3061db85b466b6f');
    expect(sha('20261012131557_p10a_mess_foundation')).toBe('2dc8218842d84d065a6d06c1c10ed29be70df5ea3c743b799817755f90a519e4');
    expect(sha('20261012174358_p10b_mess_meals')).toBe('171c47bd0ff7cf45ae0a6977671e8ef9d98e125b728dd4a370335dfed4269282');
  });

  it('adds nothing destructive: no table / column / index drop, no DELETE, TRUNCATE, UPDATE or INSERT; the only DROPs replace the two meal CHECKs of #17', () => {
    const sql = readFileSync(migrationFile(migrations[P10C]), 'utf8').replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bINSERT\s+INTO\b|\bUPDATE\s+"/i);
    expect([...sql.matchAll(/DROP\s+CONSTRAINT\s+"([^"]+)"/gi)].map((m) => m[1]).sort()).toEqual(['mess_meals_batch_ck', 'mess_meals_status_ck']);
  });

  it('P10B-era data survives untouched and the new catalog is exactly as designed', async () => {
    for (const m of migrations.slice(0, P10C)) {
      const file = migrationFile(m);
      expect(existsSync(file)).toBe(true);
      applyFile(urlOf(dbA), file);
    }
    const seed = join(tmp, 'seed-a.sql');
    writeFileSync(seed, SEED_SQL);
    applyFile(urlOf(dbA), seed);
    a = new PrismaClient({ datasources: { db: { url: urlOf(dbA) } } });
    applyFile(urlOf(dbA), migrationFile(migrations[P10C]));

    const meal = await a.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT status, "batchId", "deliveryStopId", "fulfilledAt" FROM "mess_daily_orders"`);
    expect(meal).toEqual([{ status: 'SCHEDULED', batchId: 'b-1', deliveryStopId: null, fulfilledAt: null }]); // never auto-released, never auto-fulfilled
    expect(await a.$queryRawUnsafe(`SELECT count(*)::int n FROM "mess_delivery_runs"`)).toEqual([{ n: 0 }]);
    expect(await a.$queryRawUnsafe(`SELECT "deliveryInstructions" FROM "mess_service_points"`)).toEqual([{ deliveryInstructions: null }]);

    const fks = await a.$queryRawUnsafe<Array<{ conname: string; def: string }>>(
      `SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE contype = 'f' AND (conrelid = 'mess_delivery_runs'::regclass OR conrelid = 'mess_delivery_stops'::regclass OR conname = 'mess_daily_orders_deliveryStopId_fkey') ORDER BY conname`
    );
    expect(fks).toHaveLength(10);
    for (const f of fks) expect(f.def, f.conname).toMatch(/ON DELETE RESTRICT/);
    const idx = await a.$queryRawUnsafe<Array<{ indexname: string }>>(`SELECT indexname FROM pg_indexes WHERE indexname IN ('mess_delivery_runs_batchId_key','mess_delivery_stops_runId_servicePointId_key')`);
    expect(idx.map((i) => i.indexname).sort()).toEqual(['mess_delivery_runs_batchId_key', 'mess_delivery_stops_runId_servicePointId_key']);
    const checks = await a.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname LIKE ANY (ARRAY['mess_runs_%_ck','mess_stops_%_ck','mess_sp_instructions_ck','mess_meals_%_ck']) ORDER BY conname`
    );
    expect(checks.map((c) => c.conname)).toEqual([
      'mess_meals_batch_ck', 'mess_meals_fulfilled_ck', 'mess_meals_slot_ck', 'mess_meals_status_ck', 'mess_meals_stop_ck',
      'mess_runs_claim_ck', 'mess_runs_counts_ck', 'mess_runs_dispatch_ck', 'mess_runs_slot_ck', 'mess_runs_status_ck', 'mess_runs_terminal_ck',
      'mess_sp_instructions_ck',
      'mess_stops_closed_ck', 'mess_stops_code_ck', 'mess_stops_counters_ck', 'mess_stops_failed_ck', 'mess_stops_handed_ck', 'mess_stops_method_ck', 'mess_stops_status_ck'
    ]);
  }, 240000);

  it('the integrity checks accept the legal lifecycle and reject every incoherent row', async () => {
    const run = (sql: string) => a.$executeRawUnsafe(sql);
    await run(`INSERT INTO "mess_delivery_runs" ("id","batchId","branchId","mealDate","slot","stopCount","mealCount","releasedByUserId") VALUES ('r-1','b-1','kb-1','2026-11-01','LUNCH',1,1,'u-1')`);
    await expect(run(`INSERT INTO "mess_delivery_runs" ("id","batchId","branchId","mealDate","slot","stopCount","mealCount","releasedByUserId") VALUES ('r-2','b-1','kb-1','2026-11-01','LUNCH',1,1,'u-1')`), 'one run per batch').rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_runs" SET status = 'CLAIMED' WHERE id = 'r-1'`), 'CLAIMED needs an owner').rejects.toThrow();
    await run(`UPDATE "mess_delivery_runs" SET status = 'CLAIMED', "claimedByEmployeeId" = 'ep-1', "claimedAt" = now() WHERE id = 'r-1'`);
    await expect(run(`UPDATE "mess_delivery_runs" SET status = 'IN_TRANSIT' WHERE id = 'r-1'`), 'IN_TRANSIT needs dispatchedAt').rejects.toThrow();
    await run(`UPDATE "mess_delivery_runs" SET status = 'IN_TRANSIT', "dispatchedAt" = now() WHERE id = 'r-1'`);
    await expect(run(`UPDATE "mess_delivery_runs" SET status = 'COMPLETED' WHERE id = 'r-1'`), 'COMPLETED needs completedAt').rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_runs" SET "stopCount" = 0 WHERE id = 'r-1'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_runs" SET slot = 'SNACK' WHERE id = 'r-1'`)).rejects.toThrow();

    const stop = (id: string, extra = '') => run(`INSERT INTO "mess_delivery_stops" ("id","runId","servicePointId","servicePointName","addressLine","city","postalCode","expectedQuantity"${extra ? ',' + extra.split('|')[0] : ''}) VALUES ('${id}','r-1','sp-1','S','a','c','1',1${extra ? ',' + extra.split('|')[1] : ''})`);
    await stop('s-1');
    await expect(stop('s-2'), 'one stop per service point per run').rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_stops" SET "attemptCount" = 4 WHERE id = 's-1'`), 'attempt cap').rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_stops" SET "regenerationCount" = 4 WHERE id = 's-1'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_stops" SET "failedCodeAttempts" = 6 WHERE id = 's-1'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_stops" SET status = 'HANDED_OVER' WHERE id = 's-1'`), 'HANDED_OVER needs evidence').rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_stops" SET status = 'HANDED_OVER', "handedOverAt" = now(), "handoverMethod" = 'CODE' WHERE id = 's-1'`), 'CODE needs the driver').rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_stops" SET status = 'HANDED_OVER', "handedOverAt" = now(), "handoverMethod" = 'ADMIN_OVERRIDE' WHERE id = 's-1'`), 'override needs actor + reason + note').rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_stops" SET status = 'FAILED' WHERE id = 's-1'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_stops" SET status = 'CLOSED_UNDELIVERED' WHERE id = 's-1'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_delivery_stops" SET "codeHash" = 'ab' WHERE id = 's-1'`), 'a hash needs recipient, version and dates').rejects.toThrow();
    await run(`UPDATE "mess_delivery_stops" SET "codeHash" = 'ab', "codeVersion" = 1, "codeIssuedAt" = now(), "codeExpiresAt" = now(), "recipientCustomerProfileId" = 'cp-1' WHERE id = 's-1'`);
    await run(`UPDATE "mess_delivery_stops" SET status = 'HANDED_OVER', "handedOverAt" = now(), "handoverMethod" = 'CODE', "handedOverByEmployeeId" = 'ep-1' WHERE id = 's-1'`);
    await run(`UPDATE "mess_delivery_runs" SET status = 'COMPLETED', "completedAt" = now() WHERE id = 'r-1'`);

    // meals: the widened vocabulary and the evidence rules
    await expect(run(`UPDATE "mess_daily_orders" SET status = 'FULFILLED' WHERE id = 'm-1'`), 'FULFILLED needs fulfilledAt').rejects.toThrow();
    await expect(run(`UPDATE "mess_daily_orders" SET status = 'MAYBE' WHERE id = 'm-1'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_daily_orders" SET "deliveryStopId" = 's-1', "batchId" = NULL WHERE id = 'm-1'`), 'a stop member must be batched').rejects.toThrow();
    await run(`UPDATE "mess_daily_orders" SET "deliveryStopId" = 's-1', status = 'FULFILLED', "fulfilledAt" = now() WHERE id = 'm-1'`);
    await run(`UPDATE "mess_daily_orders" SET status = 'NOT_DELIVERED', "fulfilledAt" = NULL WHERE id = 'm-1'`); // a batched meal may be NOT_DELIVERED
    await expect(run(`UPDATE "mess_daily_orders" SET status = 'PAUSED' WHERE id = 'm-1'`), 'a batched meal can never be paused').rejects.toThrow();
    await expect(run(`DELETE FROM "mess_delivery_stops" WHERE id = 's-1'`), 'RESTRICT: a stop with members').rejects.toThrow();
    await expect(run(`DELETE FROM "mess_delivery_runs" WHERE id = 'r-1'`), 'RESTRICT: a run with stops').rejects.toThrow();
    await expect(run(`UPDATE "mess_service_points" SET "deliveryInstructions" = '${'x'.repeat(301)}'`)).rejects.toThrow();
    await run(`UPDATE "mess_service_points" SET "deliveryInstructions" = '${'x'.repeat(300)}'`);
    await expect(run(`UPDATE "mess_service_points" SET "deliveryInstructions" = ''`)).rejects.toThrow();
  }, 120000);
});

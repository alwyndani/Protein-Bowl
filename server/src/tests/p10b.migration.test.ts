import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Replays the REAL migration files into throwaway databases (the shared test DB is never touched):
 *  A. #1-#16 + a P10A-era ACTIVE subscription (no meals), then #17 -> the subscription survives untouched, and every P10B guarantee holds in PostgreSQL;
 *  B. #1-#16 + a legacy mess_daily_orders row -> #17 refuses to run (it never deletes or invents legacy meal data).
 * Needs the local `postgres` superuser (same requirement as the other migration tests).
 */
const SERVER_ROOT = join(__dirname, '..', '..');
const PRISMA_CLI = join(SERVER_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
const stamp = Date.now();
const dbA = `pb_p10b_mig_a_${stamp}`;
const dbB = `pb_p10b_mig_b_${stamp}`;
const urlOf = (db: string) => `postgresql://postgres:postgres@localhost:5432/${db}?schema=public`;

const migrations = readdirSync(join(SERVER_ROOT, 'prisma', 'migrations'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const P10B = migrations.findIndex((m) => m.includes('p10b_mess_meals'));
const applyFile = (url: string, file: string) => execFileSync(process.execPath, [PRISMA_CLI, 'db', 'execute', '--url', url, '--file', file], { cwd: SERVER_ROOT, stdio: 'pipe' });
const migrationFile = (name: string) => join(SERVER_ROOT, 'prisma', 'migrations', name, 'migration.sql');

const SEED_SQL = (suffix: string, withLegacyMeal: boolean) => `
  INSERT INTO "users" ("id","email","passwordHash","updatedAt") VALUES ('u-1','mig@p10b-${suffix}.test','x',now());
  INSERT INTO "customer_profiles" ("id","userId","fullName","referralCode","updatedAt") VALUES ('cp-1','u-1','Mig','PB-MIG10B${suffix}',now());
  INSERT INTO "kitchen_branches" ("id","code","name","address","city","updatedAt") VALUES ('kb-1','mig-kb-${suffix}','Mig Branch','A','Kochi',now());
  INSERT INTO "mess_service_points" ("id","code","name","addressLine","city","postalCode","branchId","updatedAt") VALUES ('sp-1','SP-${suffix}','S','a','c','1','kb-1',now());
  INSERT INTO "mess_accounts" ("id","customerProfileId","collegeHostelName","roomNumber","approvalStatus","servicePointId","reviewedAt","reviewedByUserId","updatedAt") VALUES ('ma-1','cp-1','S','12','APPROVED','sp-1',now(),'u-1',now());
  INSERT INTO "mess_subscription_plans" ("id","name","code","durationDays","mealsPerDay","basePrice") VALUES ('pl-1','Plan','PL-${suffix}',30,2,100.00);
  INSERT INTO "mess_subscriptions" ("id","messAccountId","planId","status","startDate","endDate","totalMealsAllowed","mealsRemaining","activatedAt","updatedAt") VALUES ('ms-1','ma-1','pl-1','ACTIVE','2026-11-01','2026-11-30',60,60,now(),now());
  ${withLegacyMeal ? `INSERT INTO "mess_daily_orders" ("id","messSubscriptionId","date","slot","status") VALUES ('md-1','ms-1','2026-11-01','LUNCH','CONSUMED');` : ''}
`;

describe('P10B migration (#17): additive meal model, guarded legacy table, integrity guarantees in PostgreSQL', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let a: PrismaClient;
  let tmp: string;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'pb-p10b-'));
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbA}"`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbB}"`);
  }, 60000);

  afterAll(async () => {
    await a?.$disconnect();
    try {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbA}" WITH (FORCE)`);
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbB}" WITH (FORCE)`);
    } finally {
      await admin.$disconnect();
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);

  it('the chain has at least 17 migrations and #17 sorts directly after the P10A migration', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(17);
    expect(P10B).toBe(16);
    expect(migrations[P10B - 1]).toContain('p10a_mess_foundation');
    expect(migrations[P10B] > migrations[P10B - 1]).toBe(true);
  });

  it('adds no destructive statement: no DROP, no DELETE, no TRUNCATE, no UPDATE, no INSERT (apart from the guard)', () => {
    const sql = readFileSync(migrationFile(migrations[P10B]), 'utf8').replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bINSERT\s+INTO\b|\bUPDATE\s+"/i);
  });

  it('a P10A-era subscription survives untouched; the catalog guarantees hold', async () => {
    for (const m of migrations.slice(0, P10B)) {
      const file = migrationFile(m);
      expect(existsSync(file)).toBe(true);
      applyFile(urlOf(dbA), file);
    }
    const seed = join(tmp, 'seed-a.sql');
    writeFileSync(seed, SEED_SQL('a', false));
    applyFile(urlOf(dbA), seed);
    a = new PrismaClient({ datasources: { db: { url: urlOf(dbA) } } });
    applyFile(urlOf(dbA), migrationFile(migrations[P10B]));

    const sub = await a.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT status, "slotTimes", "mealsGeneratedAt", "totalMealsAllowed" FROM "mess_subscriptions"`);
    expect(sub).toEqual([{ status: 'ACTIVE', slotTimes: null, mealsGeneratedAt: null, totalMealsAllowed: 60 }]); // never auto-generated, never given invented times
    const cols = await a.$queryRawUnsafe<Array<{ column_name: string; is_nullable: string }>>(`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'mess_daily_orders' AND column_name IN ('branchId','servicePointId','serviceAt','batchId','pausedAt')`);
    const nullable = Object.fromEntries(cols.map((c) => [c.column_name, c.is_nullable]));
    expect(nullable).toEqual({ branchId: 'NO', servicePointId: 'NO', serviceAt: 'NO', batchId: 'YES', pausedAt: 'YES' });

    const fks = await a.$queryRawUnsafe<Array<{ conname: string; def: string }>>(
      `SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE contype = 'f' AND (conrelid = 'mess_daily_orders'::regclass OR conrelid = 'mess_meal_batches'::regclass OR conrelid = 'mess_meal_events'::regclass) AND conname NOT LIKE '%messSubscriptionId_fkey' ORDER BY conname`
    );
    expect(fks.length).toBeGreaterThanOrEqual(8);
    for (const f of fks) expect(f.def, f.conname).toMatch(/ON DELETE RESTRICT/);
    const idx = await a.$queryRawUnsafe<Array<{ indexname: string }>>(`SELECT indexname FROM pg_indexes WHERE indexname IN ('mess_meal_batches_branchId_mealDate_slot_key','mess_daily_orders_messSubscriptionId_date_slot_key')`);
    expect(idx.map((i) => i.indexname).sort()).toEqual(['mess_daily_orders_messSubscriptionId_date_slot_key', 'mess_meal_batches_branchId_mealDate_slot_key']);
    const checks = await a.$queryRawUnsafe<Array<{ conname: string }>>(`SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname IN ('mess_meals_status_ck','mess_meals_slot_ck','mess_meals_batch_ck','mess_batches_status_ck','mess_batches_slot_ck','mess_batches_count_ck','mess_batches_ready_ck','mess_events_action_ck','mess_events_count_ck','mess_plans_slottimes_ck','mess_subs_slottimes_ck','mess_subs_pauses_ck')`);
    expect(checks).toHaveLength(12);
  }, 240000);

  it('the integrity checks reject invalid rows', async () => {
    const run = (sql: string) => a.$executeRawUnsafe(sql);
    const meal = (id: string, over = '') => run(`INSERT INTO "mess_daily_orders" ("id","messSubscriptionId","date","slot","branchId","servicePointId","serviceAt"${over ? ',' + over.split('|')[0] : ''}) VALUES ('${id}','ms-1','2026-11-0${id.slice(-1)}','LUNCH','kb-1','sp-1',now()${over ? ',' + over.split('|')[1] : ''})`);
    await meal('m-1');
    await expect(meal('m-1'), 'duplicate id').rejects.toThrow();
    await expect(run(`INSERT INTO "mess_daily_orders" ("id","messSubscriptionId","date","slot","branchId","servicePointId","serviceAt") VALUES ('m-dup','ms-1','2026-11-01','LUNCH','kb-1','sp-1',now())`), 'unique subscription+date+slot').rejects.toThrow();
    await expect(run(`INSERT INTO "mess_daily_orders" ("id","messSubscriptionId","date","slot","branchId","servicePointId","serviceAt","status") VALUES ('m-x','ms-1','2026-11-02','LUNCH','kb-1','sp-1',now(),'MAYBE')`)).rejects.toThrow();
    await expect(run(`INSERT INTO "mess_daily_orders" ("id","messSubscriptionId","date","slot","branchId","servicePointId","serviceAt") VALUES ('m-s','ms-1','2026-11-02','SNACK','kb-1','sp-1',now())`)).rejects.toThrow();
    await expect(run(`INSERT INTO "mess_daily_orders" ("id","messSubscriptionId","date","slot","branchId","servicePointId","serviceAt") VALUES ('m-f','ms-1','2026-11-02','LUNCH','missing','sp-1',now())`), 'branch FK').rejects.toThrow();

    await run(`INSERT INTO "mess_meal_batches" ("id","branchId","mealDate","slot","mealCount","startedByUserId") VALUES ('b-1','kb-1','2026-11-01','LUNCH',1,'u-1')`);
    await expect(run(`INSERT INTO "mess_meal_batches" ("id","branchId","mealDate","slot","mealCount","startedByUserId") VALUES ('b-2','kb-1','2026-11-01','LUNCH',1,'u-1')`), 'unique branch+date+slot').rejects.toThrow();
    await expect(run(`UPDATE "mess_meal_batches" SET "mealCount" = 0 WHERE id = 'b-1'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_meal_batches" SET status = 'READY' WHERE id = 'b-1'`), 'READY needs readyAt + readyBy').rejects.toThrow();
    await run(`UPDATE "mess_meal_batches" SET status = 'READY', "readyAt" = now(), "readyByUserId" = 'u-1' WHERE id = 'b-1'`);
    await run(`UPDATE "mess_daily_orders" SET "batchId" = 'b-1' WHERE id = 'm-1'`);
    await expect(run(`UPDATE "mess_daily_orders" SET status = 'PAUSED' WHERE id = 'm-1'`), 'a batched meal cannot be paused').rejects.toThrow();
    await expect(run(`DELETE FROM "mess_meal_batches" WHERE id = 'b-1'`), 'RESTRICT: batch with members').rejects.toThrow();

    await run(`INSERT INTO "mess_meal_events" ("id","messSubscriptionId","mealId","action","actorUserId","pausesUsedAfter") VALUES ('e-1','ms-1','m-1','PAUSE','u-1',1)`);
    await expect(run(`INSERT INTO "mess_meal_events" ("id","messSubscriptionId","mealId","action","actorUserId","pausesUsedAfter") VALUES ('e-2','ms-1','m-1','REFUND','u-1',1)`)).rejects.toThrow();
    await expect(run(`INSERT INTO "mess_meal_events" ("id","messSubscriptionId","mealId","action","actorUserId","pausesUsedAfter") VALUES ('e-3','ms-1','m-1','PAUSE','u-1',-1)`)).rejects.toThrow();
    await expect(run(`DELETE FROM "mess_daily_orders" WHERE id = 'm-1'`), 'RESTRICT: a meal with evidence').rejects.toThrow();

    await run(`UPDATE "mess_subscriptions" SET "maxPauses" = 2, "totalPausesUsed" = 2 WHERE id = 'ms-1'`);
    await expect(run(`UPDATE "mess_subscriptions" SET "totalPausesUsed" = 3 WHERE id = 'ms-1'`), 'counter above allowance').rejects.toThrow();
    await expect(run(`UPDATE "mess_subscriptions" SET "slotTimes" = '[]'::jsonb WHERE id = 'ms-1'`)).rejects.toThrow();
    await run(`UPDATE "mess_subscriptions" SET "slotTimes" = '{"LUNCH":"13:00"}'::jsonb WHERE id = 'ms-1'`);
  }, 120000);

  it('refuses to run when a legacy mess_daily_orders row exists (nothing is deleted or invented)', () => {
    for (const m of migrations.slice(0, P10B)) applyFile(urlOf(dbB), migrationFile(m));
    const seed = join(tmp, 'seed-b.sql');
    writeFileSync(seed, SEED_SQL('b', true));
    applyFile(urlOf(dbB), seed);
    expect(() => applyFile(urlOf(dbB), migrationFile(migrations[P10B]))).toThrow();
  }, 240000);
});

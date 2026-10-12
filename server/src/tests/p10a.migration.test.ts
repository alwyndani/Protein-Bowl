import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Replays the REAL migration files into throwaway databases (the shared test DB is never touched):
 *  A. migrations #1-#15, legacy Mess rows (an account, a plan, a wallet, NO subscription), then #16 -> rows survive, vocabulary defaults are safe,
 *     and every P10A guarantee holds in the PostgreSQL catalog;
 *  B. migrations #1-#15 with a legacy SUBSCRIPTION row -> #16 refuses to run (it never converts data silently).
 * Needs the local `postgres` superuser (same requirement as the other migration tests).
 */
const SERVER_ROOT = join(__dirname, '..', '..');
const PRISMA_CLI = join(SERVER_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
const stamp = Date.now();
const dbA = `pb_p10a_mig_a_${stamp}`;
const dbB = `pb_p10a_mig_b_${stamp}`;
const urlOf = (db: string) => `postgresql://postgres:postgres@localhost:5432/${db}?schema=public`;

const migrations = readdirSync(join(SERVER_ROOT, 'prisma', 'migrations'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const P10A = migrations.findIndex((m) => m.includes('p10a_mess_foundation'));
const applyFile = (url: string, file: string) => execFileSync(process.execPath, [PRISMA_CLI, 'db', 'execute', '--url', url, '--file', file], { cwd: SERVER_ROOT, stdio: 'pipe' });
const migrationFile = (name: string) => join(SERVER_ROOT, 'prisma', 'migrations', name, 'migration.sql');

describe('P10A migration (#16): additive Mess foundation, safe vocabulary defaults, integrity guarantees in PostgreSQL', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let a: PrismaClient;
  let tmp: string;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'pb-p10a-'));
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

  it('the chain has at least 16 migrations and #16 sorts directly after the P9C migration', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(16);
    expect(P10A).toBe(15);
    expect(migrations[P10A - 1]).toContain('p9c_delivery_attempts');
    expect(migrations[P10A] > migrations[P10A - 1]).toBe(true);
  });

  it('adds no destructive statement: no DROP, no DELETE, no TRUNCATE, no data rewrite (apart from the guard)', () => {
    const sql = readFileSync(migrationFile(migrations[P10A]), 'utf8').replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bINSERT\s+INTO\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+"/i);
  });

  it('legacy Mess rows survive; accounts become PENDING and plans DRAFT (never auto-approved / auto-sold); the catalog guarantees hold', async () => {
    for (const m of migrations.slice(0, P10A)) {
      const file = migrationFile(m);
      expect(existsSync(file)).toBe(true);
      applyFile(urlOf(dbA), file);
    }
    const legacy = join(tmp, 'legacy.sql');
    writeFileSync(
      legacy,
      `
      INSERT INTO "users" ("id","email","passwordHash","updatedAt") VALUES ('u-1','mig@p10a.test','x',now());
      INSERT INTO "customer_profiles" ("id","userId","fullName","referralCode","updatedAt") VALUES ('cp-1','u-1','Mig','PB-MIG10A',now());
      INSERT INTO "mess_accounts" ("id","customerProfileId","collegeHostelName","roomNumber","isApproved","updatedAt") VALUES ('ma-1','cp-1','Old Hostel','12',true,now());
      INSERT INTO "mess_subscription_plans" ("id","name","code","durationDays","mealsPerDay","basePrice","active") VALUES ('pl-1','Old Plan','OLD-1',30,2,4999.00,true);
      INSERT INTO "wallet_accounts" ("id","customerProfileId","balance","updatedAt") VALUES ('wa-1','cp-1',450.00,now());
      INSERT INTO "kitchen_branches" ("id","code","name","address","city","updatedAt") VALUES ('kb-1','mig-kb','Mig Branch','A','Kochi',now());
      `
    );
    applyFile(urlOf(dbA), legacy);
    a = new PrismaClient({ datasources: { db: { url: urlOf(dbA) } } });
    applyFile(urlOf(dbA), migrationFile(migrations[P10A]));

    const acc = await a.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT "approvalStatus","isApproved","servicePointId","roomNumber","collegeHostelName" FROM "mess_accounts"`);
    expect(acc).toEqual([{ approvalStatus: 'PENDING', isApproved: true, servicePointId: null, roomNumber: '12', collegeHostelName: 'Old Hostel' }]);
    const plan = await a.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT status, "taxRate", "mealSlots", version, "basePrice"::text AS "basePrice", active FROM "mess_subscription_plans"`);
    expect(plan).toEqual([{ status: 'DRAFT', taxRate: null, mealSlots: [], version: 1, basePrice: '4999.00', active: true }]); // never ACTIVE, never given a tax rate
    expect(Number((await a.$queryRawUnsafe<Array<{ b: unknown }>>(`SELECT balance AS b FROM "wallet_accounts"`))[0].b)).toBe(450); // wallet untouched

    // column types
    const cols = await a.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'mess_subscriptions' AND column_name IN ('startDate','endDate')`);
    expect(cols.every((c) => c.data_type === 'date')).toBe(true);
    const defaults = await a.$queryRawUnsafe<Array<{ column_default: string | null }>>(`SELECT column_default FROM information_schema.columns WHERE table_name = 'mess_subscription_plans' AND column_name = 'taxRate'`);
    expect(defaults[0].column_default).toBeNull(); // NO default tax rate anywhere

    // FKs are RESTRICT (never CASCADE) on the new references
    const fks = await a.$queryRawUnsafe<Array<{ conname: string; def: string }>>(
      `SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE contype = 'f' AND conname IN ('mess_accounts_servicePointId_fkey','mess_accounts_reviewedByUserId_fkey','mess_service_points_branchId_fkey','mess_subscription_plans_branchId_fkey','mess_subscriptions_purchaseOrderId_fkey','mess_subscriptions_servicePointId_fkey','mess_subscriptions_branchId_fkey') ORDER BY conname`
    );
    expect(fks).toHaveLength(7);
    for (const f of fks) expect(f.def).toMatch(/ON DELETE RESTRICT/);

    const idx = await a.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(`SELECT indexname, indexdef FROM pg_indexes WHERE indexname IN ('mess_subscriptions_one_pending_per_account','mess_service_points_code_key','mess_subscriptions_purchaseOrderId_key')`);
    expect(idx.map((i) => i.indexname).sort()).toEqual(['mess_service_points_code_key', 'mess_subscriptions_one_pending_per_account', 'mess_subscriptions_purchaseOrderId_key']);
    expect(idx.find((i) => i.indexname === 'mess_subscriptions_one_pending_per_account')!.indexdef).toMatch(/UNIQUE.*"messAccountId".*WHERE.*PENDING_PAYMENT/i);

    const checks = await a.$queryRawUnsafe<Array<{ conname: string }>>(`SELECT conname FROM pg_constraint WHERE contype = 'c' AND (conname LIKE 'mess\\_%\\_ck' ESCAPE '\\') ORDER BY conname`);
    for (const expected of [
      'mess_accounts_approval_ck', 'mess_accounts_approved_sp_ck', 'mess_accounts_review_ck', 'mess_accounts_reject_ck',
      'mess_plans_status_ck', 'mess_plans_slots_ck', 'mess_plans_tax_ck', 'mess_plans_numbers_ck', 'mess_plans_window_ck', 'mess_plans_active_ck',
      'mess_service_points_status_ck', 'mess_service_points_version_ck',
      'mess_subs_status_ck', 'mess_subs_dates_ck', 'mess_subs_counts_ck', 'mess_subs_active_ck', 'mess_subs_cancel_ck'
    ]) expect(checks.map((c) => c.conname), expected).toContain(expected);
  }, 240000);

  it('the integrity checks reject invalid rows', async () => {
    const run = (sql: string) => a.$executeRawUnsafe(sql);
    await run(`INSERT INTO "mess_service_points" ("id","code","name","addressLine","city","postalCode","branchId","updatedAt") VALUES ('sp-1','SP1','S','a','c','1','kb-1',now())`);
    await expect(run(`INSERT INTO "mess_service_points" ("id","code","name","addressLine","city","postalCode","branchId","status","updatedAt") VALUES ('sp-2','SP2','S','a','c','1','kb-1','MAYBE',now())`)).rejects.toThrow();
    await expect(run(`INSERT INTO "mess_service_points" ("id","code","name","addressLine","city","postalCode","branchId","updatedAt") VALUES ('sp-3','SP3','S','a','c','1','missing',now())`)).rejects.toThrow();
    // an ACTIVE plan must be complete
    await expect(run(`UPDATE "mess_subscription_plans" SET status = 'ACTIVE' WHERE id = 'pl-1'`), 'active without tax/slots/policy').rejects.toThrow();
    await run(`UPDATE "mess_subscription_plans" SET status = 'ACTIVE', "taxRate" = 0.05, "mealSlots" = '{BREAKFAST,LUNCH}', "mealsPerDay" = 2, "pauseCutoffHours" = 12, "maxPauses" = 3, "minStartLeadDays" = 0 WHERE id = 'pl-1'`);
    await expect(run(`UPDATE "mess_subscription_plans" SET "taxRate" = 1.5 WHERE id = 'pl-1'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_subscription_plans" SET "mealSlots" = '{LUNCH,LUNCH}', "mealsPerDay" = 2 WHERE id = 'pl-1'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_subscription_plans" SET "mealSlots" = '{SNACK}', "mealsPerDay" = 1 WHERE id = 'pl-1'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_subscription_plans" SET "mealsPerDay" = 3 WHERE id = 'pl-1'`), 'mealsPerDay must equal the slot count').rejects.toThrow();
    await expect(run(`UPDATE "mess_subscription_plans" SET "minStartLeadDays" = -1 WHERE id = 'pl-1'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_subscription_plans" SET "validFrom" = '2026-02-01', "validUntil" = '2026-01-01' WHERE id = 'pl-1'`)).rejects.toThrow();
    // accounts
    await expect(run(`UPDATE "mess_accounts" SET "approvalStatus" = 'APPROVED' WHERE id = 'ma-1'`), 'approved needs a service point + reviewer').rejects.toThrow();
    await run(`UPDATE "mess_accounts" SET "approvalStatus" = 'APPROVED', "servicePointId" = 'sp-1', "reviewedAt" = now(), "reviewedByUserId" = 'u-1' WHERE id = 'ma-1'`);
    await expect(run(`UPDATE "mess_accounts" SET "approvalStatus" = 'REJECTED' WHERE id = 'ma-1'`), 'rejected needs a reason').rejects.toThrow();
    // subscriptions: one pending per account, date order, counters
    const sub = (id: string, over = '') =>
      run(`INSERT INTO "mess_subscriptions" ("id","messAccountId","planId","status","startDate","endDate","totalMealsAllowed","mealsRemaining","updatedAt"${over ? ',' + over.split('|')[0] : ''}) VALUES ('${id}','ma-1','pl-1','PENDING_PAYMENT','2026-11-01','2026-11-30',60,60,now()${over ? ',' + over.split('|')[1] : ''})`);
    await sub('ms-1');
    await expect(sub('ms-2'), 'second PENDING_PAYMENT').rejects.toThrow();
    await run(`UPDATE "mess_subscriptions" SET status = 'ACTIVE', "activatedAt" = now() WHERE id = 'ms-1'`);
    await sub('ms-2'); // allowed again once the first is no longer pending
    await expect(run(`UPDATE "mess_subscriptions" SET "endDate" = '2026-10-01' WHERE id = 'ms-2'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_subscriptions" SET "mealsRemaining" = 61 WHERE id = 'ms-2'`)).rejects.toThrow();
    await expect(run(`UPDATE "mess_subscriptions" SET status = 'ACTIVE' WHERE id = 'ms-2'`), 'ACTIVE needs activatedAt').rejects.toThrow();
    await expect(run(`UPDATE "mess_subscriptions" SET status = 'CANCELLED' WHERE id = 'ms-2'`), 'CANCELLED needs cancelledAt').rejects.toThrow();
    await expect(run(`UPDATE "mess_subscriptions" SET status = 'PAUSED' WHERE id = 'ms-2'`)).rejects.toThrow();
    // RESTRICT: a service point in use cannot be deleted
    await expect(run(`DELETE FROM "mess_service_points" WHERE id = 'sp-1'`)).rejects.toThrow();
  }, 120000);

  it('refuses to run when a legacy SUBSCRIPTION row exists (no silent conversion of data)', () => {
    for (const m of migrations.slice(0, P10A)) applyFile(urlOf(dbB), migrationFile(m));
    const legacy = join(tmp, 'legacy-b.sql');
    writeFileSync(
      legacy,
      `
      INSERT INTO "users" ("id","email","passwordHash","updatedAt") VALUES ('u-1','mig@p10a-b.test','x',now());
      INSERT INTO "customer_profiles" ("id","userId","fullName","referralCode","updatedAt") VALUES ('cp-1','u-1','Mig','PB-MIG10B',now());
      INSERT INTO "mess_accounts" ("id","customerProfileId","collegeHostelName","roomNumber","updatedAt") VALUES ('ma-1','cp-1','Old Hostel','12',now());
      INSERT INTO "mess_subscription_plans" ("id","name","code","durationDays","mealsPerDay","basePrice") VALUES ('pl-1','Old Plan','OLD-1',30,2,4999.00);
      INSERT INTO "mess_subscriptions" ("id","messAccountId","planId","status","startDate","endDate","totalMealsAllowed","mealsRemaining","updatedAt") VALUES ('ms-1','ma-1','pl-1','ACTIVE','2026-01-01','2026-01-30',60,60,now());
      `
    );
    applyFile(urlOf(dbB), legacy);
    expect(() => applyFile(urlOf(dbB), migrationFile(migrations[P10A]))).toThrow();
  }, 240000);
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Replays the REAL migration files, in order, into a throwaway database (the shared test DB is never touched):
 *  1. applies every migration BEFORE P7C,
 *  2. inserts P7B-era rows (order, payment session, provider payment, webhook event, order event),
 *  3. applies the P7C migration,
 *  4. checks every P7B row survived byte-for-byte, the refunds table exists, and its database guarantees really hold.
 * Needs the local `postgres` superuser (same requirement as p7a.migration / p6b.isolated).
 */
const SERVER_ROOT = join(__dirname, '..', '..');
const PRISMA_CLI = join(SERVER_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
const dbName = `pb_p7c_mig_${Date.now()}`;
const dbUrl = `postgresql://postgres:postgres@localhost:5432/${dbName}?schema=public`;

const migrations = readdirSync(join(SERVER_ROOT, 'prisma', 'migrations'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const P7C = migrations.findIndex((m) => m.includes('p7c_refunds'));

const applyFile = (file: string) => execFileSync(process.execPath, [PRISMA_CLI, 'db', 'execute', '--url', dbUrl, '--file', file], { cwd: SERVER_ROOT, stdio: 'pipe' });

describe('P7C migration: one additive migration, P7B data preserved, database guarantees hold', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let scratch: PrismaClient;
  let tmp: string;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'pb-p7c-'));
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

  it('the chain has 13 migrations and the P7C migration sorts LAST, directly after the P7B one', () => {
    expect(migrations).toHaveLength(13);
    expect(P7C).toBe(migrations.length - 1);
    expect(migrations[P7C - 1]).toContain('p7b_payment_sessions_ledger_and_webhook_events');
    expect(migrations[P7C] > migrations[P7C - 1]).toBe(true);
  });

  it('is purely additive: it creates the refunds table and touches no existing table', () => {
    const sql = readFileSync(join(SERVER_ROOT, 'prisma', 'migrations', migrations[P7C], 'migration.sql'), 'utf8').replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"(?!refunds")/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+"/i); // statements (not the "ON UPDATE CASCADE" of a foreign key)
    expect(sql).toMatch(/CREATE TABLE "refunds"/);
  });

  it('P7B-era rows survive the P7C migration unchanged, and the refunds guarantees work', async () => {
    for (const m of migrations.slice(0, P7C)) {
      const file = join(SERVER_ROOT, 'prisma', 'migrations', m, 'migration.sql');
      expect(existsSync(file)).toBe(true);
      applyFile(file);
    }

    const legacy = join(tmp, 'p7b-rows.sql');
    writeFileSync(
      legacy,
      `
      INSERT INTO "users" ("id","email","passwordHash","updatedAt") VALUES ('u-1','mig@p7c.test','x',now());
      INSERT INTO "customer_profiles" ("id","userId","fullName","referralCode","updatedAt") VALUES ('cp-1','u-1','Mig','PB-MIG',now());
      INSERT INTO "orders" ("id","orderNumber","status","paymentStatus","paymentMethod","totalAmount","netAmount","customerProfileId","updatedAt") VALUES ('ord-1','P7B-LEGACY-1','CONFIRMED','PAID','ONLINE',100,145.50,'cp-1',now());
      INSERT INTO "payments" ("id","orderId","customerProfileId","amount","status","provider","providerOrderId","currency") VALUES ('pay-1','ord-1','cp-1',145.50,'SUCCESS','razorpay','order_legacy','INR');
      INSERT INTO "provider_payments" ("id","provider","providerPaymentId","providerOrderId","paymentId","orderId","amount","currency","providerStatus","firstSeenVia","reconciliationStatus") VALUES ('lp-1','razorpay','pay_legacy','order_legacy','pay-1','ord-1',145.50,'INR','CAPTURED','WEBHOOK','APPLIED');
      INSERT INTO "provider_payments" ("id","provider","providerPaymentId","providerOrderId","paymentId","orderId","amount","currency","providerStatus","firstSeenVia","reconciliationStatus") VALUES ('lp-2','razorpay','pay_legacy_dup','order_legacy','pay-1','ord-1',145.50,'INR','CAPTURED','WEBHOOK','DUPLICATE');
      UPDATE "orders" SET "paidByProviderPaymentId" = 'lp-1' WHERE "id" = 'ord-1';
      INSERT INTO "payment_webhook_events" ("id","provider","eventId","eventType","payloadHash","status") VALUES ('ev-1','razorpay','evt_legacy','refund.processed','${'a'.repeat(64)}','IGNORED');
      INSERT INTO "order_events" ("id","orderId","fromStatus","toStatus","actorRole") VALUES ('oe-1','ord-1','PENDING','CONFIRMED','SYSTEM:PAYMENT_VERIFICATION');
      `
    );
    applyFile(legacy);

    scratch = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    const snapshot = async () => ({
      orders: await scratch.$queryRawUnsafe(`SELECT * FROM "orders" ORDER BY "id"`),
      payments: await scratch.$queryRawUnsafe(`SELECT * FROM "payments" ORDER BY "id"`),
      ledger: await scratch.$queryRawUnsafe(`SELECT * FROM "provider_payments" ORDER BY "id"`),
      events: await scratch.$queryRawUnsafe(`SELECT * FROM "payment_webhook_events" ORDER BY "id"`),
      orderEvents: await scratch.$queryRawUnsafe(`SELECT * FROM "order_events" ORDER BY "id"`)
    });
    const before = JSON.stringify(await snapshot());

    applyFile(join(SERVER_ROOT, 'prisma', 'migrations', migrations[P7C], 'migration.sql'));

    expect(JSON.stringify(await snapshot())).toBe(before);
    expect(Number((await scratch.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) n FROM "refunds"`))[0].n)).toBe(0);

    const insert = (id: string, ledger: string, status: string, trigger: string, providerRefundId: string | null, amount = 145.5) =>
      scratch.$executeRawUnsafe(
        `INSERT INTO "refunds" ("id","orderId","providerPaymentId","paymentId","provider","providerRefundId","amount","currency","trigger","reasonCode","requestedByKind","status") VALUES ('${id}','ord-1','${ledger}','pay-1','razorpay',${providerRefundId ? `'${providerRefundId}'` : 'NULL'},${amount},'INR','${trigger}','OTHER','SYSTEM','${status}')`
      );

    // CHECK (amount > 0)
    await expect(insert('r-zero', 'lp-1', 'REQUESTED', 'CUSTOMER_CANCELLATION', null, 0)).rejects.toThrow();
    // one LIVE non-EXTERNAL refund per ProviderPayment
    await insert('r-1', 'lp-1', 'REQUESTED', 'CUSTOMER_CANCELLATION', null);
    await expect(insert('r-2', 'lp-1', 'REQUESTED', 'ADMIN_CANCELLATION', null)).rejects.toThrow();
    // a PROCESSED refund still occupies the payment (it can never be refunded twice)
    await scratch.$executeRawUnsafe(`UPDATE "refunds" SET "status"='PROCESSED' WHERE "id"='r-1'`);
    await expect(insert('r-3', 'lp-1', 'REQUESTED', 'ADMIN_CANCELLATION', null)).rejects.toThrow();
    // only an ABANDONED intent frees the slot
    await scratch.$executeRawUnsafe(`UPDATE "refunds" SET "status"='ABANDONED' WHERE "id"='r-1'`);
    await insert('r-4', 'lp-1', 'REQUESTED', 'ADMIN_CANCELLATION', null);
    // EXTERNAL rows record money that already moved: not limited by the live index
    await insert('r-ext', 'lp-1', 'PROCESSED', 'EXTERNAL', 'rfnd_ext_1', 10);
    // the guarantees exist in the REAL PostgreSQL catalogs (Prisma drift checks ignore the partial index and the CHECK)
    const idx = await scratch.$queryRawUnsafe<Array<{ indexdef: string }>>(`SELECT indexdef FROM pg_indexes WHERE tablename = 'refunds' AND indexname = 'refunds_one_live_per_payment_key'`);
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toMatch(/CREATE UNIQUE INDEX/);
    expect(idx[0].indexdef).toMatch(/\("providerPaymentId"\)/);
    expect(idx[0].indexdef).toMatch(/WHERE .*status.* <> 'ABANDONED'.*AND .*trigger.* <> 'EXTERNAL'/);
    const checks = await scratch.$queryRawUnsafe<Array<{ conname: string; def: string }>>(`SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid = 'refunds'::regclass AND contype = 'c'`);
    expect(checks).toEqual([{ conname: 'refunds_amount_positive_check', def: expect.stringMatching(/amount.*>/) }]);
    const uniques = await scratch.$queryRawUnsafe<Array<{ indexname: string }>>(`SELECT indexname FROM pg_indexes WHERE tablename = 'refunds' ORDER BY indexname`);
    expect(uniques.map((u) => u.indexname)).toEqual([
      'refunds_one_live_per_payment_key',
      'refunds_orderId_idx',
      'refunds_pkey',
      'refunds_providerPaymentId_idx',
      'refunds_provider_providerRefundId_key',
      'refunds_status_nextAttemptAt_idx'
    ]);
    const fks = await scratch.$queryRawUnsafe<Array<{ conname: string; def: string }>>(`SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid = 'refunds'::regclass AND contype = 'f' ORDER BY conname`);
    expect(fks.map((f) => f.conname)).toEqual(['refunds_orderId_fkey', 'refunds_paymentId_fkey', 'refunds_providerPaymentId_fkey']);
    for (const f of fks) expect(f.def).toMatch(/ON DELETE RESTRICT/);

    // another payment is independent
    await insert('r-5', 'lp-2', 'REQUESTED', 'DUPLICATE_CAPTURE', null);
    // unique (provider, providerRefundId)
    await expect(insert('r-6', 'lp-2', 'ABANDONED', 'EXTERNAL', 'rfnd_ext_1', 10)).rejects.toThrow();
    // foreign keys are RESTRICT: evidence can never be deleted from under a refund
    await expect(scratch.$executeRawUnsafe(`DELETE FROM "provider_payments" WHERE "id"='lp-1'`)).rejects.toThrow();
    await expect(scratch.$executeRawUnsafe(`DELETE FROM "orders" WHERE "id"='ord-1'`)).rejects.toThrow();
  }, 180000);
});

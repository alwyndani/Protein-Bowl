import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Replays the REAL migration files, in order, into a throwaway database (the shared test DB is never touched):
 *  1. applies every migration BEFORE P7A,
 *  2. inserts legacy rows that were created while Product/OrderItem still carried the 0.05 column default,
 *  3. applies the two P7A migrations,
 *  4. checks that every stored value survived, that the defaults are gone and that the P7A order-event backfill ran.
 * Needs the local `postgres` superuser (same requirement as p6b.isolated).
 */
const SERVER_ROOT = join(__dirname, '..', '..');
const PRISMA_CLI = join(SERVER_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
const dbName = `pb_p7a_taxmig_${Date.now()}`;
const dbUrl = `postgresql://postgres:postgres@localhost:5432/${dbName}?schema=public`;

const migrations = readdirSync(join(SERVER_ROOT, 'prisma', 'migrations'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const P7A_FIRST = migrations.findIndex((m) => m.includes('p7a_order_lifecycle_foundation'));
const P7A_TAX = migrations.findIndex((m) => m.includes('p7a_remove_tax_rate_defaults'));

const applyFile = (file: string) =>
  execFileSync(process.execPath, [PRISMA_CLI, 'db', 'execute', '--url', dbUrl, '--file', file], { cwd: SERVER_ROOT, stdio: 'pipe' });

describe('P7A migration chain: tax-default removal preserves every stored value', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let scratch: PrismaClient;
  let tmp: string;

  beforeAll(async () => {
    expect(P7A_FIRST).toBeGreaterThan(0);
    expect(P7A_TAX).toBe(P7A_FIRST + 1); // the correction sorts directly after the first P7A migration
    tmp = mkdtempSync(join(tmpdir(), 'pb-p7a-'));
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

  it('11. legacy products / order items / orders keep their exact values; defaults are removed; order events are backfilled', async () => {
    // 1. everything before P7A
    for (const m of migrations.slice(0, P7A_FIRST)) {
      const file = join(SERVER_ROOT, 'prisma', 'migrations', m, 'migration.sql');
      expect(existsSync(file)).toBe(true);
      applyFile(file);
    }

    // 2. legacy rows. The first product/item omit taxRate, so they receive the OLD 0.05 database default.
    const legacy = join(tmp, 'legacy.sql');
    writeFileSync(
      legacy,
      `
      INSERT INTO "product_categories" ("id","name","slug") VALUES ('cat-1','Legacy','legacy');
      INSERT INTO "products" ("id","categoryId","name","slug","description","basePrice","updatedAt") VALUES ('prod-default','cat-1','Defaulted','legacy-default','x',100,now());
      INSERT INTO "products" ("id","categoryId","name","slug","description","basePrice","taxRate","updatedAt") VALUES ('prod-12','cat-1','Twelve','legacy-12','x',100,0.1200,now());
      INSERT INTO "products" ("id","categoryId","name","slug","description","basePrice","taxRate","updatedAt") VALUES ('prod-0','cat-1','Zero','legacy-0','x',100,0.0000,now());
      INSERT INTO "orders" ("id","orderNumber","status","totalAmount","netAmount","updatedAt") VALUES ('ord-1','LEGACY-1','CONFIRMED',100,105,now());
      INSERT INTO "order_items" ("id","orderId","itemTitle","unitPrice","quantity","totalPrice") VALUES ('oi-default','ord-1','Defaulted',100,1,105);
      INSERT INTO "order_items" ("id","orderId","itemTitle","unitPrice","quantity","taxRate","taxAmount","totalPrice") VALUES ('oi-12','ord-1','Twelve',100,1,0.1200,12,112);
      INSERT INTO "order_items" ("id","orderId","itemTitle","unitPrice","quantity","taxRate","taxAmount","totalPrice") VALUES ('oi-0','ord-1','Zero',100,1,0.0000,0,100);
      `
    );
    applyFile(legacy);

    scratch = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    const before = {
      products: await scratch.$queryRawUnsafe<any[]>(`SELECT id, "taxRate"::text AS r FROM products ORDER BY id`),
      items: await scratch.$queryRawUnsafe<any[]>(`SELECT id, "taxRate"::text AS r, "taxAmount"::text AS a, "totalPrice"::text AS t FROM order_items ORDER BY id`)
    };
    expect(before.products).toEqual([
      { id: 'prod-0', r: '0.0000' },
      { id: 'prod-12', r: '0.1200' },
      { id: 'prod-default', r: '0.0500' } // the old silent default is what these legacy rows were stored with
    ]);
    const defaultsBefore = await scratch.$queryRawUnsafe<any[]>(`SELECT table_name, column_default FROM information_schema.columns WHERE column_name='taxRate' AND table_name IN ('products','order_items') ORDER BY table_name`);
    expect(defaultsBefore.map((d) => d.column_default)).toEqual(['0.0500', '0.0500']);

    // 3. both P7A migrations
    for (const m of migrations.slice(P7A_FIRST, P7A_TAX + 1)) applyFile(join(SERVER_ROOT, 'prisma', 'migrations', m, 'migration.sql'));

    // 4. verification
    const after = {
      products: await scratch.$queryRawUnsafe<any[]>(`SELECT id, "taxRate"::text AS r FROM products ORDER BY id`),
      items: await scratch.$queryRawUnsafe<any[]>(`SELECT id, "taxRate"::text AS r, "taxAmount"::text AS a, "totalPrice"::text AS t FROM order_items ORDER BY id`)
    };
    expect(after.products).toEqual(before.products); // every stored product rate preserved, including the legacy 0.05 rows
    expect(after.items).toEqual(before.items); // every historical OrderItem snapshot preserved

    const defaultsAfter = await scratch.$queryRawUnsafe<any[]>(`SELECT table_name, column_default, is_nullable FROM information_schema.columns WHERE column_name='taxRate' AND table_name IN ('products','order_items') ORDER BY table_name`);
    expect(defaultsAfter.map((d) => d.column_default)).toEqual([null, null]);
    expect(defaultsAfter.map((d) => d.is_nullable)).toEqual(['NO', 'NO']);

    // the P7A backfill still works: the pre-existing order received exactly one creation event
    const events = await scratch.$queryRawUnsafe<any[]>(`SELECT "orderId","fromStatus","toStatus","reason" FROM order_events`);
    expect(events).toEqual([{ orderId: 'ord-1', fromStatus: null, toStatus: 'CONFIRMED', reason: 'BACKFILLED_P7A' }]);

    // a product can no longer be inserted without a rate
    await expect(
      scratch.$executeRawUnsafe(`INSERT INTO "products" ("id","categoryId","name","slug","description","basePrice","updatedAt") VALUES ('prod-new','cat-1','New','legacy-new','x',10,now())`)
    ).rejects.toThrow(/23502/);
  }, 240000);
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { buildCommercePolicy } from '../config/commercePolicy.js';
import { PricingService } from '../modules/commerce/pricing.service.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const SERVER_ROOT = join(__dirname, '..', '..');

/** Source with comments removed so explanatory comments cannot trip (or hide) the scans. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const modelBlock = (schema: string, name: string) => {
  const m = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  if (!m) throw new Error(`model ${name} not found`);
  return m[0];
};

describe('P7A tax-rate defaults — no silent 5 % anywhere in the data model or the production path', () => {
  const ts = Date.now();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let token: string;
  let profileId: string;
  let addressId: string;
  let categoryId: string;

  const mkProduct = (slug: string, basePrice: number, taxRate: number | string) =>
    prisma.product.create({ data: { slug: `p7a-tax-${slug}-${ts}`, categoryId, name: `P7A tax ${slug}`, description: 'x', basePrice, taxRate, isPublished: true, isActive: true } });

  beforeAll(async () => {
    const email = `p7a_tax_${ts}@test.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: { role: RoleEnum.CUSTOMER } },
        customerProfile: { create: { fullName: 'P7A Tax Customer', referralCode: `PB-7TAX${ts}` } }
      },
      include: { customerProfile: true }
    });
    profileId = user.customerProfile!.id;
    token = jwt.sign({ userId: user.id, email, roles: [RoleEnum.CUSTOMER] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
    addressId = (await prisma.customerAddress.create({ data: { customerProfileId: profileId, title: 'Home', addressLine1: 'Tax Street 1', city: 'Kochi', state: 'Kerala', postalCode: '682001' } })).id;
    categoryId = (await prisma.productCategory.create({ data: { name: `P7A Tax Category ${ts}`, slug: `p7a-tax-cat-${ts}`, description: 'x' } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------------------------------------ schema / database
  it('1. the Prisma schema declares NO default for Product.taxRate', () => {
    const line = modelBlock(readFileSync(join(SERVER_ROOT, 'prisma', 'schema.prisma'), 'utf8'), 'Product').split('\n').find((l) => /\btaxRate\b/.test(l))!;
    expect(line).toMatch(/Decimal\s+@db\.Decimal\(5, 4\)/);
    expect(line).not.toMatch(/@default/);
  });

  it('2. the Prisma schema declares NO default for OrderItem.taxRate (a historical snapshot is never invented)', () => {
    const line = modelBlock(readFileSync(join(SERVER_ROOT, 'prisma', 'schema.prisma'), 'utf8'), 'OrderItem').split('\n').find((l) => /\btaxRate\b/.test(l))!;
    expect(line).not.toMatch(/@default/);
  });

  it('3. the migrated database has no column default on either taxRate column, and both stay NOT NULL', async () => {
    const cols: Array<{ table_name: string; column_default: string | null; is_nullable: string }> = await prisma.$queryRaw`
      SELECT table_name, column_default, is_nullable FROM information_schema.columns
      WHERE column_name = 'taxRate' AND table_name IN ('products', 'order_items') ORDER BY table_name`;
    expect(cols.map((c) => c.table_name)).toEqual(['order_items', 'products']);
    for (const c of cols) {
      expect(c.column_default, c.table_name).toBeNull();
      expect(c.is_nullable, c.table_name).toBe('NO');
    }
  });

  it('4. creating a Product WITHOUT an explicit tax rate fails safely and creates nothing', async () => {
    const slug = `p7a-tax-missing-${ts}`;
    await expect(
      prisma.product.create({ data: { slug, categoryId, name: 'No tax rate', description: 'x', basePrice: 10 } as never })
    ).rejects.toThrow(/taxRate/);
    expect(await prisma.product.count({ where: { slug } })).toBe(0);
  });

  it('5. creating a Product WITH an explicit tax rate succeeds and stores exactly that rate (including 0)', async () => {
    const odd = await mkProduct('odd', 100, 0.0825);
    const zero = await mkProduct('zero', 100, 0);
    expect(odd.taxRate.toFixed(4)).toBe('0.0825');
    expect(zero.taxRate.toFixed(4)).toBe('0.0000');
  });

  it('6. an OrderItem can no longer be written without an explicit tax rate (client API and raw SQL)', async () => {
    const order = await prisma.order.create({ data: { orderNumber: `P7A-TAX-${ts}-1`, totalAmount: 1, netAmount: 1 } });
    await expect(
      prisma.orderItem.create({ data: { orderId: order.id, itemTitle: 'x', unitPrice: 1, quantity: 1, totalPrice: 1 } as never })
    ).rejects.toThrow(/taxRate/);
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "order_items" ("id","orderId","itemTitle","unitPrice","quantity","totalPrice") VALUES ('p7a-tax-raw-${ts}','${order.id}','x',1,1,1)`
      )
    ).rejects.toThrow(/23502/); // PostgreSQL not_null_violation
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBe(0);
  });

  // ------------------------------------------------------------------------------------------ order snapshot
  it('7. order creation explicitly snapshots Product.taxRate into OrderItem.taxRate and the tax is computed from it', async () => {
    const odd = await mkProduct('snap-odd', 100.1, 0.0825); // 100.10 x 8.25 % = 8.25825 -> 8.26 (HALF_UP)
    const zero = await mkProduct('snap-zero', 50, 0);
    await request(app).delete('/api/v1/cart').set(bearer(token));
    for (const p of [odd, zero]) expect((await request(app).post('/api/v1/cart/items').set(bearer(token)).send({ productId: p.id, quantity: 1 })).status).toBe(201);

    const res = await request(app).post('/api/v1/orders').set(bearer(token)).set('x-idempotency-key', `IK-P7A-TAX-${ts}-0001`).send({ addressId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const items: any[] = res.body.data.items;
    const oddItem = items.find((i) => i.productId === odd.id);
    const zeroItem = items.find((i) => i.productId === zero.id);
    expect(Number(oddItem.taxRate)).toBe(0.0825);
    expect(Number(oddItem.taxAmount)).toBe(8.26);
    expect(Number(zeroItem.taxRate)).toBe(0); // a zero rate is a real rate, not "missing -> 5 %"
    expect(Number(zeroItem.taxAmount)).toBe(0);
    expect(Number(res.body.data.taxAmount)).toBe(8.26);

    // The persisted rows carry the same snapshot even if the product's rate changes afterwards
    await prisma.product.update({ where: { id: odd.id }, data: { taxRate: 0.18 } });
    const rows = await prisma.orderItem.findMany({ where: { orderId: res.body.data.id } });
    expect(rows.find((r) => r.productId === odd.id)!.taxRate.toFixed(4)).toBe('0.0825');
  });

  it('8. pricing rejects missing/invalid tax configuration and never substitutes 5 %', () => {
    const policy = buildCommercePolicy();
    const base = { productId: 'p', itemTitle: 'Bowl', unitPrice: '100.00', quantity: 1 };
    for (const bad of [undefined, null, '', 'five percent', -0.05, 1.01]) {
      expect(() => PricingService.calculatePricing([{ ...base, taxRate: bad as never }], policy)).toThrowError(expect.objectContaining({ errorCode: 'PRODUCT_TAX_NOT_CONFIGURED' }));
    }
    // a cart row whose product has no rate at all is rejected the same way
    expect(() => PricingService.calculateCartPricing([{ productId: 'p', quantity: 1, product: { name: 'Bowl', basePrice: 100 } }], policy)).toThrowError(
      expect.objectContaining({ errorCode: 'PRODUCT_TAX_NOT_CONFIGURED' })
    );
  });

  // ------------------------------------------------------------------------------------------ static guards
  it('9. no production backend source contains a hard-coded 5 % / 0.05 tax assumption (comments excluded)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name === 'tests') continue;
          walk(full);
        } else if (full.endsWith('.ts') && /(0\.05\b|0\.0500|\b5 ?%|\b5\.0 ?%)/.test(code(readFileSync(full, 'utf8')))) {
          offenders.push(full.replace(SERVER_ROOT, ''));
        }
      }
    };
    walk(join(SERVER_ROOT, 'src'));
    expect(offenders).toEqual([]);
    expect(code(readFileSync(join(SERVER_ROOT, 'prisma', 'schema.prisma'), 'utf8'))).not.toMatch(/taxRate[^\n]*@default/i);
  });

  it('10. every seed Product upsert supplies an explicit taxRate (nothing relies on a database fallback)', () => {
    for (const file of ['seed.ts', 'seedProducts.ts']) {
      const text = readFileSync(join(SERVER_ROOT, 'prisma', file), 'utf8');
      const segments = text.split('product.upsert(').slice(1);
      expect(segments.length, file).toBeGreaterThan(0);
      for (const seg of segments) {
        const create = seg.slice(seg.indexOf('create:'));
        expect(create.split(/\n\s*\}\n\s*\}\);/)[0], file).toMatch(/\btaxRate:/);
      }
    }
  });
});

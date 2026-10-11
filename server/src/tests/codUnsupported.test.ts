import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Permanent business rule: Protein Bowl is ONLINE-payment-only. Cash on Delivery is not supported and cannot be created. */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('COD is permanently unsupported (customer ordering is ONLINE only)', () => {
  const ts = Date.now();
  let seq = 0;
  let token = '';
  let profileId = '';
  let addressId = '';
  let productId = '';

  const place = (body: Record<string, unknown>, key = `IK-COD-${ts}-${++seq}`) => request(app).post('/api/v1/orders').set(bearer(token)).set('x-idempotency-key', key).send(body);
  const fill = async () => {
    await request(app).delete('/api/v1/cart').set(bearer(token));
    const r = await request(app).post('/api/v1/cart/items').set(bearer(token)).send({ productId, quantity: 1 });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  };
  const orderCount = () => prisma.order.count({ where: { customerProfileId: profileId } });

  beforeAll(async () => {
    const email = `cod_${ts}@test.com`;
    const u = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash('Password123!', 4), roles: { create: { role: RoleEnum.CUSTOMER } }, customerProfile: { create: { fullName: 'COD Test', referralCode: `PB-COD${ts}` } } },
      include: { customerProfile: true }
    });
    profileId = u.customerProfile!.id;
    token = jwt.sign({ userId: u.id, email, roles: [RoleEnum.CUSTOMER] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
    addressId = (await prisma.customerAddress.create({ data: { customerProfileId: profileId, title: 'Home', addressLine1: '1 Test Road', city: 'Kochi', state: 'Kerala', postalCode: '682001' } })).id;
    const cat = await prisma.productCategory.create({ data: { name: `COD Cat ${ts}`, slug: `cod-cat-${ts}`, description: 'cod' } });
    productId = (await prisma.product.create({ data: { slug: `cod-${ts}`, categoryId: cat.id, name: 'COD Product', description: 'cod', basePrice: 200, taxRate: 0.05, isPublished: true, isActive: true } })).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('C. a direct (malicious) API request with paymentMethod COD is rejected: 422 COD_NOT_ALLOWED, no order, cart untouched', async () => {
    await fill();
    const before = await orderCount();
    const res = await place({ addressId, paymentMethod: 'COD' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('COD_NOT_ALLOWED');
    expect(await orderCount()).toBe(before);
    expect((await request(app).get('/api/v1/cart').set(bearer(token))).body.data.items).toHaveLength(1);
  });

  it('C2. spelling/case variants and unknown methods are rejected as well (strict allow-list: only ONLINE)', async () => {
    const before = await orderCount();
    for (const paymentMethod of ['cod', 'Cod', 'CASH_ON_DELIVERY', 'CASH', 'cash_on_delivery', ' COD', 'PAY_ON_DELIVERY', 42, {}, ['COD']]) {
      const res = await place({ addressId, paymentMethod });
      expect(res.status, JSON.stringify(paymentMethod)).toBe(422);
      expect(['COD_NOT_ALLOWED', 'INVALID_PAYMENT_METHOD']).toContain(res.body.error);
    }
    expect(await orderCount()).toBe(before);
  });

  it('C3. the checkout preview does not offer COD either, and no COD policy flag is exposed as enabled', async () => {
    const res = await request(app).post('/api/v1/checkout/preview').set(bearer(token)).send({ addressId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/"cod":true|cash.on.delivery/i);
  });

  it('D. a normal ONLINE order still succeeds, and so does an omitted paymentMethod (defaults to ONLINE)', async () => {
    const online = await place({ addressId, paymentMethod: 'ONLINE' });
    expect(online.status, JSON.stringify(online.body)).toBe(201);
    expect(online.body.data).toMatchObject({ paymentMethod: 'ONLINE', status: 'PENDING', paymentStatus: 'PENDING' });
    await fill();
    const dflt = await place({ addressId });
    expect(dflt.status, JSON.stringify(dflt.body)).toBe(201);
    expect(dflt.body.data.paymentMethod).toBe('ONLINE');
  });

  it('E. a historical COD row (legacy data) stays readable, is NOT payable online, and does not enable a new COD order', async () => {
    const legacy = await prisma.order.create({
      data: { orderNumber: `COD-LEGACY-${ts}`, totalAmount: 100, netAmount: '145.50', customerProfileId: profileId, status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'COD', orderType: 'DIRECT' } as never
    });
    const read = await request(app).get(`/api/v1/orders/${legacy.id}`).set(bearer(token));
    expect(read.status).toBe(200);
    expect(read.body.data.paymentMethod).toBe('COD');
    expect(read.body.data.payment).toEqual({ state: 'NOT_STARTED', canStartPayment: false });
    const pay = await request(app).post(`/api/v1/orders/${legacy.id}/payment-attempts`).set(bearer(token)).send({});
    expect(pay.status).toBeGreaterThanOrEqual(400);
    expect(pay.body.success).toBe(false);
    await fill();
    const before = await orderCount();
    const again = await place({ addressId, paymentMethod: 'COD' });
    expect(again.status).toBe(422);
    expect(await orderCount()).toBe(before);
  });

  it('startup refuses to enable COD by configuration (COMMERCE_COD_ENABLED=true) - no flag can turn it on', async () => {
    const { buildCommercePolicy } = await import('../config/commercePolicy.js');
    const base = {
      COMMERCE_TAX_MODE: 'EXCLUSIVE', COMMERCE_DELIVERY_FEE: '40.00', COMMERCE_FREE_DELIVERY_ENABLED: 'true', COMMERCE_FREE_DELIVERY_THRESHOLD: '499.00', COMMERCE_PACKAGING_FEE: '0.00',
      COMMERCE_MIN_ORDER_VALUE: '0', COMMERCE_DELIVERY_TAXABLE: 'false', COMMERCE_PACKAGING_TAXABLE: 'false', COMMERCE_MAX_LINE_QUANTITY: '20', COMMERCE_MAX_CART_UNITS: '50'
    };
    expect(() => buildCommercePolicy({ ...base, COMMERCE_COD_ENABLED: 'true' } as never)).toThrow(/online payment only/);
    expect(buildCommercePolicy({ ...base, COMMERCE_COD_ENABLED: 'false' } as never).codEnabled).toBe(false);
  });

  it('no active backend source offers COD: the payment-method allow-list contains ONLINE only', () => {
    const svc = readFileSync(join(__dirname, '..', 'modules', 'order', 'order.service.ts'), 'utf8');
    expect(svc).toMatch(/PAYMENT_METHODS = \['ONLINE'\] as const/);
  });
});

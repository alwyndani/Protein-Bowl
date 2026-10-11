import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sanitizeDeliveryInstructions, DELIVERY_INSTRUCTIONS_MAX } from '../modules/order/deliveryInstructions.js';
import { computeRequestFingerprint } from '../modules/order/idempotency.js';

/** P9A - optional customer delivery instructions: validated, sanitized, stored ONLY in the immutable address snapshot, part of idempotency, never in pricing or the kitchen view. */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });

describe('P9A - delivery instructions at checkout', () => {
  const ts = Date.now();
  let seq = 0;
  let token = '';
  let profileId = '';
  let addressId = '';
  let productId = '';
  let chefToken = '';
  let branchId = '';
  const key = () => `p9a-instr-${ts}-${++seq}`;

  const fillCart = async () => {
    await request(app).delete('/api/v1/cart').set(bearer(token));
    const r = await request(app).post('/api/v1/cart/items').set(bearer(token)).send({ productId, quantity: 3 });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  };
  const place = (k: string | null, body: Record<string, unknown>) => {
    const r = request(app).post('/api/v1/orders').set(bearer(token));
    return (k ? r.set('x-idempotency-key', k) : r).send({ addressId, paymentMethod: 'ONLINE', ...body });
  };
  const snapshotOf = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).deliveryAddressSnapshot as Record<string, unknown>;

  beforeAll(async () => {
    const email = `p9a_instr_${ts}@test.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash('Password123!', 4), roles: { create: { role: RoleEnum.CUSTOMER } }, customerProfile: { create: { fullName: 'Instr Customer', referralCode: `PB-P9AI${ts}` } } },
      include: { customerProfile: true }
    });
    profileId = user.customerProfile!.id;
    token = sign(user.id, email, [RoleEnum.CUSTOMER]);
    addressId = (await prisma.customerAddress.create({ data: { customerProfileId: profileId, title: 'Home', addressLine1: '1 Test Road', city: 'Kochi', state: 'Kerala', postalCode: '682001' } })).id;
    const cat = await prisma.productCategory.create({ data: { name: `P9AI Cat ${ts}`, slug: `p9ai-cat-${ts}`, description: 'x' } });
    productId = (await prisma.product.create({ data: { slug: `p9ai-prod-${ts}`, categoryId: cat.id, name: 'P9AI Product', description: 'x', basePrice: 200, taxRate: 0.05, isPublished: true, isActive: true } })).id;

    branchId = (await prisma.kitchenBranch.create({ data: { code: `p9ai-${ts}`, name: 'P9AI Branch', address: 'A', city: 'Kochi' } })).id;
    const chefEmail = `p9a_instr_chef_${ts}@test.com`;
    const chef = await prisma.user.create({
      data: { email: chefEmail, passwordHash: await bcrypt.hash('Password123!', 4), roles: { create: { role: RoleEnum.CHEF } }, employeeProfile: { create: { employeeCode: `P9AI-C-${ts}`, fullName: 'Chef', designation: 'Chef', assignedBranchId: branchId } } },
      include: { employeeProfile: true }
    });
    await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: chef.employeeProfile!.id, branchId } });
    chefToken = sign(chef.id, chefEmail, [RoleEnum.CHEF]);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. the sanitizer strips control / zero-width characters, collapses spaces, trims and bounds to 500; empty becomes null', () => {
    expect(DELIVERY_INSTRUCTIONS_MAX).toBe(500);
    expect(sanitizeDeliveryInstructions('  Leave\r\nat   the\tgate\u0000​  ')).toBe('Leave at the gate');
    expect(sanitizeDeliveryInstructions('x'.repeat(900))!.length).toBe(500);
    for (const empty of ['', '   ', '\n\t​', null, undefined]) expect(sanitizeDeliveryInstructions(empty as string | null | undefined)).toBeNull();
  });

  it('2. instructions are persisted SANITIZED inside the immutable address snapshot; the key exists only when instructions were given', async () => {
    await fillCart();
    const res = await place(key(), { deliveryInstructions: '  Ring twice,\r\n  then call   me\u0000 ' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await snapshotOf(res.body.data.id)).deliveryInstructions).toBe('Ring twice, then call me');

    await fillCart();
    for (const none of [{}, { deliveryInstructions: '' }, { deliveryInstructions: '   \n ' }]) {
      await fillCart();
      const r = await place(key(), none);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(Object.keys(await snapshotOf(r.body.data.id))).not.toContain('deliveryInstructions');
    }
  });

  it('3. validation: more than 500 characters or a non-string value is rejected (422) and no order is created', async () => {
    await fillCart();
    const before = await prisma.order.count({ where: { customerProfileId: profileId } });
    for (const bad of ['x'.repeat(501), 123, ['a'], { a: 1 }]) {
      const r = await place(key(), { deliveryInstructions: bad });
      expect(r.status, JSON.stringify(bad).slice(0, 30)).toBe(422);
    }
    expect(await prisma.order.count({ where: { customerProfileId: profileId } })).toBe(before);
    const edge = await place(key(), { deliveryInstructions: 'y'.repeat(500) });
    expect(edge.status).toBe(201);
    expect(((await snapshotOf(edge.body.data.id)).deliveryInstructions as string).length).toBe(500);
  });

  it('4. idempotency uses the SAME sanitized value: a retry that differs only in whitespace / control characters replays the same order; real changes are 409', async () => {
    await fillCart();
    const k = key();
    const first = await place(k, { deliveryInstructions: 'Gate code 4321' });
    expect(first.status).toBe(201);
    const retry = await place(k, { deliveryInstructions: '  Gate   code\u0000 4321 \n' });
    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
    for (const changed of [{ deliveryInstructions: 'Gate code 9999' }, {}]) {
      const r = await place(k, changed);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('IDEMPOTENCY_KEY_REUSED');
    }
    expect(await prisma.order.count({ where: { customerProfileId: profileId, idempotencyKey: k } })).toBe(1);
    // the fingerprint is computed over the sanitized value
    const row = await prisma.order.findUniqueOrThrow({ where: { id: first.body.data.id }, include: { items: true } });
    const snap: any = row.pricingSnapshot;
    const sameDifferentlyTyped = (v: string) =>
      computeRequestFingerprint({ customerProfileId: profileId, addressId, paymentMethod: 'ONLINE', deliveryInstructions: v, items: row.items.map((i) => ({ productId: i.productId ?? '', variantId: i.variantId, quantity: i.quantity })), policyHash: snap.policyHash });
    expect(sameDifferentlyTyped('Gate code 4321')).toBe(row.requestFingerprint);
    expect(sameDifferentlyTyped('  Gate   code\u0000 4321 \n')).toBe(row.requestFingerprint);
  });

  it('5. orders without instructions keep their original fingerprint semantics (no instructions == empty string)', () => {
    const base = { customerProfileId: 'c', addressId: 'a', paymentMethod: 'ONLINE', items: [{ productId: 'p', variantId: null, quantity: 1 }], policyHash: 'h' };
    expect(computeRequestFingerprint(base)).toBe(computeRequestFingerprint({ ...base, deliveryInstructions: '' }));
    expect(computeRequestFingerprint(base)).toBe(computeRequestFingerprint({ ...base, deliveryInstructions: '  \n ' }));
    expect(computeRequestFingerprint(base)).not.toBe(computeRequestFingerprint({ ...base, deliveryInstructions: 'x' }));
  });

  it('6. instructions never touch pricing, tax or the policy snapshot: identical totals with and without them', async () => {
    await fillCart();
    const plain = await place(key(), {});
    await fillCart();
    const withNote = await place(key(), { deliveryInstructions: 'Please call on arrival' });
    const a = await prisma.order.findUniqueOrThrow({ where: { id: plain.body.data.id } });
    const b = await prisma.order.findUniqueOrThrow({ where: { id: withNote.body.data.id } });
    for (const f of ['totalAmount', 'discountAmount', 'taxAmount', 'deliveryFee', 'packagingFee', 'netAmount'] as const) expect(String(b[f]), f).toBe(String(a[f]));
    expect((b.pricingSnapshot as any).policyHash).toBe((a.pricingSnapshot as any).policyHash);
    expect(b.paymentMethod).toBe('ONLINE');
    expect(b.paymentStatus).toBe('PENDING');
  });

  it('7. the stored instructions are immutable: editing the saved address later never changes the order snapshot', async () => {
    await fillCart();
    const res = await place(key(), { deliveryInstructions: 'Second floor, blue door' });
    await prisma.customerAddress.update({ where: { id: addressId }, data: { addressLine1: 'Changed Afterwards', city: 'Elsewhere' } });
    const snap = await snapshotOf(res.body.data.id);
    expect(snap).toMatchObject({ addressLine1: '1 Test Road', city: 'Kochi', deliveryInstructions: 'Second floor, blue door' });
  });

  it('8. the kitchen never receives the instructions (Chef DTO of the same order has no trace of them)', async () => {
    await fillCart();
    const res = await place(key(), { deliveryInstructions: 'ZZ-SECRET-GATE-INSTRUCTION' });
    await prisma.order.update({ where: { id: res.body.data.id }, data: { status: 'CONFIRMED', paymentStatus: 'PAID', kitchenBranchId: branchId, confirmedAt: new Date() } });
    const q = await request(app).get('/api/v1/kds/orders').set(bearer(chefToken));
    expect(q.status).toBe(200);
    expect(JSON.stringify(q.body)).toContain(res.body.data.orderNumber); // the order IS in the kitchen queue...
    expect(JSON.stringify(q.body)).not.toContain('ZZ-SECRET-GATE-INSTRUCTION'); // ...without the instructions
  });
});

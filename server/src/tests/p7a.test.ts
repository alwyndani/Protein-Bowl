import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuditService } from '../modules/audit/audit.service.js';
import { buildCommercePolicy, resetCommercePolicyProvider, setCommercePolicyProvider } from '../config/commercePolicy.js';
import { setOrderNumberGenerator } from '../modules/order/orderNumber.js';
import { OrderTransitionService, TransitionActor } from '../modules/order/orderTransition.service.js';
import { ORDER_STATUSES, ORDER_TRANSITIONS, OrderStatus, TRANSITION_PARTIES, transitionKey } from '../modules/order/orderStatus.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const signToken = (userId: string, email: string, roles: RoleEnum[]) =>
  jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET || 'test_access_secret_key_1234567890_super_secret', { expiresIn: '15m' });

// The test environment's explicit commerce fixture (see tests/setup.ts); injected variants override single values.
const TEST_POLICY = {
  COMMERCE_TAX_MODE: 'EXCLUSIVE',
  COMMERCE_DELIVERY_FEE: '40.00',
  COMMERCE_FREE_DELIVERY_ENABLED: 'true',
  COMMERCE_FREE_DELIVERY_THRESHOLD: '499.00',
  COMMERCE_PACKAGING_FEE: '0.00',
  COMMERCE_MIN_ORDER_VALUE: '0',
  COMMERCE_DELIVERY_TAXABLE: 'false',
  COMMERCE_PACKAGING_TAXABLE: 'false',
  COMMERCE_MAX_LINE_QUANTITY: '20',
  COMMERCE_MAX_CART_UNITS: '50',
  COMMERCE_COD_ENABLED: 'false'
} as const;
const injectPolicy = (over: Partial<Record<keyof typeof TEST_POLICY, string>> = {}) => {
  const policy = buildCommercePolicy({ ...TEST_POLICY, ...over });
  setCommercePolicyProvider({ getPolicy: () => policy });
};

describe('P7A — commerce policy, idempotent checkout, order lifecycle foundation', () => {
  const ts = Date.now();
  let seq = 0;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const key = (label: string) => `IK-P7A-${ts}-${label}-${++seq}`;

  const users: Record<string, { id: string; email: string; token: string; profileId?: string; employeeId?: string }> = {};
  let branchA: { id: string };
  let branchB: { id: string };
  let p1: any; // 100.00 @ 5 %
  let p2: any; // 200.00 @ 12 %, variant 250.00 + 10.00 deposit
  let v2: any;
  let p0: any; // 50.00 @ 0 %
  let pBig: any; // 99,999,999.99
  const addr: Record<string, string> = {};

  async function mkUser(label: string, roles: RoleEnum[], branches: string[] = []) {
    const email = `p7a_${label}_${ts}@test.com`;
    const isCustomer = roles.includes(RoleEnum.CUSTOMER);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(isCustomer
          ? { customerProfile: { create: { fullName: `P7A ${label}`, referralCode: `PB-7${label.toUpperCase()}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `P7A-${label}-${ts}`, fullName: `P7A ${label}`, designation: 'Test', assignedBranchId: branches[0] ?? null } } })
      },
      include: { customerProfile: true, employeeProfile: true }
    });
    for (const branchId of branches) {
      await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: user.employeeProfile!.id, branchId } });
    }
    users[label] = { id: user.id, email, token: signToken(user.id, email, roles), profileId: user.customerProfile?.id, employeeId: user.employeeProfile?.id };
    return user;
  }

  const mkAddress = (profileId: string, line: string) =>
    prisma.customerAddress.create({ data: { customerProfileId: profileId, title: 'Home', addressLine1: line, city: 'Kochi', state: 'Kerala', postalCode: '682001' } });

  const clearCart = (t: string) => request(app).delete('/api/v1/cart').set(bearer(t));
  const addToCart = (t: string, productId: string, quantity: unknown, variantId?: string) =>
    request(app).post('/api/v1/cart/items').set(bearer(t)).send({ productId, variantId, quantity });
  const fillCart = async (t: string, lines: Array<{ productId: string; quantity: number; variantId?: string }>) => {
    await clearCart(t);
    for (const l of lines) {
      const r = await addToCart(t, l.productId, l.quantity, l.variantId);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    }
  };
  const place = (t: string, idemKey: string | null, body: Record<string, unknown>) => {
    const r = request(app).post('/api/v1/orders').set(bearer(t));
    if (idemKey) r.set('x-idempotency-key', idemKey);
    return r.send(body);
  };
  const eventsOf = (orderId: string) => prisma.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  const auditOf = (action: string, entityId: string) => prisma.auditLog.findMany({ where: { action, entityId } });

  // Actors for the transition service
  const sys: TransitionActor = { kind: 'SYSTEM', source: 'PAYMENT_VERIFICATION' };
  const userActor = (label: string, roles: RoleEnum[], extra: Partial<Extract<TransitionActor, { kind: 'USER' }>> = {}): TransitionActor => ({
    kind: 'USER',
    userId: users[label]?.id ?? 'x',
    roles,
    ...extra
  });
  const adminActor = () => userActor('admin', [RoleEnum.SUPER_ADMIN], { isGlobal: true });
  const chefActor = (branchIds: string[]) => userActor('chefA', [RoleEnum.CHEF], { branchIds });
  const driverActor = (branchIds: string[]) => userActor('driver1', [RoleEnum.DELIVERY], { branchIds });
  const customerActor = (label = 'custA'): TransitionActor => userActor(label, [RoleEnum.CUSTOMER], { customerProfileId: users[label].profileId });

  let orderSeq = 0;
  const mkOrder = (over: Record<string, unknown> = {}) =>
    prisma.order.create({
      data: {
        orderNumber: `P7A-T-${ts}-${++orderSeq}`,
        totalAmount: 100,
        netAmount: 100,
        customerProfileId: users.custA.profileId,
        paymentMethod: 'ONLINE',
        ...over
      } as any
    });
  const paidOrder = (status: string, over: Record<string, unknown> = {}) =>
    mkOrder({ status, paymentStatus: 'PAID', kitchenBranchId: branchA.id, ...over });

  beforeAll(async () => {
    branchA = await prisma.kitchenBranch.create({ data: { code: `p7a-a-${ts}`, name: 'P7A A', address: 'A', city: 'Kochi' } });
    branchB = await prisma.kitchenBranch.create({ data: { code: `p7a-b-${ts}`, name: 'P7A B', address: 'B', city: 'Kozhikode' } });

    await mkUser('custA', [RoleEnum.CUSTOMER]);
    await mkUser('custB', [RoleEnum.CUSTOMER]);
    await mkUser('custC', [RoleEnum.CUSTOMER]);
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('md', [RoleEnum.MD], [branchA.id]);
    await mkUser('chefA', [RoleEnum.CHEF], [branchA.id]);
    await mkUser('chefB', [RoleEnum.CHEF], [branchB.id]);
    await mkUser('driver1', [RoleEnum.DELIVERY], [branchA.id]);

    for (const l of ['custA', 'custB', 'custC'] as const) addr[l] = (await mkAddress(users[l].profileId!, `P7A ${l} Street 1`)).id;
    addr.custA2 = (await mkAddress(users.custA.profileId!, 'P7A custA Street 2')).id;

    const cat = await prisma.productCategory.create({ data: { name: `P7A Category ${ts}`, slug: `p7a-cat-${ts}`, description: 'p7a' } });
    const mk = (slug: string, basePrice: number, taxRate: number) =>
      prisma.product.create({ data: { slug: `p7a-${slug}-${ts}`, categoryId: cat.id, name: `P7A ${slug}`, description: 'p7a', basePrice, taxRate, isPublished: true, isActive: true } });
    p1 = await mk('p1', 100, 0.05);
    p2 = await mk('p2', 200, 0.12);
    p0 = await mk('p0', 50, 0);
    pBig = await mk('big', 99999999.99, 0);
    v2 = await prisma.productVariant.create({ data: { productId: p2.id, name: 'Large', sku: `P7A-V2-${ts}`, price: 250, containerDeposit: 10, isActive: true } });
  });

  afterEach(() => {
    resetCommercePolicyProvider();
    setOrderNumberGenerator(null);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // =============================================================================================== order creation
  describe('order creation', () => {
    let first: any;
    const k1 = `IK-P7A-${ts}-main-1`;

    it('1. creates a PENDING/PENDING ONLINE order priced by the server policy (client values ignored)', async () => {
      await fillCart(users.custA.token, [{ productId: p1.id, quantity: 1 }]);
      const res = await place(users.custA.token, k1, {
        addressId: addr.custA,
        paymentMethod: 'ONLINE',
        // hostile client fields that must be ignored
        netAmount: 1,
        totalAmount: 1,
        taxAmount: 0,
        deliveryFee: 0,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        taxRate: 0
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      first = res.body.data;
      expect(first.status).toBe('PENDING');
      expect(first.paymentStatus).toBe('PENDING');
      expect(first.paymentMethod).toBe('ONLINE');
      expect(Number(first.totalAmount)).toBe(100);
      expect(Number(first.taxAmount)).toBe(5);
      expect(Number(first.deliveryFee)).toBe(40);
      expect(Number(first.packagingFee)).toBe(0);
      expect(Number(first.netAmount)).toBe(145);
      expect(first.confirmedAt).toBeNull();
    });

    it('2. the response is a safe DTO: no idempotency key, fingerprint, snapshot, customer/branch ids or guest fields', async () => {
      const text = JSON.stringify(first);
      for (const forbidden of ['idempotencyKey', 'requestFingerprint', 'pricingSnapshot', 'customerProfileId', 'kitchenBranchId', 'guestEmail', 'guestPhone', 'isGuest', 'cancellationReason', k1]) {
        expect(text, forbidden).not.toContain(forbidden);
      }
      expect(first.items[0]).not.toHaveProperty('customization');
    });

    it('3. stores an immutable pricing-policy snapshot (no environment names) and a 64-hex request fingerprint', async () => {
      const row = await prisma.order.findUnique({ where: { id: first.id } });
      const snap: any = row!.pricingSnapshot;
      expect(snap.snapshotVersion).toBe(1);
      expect(snap.policySource).toBe('ENVIRONMENT');
      expect(snap.tax).toEqual({ mode: 'EXCLUSIVE', rounding: 'LINE_HALF_UP', deliveryTaxable: false, packagingTaxable: false });
      expect(snap.deliveryFee).toBe('40.00');
      expect(snap.freeDelivery).toEqual({ enabled: true, threshold: '499.00', basis: 'ITEMS_SUBTOTAL' });
      expect(snap.quantityLimits).toEqual({ maxLineQuantity: 20, maxCartUnits: 50 });
      expect(snap.policyHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(snap)).not.toMatch(/COMMERCE_|process\.env/);
      expect(row!.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(row!.idempotencyKey).toBe(k1);
    });

    it('4. order numbers use the documented PB-YYMMDD-XXXXXX format', () => {
      expect(first.orderNumber).toMatch(/^PB-\d{6}-[2-9A-HJKMNP-TV-Z]{6}$/);
    });

    it('5. creates exactly ONE creation event (null -> PENDING) and one ORDER_CREATED audit row in the same transaction', async () => {
      const events = await eventsOf(first.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ fromStatus: null, toStatus: 'PENDING', actorUserId: users.custA.id, actorRole: 'CUSTOMER' });
      const audits = await auditOf('ORDER_CREATED', first.id);
      expect(audits).toHaveLength(1);
      expect(audits[0].userId).toBe(users.custA.id);
      const payload = JSON.stringify(audits[0].payload);
      expect(payload).not.toContain(k1);
      expect(payload).not.toMatch(/requestFingerprint|idempotency/i);
      expect((audits[0].payload as any).paymentMethod).toBe('ONLINE');
    });

    it('6. the cart lines that were ordered are consumed', async () => {
      const cart = await request(app).get('/api/v1/cart').set(bearer(users.custA.token));
      expect(cart.body.data.items).toHaveLength(0);
    });

    it('7. replaying the same key with the same request returns the SAME order and adds no event/audit/order', async () => {
      const again = await place(users.custA.token, k1, { addressId: addr.custA, paymentMethod: 'ONLINE' });
      expect(again.status).toBe(201);
      expect(again.body.data.id).toBe(first.id);
      expect(again.body.data.orderNumber).toBe(first.orderNumber);
      expect(await prisma.order.count({ where: { customerProfileId: users.custA.profileId, idempotencyKey: k1 } })).toBe(1);
      expect(await eventsOf(first.id)).toHaveLength(1);
      expect(await auditOf('ORDER_CREATED', first.id)).toHaveLength(1);
    });

    it('8. a replay is not affected by a cart that has changed since (the request, not the cart, is compared)', async () => {
      await fillCart(users.custA.token, [{ productId: p2.id, quantity: 3, variantId: v2.id }]);
      const again = await place(users.custA.token, k1, { addressId: addr.custA, paymentMethod: 'ONLINE' });
      expect(again.status).toBe(201);
      expect(again.body.data.id).toBe(first.id);
      expect((await request(app).get('/api/v1/cart').set(bearer(users.custA.token))).body.data.items).toHaveLength(1); // untouched
    });

    it('9. same key + DIFFERENT address -> 409 IDEMPOTENCY_KEY_REUSED (no new order, cart untouched)', async () => {
      const res = await place(users.custA.token, k1, { addressId: addr.custA2, paymentMethod: 'ONLINE' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await prisma.order.count({ where: { customerProfileId: users.custA.profileId, idempotencyKey: k1 } })).toBe(1);
    });

    it('10. same key + different payment method -> 409 IDEMPOTENCY_KEY_REUSED', async () => {
      injectPolicy({ COMMERCE_COD_ENABLED: 'true' });
      const res = await place(users.custA.token, k1, { addressId: addr.custA, paymentMethod: 'COD' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('11. same key + different delivery instructions -> 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const res = await place(users.custA.token, k1, { addressId: addr.custA, paymentMethod: 'ONLINE', deliveryInstructions: 'leave at the gate' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('12. the key is REQUIRED: no header -> 400 IDEMPOTENCY_KEY_REQUIRED, nothing created, cart intact', async () => {
      const before = await prisma.order.count({ where: { customerProfileId: users.custA.profileId } });
      const res = await place(users.custA.token, null, { addressId: addr.custA, paymentMethod: 'ONLINE' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(await prisma.order.count({ where: { customerProfileId: users.custA.profileId } })).toBe(before);
      expect((await request(app).get('/api/v1/cart').set(bearer(users.custA.token))).body.data.items).toHaveLength(1);
    });

    it('13. malformed keys are rejected with INVALID_IDEMPOTENCY_KEY', async () => {
      for (const bad of ['short', 'has spaces in key', 'x'.repeat(200)]) {
        const res = await place(users.custA.token, bad, { addressId: addr.custA });
        expect(res.status, bad).toBe(400);
        expect(res.body.error).toBe('INVALID_IDEMPOTENCY_KEY');
      }
    });

    it('14. idempotency keys are scoped per customer: another customer using the same key gets their OWN order and learns nothing', async () => {
      await fillCart(users.custB.token, [{ productId: p1.id, quantity: 2 }]);
      const res = await place(users.custB.token, k1, { addressId: addr.custB });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data.id).not.toBe(first.id);
      expect(Number(res.body.data.totalAmount)).toBe(200);
      const rows = await prisma.order.findMany({ where: { idempotencyKey: k1 } });
      expect(rows.map((r) => r.customerProfileId).sort()).toEqual([users.custA.profileId, users.custB.profileId].sort());
    });

    it('15. unsupported payment methods are rejected (INVALID_PAYMENT_METHOD) and no free string is stored', async () => {
      for (const bad of ['PAID', 'cash', 'ONLINE ', 'UPI', 123, ['ONLINE'], { a: 1 }]) {
        const res = await place(users.custA.token, key('pm'), { addressId: addr.custA, paymentMethod: bad });
        expect(res.status, JSON.stringify(bad)).toBe(422);
        expect(res.body.error).toBe('INVALID_PAYMENT_METHOD');
      }
    });

    it('16. COD is rejected with COD_NOT_ALLOWED while policy disables it, and the cart is untouched', async () => {
      const res = await place(users.custA.token, key('cod'), { addressId: addr.custA, paymentMethod: 'COD' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('COD_NOT_ALLOWED');
      expect((await request(app).get('/api/v1/cart').set(bearer(users.custA.token))).body.data.items).toHaveLength(1);
    });

    it('17. when policy enables COD the order is stored as COD but is NOT confirmed or paid', async () => {
      injectPolicy({ COMMERCE_COD_ENABLED: 'true' });
      const res = await place(users.custA.token, key('cod-on'), { addressId: addr.custA, paymentMethod: 'COD' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data).toMatchObject({ paymentMethod: 'COD', status: 'PENDING', paymentStatus: 'PENDING', confirmedAt: null });
      const snap: any = (await prisma.order.findUnique({ where: { id: res.body.data.id } }))!.pricingSnapshot;
      expect(snap.paymentMethods).toEqual({ online: true, cod: true });
      expect(snap.policySource).toBe('INJECTED');
    });

    it('18. an omitted payment method defaults to ONLINE', async () => {
      await fillCart(users.custA.token, [{ productId: p0.id, quantity: 1 }]);
      const res = await place(users.custA.token, key('default'), { addressId: addr.custA });
      expect(res.status).toBe(201);
      expect(res.body.data.paymentMethod).toBe('ONLINE');
    });

    it('19. no operational payment/identity is ever accepted from the client, and unauthenticated / staff callers are refused', async () => {
      expect((await request(app).post('/api/v1/orders').set('x-idempotency-key', key('anon')).send({ addressId: addr.custA })).status).toBe(401);
      for (const staff of ['admin', 'md', 'chefA']) {
        const res = await place(users[staff].token, key(staff), { addressId: addr.custA });
        expect(res.status, staff).toBe(403);
      }
    });
  });

  // =============================================================================================== pricing, minimum order, quantities
  describe('pricing authority, minimum order and quantity limits', () => {
    it('20. checkout preview and final creation produce IDENTICAL totals for identical inputs and policy', async () => {
      await fillCart(users.custA.token, [{ productId: p2.id, quantity: 2, variantId: v2.id }, { productId: p1.id, quantity: 1 }]);
      const preview = await request(app).post('/api/v1/checkout/preview').set(bearer(users.custA.token)).send({ addressId: addr.custA });
      expect(preview.status).toBe(200);
      const res = await place(users.custA.token, key('same-totals'), { addressId: addr.custA });
      expect(res.status).toBe(201);
      const s = preview.body.data.summary;
      expect(Number(res.body.data.totalAmount)).toBe(s.itemsSubtotal);
      expect(Number(res.body.data.taxAmount)).toBe(s.totalTax);
      expect(Number(res.body.data.containerDepositTotal)).toBe(s.containerDepositTotal);
      expect(Number(res.body.data.deliveryFee)).toBe(s.deliveryFee);
      expect(Number(res.body.data.packagingFee)).toBe(s.packagingFee);
      expect(Number(res.body.data.netAmount)).toBe(s.netAmount);
      // 2 x 250 + 1 x 100 = 600 (>= 499 => free delivery); tax 60 + 5; deposit 20
      expect(s).toMatchObject({ itemsSubtotal: 600, totalTax: 65, containerDepositTotal: 20, deliveryFee: 0, netAmount: 685 });
    });

    it('21. the preview reports the (disabled) minimum order and never persists anything', async () => {
      await fillCart(users.custA.token, [{ productId: p1.id, quantity: 1 }]);
      const before = await prisma.order.count({ where: { customerProfileId: users.custA.profileId } });
      const preview = await request(app).post('/api/v1/checkout/preview').set(bearer(users.custA.token)).send({ addressId: addr.custA });
      expect(preview.body.data.minimumOrder).toEqual({ enabled: false, requiredAmount: 0, met: true, shortfall: 0 });
      expect(await prisma.order.count({ where: { customerProfileId: users.custA.profileId } })).toBe(before);
    });

    it('22. minimum order: the preview shows the shortfall and final creation is rejected server-side (MINIMUM_ORDER_NOT_MET)', async () => {
      injectPolicy({ COMMERCE_MIN_ORDER_VALUE: '250.00' });
      await fillCart(users.custA.token, [{ productId: p1.id, quantity: 1 }]); // items subtotal 100
      const preview = await request(app).post('/api/v1/checkout/preview').set(bearer(users.custA.token)).send({ addressId: addr.custA });
      expect(preview.status).toBe(200);
      expect(preview.body.data.minimumOrder).toEqual({ enabled: true, requiredAmount: 250, met: false, shortfall: 150 });

      const k = key('min-order');
      const res = await place(users.custA.token, k, { addressId: addr.custA });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('MINIMUM_ORDER_NOT_MET');
      expect(await prisma.order.count({ where: { customerProfileId: users.custA.profileId, idempotencyKey: k } })).toBe(0);
      expect((await request(app).get('/api/v1/cart').set(bearer(users.custA.token))).body.data.items).toHaveLength(1);

      await addToCart(users.custA.token, p1.id, 2); // subtotal 300 >= 250
      const ok = await place(users.custA.token, k, { addressId: addr.custA });
      expect(ok.status).toBe(201);
      expect(Number(ok.body.data.totalAmount)).toBe(300);
    });

    it('23. policy changes affect NEW orders only; an existing order keeps its stored totals and snapshot', async () => {
      await fillCart(users.custA.token, [{ productId: p1.id, quantity: 1 }]);
      const k = key('policy-drift');
      const original = await place(users.custA.token, k, { addressId: addr.custA });
      expect(Number(original.body.data.deliveryFee)).toBe(40);

      injectPolicy({ COMMERCE_DELIVERY_FEE: '99.00', COMMERCE_PACKAGING_FEE: '7.00' });
      const detail = await request(app).get(`/api/v1/orders/${original.body.data.id}`).set(bearer(users.custA.token));
      expect(Number(detail.body.data.deliveryFee)).toBe(40);
      expect(Number(detail.body.data.netAmount)).toBe(145);
      const replay = await place(users.custA.token, k, { addressId: addr.custA });
      expect(replay.body.data.id).toBe(original.body.data.id);
      expect(Number(replay.body.data.netAmount)).toBe(145);

      await fillCart(users.custA.token, [{ productId: p1.id, quantity: 1 }]);
      const fresh = await place(users.custA.token, key('policy-new'), { addressId: addr.custA });
      expect(Number(fresh.body.data.deliveryFee)).toBe(99);
      expect(Number(fresh.body.data.packagingFee)).toBe(7);
      expect(Number(fresh.body.data.netAmount)).toBe(100 + 5 + 99 + 7);
      expect(((await prisma.order.findUnique({ where: { id: fresh.body.data.id } }))!.pricingSnapshot as any).deliveryFee).toBe('99.00');
    });

    it('24. a product with a zero tax rate is taxed at zero (no hidden 5 % fallback)', async () => {
      await fillCart(users.custA.token, [{ productId: p0.id, quantity: 2 }]);
      const preview = await request(app).post('/api/v1/checkout/preview').set(bearer(users.custA.token)).send({ addressId: addr.custA });
      expect(preview.body.data.summary.totalTax).toBe(0);
      expect(preview.body.data.items[0].taxRate).toBe(0);
    });

    it('25. cart quantity validation is stable and never coerces (zero, negative, fractional, text, null)', async () => {
      await clearCart(users.custA.token);
      for (const bad of [0, -1, 1.5, '3', null, 'abc']) {
        const res = await addToCart(users.custA.token, p1.id, bad);
        expect(res.status, JSON.stringify(bad)).toBe(422);
        expect(res.body.error).toBe('INVALID_QUANTITY');
      }
      expect((await request(app).get('/api/v1/cart').set(bearer(users.custA.token))).body.data.items).toHaveLength(0);
    });

    it('26. per-line and whole-cart limits are enforced on add, merge and update', async () => {
      await clearCart(users.custA.token);
      expect((await addToCart(users.custA.token, p1.id, 21)).body.error).toBe('MAX_LINE_QUANTITY_EXCEEDED');
      expect((await addToCart(users.custA.token, p1.id, 20)).status).toBe(201);
      expect((await addToCart(users.custA.token, p1.id, 1)).body.error).toBe('MAX_LINE_QUANTITY_EXCEEDED'); // merge would be 21
      expect((await addToCart(users.custA.token, p2.id, 20)).status).toBe(201);
      expect((await addToCart(users.custA.token, p0.id, 10)).status).toBe(201); // 50 units
      expect((await addToCart(users.custA.token, pBig.id, 1)).body.error).toBe('MAX_CART_QUANTITY_EXCEEDED'); // 51

      const cart = (await request(app).get('/api/v1/cart').set(bearer(users.custA.token))).body.data;
      const p0Line = cart.items.find((i: any) => i.productId === p0.id);
      expect((await request(app).patch(`/api/v1/cart/items/${p0Line.id}`).set(bearer(users.custA.token)).send({ quantity: 11 })).body.error).toBe('MAX_CART_QUANTITY_EXCEEDED');
      expect((await request(app).patch(`/api/v1/cart/items/${p0Line.id}`).set(bearer(users.custA.token)).send({ quantity: 0 })).body.error).toBe('INVALID_QUANTITY');
      expect((await request(app).patch(`/api/v1/cart/items/${p0Line.id}`).set(bearer(users.custA.token)).send({})).body.error).toBe('INVALID_QUANTITY');
      const after = (await request(app).get('/api/v1/cart').set(bearer(users.custA.token))).body.data;
      expect(after.items.find((i: any) => i.productId === p0.id).quantity).toBe(10); // every rejection left the cart unchanged
    });

    it('27. a legacy out-of-policy cart row can still be viewed (with issues) but cannot be previewed or ordered', async () => {
      await clearCart(users.custA.token);
      const cart = await prisma.cart.findUnique({ where: { customerProfileId: users.custA.profileId! } });
      await prisma.cartItem.create({ data: { cartId: cart!.id, productId: p1.id, quantity: 0 } });

      const view = await request(app).get('/api/v1/cart').set(bearer(users.custA.token));
      expect(view.status).toBe(200);
      expect(view.body.data.quantityIssues).toEqual([{ itemId: expect.any(String), code: 'INVALID_QUANTITY' }]);

      const preview = await request(app).post('/api/v1/checkout/preview').set(bearer(users.custA.token)).send({ addressId: addr.custA });
      expect(preview.status).toBe(422);
      expect(preview.body.error).toBe('INVALID_QUANTITY');
      const k = key('legacy');
      const res = await place(users.custA.token, k, { addressId: addr.custA });
      expect(res.status).toBe(422);
      expect(await prisma.order.count({ where: { customerProfileId: users.custA.profileId, idempotencyKey: k } })).toBe(0);

      const line = view.body.data.items[0];
      expect((await request(app).delete(`/api/v1/cart/items/${line.id}`).set(bearer(users.custA.token))).status).toBe(200); // repairable
    });

    it('28. order totals that would overflow money storage are rejected, not stored or truncated', async () => {
      await fillCart(users.custA.token, [{ productId: pBig.id, quantity: 1 }]);
      await request(app).patch(`/api/v1/cart/items/${(await prisma.cartItem.findFirst({ where: { productId: pBig.id, cart: { customerProfileId: users.custA.profileId! } } }))!.id}`).set(bearer(users.custA.token)).send({ quantity: 2 });
      const res = await place(users.custA.token, key('big'), { addressId: addr.custA });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('ORDER_TOTAL_TOO_LARGE');
    });

    it('29. cart totals use the same policy (and a configured free-delivery rule) as checkout', async () => {
      injectPolicy({ COMMERCE_FREE_DELIVERY_ENABLED: 'false', COMMERCE_FREE_DELIVERY_THRESHOLD: '', COMMERCE_PACKAGING_FEE: '3.00' });
      await fillCart(users.custA.token, [{ productId: p2.id, quantity: 4, variantId: v2.id }]); // 1000 subtotal
      const cart = (await request(app).get('/api/v1/cart').set(bearer(users.custA.token))).body.data;
      expect(cart.deliveryFee).toBe(40); // threshold disabled: no waiver however large
      expect(cart.packagingFee).toBe(3);
      const preview = (await request(app).post('/api/v1/checkout/preview').set(bearer(users.custA.token)).send({ addressId: addr.custA })).body.data;
      expect(cart.netAmount).toBe(preview.summary.netAmount);
    });
  });

  // =============================================================================================== concurrency
  describe('checkout concurrency (real database races)', () => {
    it('30. the same key + same request submitted 8x in parallel yields ONE order, ONE event, ONE audit row and no errors', async () => {
      await fillCart(users.custC.token, [{ productId: p1.id, quantity: 2 }]);
      const k = key('race-same');
      const results = await Promise.all(Array.from({ length: 8 }, () => place(users.custC.token, k, { addressId: addr.custC })));
      expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
      const ids = new Set(results.map((r) => r.body.data.id));
      expect(ids.size).toBe(1);
      const id = [...ids][0] as string;
      expect(await prisma.order.count({ where: { customerProfileId: users.custC.profileId, idempotencyKey: k } })).toBe(1);
      expect(await eventsOf(id)).toHaveLength(1);
      expect(await auditOf('ORDER_CREATED', id)).toHaveLength(1);
    });

    it('31. the same key with DIFFERENT requests in parallel: exactly one wins, the others get 409 IDEMPOTENCY_KEY_REUSED (never 500)', async () => {
      await fillCart(users.custC.token, [{ productId: p1.id, quantity: 1 }]);
      const addr2 = (await mkAddress(users.custC.profileId!, 'P7A custC Street 2')).id;
      const k = key('race-diff');
      const calls = [addr.custC, addr2, addr.custC, addr2].map((a) => place(users.custC.token, k, { addressId: a }));
      const results = await Promise.all(calls);
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201).length).toBeGreaterThanOrEqual(1);
      expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
      for (const r of results.filter((x) => x.status === 409)) expect(r.body.error).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await prisma.order.count({ where: { customerProfileId: users.custC.profileId, idempotencyKey: k } })).toBe(1);
      // every 201 returned the single stored order (the winning address's requests replay; the other address conflicts)
      expect(new Set(results.filter((x) => x.status === 201).map((x) => x.body.data.id)).size).toBe(1);
    });

    it('32. ONE cart with SIX different keys in parallel creates exactly ONE order (the rest see an empty cart)', async () => {
      await fillCart(users.custC.token, [{ productId: p1.id, quantity: 1 }, { productId: p0.id, quantity: 3 }]);
      const before = await prisma.order.count({ where: { customerProfileId: users.custC.profileId } });
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => place(users.custC.token, key(`race-keys-${i}`), { addressId: addr.custC })));
      const created = results.filter((r) => r.status === 201);
      expect(created).toHaveLength(1);
      for (const r of results.filter((x) => x.status !== 201)) {
        expect(r.status).toBe(400);
        expect(r.body.error).toBe('EMPTY_CART');
      }
      expect(await prisma.order.count({ where: { customerProfileId: users.custC.profileId } })).toBe(before + 1);
      expect(created[0].body.data.items).toHaveLength(2);
    });

    it('33. a cart edit racing with checkout never loses a line: it is either in the order or still in the cart, exactly once', async () => {
      await fillCart(users.custC.token, [{ productId: p1.id, quantity: 1 }]);
      const [orderRes, addRes] = await Promise.all([
        place(users.custC.token, key('race-edit'), { addressId: addr.custC }),
        addToCart(users.custC.token, p0.id, 1)
      ]);
      expect(orderRes.status).toBe(201);
      expect(addRes.status).toBe(201);
      const inOrder = orderRes.body.data.items.filter((i: any) => i.productId === p0.id).reduce((s: number, i: any) => s + i.quantity, 0);
      const cart = (await request(app).get('/api/v1/cart').set(bearer(users.custC.token))).body.data;
      const inCart = cart.items.filter((i: any) => i.productId === p0.id).reduce((s: number, i: any) => s + i.quantity, 0);
      expect(inOrder + inCart).toBe(1);
    });

    it('34. an order-number collision is retried transparently and never surfaces as a database error', async () => {
      const dup = `PB-C${ts}-0001`;
      const next = `PB-C${ts}-0002`;
      const draws = [dup, dup, next];
      setOrderNumberGenerator(() => draws.shift() ?? `PB-C${ts}-9999`);

      await fillCart(users.custA.token, [{ productId: p0.id, quantity: 1 }]);
      const a = await place(users.custA.token, key('collide-a'), { addressId: addr.custA });
      expect(a.status, JSON.stringify(a.body)).toBe(201);
      expect(a.body.data.orderNumber).toBe(dup);

      await fillCart(users.custB.token, [{ productId: p0.id, quantity: 1 }]);
      const b = await place(users.custB.token, key('collide-b'), { addressId: addr.custB });
      expect(b.status, JSON.stringify(b.body)).toBe(201);
      expect(b.body.data.orderNumber).toBe(next); // first draw collided, second was used
    });

    it('35. persistent collisions end in a clean 503 ORDER_NUMBER_UNAVAILABLE with nothing created and the cart intact', async () => {
      const fixed = `PB-C${ts}-0003`;
      await prisma.order.create({ data: { orderNumber: fixed, totalAmount: 1, netAmount: 1 } });
      setOrderNumberGenerator(() => fixed);
      await fillCart(users.custB.token, [{ productId: p0.id, quantity: 1 }]);
      const k = key('collide-all');
      const res = await place(users.custB.token, k, { addressId: addr.custB });
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('ORDER_NUMBER_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|P2002|unique constraint/i);
      expect(await prisma.order.count({ where: { customerProfileId: users.custB.profileId, idempotencyKey: k } })).toBe(0);
      expect((await request(app).get('/api/v1/cart').set(bearer(users.custB.token))).body.data.items).toHaveLength(1);
    });

    it('36. an audit failure rolls the whole checkout back (no order, no event, cart intact)', async () => {
      await fillCart(users.custB.token, [{ productId: p0.id, quantity: 2 }]);
      const k = key('audit-fail');
      const spy = vi.spyOn(AuditService, 'record').mockRejectedValueOnce(new Error('audit store unavailable'));
      const res = await place(users.custB.token, k, { addressId: addr.custB });
      expect(spy).toHaveBeenCalled();
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('audit store unavailable');
      expect(await prisma.order.count({ where: { customerProfileId: users.custB.profileId, idempotencyKey: k } })).toBe(0);
      expect((await request(app).get('/api/v1/cart').set(bearer(users.custB.token))).body.data.items.length).toBeGreaterThan(0);
    });
  });

  // =============================================================================================== order reads / DTO / timeline
  describe('customer order reads (DTO, ownership, timeline)', () => {
    let o: any;

    it('37. list and detail never expose internal fields; only the detail view carries the timeline', async () => {
      o = await mkOrder({ idempotencyKey: `IK-LEAK-${ts}-12345678`, requestFingerprint: 'f'.repeat(64), kitchenBranchId: branchA.id, cancellationReason: 'secret reason' });
      await prisma.orderEvent.create({ data: { orderId: o.id, fromStatus: null, toStatus: 'PENDING', actorUserId: users.custA.id, actorRole: 'CUSTOMER', reason: 'internal note' } });

      const list = await request(app).get('/api/v1/orders/my-orders').set(bearer(users.custA.token));
      expect(list.status).toBe(200);
      const row = list.body.data.find((x: any) => x.id === o.id);
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty('timeline');
      const detail = await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(users.custA.token));
      expect(detail.status).toBe(200);
      for (const body of [JSON.stringify(row), JSON.stringify(detail.body.data)]) {
        for (const forbidden of ['idempotencyKey', 'requestFingerprint', 'kitchenBranchId', 'secret reason', 'internal note', 'actorUserId', users.custA.id]) {
          expect(body, forbidden).not.toContain(forbidden);
        }
      }
      expect(detail.body.data.timeline).toEqual([{ fromStatus: null, toStatus: 'PENDING', at: expect.any(String) }]);
    });

    it('38. another customer (and staff) cannot read the order; lookup works by number for the owner', async () => {
      expect((await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(users.custB.token))).status).toBe(404);
      expect((await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(users.admin.token))).status).toBe(403);
      expect((await request(app).get(`/api/v1/orders/${o.orderNumber}`).set(bearer(users.custA.token))).status).toBe(200);
      const mine = await request(app).get('/api/v1/orders/my-orders').set(bearer(users.custB.token));
      expect(mine.body.data.find((x: any) => x.id === o.id)).toBeUndefined();
    });

    it('39. the timeline reflects status changes in order, without actor identities or reasons', async () => {
      const order = await paidOrder('PENDING');
      await OrderTransitionService.transition({ orderId: order.id, to: 'CONFIRMED', actor: sys });
      await OrderTransitionService.transition({ orderId: order.id, to: 'PREPARING', actor: chefActor([branchA.id]), reason: 'started' });
      const detail = await request(app).get(`/api/v1/orders/${order.id}`).set(bearer(users.custA.token));
      expect(detail.body.data.timeline.map((t: any) => t.toStatus)).toEqual(['CONFIRMED', 'PREPARING']);
      expect(JSON.stringify(detail.body.data)).not.toMatch(/started|actorRole|SYSTEM:/);
    });
  });

  // =============================================================================================== transition service
  describe('OrderTransitionService', () => {
    const expectCode = async (p: Promise<unknown>, code: string) =>
      expect(p).rejects.toMatchObject({ errorCode: code });

    it('40. the payment seam: PENDING -> CONFIRMED works for the SYSTEM actor only when the order is PAID, and records everything', async () => {
      const order = await paidOrder('PENDING');
      const res = await OrderTransitionService.transition({ orderId: order.id, to: 'CONFIRMED', actor: sys });
      expect(res).toMatchObject({ changed: true, order: { status: 'CONFIRMED' } });
      const row = await prisma.order.findUnique({ where: { id: order.id } });
      expect(row!.confirmedAt).not.toBeNull();
      const events = await eventsOf(order.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ fromStatus: 'PENDING', toStatus: 'CONFIRMED', actorUserId: null, actorRole: 'SYSTEM:PAYMENT_VERIFICATION' });
      const audits = await auditOf('ORDER_STATUS_CHANGED', order.id);
      expect(audits).toHaveLength(1);
      expect(audits[0].payload).toMatchObject({ from: 'PENDING', to: 'CONFIRMED', actorKind: 'SYSTEM' });
    });

    it('41. an unpaid ONLINE order can NOT be confirmed - not even by the SYSTEM actor', async () => {
      const order = await mkOrder({ status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'ONLINE' });
      await expectCode(OrderTransitionService.transition({ orderId: order.id, to: 'CONFIRMED', actor: sys }), 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('PENDING');
      expect(await eventsOf(order.id)).toHaveLength(0);
      expect(await auditOf('ORDER_STATUS_CHANGED', order.id)).toHaveLength(0);
    });

    it('42. a COD order stays PENDING in P7A (no COD confirmation path exists yet)', async () => {
      const order = await mkOrder({ status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'COD' });
      await expectCode(OrderTransitionService.transition({ orderId: order.id, to: 'CONFIRMED', actor: sys }), 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
    });

    it('43. no actor can confirm: customers, SUPER_ADMIN, chefs and drivers get ORDER_TRANSITION_FORBIDDEN even for a paid order', async () => {
      const order = await paidOrder('PENDING');
      for (const actor of [customerActor(), adminActor(), chefActor([branchA.id]), driverActor([branchA.id])]) {
        await expectCode(OrderTransitionService.transition({ orderId: order.id, to: 'CONFIRMED', actor }), 'ORDER_TRANSITION_FORBIDDEN');
      }
      expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('PENDING');
    });

    it('44. payment gating holds for EVERY operational status, whatever the current state or role, for unpaid/failed/refunded payments', async () => {
      const predecessor: Record<string, OrderStatus> = { CONFIRMED: 'PENDING', ACCEPTED: 'CONFIRMED', PREPARING: 'CONFIRMED', READY: 'PREPARING', DISPATCHED: 'READY', DELIVERED: 'DISPATCHED' };
      const actorFor: Record<string, TransitionActor> = {
        CONFIRMED: sys,
        ACCEPTED: adminActor(),
        PREPARING: adminActor(),
        READY: adminActor(),
        DISPATCHED: adminActor(),
        DELIVERED: adminActor()
      };
      for (const to of Object.keys(predecessor)) {
        for (const paymentStatus of ['PENDING', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']) {
          const order = await mkOrder({ status: predecessor[to], paymentStatus, kitchenBranchId: branchA.id });
          await expectCode(OrderTransitionService.transition({ orderId: order.id, to: to as OrderStatus, actor: actorFor[to] }), 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
          expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe(predecessor[to]);
        }
      }
    });

    it('45. every status not listed as an edge is impossible (all 44 forbidden pairs), leaving no event or audit row', async () => {
      let checked = 0;
      for (const from of ORDER_STATUSES) {
        for (const to of ORDER_STATUSES) {
          if (from === to || (ORDER_TRANSITIONS[from] as readonly string[]).includes(to)) continue;
          const order = await paidOrder(from);
          await expectCode(OrderTransitionService.transition({ orderId: order.id, to, actor: adminActor(), reason: 'test reason' }), 'INVALID_ORDER_TRANSITION');
          expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe(from);
          expect(await eventsOf(order.id)).toHaveLength(0);
          checked++;
        }
      }
      expect(checked).toBe(8 * 7 - Object.values(ORDER_TRANSITIONS).reduce((n, e) => n + e.length, 0));
    });

    it('46. every legal edge succeeds for an authorized actor, advances timestamps, and builds a consistent event chain', async () => {
      for (const from of ORDER_STATUSES) {
        for (const to of ORDER_TRANSITIONS[from]) {
          const parties = TRANSITION_PARTIES[transitionKey(from, to)];
          const isCancel = to === 'CANCELLED';
          const order = isCancel ? await mkOrder({ status: from, paymentStatus: 'PENDING', kitchenBranchId: branchA.id }) : await paidOrder(from);
          const actor: TransitionActor = parties.includes('SYSTEM') ? sys : isCancel ? adminActor() : parties.includes(RoleEnum.CHEF) ? chefActor([branchA.id]) : driverActor([branchA.id]);
          const res = await OrderTransitionService.transition({ orderId: order.id, to, actor, reason: 'test reason' });
          expect(res.changed, `${from}->${to}`).toBe(true);
          const row = await prisma.order.findUnique({ where: { id: order.id } });
          expect(row!.status).toBe(to);
          if (to === 'CONFIRMED') expect(row!.confirmedAt).not.toBeNull();
          if (isCancel) {
            expect(row!.cancelledAt).not.toBeNull();
            expect(row!.cancellationReason).toBe('test reason');
          }
          const events = await eventsOf(order.id);
          expect(events).toHaveLength(1);
          expect(events[0]).toMatchObject({ fromStatus: from, toStatus: to });
        }
      }
    });

    it('47. roles that are not on an edge are refused (customers, MD, POS, nutritionists...) with ORDER_TRANSITION_FORBIDDEN', async () => {
      const outsiders: RoleEnum[] = [RoleEnum.MD, RoleEnum.POS, RoleEnum.NUTRITIONIST, RoleEnum.TRAINER, RoleEnum.PROCUREMENT, RoleEnum.BAKERY_FMCG, RoleEnum.TEPACHE_ERP, RoleEnum.SWIGGY_ZOMATO, RoleEnum.MESS_CUSTOMER];
      for (const from of ORDER_STATUSES) {
        for (const to of ORDER_TRANSITIONS[from]) {
          const parties = TRANSITION_PARTIES[transitionKey(from, to)];
          const order = to === 'CANCELLED' ? await mkOrder({ status: from, paymentStatus: 'PENDING', kitchenBranchId: branchA.id }) : await paidOrder(from);
          for (const role of outsiders.filter((r) => !parties.includes(r))) {
            await expectCode(OrderTransitionService.transition({ orderId: order.id, to, actor: userActor('md', [role], { isGlobal: true }) }), 'ORDER_TRANSITION_FORBIDDEN');
          }
          // specific boundary rules
          if (!parties.includes(RoleEnum.CHEF)) await expectCode(OrderTransitionService.transition({ orderId: order.id, to, actor: chefActor([branchA.id]) }), 'ORDER_TRANSITION_FORBIDDEN');
          if (!parties.includes(RoleEnum.DELIVERY)) await expectCode(OrderTransitionService.transition({ orderId: order.id, to, actor: driverActor([branchA.id]) }), 'ORDER_TRANSITION_FORBIDDEN');
          expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe(from);
        }
      }
    });

    it('48. a repeated identical transition is an idempotent no-op: no second event, no second audit row', async () => {
      const order = await paidOrder('CONFIRMED');
      const a = await OrderTransitionService.transition({ orderId: order.id, to: 'PREPARING', actor: chefActor([branchA.id]) });
      const b = await OrderTransitionService.transition({ orderId: order.id, to: 'PREPARING', actor: chefActor([branchA.id]) });
      expect(a.changed).toBe(true);
      expect(b.changed).toBe(false);
      expect(await eventsOf(order.id)).toHaveLength(1);
      expect(await auditOf('ORDER_STATUS_CHANGED', order.id)).toHaveLength(1);
    });

    it('49. the kitchen cannot start an order that has no kitchen branch yet (even SUPER_ADMIN)', async () => {
      const order = await paidOrder('CONFIRMED', { kitchenBranchId: null });
      await expectCode(OrderTransitionService.transition({ orderId: order.id, to: 'PREPARING', actor: adminActor() }), 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      await expectCode(OrderTransitionService.transition({ orderId: order.id, to: 'ACCEPTED', actor: adminActor() }), 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
    });

    it('50. branch-scoped staff may only act on their own branch\'s orders (BRANCH_FORBIDDEN); global roles are unrestricted', async () => {
      const inB = await paidOrder('CONFIRMED', { kitchenBranchId: branchB.id });
      await expectCode(OrderTransitionService.transition({ orderId: inB.id, to: 'PREPARING', actor: chefActor([branchA.id]) }), 'BRANCH_FORBIDDEN');
      await expectCode(OrderTransitionService.transition({ orderId: inB.id, to: 'PREPARING', actor: chefActor([]) }), 'BRANCH_FORBIDDEN');
      expect((await OrderTransitionService.transition({ orderId: inB.id, to: 'PREPARING', actor: adminActor() })).changed).toBe(true);
    });

    it('51. cancellation: the owner may cancel an UNPAID pending order; other customers cannot (404); terminal states are final', async () => {
      const order = await mkOrder({ status: 'PENDING' });
      await expectCode(OrderTransitionService.transition({ orderId: order.id, to: 'CANCELLED', actor: customerActor('custB') }), 'ORDER_NOT_FOUND');
      const res = await OrderTransitionService.transition({ orderId: order.id, to: 'CANCELLED', actor: customerActor('custA'), reason: 'changed my mind' });
      expect(res.changed).toBe(true);
      const row = await prisma.order.findUnique({ where: { id: order.id } });
      expect(row!.cancelledAt).not.toBeNull();
      await expectCode(OrderTransitionService.transition({ orderId: order.id, to: 'PENDING', actor: adminActor() }), 'INVALID_ORDER_TRANSITION');
      await expectCode(OrderTransitionService.transition({ orderId: order.id, to: 'CONFIRMED', actor: sys }), 'INVALID_ORDER_TRANSITION');
      const delivered = await paidOrder('DELIVERED');
      await expectCode(OrderTransitionService.transition({ orderId: delivered.id, to: 'PREPARING', actor: adminActor() }), 'INVALID_ORDER_TRANSITION');
    });

    it('52. a PAID order can not be cancelled until the refund workflow exists; an administrator needs a reason', async () => {
      const paid = await paidOrder('CONFIRMED');
      await expectCode(OrderTransitionService.transition({ orderId: paid.id, to: 'CANCELLED', actor: adminActor(), reason: 'because' }), 'ORDER_NOT_CANCELLABLE');
      const unpaid = await mkOrder({ status: 'PENDING' });
      await expectCode(OrderTransitionService.transition({ orderId: unpaid.id, to: 'CANCELLED', actor: adminActor() }), 'REASON_REQUIRED');
      await expectCode(OrderTransitionService.transition({ orderId: unpaid.id, to: 'CANCELLED', actor: adminActor(), reason: ' ' }), 'REASON_REQUIRED');
    });

    it('53. unknown statuses, unknown orders and non-direct order types are rejected cleanly', async () => {
      const order = await paidOrder('PENDING');
      await expectCode(OrderTransitionService.transition({ orderId: order.id, to: 'OUT_FOR_DELIVERY' as OrderStatus, actor: adminActor() }), 'INVALID_ORDER_STATUS');
      await expectCode(OrderTransitionService.transition({ orderId: '00000000-0000-4000-8000-000000000000', to: 'CONFIRMED', actor: sys }), 'ORDER_NOT_FOUND');
      const pos = await paidOrder('PENDING', { orderType: 'POS' });
      await expectCode(OrderTransitionService.transition({ orderId: pos.id, to: 'CONFIRMED', actor: sys }), 'INVALID_ORDER_TRANSITION');
    });

    it('54. concurrent identical transitions apply exactly once (row lock + compare-and-set): one event, the rest no-ops', async () => {
      const order = await paidOrder('CONFIRMED');
      const results = await Promise.all(Array.from({ length: 10 }, () => OrderTransitionService.transition({ orderId: order.id, to: 'PREPARING', actor: chefActor([branchA.id]) })));
      expect(results.filter((r) => r.changed)).toHaveLength(1);
      expect(await eventsOf(order.id)).toHaveLength(1);
      expect(await auditOf('ORDER_STATUS_CHANGED', order.id)).toHaveLength(1);
    });

    it('55. concurrent competing transitions never corrupt the event chain', async () => {
      const order = await paidOrder('CONFIRMED');
      const attempts = ['ACCEPTED', 'PREPARING', 'ACCEPTED', 'PREPARING'] as const;
      const results = await Promise.allSettled(attempts.map((to) => OrderTransitionService.transition({ orderId: order.id, to, actor: adminActor() })));
      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
      for (const r of results) if (r.status === 'rejected') expect((r.reason as any).errorCode).toBe('INVALID_ORDER_TRANSITION');
      const events = await eventsOf(order.id);
      let cursor: string = 'CONFIRMED';
      for (const e of events) {
        expect(e.fromStatus).toBe(cursor);
        expect((ORDER_TRANSITIONS[cursor as OrderStatus] as readonly string[]).includes(e.toStatus)).toBe(true);
        cursor = e.toStatus;
      }
      expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe(cursor);
    });

    it('56. a failure after the status update (audit down) rolls the status change, event and audit back together', async () => {
      const order = await paidOrder('PENDING');
      vi.spyOn(AuditService, 'record').mockRejectedValueOnce(new Error('audit store unavailable'));
      await expect(OrderTransitionService.transition({ orderId: order.id, to: 'CONFIRMED', actor: sys })).rejects.toThrow('audit store unavailable');
      expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('PENDING');
      expect(await eventsOf(order.id)).toHaveLength(0);
    });
  });

  // =============================================================================================== KDS / delivery regression
  describe('KDS and delivery no longer write order status directly', () => {
    const mkKot = (orderId: string, status = 'QUEUED') =>
      prisma.kitchenOrderTicket.create({ data: { orderId, branchId: branchA.id, kotNumber: `KOT-P7A-${ts}-${++orderSeq}`, itemsJson: [], status } });
    const patchKot = (id: string, status: string, token = users.chefA.token) => request(app).patch(`/api/v1/kds/tickets/${id}/status`).set(bearer(token)).send({ status });
    const mkAssign = (orderId: string, status = 'ASSIGNED') =>
      prisma.deliveryAssignment.create({ data: { orderId, driverId: users.driver1.employeeId!, branchId: branchA.id, status } });
    const patchAssign = (id: string, status: string, token = users.driver1.token) => request(app).patch(`/api/v1/delivery/assignments/${id}/status`).set(bearer(token)).send({ status });

    it('57. a chef starting a ticket of a paid, confirmed, branch-routed order moves the order through the transition service (event + audit)', async () => {
      const order = await paidOrder('CONFIRMED');
      const kot = await mkKot(order.id);
      const res = await patchKot(kot.id, 'PREPARING');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.order.status).toBe('PREPARING');
      expect((await eventsOf(order.id)).map((e) => e.toStatus)).toEqual(['PREPARING']);
      expect((await auditOf('ORDER_STATUS_CHANGED', order.id)).length).toBe(1);
      const ready = await patchKot(kot.id, 'READY');
      expect(ready.body.data.order.status).toBe('READY');
      expect((await patchKot(kot.id, 'SERVED')).status).toBe(200);
      expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('READY'); // SERVED does not move the order
    });

    it('58. an UNPAID order can never reach PREPARING through the kitchen: 409 and BOTH the ticket and the order are unchanged', async () => {
      const order = await mkOrder({ status: 'CONFIRMED', paymentStatus: 'PENDING', kitchenBranchId: branchA.id });
      const kot = await mkKot(order.id);
      const res = await patchKot(kot.id, 'PREPARING');
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      expect((await prisma.kitchenOrderTicket.findUnique({ where: { id: kot.id } }))!.status).toBe('QUEUED');
      expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('CONFIRMED');
      expect(await eventsOf(order.id)).toHaveLength(0);
    });

    it('59. an order without a kitchen branch cannot be started by a chef', async () => {
      const order = await paidOrder('CONFIRMED', { kitchenBranchId: null });
      const kot = await mkKot(order.id);
      const res = await patchKot(kot.id, 'PREPARING');
      expect(res.status).toBe(409);
      expect((await prisma.kitchenOrderTicket.findUnique({ where: { id: kot.id } }))!.status).toBe('QUEUED');
    });

    it('60. tickets never regress and SERVED is final; repeating the same status is a no-op', async () => {
      const order = await paidOrder('CONFIRMED');
      const kot = await mkKot(order.id);
      expect((await patchKot(kot.id, 'PREPARING')).status).toBe(200);
      expect((await patchKot(kot.id, 'PREPARING')).status).toBe(200);
      expect(await eventsOf(order.id)).toHaveLength(1);
      expect((await patchKot(kot.id, 'QUEUED')).body.error).toBe('INVALID_KOT_TRANSITION');
      expect((await patchKot(kot.id, 'READY')).status).toBe(200);
      expect((await patchKot(kot.id, 'SERVED')).status).toBe(200);
      for (const back of ['QUEUED', 'PREPARING', 'READY']) expect((await patchKot(kot.id, back)).body.error).toBe('INVALID_KOT_TRANSITION');
      expect((await prisma.kitchenOrderTicket.findUnique({ where: { id: kot.id } }))!.status).toBe('SERVED');
    });

    it('61. a KOT cannot skip states (QUEUED -> READY / SERVED) and cannot be started for a CANCELLED order', async () => {
      const order = await paidOrder('CONFIRMED');
      const kot = await mkKot(order.id);
      expect((await patchKot(kot.id, 'READY')).body.error).toBe('INVALID_KOT_TRANSITION');
      expect((await patchKot(kot.id, 'SERVED')).body.error).toBe('INVALID_KOT_TRANSITION');
      const cancelled = await mkOrder({ status: 'CANCELLED', paymentStatus: 'PENDING', kitchenBranchId: branchA.id });
      const kot2 = await mkKot(cancelled.id);
      const res = await patchKot(kot2.id, 'PREPARING');
      expect(res.status).toBe(409);
      expect((await prisma.order.findUnique({ where: { id: cancelled.id } }))!.status).toBe('CANCELLED');
    });

    it('62. the other branch\'s chef is still denied before any order change happens', async () => {
      const order = await paidOrder('CONFIRMED');
      const kot = await mkKot(order.id);
      const res = await patchKot(kot.id, 'PREPARING', users.chefB.token);
      expect(res.status).toBe(403);
      expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('CONFIRMED');
    });

    it('63. delivery: IN_TRANSIT dispatches and DELIVERED completes a READY paid order, atomically with the assignment', async () => {
      const order = await paidOrder('READY');
      const a = await mkAssign(order.id);
      const transit = await patchAssign(a.id, 'IN_TRANSIT');
      expect(transit.status, JSON.stringify(transit.body)).toBe(200);
      expect(transit.body.data.order.status).toBe('DISPATCHED');
      const done = await patchAssign(a.id, 'DELIVERED');
      expect(done.status).toBe(200);
      expect(done.body.data.order.status).toBe('DELIVERED');
      expect(done.body.data.deliveryTime).not.toBeNull();
      expect((await eventsOf(order.id)).map((e) => e.toStatus)).toEqual(['DISPATCHED', 'DELIVERED']);
    });

    it('64. delivery of an unpaid order is rejected and the assignment is left untouched', async () => {
      const order = await mkOrder({ status: 'READY', paymentStatus: 'PENDING', kitchenBranchId: branchA.id });
      const a = await mkAssign(order.id);
      const res = await patchAssign(a.id, 'IN_TRANSIT');
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      expect((await prisma.deliveryAssignment.findUnique({ where: { id: a.id } }))!.status).toBe('ASSIGNED');
      expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('READY');
    });

    it('65. an order cannot be DELIVERED without being dispatched first, and a delivered assignment is final', async () => {
      const order = await paidOrder('READY');
      const a = await mkAssign(order.id);
      const skip = await patchAssign(a.id, 'DELIVERED');
      expect(skip.status).toBe(409);
      expect(skip.body.error).toBe('INVALID_ORDER_TRANSITION');
      expect((await prisma.deliveryAssignment.findUnique({ where: { id: a.id } }))!.status).toBe('ASSIGNED');

      const dispatched = await paidOrder('DISPATCHED');
      const done = await mkAssign(dispatched.id, 'IN_TRANSIT');
      expect((await patchAssign(done.id, 'DELIVERED')).status).toBe(200);
      const back = await patchAssign(done.id, 'IN_TRANSIT');
      expect(back.status).toBe(409);
      expect(back.body.error).toBe('INVALID_DELIVERY_TRANSITION');
      expect((await prisma.order.findUnique({ where: { id: dispatched.id } }))!.status).toBe('DELIVERED');
    });

    it('66. no source file outside the transition service writes Order.status (static guard against regressions)', () => {
      const root = join(__dirname, '..');
      const offenders: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) {
            if (name === 'tests') continue;
            walk(full);
          } else if (full.endsWith('.ts') && !full.endsWith('orderTransition.service.ts') && !full.endsWith('paymentSettlement.service.ts')) {
            const text = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
            if (/\.order\.(update|updateMany|upsert)\s*\(/.test(text) || /\border\.(update|updateMany|upsert)\s*\(/.test(text)) offenders.push(full);
          }
        }
      };
      walk(root);
      expect(offenders).toEqual([]);

      // The payment settlement service may update ORDER PAYMENT fields (paymentStatus + the paid-provider-payment reference, a
      // compare-and-set) but must never write Order.status: confirmation goes through OrderTransitionService.
      const settlement = readFileSync(join(root, 'modules', 'payment', 'paymentSettlement.service.ts'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      const orderWrites = settlement.match(/order\.update(?:Many)?\(\{[\s\S]*?\}\);/g) ?? [];
      expect(orderWrites.length).toBeGreaterThan(0);
      for (const w of orderWrites) expect(w).not.toMatch(/(^|[^A-Za-z])status\s*:/);
    });
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parsePaymentConfig, resetPaymentConfig, setPaymentConfigForTests } from '../config/paymentConfig.js';
import { getPaymentProvider } from '../modules/payment/providerRegistry.js';
import { MockPaymentProvider } from '../modules/payment/mock.provider.js';
import { ORDER_TRANSITIONS, TRANSITION_PARTIES } from '../modules/order/orderStatus.js';
import { roleHasPermission } from '../authz/permissions.js';

/**
 * P8 - kitchen operations: manual SUPER_ADMIN routing, branch-scoped Chef queue derived from Order + OrderItem + OrderEvent,
 * the three Chef transitions, data minimization and database-decided concurrency. Real PostgreSQL, mock payment provider.
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const PASSWORD = 'P8#Kitchen-Pass-2026-xyz';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('P8 - kitchen routing, Chef queue and Chef transitions', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; email: string; token: string; profileId?: string };
  const who: Record<string, Who> = {};
  let branchA: { id: string; code: string };
  let branchB: { id: string; code: string };
  let branchOff: { id: string };
  let step = '';
  let recipeId = '';
  let productId = '';

  async function mkUser(label: string, roles: RoleEnum[], branchIds: string[] = []): Promise<Who> {
    const email = `p8_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer
          ? { customerProfile: { create: { fullName: `Secret Customer ${label}`, referralCode: `PB-P8${label.toUpperCase()}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `P8-${label}-${ts}`, fullName: `P8 ${label}`, designation: 'Test', assignedBranchId: branchIds[0] ?? null } } })
      },
      include: { customerProfile: true, employeeProfile: true }
    });
    for (const branchId of branchIds) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile!.id, branchId } });
    who[label] = { id: u.id, email, token: sign(u.id, email, roles), profileId: u.customerProfile?.id };
    return who[label];
  }

  /** A kitchen-eligible order by default: CONFIRMED + PAID + ONLINE + DIRECT, routed to branch A, with one item. */
  const mkOrder = async (over: Record<string, unknown> = {}, items: Array<Record<string, unknown>> | null = null) => {
    const n = ++seq;
    return prisma.order.create({
      data: {
        orderNumber: `P8-${ts}-${n}`,
        totalAmount: 100,
        netAmount: '145.50',
        customerProfileId: who.custA.profileId,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        paymentMethod: 'ONLINE',
        orderType: 'DIRECT',
        kitchenBranchId: branchA.id,
        confirmedAt: new Date(Date.now() - (1000 - n) * 1000),
        deliveryAddress: '12 Secret Street',
        deliveryAddressSnapshot: { addressLine1: '12 Secret Street', city: 'Kochi', postalCode: '682001', recipientName: 'Secret Name', phone: '+91 90000 00000', email: 'secret@example.test' },
        items: { create: items ?? [{ itemTitle: `Bowl ${n}`, variantName: 'Large', sku: `SKU-${n}`, unitPrice: 100, quantity: 2, taxRate: 0.05, totalPrice: 200, productId, recipeId }] },
        ...over
      } as never
    });
  };

  const queue = (token: string, qs = '') => request(app).get(`/api/v1/kds/orders${qs}`).set(bearer(token));
  const detail = (token: string, id: string, qs = '') => request(app).get(`/api/v1/kds/orders/${id}${qs}`).set(bearer(token));
  const act = (token: string, id: string, action: 'accept' | 'start-preparing' | 'mark-ready', body: Record<string, unknown> = {}) => request(app).post(`/api/v1/kds/orders/${id}/${action}`).set(bearer(token)).send(body);
  const route = (id: string, body: Record<string, unknown>, token = who.admin.token, stepToken: string | null = step) => {
    const r = request(app).put(`/api/v1/admin/orders/${id}/kitchen-branch`).set(bearer(token));
    return (stepToken ? r.set('x-step-up-token', stepToken) : r).send(body);
  };
  const routingList = (token: string, qs = '') => request(app).get(`/api/v1/admin/kitchen/orders${qs}`).set(bearer(token));
  const ids = (res: { body: { data: { sections: Record<string, { items: Array<{ id: string }> }> } } }) => Object.values(res.body.data.sections).flatMap((s) => s.items.map((o) => o.id));
  const section = (res: any, status: string) => res.body.data.sections[status];
  const statusOf = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;
  const events = (orderId: string) => prisma.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  const audits = (action: string, entityId: string) => prisma.auditLog.findMany({ where: { action, entityId } });

  async function quiesce() {
    await prisma.payment.updateMany({ where: { provider: { not: null } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
    await prisma.refund.updateMany({ where: { status: { in: ['REQUESTED', 'SUBMITTING', 'UNKNOWN', 'PROCESSING'] } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
  }

  /** A real paid + CONFIRMED order (session + verification through the API), routed to branch A. */
  async function realPaidOrder(customer = who.custA) {
    const order = await mkOrder({ status: 'PENDING', paymentStatus: 'PENDING', kitchenBranchId: null, confirmedAt: null, customerProfileId: customer.profileId });
    const s = await request(app).post(`/api/v1/orders/${order.id}/payment-attempts`).set(bearer(customer.token)).send({});
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const pay = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
    const v = await request(app)
      .post(`/api/v1/orders/${order.id}/payment-attempts/${s.body.data.attemptId}/verify`)
      .set(bearer(customer.token))
      .send({ providerOrderId: s.body.data.providerOrderId, providerPaymentId: pay.providerPaymentId, signature: mock.signCheckout(s.body.data.providerOrderId, pay.providerPaymentId) });
    expect(v.status, JSON.stringify(v.body)).toBe(200);
    await prisma.order.update({ where: { id: order.id }, data: { kitchenBranchId: branchA.id } });
    return order;
  }

  beforeAll(async () => {
    setPaymentConfigForTests(parsePaymentConfig({ PAYMENT_REFUND_INLINE_SUBMIT: 'false' }, 'test'));
    branchA = await prisma.kitchenBranch.create({ data: { code: `p8-a-${ts}`, name: 'P8 Branch A', address: 'A', city: 'Kochi' } });
    branchB = await prisma.kitchenBranch.create({ data: { code: `p8-b-${ts}`, name: 'P8 Branch B', address: 'B', city: 'Kozhikode' } });
    branchOff = await prisma.kitchenBranch.create({ data: { code: `p8-off-${ts}`, name: 'P8 Inactive', address: 'C', city: 'Kollam', isActive: false } });
    await mkUser('custA', [RoleEnum.CUSTOMER]);
    await mkUser('custB', [RoleEnum.CUSTOMER]);
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('md', [RoleEnum.MD]);
    await mkUser('chefA1', [RoleEnum.CHEF], [branchA.id]);
    await mkUser('chefA2', [RoleEnum.CHEF], [branchA.id]);
    await mkUser('chefB', [RoleEnum.CHEF], [branchB.id]);
    await mkUser('chefAB', [RoleEnum.CHEF], [branchA.id, branchB.id]);
    await mkUser('chefNone', [RoleEnum.CHEF]);
    await mkUser('pos', [RoleEnum.POS], [branchA.id]);
    await mkUser('driver', [RoleEnum.DELIVERY], [branchA.id]);
    const cat = await prisma.productCategory.create({ data: { name: `P8 Cat ${ts}`, slug: `p8-cat-${ts}`, description: 'p8' } });
    const recipe = await prisma.recipe.create({
      data: {
        code: `P8-R-${ts}`,
        isPublished: false, // never leak an ingredient-less PUBLISHED recipe into the shared test DB (other suites pick any published recipe)
        title: 'P8 Recipe',
        category: 'Bowls',
        calories: 400,
        proteinGrams: 30,
        carbsGrams: 40,
        fatGrams: 10,
        chefInstructions: 'Grill 6 minutes per side',
        dietaryTag: 'non-veg',
        spiceLevel: 'MEDIUM',
        costPerPortion: '77.77',
        prepSteps: [{ step: 'secret internal step' }]
      } as never
    });
    recipeId = recipe.id;
    productId = (await prisma.product.create({ data: { slug: `p8-prod-${ts}`, categoryId: cat.id, recipeId, name: 'P8 Product', description: 'p8', basePrice: 200, taxRate: 0.05, isPublished: true, isActive: true } })).id;
    const su = await request(app).post('/api/v1/admin/step-up').set(bearer(who.admin.token)).send({ password: PASSWORD });
    expect(su.status).toBe(200);
    step = su.body.data.stepUpToken;
    await quiesce();
  });
  beforeEach(() => mock.reset());
  afterEach(() => resetPaymentConfig());
  afterAll(async () => {
    await quiesce();
    await prisma.$disconnect();
  });

  // ===================================================================================================== RBAC
  describe('authentication and RBAC', () => {
    it('1. unauthenticated callers get 401 on every kitchen and routing endpoint', async () => {
      const o = await mkOrder();
      for (const r of [request(app).get('/api/v1/kds/orders'), request(app).get(`/api/v1/kds/orders/${o.id}`), request(app).post(`/api/v1/kds/orders/${o.id}/accept`).send({}), request(app).get('/api/v1/admin/kitchen/orders'), request(app).put(`/api/v1/admin/orders/${o.id}/kitchen-branch`).send({})]) {
        expect((await r).status).toBe(401);
      }
    });

    it('2. customers and other staff roles (POS, DELIVERY) cannot read or act on the kitchen, and cannot route', async () => {
      const o = await mkOrder();
      for (const label of ['custA', 'pos', 'driver']) {
        expect((await queue(who[label].token)).status, label).toBe(403);
        expect((await act(who[label].token, o.id, 'accept')).status, label).toBe(403);
        expect((await routingList(who[label].token)).status, label).toBe(403);
        expect((await route(o.id, { branchId: branchA.id, expectedBranchId: null, reason: 'nope nope' }, who[label].token)).status, label).toBe(403);
      }
      expect(await statusOf(o.id)).toBe('CONFIRMED');
    });

    it('3. MD is read-only: explicit branchId required to read, no Chef action, no routing', async () => {
      const o = await mkOrder();
      expect((await queue(who.md.token)).status).toBe(400);
      expect((await queue(who.md.token)).body.error).toBe('BRANCH_REQUIRED');
      const read = await queue(who.md.token, `?branchId=${branchA.id}`);
      expect(read.status).toBe(200);
      expect(ids(read)).toContain(o.id);
      expect((await detail(who.md.token, o.id, `?branchId=${branchA.id}`)).status).toBe(200);
      expect((await detail(who.md.token, o.id)).status).toBe(400);
      for (const a of ['accept', 'start-preparing', 'mark-ready'] as const) expect((await act(who.md.token, o.id, a)).status).toBe(403);
      expect((await routingList(who.md.token)).status).toBe(403);
      expect((await route(o.id, { branchId: branchB.id, expectedBranchId: branchA.id, reason: 'md reroute' }, who.md.token)).status).toBe(403);
      expect(await statusOf(o.id)).toBe('CONFIRMED');
    });

    it('4. SUPER_ADMIN is READ-ONLY for kitchen operations (explicit branch) and cannot perform any Chef action', async () => {
      const o = await mkOrder();
      expect((await queue(who.admin.token)).status).toBe(400);
      expect(ids(await queue(who.admin.token, `?branchId=${branchA.id}`))).toContain(o.id);
      for (const a of ['accept', 'start-preparing', 'mark-ready'] as const) {
        const r = await act(who.admin.token, o.id, a);
        expect(r.status, a).toBe(403);
      }
      expect(await statusOf(o.id)).toBe('CONFIRMED');
      expect(await events(o.id)).toHaveLength(0);
    });

    it('5. permission catalogue: SUPER_ADMIN has kitchen:assign and NO kds:write; only SUPER_ADMIN may assign; CHEF has kds:write but no kitchen:assign', () => {
      expect(roleHasPermission(RoleEnum.SUPER_ADMIN, 'kitchen:assign')).toBe(true);
      expect(roleHasPermission(RoleEnum.SUPER_ADMIN, 'kds:write')).toBe(false);
      expect(roleHasPermission(RoleEnum.SUPER_ADMIN, 'kds:read')).toBe(true);
      expect(roleHasPermission(RoleEnum.CHEF, 'kds:write')).toBe(true);
      expect(roleHasPermission(RoleEnum.CHEF, 'kitchen:assign')).toBe(false);
      for (const role of Object.values(RoleEnum)) if (role !== RoleEnum.SUPER_ADMIN) expect(roleHasPermission(role, 'kitchen:assign'), role).toBe(false);
      expect(roleHasPermission(RoleEnum.MD, 'kds:write')).toBe(false);
    });

    it('6. transition graph: CONFIRMED -> PREPARING is gone; the three kitchen edges are CHEF-only; admin cancellation and delivery edges are unchanged', () => {
      expect(ORDER_TRANSITIONS.CONFIRMED).toEqual(['ACCEPTED', 'CANCELLED']);
      expect(TRANSITION_PARTIES['CONFIRMED->PREPARING']).toBeUndefined();
      for (const edge of ['CONFIRMED->ACCEPTED', 'ACCEPTED->PREPARING', 'PREPARING->READY']) expect(TRANSITION_PARTIES[edge], edge).toEqual([RoleEnum.CHEF]);
      expect(TRANSITION_PARTIES['ACCEPTED->CANCELLED']).toEqual([RoleEnum.SUPER_ADMIN]);
      expect(TRANSITION_PARTIES['CONFIRMED->CANCELLED']).toEqual(['CUSTOMER_OWNER', RoleEnum.SUPER_ADMIN]);
      expect(TRANSITION_PARTIES['READY->DISPATCHED']).toEqual([RoleEnum.DELIVERY, RoleEnum.SUPER_ADMIN]);
      expect(TRANSITION_PARTIES['DISPATCHED->DELIVERED']).toEqual([RoleEnum.DELIVERY, RoleEnum.SUPER_ADMIN]);
    });

    it('7. the kitchen module never writes Order.status itself and the retired KOT routes are gone', () => {
      const root = join(__dirname, '..', 'modules', 'kds');
      for (const f of ['kds.service.ts', 'kds.controller.ts', 'kds.routes.ts', 'kds.dto.ts']) {
        const text = readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        expect(text, f).not.toMatch(/order\.(update|updateMany|upsert)\s*\(/);
        expect(text, f).not.toMatch(/kitchenOrderTicket/);
        expect(text, f).not.toMatch(/\bcod\b|cash/i);
      }
    });
  });

  // ===================================================================================================== routing
  describe('SUPER_ADMIN kitchen routing', () => {
    const goodBody = (extra: Record<string, unknown> = {}) => ({ branchId: branchA.id, expectedBranchId: null, reason: 'Nearest hub for this delivery area', ...extra });

    it('8. assigns an UNROUTED order: only kitchenBranchId changes; audited atomically; no event, no KOT, no step-up token recorded', async () => {
      const o = await mkOrder({ kitchenBranchId: null });
      const before = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      const res = await route(o.id, goodBody());
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toMatchObject({ changed: true, orderId: o.id, status: 'CONFIRMED', previousBranchId: null, kitchenBranch: { id: branchA.id } });
      const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      expect(after.kitchenBranchId).toBe(branchA.id);
      expect({ ...after, kitchenBranchId: null, updatedAt: null }).toEqual({ ...before, kitchenBranchId: null, updatedAt: null });
      expect(await events(o.id)).toHaveLength(0);
      expect(await prisma.kitchenOrderTicket.count({ where: { orderId: o.id } })).toBe(0);
      const audit = await audits('ORDER_KITCHEN_BRANCH_ASSIGNED', o.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].userId).toBe(who.admin.id);
      expect(JSON.stringify(audit[0].payload)).toContain('Nearest hub');
      expect(audit[0].payload).toMatchObject({ orderNumber: o.orderNumber, fromBranchId: null, toBranchId: branchA.id });
      expect(JSON.stringify(audit[0])).not.toContain(step);
    });

    it('9. requires a fresh step-up proof and the exact permission', async () => {
      const o = await mkOrder({ kitchenBranchId: null });
      const noStep = await route(o.id, goodBody(), who.admin.token, null);
      expect(noStep.status).toBe(403);
      expect(noStep.body.error).toBe('STEP_UP_REQUIRED');
      expect((await route(o.id, goodBody(), who.admin.token, 'garbage')).status).toBe(403);
      expect((await route(o.id, goodBody(), who.chefA1.token)).status).toBe(403);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).kitchenBranchId).toBeNull();
    });

    it('10. strict body validation: missing expectedBranchId, extra fields, short reason, malformed ids', async () => {
      const o = await mkOrder({ kitchenBranchId: null });
      const bad: Array<Record<string, unknown>> = [
        { branchId: branchA.id, reason: 'valid reason' }, // expectedBranchId key is required
        goodBody({ status: 'ACCEPTED' }),
        goodBody({ paymentStatus: 'PAID' }),
        goodBody({ kitchenBranchId: branchB.id }),
        goodBody({ reason: 'ab' }),
        goodBody({ reason: '   ' }),
        goodBody({ branchId: 'not-a-uuid' }),
        goodBody({ expectedBranchId: 'nope' }),
        {}
      ];
      for (const body of bad) expect((await route(o.id, body)).status, JSON.stringify(body)).toBe(422);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).kitchenBranchId).toBeNull();
    });

    it('11. an inactive or unknown branch is refused with the same error and nothing changes', async () => {
      const o = await mkOrder({ kitchenBranchId: null });
      for (const branchId of [branchOff.id, '00000000-0000-4000-8000-000000000000']) {
        const r = await route(o.id, goodBody({ branchId }));
        expect(r.status).toBe(422);
        expect(r.body.error).toBe('KITCHEN_BRANCH_INVALID');
      }
      expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).kitchenBranchId).toBeNull();
      expect(await audits('ORDER_KITCHEN_BRANCH_ASSIGNED', o.id)).toHaveLength(0);
    });

    it('12. only CONFIRMED + PAID + DIRECT + ONLINE orders are routable (pending, accepted, cancelled, unpaid, COD, non-direct, unknown)', async () => {
      const cases = [
        await mkOrder({ status: 'PENDING', paymentStatus: 'PENDING', kitchenBranchId: null }),
        await mkOrder({ status: 'ACCEPTED', kitchenBranchId: null }),
        await mkOrder({ status: 'CANCELLED', kitchenBranchId: null }),
        await mkOrder({ paymentStatus: 'PENDING', kitchenBranchId: null }),
        await mkOrder({ paymentStatus: 'REFUNDED', kitchenBranchId: null }),
        await mkOrder({ paymentMethod: 'COD', kitchenBranchId: null }),
        await mkOrder({ orderType: 'POS', kitchenBranchId: null })
      ];
      for (const o of cases) {
        const r = await route(o.id, goodBody());
        expect(r.status).toBe(409);
        expect(r.body.error).toBe('ORDER_NOT_ROUTABLE');
        expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).kitchenBranchId).toBeNull();
      }
      expect((await route('00000000-0000-4000-8000-000000000000', goodBody())).status).toBe(404);
    });

    it('13. assigning the same branch again is a no-op (changed:false) with no second audit row', async () => {
      const o = await mkOrder({ kitchenBranchId: null });
      expect((await route(o.id, goodBody())).body.data.changed).toBe(true);
      const again = await route(o.id, goodBody({ expectedBranchId: null })); // a retry of the same request
      expect(again.status).toBe(200);
      expect(again.body.data.changed).toBe(false);
      expect(await audits('ORDER_KITCHEN_BRANCH_ASSIGNED', o.id)).toHaveLength(1);
    });

    it('14. reassignment while CONFIRMED needs the CURRENT branch as expectedBranchId (stale -> 409) and is audited as REASSIGNED', async () => {
      const o = await mkOrder({ kitchenBranchId: branchA.id });
      const stale = await route(o.id, goodBody({ branchId: branchB.id, expectedBranchId: null }));
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe('KITCHEN_BRANCH_CHANGED');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).kitchenBranchId).toBe(branchA.id);
      const ok = await route(o.id, goodBody({ branchId: branchB.id, expectedBranchId: branchA.id, reason: 'Branch A is closed today' }));
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ changed: true, previousBranchId: branchA.id });
      const audit = await audits('ORDER_KITCHEN_BRANCH_REASSIGNED', o.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].payload).toMatchObject({ fromBranchId: branchA.id, toBranchId: branchB.id });
    });

    it('15. after ACCEPTED / PREPARING / READY there is no normal reassignment', async () => {
      for (const status of ['ACCEPTED', 'PREPARING', 'READY']) {
        const o = await mkOrder({ status });
        const r = await route(o.id, goodBody({ branchId: branchB.id, expectedBranchId: branchA.id }));
        expect(r.status, status).toBe(409);
        expect(r.body.error).toBe('ORDER_NOT_ROUTABLE');
        expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).kitchenBranchId).toBe(branchA.id);
      }
    });

    it('16. routing never changes status or payment, creates no OrderEvent, and the customer still sees CONFIRMED and may still cancel', async () => {
      const o = await mkOrder({ kitchenBranchId: null, customerProfileId: who.custB.profileId, paymentStatus: 'PENDING', status: 'PENDING' });
      await prisma.order.update({ where: { id: o.id }, data: { status: 'CONFIRMED', paymentStatus: 'PAID' } });
      // PAID orders cancel only with a refund intent; a PAID order without a real payment is "not refundable", so use the customer DTO instead
      await route(o.id, goodBody());
      const customerView = await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(who.custB.token));
      expect(customerView.status).toBe(200);
      expect(customerView.body.data.status).toBe('CONFIRMED');
      expect(customerView.body.data.cancellation.state).toBe('CANCELLATION_AVAILABLE');
      expect(JSON.stringify(customerView.body.data)).not.toContain('kitchenBranchId');
    });

    it('17. the routing list: default unrouted; routed / all; only confirmed + paid + online direct orders; area = city + postal code only', async () => {
      // The list is oldest-first and the test database is shared: park earlier P8 runs' leftovers, and make this test's orders the oldest.
      await prisma.order.updateMany({ where: { orderNumber: { startsWith: 'P8-' }, NOT: { orderNumber: { startsWith: `P8-${ts}-` } } }, data: { status: 'CANCELLED' } });
      const oldest = { confirmedAt: new Date(0) };
      const un = await mkOrder({ kitchenBranchId: null, ...oldest });
      const routed = await mkOrder({ kitchenBranchId: branchB.id, ...oldest });
      const excluded = [
        await mkOrder({ kitchenBranchId: null, paymentStatus: 'PENDING', ...oldest }),
        await mkOrder({ kitchenBranchId: null, paymentMethod: 'COD', ...oldest }),
        await mkOrder({ kitchenBranchId: null, status: 'ACCEPTED', ...oldest })
      ];
      const def = await routingList(who.admin.token);
      expect(def.status).toBe(200);
      const defIds = def.body.data.items.map((i: any) => i.id);
      expect(defIds).toContain(un.id);
      expect(defIds).not.toContain(routed.id);
      for (const e of excluded) expect(defIds).not.toContain(e.id);
      expect((await routingList(who.admin.token, '?routing=routed')).body.data.items.map((i: any) => i.id)).toContain(routed.id);
      const all = (await routingList(who.admin.token, '?routing=all')).body.data.items.map((i: any) => i.id);
      expect(all).toEqual(expect.arrayContaining([un.id, routed.id]));
      const row = def.body.data.items.find((i: any) => i.id === un.id);
      expect(row.deliveryArea).toEqual({ city: 'Kochi', postalCode: '682001' });
      const text = JSON.stringify(def.body.data);
      for (const secret of ['Secret Street', 'Secret Name', '+91 90000', 'secret@example.test', 'Secret Customer']) expect(text, secret).not.toContain(secret);
      expect((await routingList(who.admin.token, '?routing=bogus')).status).toBe(422);
      expect((await routingList(who.admin.token, '?limit=1')).body.data.items.length).toBe(1);
    });
  });

  // ===================================================================================================== queue
  describe('Chef queue (server-side eligibility, branch isolation, minimization)', () => {
    it('18. the queue shows only DIRECT + ONLINE + PAID orders of the chef\'s branches in the four kitchen states', async () => {
      const shown = {
        CONFIRMED: await mkOrder({ status: 'CONFIRMED' }),
        ACCEPTED: await mkOrder({ status: 'ACCEPTED' }),
        PREPARING: await mkOrder({ status: 'PREPARING' }),
        READY: await mkOrder({ status: 'READY' })
      };
      const hidden = [
        await mkOrder({ kitchenBranchId: null }), // UNROUTED
        await mkOrder({ kitchenBranchId: branchB.id }), // another branch
        await mkOrder({ paymentStatus: 'PENDING' }),
        await mkOrder({ paymentStatus: 'REFUNDED' }), // refunded / non-paid
        await mkOrder({ paymentStatus: 'FAILED' }),
        await mkOrder({ paymentMethod: 'COD' }), // historical COD
        await mkOrder({ paymentMethod: null }),
        await mkOrder({ orderType: 'MESS' }),
        await mkOrder({ status: 'PENDING', paymentStatus: 'PENDING' }),
        await mkOrder({ status: 'CANCELLED' }),
        await mkOrder({ status: 'DISPATCHED' }),
        await mkOrder({ status: 'DELIVERED' })
      ];
      const res = await queue(who.chefA1.token);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      for (const [status, o] of Object.entries(shown)) expect(section(res, status).items.map((i: any) => i.id), status).toContain(o.id);
      for (const h of hidden) expect(ids(res), h.orderNumber).not.toContain(h.id);
      expect(res.body.data.selectedBranchIds).toEqual([branchA.id]);
      expect(res.body.data.branches.map((b: any) => b.id)).toEqual([branchA.id]);
    });

    it('19. branch isolation: a Branch B chef never sees Branch A orders; foreign branchId is 403; two-branch chef sees both; no assignment is 403', async () => {
      const a = await mkOrder({ kitchenBranchId: branchA.id });
      const b = await mkOrder({ kitchenBranchId: branchB.id });
      expect(ids(await queue(who.chefB.token))).toContain(b.id);
      expect(ids(await queue(who.chefB.token))).not.toContain(a.id);
      const foreign = await queue(who.chefB.token, `?branchId=${branchA.id}`);
      expect(foreign.status).toBe(403);
      expect(foreign.body.error).toBe('BRANCH_FORBIDDEN');
      expect(await prisma.auditLog.count({ where: { action: 'BRANCH_ACCESS_DENIED', userId: who.chefB.id } })).toBeGreaterThan(0);
      const both = ids(await queue(who.chefAB.token));
      expect(both).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(ids(await queue(who.chefAB.token, `?branchId=${branchB.id}`))).not.toContain(a.id);
      const none = await queue(who.chefNone.token);
      expect(none.status).toBe(403);
      expect(none.body.error).toBe('NO_BRANCH_ASSIGNMENT');
    });

    it('20. deterministic ordering and bounds: active sections confirmedAt ASC then orderNumber; READY newest first; 100 per section with total/truncated', async () => {
      const early = await mkOrder({ confirmedAt: new Date(Date.now() - 3_600_000) });
      const late = await mkOrder({ confirmedAt: new Date(Date.now() - 60_000) });
      const items = section(await queue(who.chefA1.token), 'CONFIRMED').items.map((i: any) => i.id);
      expect(items.indexOf(early.id)).toBeLessThan(items.indexOf(late.id));

      const r1 = await mkOrder({ status: 'READY' });
      await new Promise((r) => setTimeout(r, 15));
      const r2 = await mkOrder({ status: 'READY' });
      await prisma.order.update({ where: { id: r2.id }, data: { status: 'READY' } }); // touches updatedAt
      const ready = section(await queue(who.chefA1.token), 'READY').items.map((i: any) => i.id);
      expect(ready.indexOf(r2.id)).toBeLessThan(ready.indexOf(r1.id));

      // bound: more than 100 READY orders in a dedicated branch
      const big = await prisma.kitchenBranch.create({ data: { code: `p8-big-${ts}`, name: 'P8 Big', address: 'x', city: 'Kochi' } });
      const chef = await mkUser('chefBig', [RoleEnum.CHEF], [big.id]);
      await prisma.order.createMany({
        data: Array.from({ length: 105 }, (_, i) => ({ orderNumber: `P8BIG-${ts}-${i}`, totalAmount: 1, netAmount: 1, status: 'READY', paymentStatus: 'PAID', paymentMethod: 'ONLINE', orderType: 'DIRECT', kitchenBranchId: big.id, confirmedAt: new Date() }))
      });
      const res = await queue(chef.token);
      expect(section(res, 'READY').items).toHaveLength(100);
      expect(section(res, 'READY')).toMatchObject({ total: 105, truncated: true });
      expect(section(res, 'CONFIRMED')).toMatchObject({ total: 0, truncated: false });
      expect(res.body.data.sectionLimit).toBe(100);
    });

    it('21. the Chef DTO is an exact allow-list and carries no customer, money, payment, refund, address or health data', async () => {
      const o = await mkOrder({ deliveryInstructions: undefined });
      const res = await queue(who.chefA1.token);
      const dto = section(res, 'CONFIRMED').items.find((i: any) => i.id === o.id);
      expect(Object.keys(dto).sort()).toEqual(['acceptedAt', 'branch', 'confirmedAt', 'id', 'items', 'orderNumber', 'preparingAt', 'readyAt', 'serverTime', 'status']);
      expect(Object.keys(dto.branch).sort()).toEqual(['code', 'id', 'name']);
      expect(Object.keys(dto.items[0]).sort()).toEqual(['id', 'quantity', 'recipe', 'sku', 'title', 'variantName']);
      expect(Object.keys(dto.items[0].recipe).sort()).toEqual(['chefInstructions', 'cookTimeMins', 'dietaryTag', 'name', 'prepTimeMins', 'servingSize', 'spiceLevel']);
      const text = JSON.stringify(res.body.data);
      for (const forbidden of ['Secret Customer', 'Secret Street', 'Secret Name', '+91 90000', 'secret@example.test', 'customerProfile', 'deliveryAddress', 'paymentStatus', 'paymentMethod', 'netAmount', 'totalAmount', 'unitPrice', 'taxRate', 'providerPaymentId', 'refund', 'costPerPortion', '77.77', 'prepSteps', 'secret internal step', 'customization', 'deliveryInstructions', 'idempotencyKey', 'pricingSnapshot']) {
        expect(text, forbidden).not.toContain(forbidden);
      }
      expect(dto.items[0].recipe).toMatchObject({ name: 'P8 Recipe', chefInstructions: 'Grill 6 minutes per side', dietaryTag: 'non-veg', spiceLevel: 'MEDIUM' });
    });

    it('22. recipe projection: new rows use OrderItem.recipeId; legacy NULL recipeId falls back to the product in a batch; no recipe -> null', async () => {
      const withNull = await mkOrder({}, [{ itemTitle: 'Legacy line', unitPrice: 10, quantity: 1, taxRate: 0.05, totalPrice: 10, productId, recipeId: null }]);
      const noRecipe = await mkOrder({}, [{ itemTitle: 'No recipe line', unitPrice: 10, quantity: 1, taxRate: 0.05, totalPrice: 10, productId: null, recipeId: null }]);
      const res = await queue(who.chefA1.token);
      const find = (id: string) => section(res, 'CONFIRMED').items.find((i: any) => i.id === id);
      expect(find(withNull.id).items[0].recipe.name).toBe('P8 Recipe');
      expect(find(noRecipe.id).items[0].recipe).toBeNull();
    });

    it('23. order detail: visible for own branch; foreign branch, unrouted, unpaid, COD and unknown are the SAME 404', async () => {
      const own = await mkOrder();
      expect((await detail(who.chefA1.token, own.id)).status).toBe(200);
      const invisible = [await mkOrder({ kitchenBranchId: branchB.id }), await mkOrder({ kitchenBranchId: null }), await mkOrder({ paymentStatus: 'PENDING' }), await mkOrder({ paymentMethod: 'COD' }), { id: '00000000-0000-4000-8000-000000000000' }];
      const bodies = [];
      for (const o of invisible) {
        const r = await detail(who.chefA1.token, o.id);
        expect(r.status).toBe(404);
        bodies.push(JSON.stringify(r.body));
      }
      expect(new Set(bodies).size).toBe(1);
    });

    it('24. timestamps come from OrderEvent: acceptedAt / preparingAt / readyAt appear as the order progresses', async () => {
      const o = await mkOrder();
      await act(who.chefA1.token, o.id, 'accept');
      let dto = (await detail(who.chefA1.token, o.id)).body.data;
      expect(dto.acceptedAt).not.toBeNull();
      expect(dto.preparingAt).toBeNull();
      await act(who.chefA1.token, o.id, 'start-preparing');
      await act(who.chefA1.token, o.id, 'mark-ready');
      dto = (await detail(who.chefA1.token, o.id)).body.data;
      expect([dto.confirmedAt, dto.acceptedAt, dto.preparingAt, dto.readyAt].every((t) => typeof t === 'string')).toBe(true);
      expect(new Date(dto.acceptedAt).getTime()).toBeLessThanOrEqual(new Date(dto.preparingAt).getTime());
      expect(new Date(dto.preparingAt).getTime()).toBeLessThanOrEqual(new Date(dto.readyAt).getTime());
    });
  });

  // ===================================================================================================== chef transitions
  describe('Chef transitions', () => {
    it('25. CONFIRMED -> ACCEPTED -> PREPARING -> READY: event chain with the chef as actor, one audit row per move, payment untouched', async () => {
      const o = await mkOrder();
      for (const [action, to] of [['accept', 'ACCEPTED'], ['start-preparing', 'PREPARING'], ['mark-ready', 'READY']] as const) {
        const r = await act(who.chefA1.token, o.id, action);
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        expect(r.body.data).toMatchObject({ changed: true, order: { id: o.id, status: to } });
        expect(await statusOf(o.id)).toBe(to);
      }
      const ev = await events(o.id);
      expect(ev.map((e) => [e.fromStatus, e.toStatus])).toEqual([['CONFIRMED', 'ACCEPTED'], ['ACCEPTED', 'PREPARING'], ['PREPARING', 'READY']]);
      expect(ev.every((e) => e.actorUserId === who.chefA1.id && e.actorRole === 'CHEF')).toBe(true);
      expect((await audits('ORDER_STATUS_CHANGED', o.id)).length).toBe(3);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      expect(row).toMatchObject({ paymentStatus: 'PAID', paymentMethod: 'ONLINE', kitchenBranchId: branchA.id });
      expect(await prisma.kitchenOrderTicket.count({ where: { orderId: o.id } })).toBe(0);
    });

    it('26. no skipping, no going back, and nothing past READY: dispatch/deliver/cancel are not kitchen actions', async () => {
      const o = await mkOrder();
      expect((await act(who.chefA1.token, o.id, 'start-preparing')).body.error).toBe('INVALID_ORDER_TRANSITION'); // the removed shortcut
      expect((await act(who.chefA1.token, o.id, 'mark-ready')).body.error).toBe('INVALID_ORDER_TRANSITION');
      expect(await statusOf(o.id)).toBe('CONFIRMED');
      await act(who.chefA1.token, o.id, 'accept');
      expect((await act(who.chefA1.token, o.id, 'mark-ready')).status).toBe(409);
      await act(who.chefA1.token, o.id, 'start-preparing');
      await act(who.chefA1.token, o.id, 'mark-ready');
      expect((await act(who.chefA1.token, o.id, 'accept')).status).toBe(409); // READY cannot go back
      expect((await act(who.chefA1.token, o.id, 'start-preparing')).status).toBe(409);
      for (const bogus of ['dispatch', 'deliver', 'cancel', 'refund']) expect((await request(app).post(`/api/v1/kds/orders/${o.id}/${bogus}`).set(bearer(who.chefA1.token)).send({})).status).toBe(404);
      expect(await statusOf(o.id)).toBe('READY');
    });

    it('27. a repeated identical action is an idempotent no-op: changed:false, one event, one audit row', async () => {
      const o = await mkOrder();
      const a = await act(who.chefA1.token, o.id, 'accept');
      const b = await act(who.chefA2.token, o.id, 'accept');
      expect(a.body.data.changed).toBe(true);
      expect(b.status).toBe(200);
      expect(b.body.data.changed).toBe(false);
      expect(await events(o.id)).toHaveLength(1);
      expect((await audits('ORDER_STATUS_CHANGED', o.id)).length).toBe(1);
    });

    it('28. foreign-branch, unrouted, unpaid, COD, refunded and unknown orders are the SAME 404; existing ones are audited; nothing changes', async () => {
      const targets = [
        await mkOrder({ kitchenBranchId: branchB.id }),
        await mkOrder({ kitchenBranchId: null }),
        await mkOrder({ paymentStatus: 'PENDING' }),
        await mkOrder({ paymentMethod: 'COD' }),
        await mkOrder({ paymentStatus: 'REFUNDED' })
      ];
      const bodies = new Set<string>();
      for (const o of targets) {
        for (const a of ['accept', 'start-preparing', 'mark-ready'] as const) {
          const r = await act(who.chefA1.token, o.id, a);
          expect(r.status, `${o.orderNumber} ${a}`).toBe(404);
          bodies.add(JSON.stringify(r.body));
        }
        expect(await events(o.id)).toHaveLength(0);
        expect(await prisma.auditLog.count({ where: { action: 'BRANCH_ACCESS_DENIED', entityId: o.id, userId: who.chefA1.id } })).toBe(3);
      }
      const unknown = await act(who.chefA1.token, '00000000-0000-4000-8000-000000000000', 'accept');
      expect(unknown.status).toBe(404);
      bodies.add(JSON.stringify(unknown.body));
      expect(bodies.size).toBe(1);
      expect(await statusOf(targets[0].id)).toBe('CONFIRMED');
    });

    it('29. a Chef cannot submit status, payment, amount, refund, customer or branch overrides; they are rejected, not ignored', async () => {
      const o = await mkOrder();
      for (const body of [{ status: 'READY' }, { paymentStatus: 'REFUNDED' }, { paymentMethod: 'COD' }, { amount: 1 }, { refund: true }, { customerId: 'x' }, { branchId: branchB.id }, { kitchenBranchId: branchB.id }, { to: 'DELIVERED' }]) {
        expect((await act(who.chefA1.token, o.id, 'accept', body)).status, JSON.stringify(body)).toBe(422);
      }
      expect((await request(app).post(`/api/v1/kds/orders/${o.id}/accept?status=READY&branchId=${branchB.id}`).set(bearer(who.chefA1.token)).send({})).status).toBe(200);
      expect(await statusOf(o.id)).toBe('ACCEPTED');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).kitchenBranchId).toBe(branchA.id);
    });

    it('30. a chef without a branch assignment cannot act (403) and no chef can route, cancel financially or refund', async () => {
      const o = await mkOrder();
      expect((await act(who.chefNone.token, o.id, 'accept')).body.error).toBe('NO_BRANCH_ASSIGNMENT');
      expect((await route(o.id, { branchId: branchB.id, expectedBranchId: branchA.id, reason: 'chef reroute' }, who.chefA1.token)).status).toBe(403);
      expect((await request(app).post(`/api/v1/admin/orders/${o.id}/cancel`).set(bearer(who.chefA1.token)).set('x-step-up-token', step).send({ reasonCode: 'OTHER' })).status).toBe(403);
      expect((await request(app).post(`/api/v1/orders/${o.id}/cancel`).set(bearer(who.chefA1.token)).send({ reasonCode: 'OTHER' })).status).toBe(403);
      expect(await statusOf(o.id)).toBe('CONFIRMED');
    });

    it('31. a paid order is required at the moment of the action: an order refunded after being shown can no longer be accepted', async () => {
      const o = await mkOrder();
      await prisma.order.update({ where: { id: o.id }, data: { paymentStatus: 'REFUNDED' } });
      expect((await act(who.chefA1.token, o.id, 'accept')).status).toBe(404);
      expect(await statusOf(o.id)).toBe('CONFIRMED');
    });
  });

  // ===================================================================================================== customer / cancellation
  describe('cancellation interaction (P7C rules preserved)', () => {
    it('32. after ACCEPTED the customer can no longer cancel; the customer then sees PREPARING and READY', async () => {
      const o = await realPaidOrder();
      const before = await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(who.custA.token));
      expect(before.body.data.cancellation.state).toBe('CANCELLATION_AVAILABLE');
      expect((await act(who.chefA1.token, o.id, 'accept')).status).toBe(200);
      const after = await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(who.custA.token));
      expect(after.body.data.status).toBe('ACCEPTED');
      expect(after.body.data.cancellation.state).toBe('CANCELLATION_NOT_ALLOWED');
      const cancel = await request(app).post(`/api/v1/orders/${o.id}/cancel`).set(bearer(who.custA.token)).send({ reasonCode: 'CHANGED_MIND' });
      expect(cancel.status).toBe(409);
      expect(cancel.body.error).toBe('CANCELLATION_NOT_ALLOWED');
      await act(who.chefA1.token, o.id, 'start-preparing');
      expect((await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(who.custA.token))).body.data.status).toBe('PREPARING');
      await act(who.chefA1.token, o.id, 'mark-ready');
      const ready = await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(who.custA.token));
      expect(ready.body.data.status).toBe('READY');
      expect(ready.body.data.timeline.map((t: any) => t.toStatus)).toEqual(['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY']);
      expect((await request(app).post(`/api/v1/orders/${o.id}/cancel`).set(bearer(who.custA.token)).send({ reasonCode: 'CHANGED_MIND' })).status).toBe(409);
    });

    it('33. a cancelled order leaves the kitchen and cannot be accepted (cancel before accept)', async () => {
      const o = await realPaidOrder();
      expect(ids(await queue(who.chefA1.token))).toContain(o.id);
      expect((await request(app).post(`/api/v1/orders/${o.id}/cancel`).set(bearer(who.custA.token)).send({ reasonCode: 'CHANGED_MIND' })).status).toBe(200);
      const r = await act(who.chefA1.token, o.id, 'accept');
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('INVALID_ORDER_TRANSITION');
      expect(await statusOf(o.id)).toBe('CANCELLED');
      expect(ids(await queue(who.chefA1.token))).not.toContain(o.id);
    });

    it('34. a customer cannot cancel an unrouted CONFIRMED order differently from a routed one (still allowed) and the order stays out of every chef queue', async () => {
      const o = await realPaidOrder();
      await prisma.order.update({ where: { id: o.id }, data: { kitchenBranchId: null } });
      expect(ids(await queue(who.chefA1.token))).not.toContain(o.id);
      expect(ids(await queue(who.chefB.token))).not.toContain(o.id);
      expect((await request(app).post(`/api/v1/orders/${o.id}/cancel`).set(bearer(who.custA.token)).send({ reasonCode: 'CHANGED_MIND' })).status).toBe(200);
    });
  });

  // ===================================================================================================== concurrency
  describe('database-decided concurrency', () => {
    it('35. two chefs ACCEPT the same order at once: exactly one change, one event, one audit row, all responses 200', async () => {
      const o = await mkOrder();
      const results = await Promise.all([act(who.chefA1.token, o.id, 'accept'), act(who.chefA2.token, o.id, 'accept'), act(who.chefA1.token, o.id, 'accept'), act(who.chefAB.token, o.id, 'accept'), act(who.chefA2.token, o.id, 'accept')]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(results.filter((r) => r.body.data.changed)).toHaveLength(1);
      expect(await events(o.id)).toHaveLength(1);
      expect((await audits('ORDER_STATUS_CHANGED', o.id)).length).toBe(1);
    });

    it('36. double START PREPARING and double MARK READY: one effective transition each', async () => {
      const o = await mkOrder({ status: 'ACCEPTED' });
      const start = await Promise.all([act(who.chefA1.token, o.id, 'start-preparing'), act(who.chefA2.token, o.id, 'start-preparing'), act(who.chefA1.token, o.id, 'start-preparing')]);
      expect(start.every((r) => r.status === 200)).toBe(true);
      expect(start.filter((r) => r.body.data.changed)).toHaveLength(1);
      const ready = await Promise.all([act(who.chefA1.token, o.id, 'mark-ready'), act(who.chefA2.token, o.id, 'mark-ready')]);
      expect(ready.every((r) => r.status === 200)).toBe(true);
      expect(ready.filter((r) => r.body.data.changed)).toHaveLength(1);
      expect((await events(o.id)).map((e) => e.toStatus)).toEqual(['PREPARING', 'READY']);
    });

    it('37. customer CANCEL vs CHEF ACCEPT: exactly one wins, the loser gets a clean 409, and the event chain is consistent', async () => {
      const outcomes = { cancelled: 0, accepted: 0 };
      for (let i = 0; i < 4; i++) {
        const o = await realPaidOrder();
        const [cancel, accept] = await Promise.all([
          request(app).post(`/api/v1/orders/${o.id}/cancel`).set(bearer(who.custA.token)).send({ reasonCode: 'CHANGED_MIND' }),
          act(who.chefA1.token, o.id, 'accept')
        ]);
        const final = await statusOf(o.id);
        const ev = (await events(o.id)).map((e) => e.toStatus);
        if (final === 'CANCELLED') {
          outcomes.cancelled++;
          expect(cancel.status).toBe(200);
          expect(accept.status).toBe(409);
          expect(accept.body.error).toBe('INVALID_ORDER_TRANSITION');
          expect(ev).toEqual(['CONFIRMED', 'CANCELLED']);
        } else {
          outcomes.accepted++;
          expect(final).toBe('ACCEPTED');
          expect(accept.status).toBe(200);
          expect(cancel.status).toBe(409);
          expect(cancel.body.error).toBe('CANCELLATION_NOT_ALLOWED');
          expect(ev).toEqual(['CONFIRMED', 'ACCEPTED']);
          expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(0); // no refund intent for a cancellation that lost
        }
      }
      expect(outcomes.cancelled + outcomes.accepted).toBe(4);
    });

    it('38. SUPER_ADMIN ASSIGN vs ASSIGN (different branches): exactly one wins, the other gets KITCHEN_BRANCH_CHANGED, one audit row, the winner is stored', async () => {
      const o = await mkOrder({ kitchenBranchId: null });
      const [a, b] = await Promise.all([route(o.id, { branchId: branchA.id, expectedBranchId: null, reason: 'admin one routes' }), route(o.id, { branchId: branchB.id, expectedBranchId: null, reason: 'admin two routes' })]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expect(loser.body.error).toBe('KITCHEN_BRANCH_CHANGED');
      const winnerBranch = a.status === 200 ? branchA.id : branchB.id;
      expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).kitchenBranchId).toBe(winnerBranch);
      expect(await audits('ORDER_KITCHEN_BRANCH_ASSIGNED', o.id)).toHaveLength(1);
    });

    it('39. SUPER_ADMIN ASSIGN vs ASSIGN (same branch): one change, one no-op, one audit row', async () => {
      const o = await mkOrder({ kitchenBranchId: null });
      const body = { branchId: branchB.id, expectedBranchId: null, reason: 'double click on assign' };
      const rs = await Promise.all([route(o.id, body), route(o.id, body), route(o.id, body)]);
      expect(rs.every((r) => r.status === 200)).toBe(true);
      expect(rs.filter((r) => r.body.data.changed)).toHaveLength(1);
      expect(await audits('ORDER_KITCHEN_BRANCH_ASSIGNED', o.id)).toHaveLength(1);
    });

    it('40. SUPER_ADMIN ASSIGN vs customer CANCEL: the database decides; no order is both cancelled-by-customer and then routed, and a routed order can still be cancelled', async () => {
      for (let i = 0; i < 3; i++) {
        const o = await realPaidOrder();
        await prisma.order.update({ where: { id: o.id }, data: { kitchenBranchId: null } });
        const [assign, cancel] = await Promise.all([
          route(o.id, { branchId: branchA.id, expectedBranchId: null, reason: 'route versus cancel' }),
          request(app).post(`/api/v1/orders/${o.id}/cancel`).set(bearer(who.custA.token)).send({ reasonCode: 'CHANGED_MIND' })
        ]);
        expect(cancel.status).toBe(200); // cancellation is allowed on a CONFIRMED order whether or not it was routed
        const row = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
        expect(row.status).toBe('CANCELLED');
        if (assign.status === 200) expect(row.kitchenBranchId).toBe(branchA.id);
        else {
          expect(assign.body.error).toBe('ORDER_NOT_ROUTABLE');
          expect(row.kitchenBranchId).toBeNull();
        }
      }
    });

    it('41. SUPER_ADMIN reassignment vs CHEF ACCEPT: either the accept wins (reassignment refused) or the reassignment wins (the old chef gets 404)', async () => {
      for (let i = 0; i < 4; i++) {
        const o = await mkOrder({ kitchenBranchId: branchA.id });
        const [assign, accept] = await Promise.all([route(o.id, { branchId: branchB.id, expectedBranchId: branchA.id, reason: 'move to branch B' }), act(who.chefA1.token, o.id, 'accept')]);
        const row = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
        if (assign.status === 200) {
          expect(row.kitchenBranchId).toBe(branchB.id);
          expect(row.status).toBe('CONFIRMED');
          expect(accept.status).toBe(404);
        } else {
          expect(assign.status).toBe(409);
          expect(assign.body.error).toBe('ORDER_NOT_ROUTABLE');
          expect(row.kitchenBranchId).toBe(branchA.id);
          expect(row.status).toBe('ACCEPTED');
          expect(accept.status).toBe(200);
        }
      }
    });

    it('42. stale card: a chef acting on an order another chef already moved gets a no-op or a clean 409, never a corrupted state; multiple tabs converge', async () => {
      const o = await mkOrder();
      const staleView = await queue(who.chefA1.token);
      expect(section(staleView, 'CONFIRMED').items.map((i: any) => i.id)).toContain(o.id);
      await act(who.chefA2.token, o.id, 'accept');
      await act(who.chefA2.token, o.id, 'start-preparing');
      const staleAccept = await act(who.chefA1.token, o.id, 'accept'); // this tab still shows CONFIRMED
      expect(staleAccept.status).toBe(409);
      expect(staleAccept.body.error).toBe('INVALID_ORDER_TRANSITION');
      const staleStart = await act(who.chefA1.token, o.id, 'start-preparing'); // same-target as the other tab's action
      expect(staleStart.status).toBe(200);
      expect(staleStart.body.data.changed).toBe(false);
      const fresh = await queue(who.chefA1.token);
      expect(section(fresh, 'PREPARING').items.map((i: any) => i.id)).toContain(o.id);
      expect(section(fresh, 'CONFIRMED').items.map((i: any) => i.id)).not.toContain(o.id);
      expect(await events(o.id)).toHaveLength(2);
    });
  });

  // ===================================================================================================== order creation: recipeId
  describe('recipeId at order creation', () => {
    it('43. a real order records the product\'s recipeId on each item; the idempotent replay (same fingerprint) still works; pricing is unchanged', async () => {
      const cust = who.custB;
      const addr = await prisma.customerAddress.create({ data: { customerProfileId: cust.profileId!, title: 'Home', addressLine1: '1 Test Road', city: 'Kochi', state: 'Kerala', postalCode: '682001' } });
      await request(app).delete('/api/v1/cart').set(bearer(cust.token));
      const add = await request(app).post('/api/v1/cart/items').set(bearer(cust.token)).send({ productId, quantity: 2 });
      expect(add.status, JSON.stringify(add.body)).toBe(201);
      const key = `IK-P8-${ts}-recipe`;
      const place = () => request(app).post('/api/v1/orders').set(bearer(cust.token)).set('x-idempotency-key', key).send({ addressId: addr.id });
      const created = await place();
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const items = await prisma.orderItem.findMany({ where: { orderId: created.body.data.id } });
      expect(items).toHaveLength(1);
      expect(items[0].recipeId).toBe(recipeId);
      expect(created.body.data.netAmount).toBeDefined();
      const replay = await place();
      expect([200, 201]).toContain(replay.status);
      expect(replay.body.data.id).toBe(created.body.data.id);
      // the customer DTO does not expose the recipe link
      expect(JSON.stringify(created.body.data)).not.toContain(recipeId);
    });
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ORDER_TRANSITIONS, TRANSITION_PARTIES } from '../modules/order/orderStatus.js';
import { OrderTransitionService } from '../modules/order/orderTransition.service.js';
import { roleHasPermission } from '../authz/permissions.js';
import { FAILURE_NOTE_PREFIX, FAILURE_REASON_CODES, parseFailureNote, serializeFailureNote } from '../modules/delivery/delivery.dto.js';

/**
 * P9A - delivery: READY queue, DELIVERY self-claim, SUPER_ADMIN assignment, dispatch (READY -> DISPATCHED), failure reporting,
 * PII allow-lists, branch / ownership isolation, database-decided concurrency, and "DELIVERED is unreachable".
 * Real PostgreSQL. Nothing here calls a payment provider (orders are created PAID directly, exactly like the kitchen suite).
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const PASSWORD = 'P9A#Delivery-Pass-2026-xyz';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

// Sentinel customer data: every one of these must be absent from pre-claim / monitoring payloads and from other drivers' responses.
const SECRET = {
  first: 'Asha',
  full: 'Asha Verma-Secret',
  last: 'Verma-Secret',
  phone: '+91 98765 43210',
  street: '12 Secret Street',
  line2: 'Flat 4B Hidden Block',
  email: 'asha.secret@example.test',
  instructions: 'Leave with the security guard',
  net: '145.50'
};

describe('B2a - delivery: driver surface removed, SUPER_ADMIN monitor and invariants', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; email: string; token: string; profileId?: string; employeeId?: string };
  const who: Record<string, Who> = {};
  let branchA: { id: string; code: string };
  let branchB: { id: string; code: string };
  let step = '';

  async function mkUser(label: string, roles: RoleEnum[], branchIds: string[] = [], status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE'): Promise<Who> {
    const email = `p9a_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER);
    const u = await prisma.user.create({
      data: {
        email,
        status,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer
          ? { customerProfile: { create: { fullName: `Customer ${label}`, referralCode: `PB-P9A${label.toUpperCase()}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `P9A-${label}-${ts}`, fullName: `P9A ${label}`, designation: 'Test', assignedBranchId: branchIds[0] ?? null } } })
      },
      include: { customerProfile: true, employeeProfile: true }
    });
    for (const branchId of branchIds) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile!.id, branchId } });
    who[label] = { id: u.id, email, token: sign(u.id, email, roles), profileId: u.customerProfile?.id, employeeId: u.employeeProfile?.id };
    return who[label];
  }

  /** A delivery-eligible order by default: READY + PAID + ONLINE + DIRECT, routed to branch A. */
  const mkOrder = async (over: Record<string, unknown> = {}) => {
    const n = ++seq;
    return prisma.order.create({
      data: {
        orderNumber: `P9A-${ts}-${n}`,
        totalAmount: 100,
        netAmount: SECRET.net,
        customerProfileId: who.custA.profileId,
        status: 'READY',
        paymentStatus: 'PAID',
        paymentMethod: 'ONLINE',
        orderType: 'DIRECT',
        kitchenBranchId: branchA.id,
        confirmedAt: new Date(Date.now() - 60000),
        deliveryAddress: `${SECRET.street}, Kochi`,
        deliveryAddressSnapshot: {
          title: 'Home',
          addressLine1: SECRET.street,
          addressLine2: SECRET.line2,
          city: 'Kochi',
          state: 'Kerala',
          postalCode: '682001',
          recipientName: SECRET.full,
          phone: SECRET.phone,
          email: SECRET.email,
          deliveryInstructions: SECRET.instructions
        },
        items: { create: [{ itemTitle: `Bowl ${n}`, variantName: 'Large', sku: `SKU-${n}`, unitPrice: 100, quantity: 2, taxRate: 0.05, totalPrice: 200 }] },
        ...over
      } as never
    });
  };
  const assignRow = (orderId: string, driverId: string | null, over: Record<string, unknown> = {}) =>
    prisma.deliveryAssignment.create({ data: { orderId, driverId, branchId: branchA.id, status: 'ASSIGNED', ...over } });

  const queue = (token: string, qs = '') => request(app).get(`/api/v1/delivery/orders${qs}`).set(bearer(token));
  const detail = (token: string, id: string) => request(app).get(`/api/v1/delivery/orders/${id}`).set(bearer(token));
  const claim = (token: string, id: string, body: Record<string, unknown> = {}) => request(app).post(`/api/v1/delivery/orders/${id}/claim`).set(bearer(token)).send(body);
  const dispatch = (token: string, id: string, body: Record<string, unknown> = {}) => request(app).post(`/api/v1/delivery/orders/${id}/dispatch`).set(bearer(token)).send(body);
  const fail = (token: string, id: string, body: Record<string, unknown> = { reasonCode: 'CUSTOMER_UNAVAILABLE' }) => request(app).post(`/api/v1/delivery/orders/${id}/report-failure`).set(bearer(token)).send(body);
  const monitor = (token: string, qs = `?branchId=${branchA.id}`) => request(app).get(`/api/v1/delivery/monitor${qs}`).set(bearer(token));
  const assign = (id: string, body: Record<string, unknown>, token = who.admin.token, stepToken: string | null = step) => {
    const r = request(app).put(`/api/v1/admin/orders/${id}/delivery-assignment`).set(bearer(token));
    return (stepToken ? r.set('x-step-up-token', stepToken) : r).send(body);
  };
  const reason = 'Admin reassigns for load';
  const allIds = (res: { body: { data: { sections: Record<string, { items: Array<{ id: string }> }> } } }) => Object.values(res.body.data.sections).flatMap((s) => s.items.map((o) => o.id));
  const order = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
  const assignmentOf = (orderId: string) => prisma.deliveryAssignment.findUnique({ where: { orderId } });
  const events = (orderId: string) => prisma.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  const audits = (action: string, entityId: string) => prisma.auditLog.findMany({ where: { action, entityId } });
  const text = (res: { body: unknown }) => JSON.stringify(res.body);
  const piiAbsent = (res: { body: unknown }, except: string[] = []) => {
    for (const [k, v] of Object.entries(SECRET)) if (!except.includes(k)) expect(text(res), `leaked ${k}`).not.toContain(v);
  };

  beforeAll(async () => {
    branchA = await prisma.kitchenBranch.create({ data: { code: `p9a-a-${ts}`, name: 'P9A Branch A', address: 'A', city: 'Kochi' } });
    branchB = await prisma.kitchenBranch.create({ data: { code: `p9a-b-${ts}`, name: 'P9A Branch B', address: 'B', city: 'Kozhikode' } });
    await mkUser('custA', [RoleEnum.CUSTOMER]);
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('md', [RoleEnum.MD]);
    await mkUser('chef', [RoleEnum.CHEF], [branchA.id]);
    await mkUser('pos', [RoleEnum.POS], [branchA.id]);
    await mkUser('d1', [RoleEnum.DELIVERY], [branchA.id]);
    await mkUser('d2', [RoleEnum.DELIVERY], [branchA.id]);
    await mkUser('d3', [RoleEnum.DELIVERY], [branchA.id]);
    await mkUser('dAB', [RoleEnum.DELIVERY], [branchA.id, branchB.id]);
    await mkUser('dB', [RoleEnum.DELIVERY], [branchB.id]);
    await mkUser('dNone', [RoleEnum.DELIVERY]);
    await mkUser('dSuspended', [RoleEnum.DELIVERY], [branchA.id], 'SUSPENDED');
    const su = await request(app).post('/api/v1/admin/step-up').set(bearer(who.admin.token)).send({ password: PASSWORD });
    expect(su.status).toBe(200);
    step = su.body.data.stepUpToken;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const ALLOWED_DELIVERED_FILES = [join('order', 'orderStatus.ts'), join('order', 'orderTransition.service.ts'), join('delivery', 'deliveryProof.service.ts'), join('delivery', 'deliveryView.service.ts'), join('delivery', 'deliveryResolution.service.ts')];

  // ===================================================================================================== the DELIVERY driver surface is gone (B2a)
  const DRIVER_PATHS: Array<['get' | 'post', (id: string) => string]> = [
    ['get', () => '/api/v1/delivery/orders'],
    ['get', (id) => `/api/v1/delivery/orders/${id}`],
    ['post', (id) => `/api/v1/delivery/orders/${id}/claim`],
    ['post', (id) => `/api/v1/delivery/orders/${id}/dispatch`],
    ['post', (id) => `/api/v1/delivery/orders/${id}/report-failure`],
    ['post', (id) => `/api/v1/delivery/orders/${id}/resume`],
    ['post', (id) => `/api/v1/delivery/orders/${id}/verify-delivery`]
  ];

  describe('the driver surface was removed', () => {
    it('1. every former driver endpoint answers 404 for anonymous callers, a legacy DELIVERY account, SUPER_ADMIN, CHEF and customers, and nothing changes', async () => {
      const o = await mkOrder();
      await assignRow(o.id, who.d1.employeeId!); // a legacy driver-owned job, exactly like the development data
      for (const [method, path] of DRIVER_PATHS) {
        const calls = [request(app)[method](path(o.id))];
        for (const label of ['d1', 'admin', 'chef', 'custA']) calls.push(request(app)[method](path(o.id)).set(bearer(who[label].token)));
        for (const call of calls) {
          const res = await (method === 'post' ? call.send({ code: '123456', reasonCode: 'OTHER' }) : call);
          expect([method, path('x'), res.status]).toEqual([method, path('x'), 404]);
        }
      }
      expect(await order(o.id)).toMatchObject({ status: 'READY', paymentStatus: 'PAID', kitchenBranchId: branchA.id });
      expect(await assignmentOf(o.id)).toMatchObject({ driverId: who.d1.employeeId, status: 'ASSIGNED', operatedByUserId: null });
    });

    it('2. the driver-only administrator routes are gone too: assignment, the driver list and the driver-based retry answer 404 even with a valid step-up proof', async () => {
      const o = await mkOrder({ status: 'DISPATCHED' });
      await assignRow(o.id, who.d1.employeeId!, { status: 'FAILED', deliveryNotes: serializeFailureNote('OTHER', 'x') });
      expect((await assign(o.id, { driverEmployeeId: who.d2.employeeId, expectedDriverId: who.d1.employeeId, reason })).status).toBe(404);
      expect((await request(app).get(`/api/v1/admin/delivery/drivers?branchId=${branchA.id}`).set(bearer(who.admin.token))).status).toBe(404);
      const retry = await request(app)
        .post(`/api/v1/admin/orders/${o.id}/delivery-retry`)
        .set(bearer(who.admin.token))
        .set('x-step-up-token', step)
        .send({ mode: 'SAME_DRIVER', expectedAttemptNumber: 1, expectedDriverId: who.d1.employeeId, reasonCode: 'OTHER' });
      expect(retry.status).toBe(404);
      expect(await assignmentOf(o.id)).toMatchObject({ driverId: who.d1.employeeId, status: 'FAILED', attemptNumber: 1 });
    });

    it('3. a legacy DELIVERY-only account is refused NO_APPROVED_ROLE everywhere: sign-in, a token it still holds, the monitor, the administrator operations, the kitchen and the customer API', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ email: who.d1.email, password: PASSWORD });
      expect([login.status, login.body.error]).toEqual([403, 'NO_APPROVED_ROLE']);
      const o = await mkOrder();
      const calls: Array<[string, string, object?]> = [
        ['get', `/api/v1/delivery/monitor?branchId=${branchA.id}`],
        ['get', `/api/v1/admin/delivery/orders/${o.id}`],
        ['post', `/api/v1/admin/delivery/orders/${o.id}/dispatch`, {}],
        ['post', `/api/v1/admin/delivery/orders/${o.id}/verify-delivery`, { code: '123456' }],
        ['get', '/api/v1/kds/orders'],
        ['get', '/api/v1/cart'],
        ['get', '/api/v1/auth/me']
      ];
      for (const [method, path, body] of calls) {
        const res = await (request(app) as never as Record<string, (p: string) => request.Test>)[method](path).set(bearer(who.d1.token)).send(body ?? {});
        expect([method, path, res.status, res.body.error]).toEqual([method, path, 403, 'NO_APPROVED_ROLE']);
      }
      expect(await order(o.id)).toMatchObject({ status: 'READY' });
    });

    it('4. the permission catalogue holds no driver permissions: nobody has delivery:write, delivery:assign or mess:delivery:write, DELIVERY holds nothing, SUPER_ADMIN keeps read / operate / override / resolve', () => {
      const roles = Object.values(RoleEnum) as RoleEnum[];
      for (const permission of ['delivery:write', 'delivery:assign', 'mess:delivery:write']) {
        for (const role of roles) expect(roleHasPermission(role, permission as never), `${role} ${permission}`).toBe(false);
      }
      for (const permission of ['delivery:read', 'delivery:operate', 'delivery:override', 'delivery:resolve', 'mess:delivery:read', 'mess:delivery:operate', 'mess:delivery:override']) {
        expect(roleHasPermission(RoleEnum.SUPER_ADMIN, permission as never), permission).toBe(true);
        for (const role of roles.filter((r) => r !== RoleEnum.SUPER_ADMIN)) expect(roleHasPermission(role, permission as never), `${role} ${permission}`).toBe(false);
      }
    });

    it('5. READY -> DISPATCHED belongs to SUPER_ADMIN alone and DISPATCHED -> DELIVERED to the proof party alone', () => {
      expect(TRANSITION_PARTIES['READY->DISPATCHED']).toEqual([RoleEnum.SUPER_ADMIN]);
      expect(TRANSITION_PARTIES['DISPATCHED->DELIVERED']).toEqual(['DELIVERY_PROOF']);
    });
  });

  // ===================================================================================================== monitor
  describe('the SUPER_ADMIN monitor', () => {
    it('6. only SUPER_ADMIN reads it, with an explicit branch; chefs, customers and every retired role are refused', async () => {
      for (const label of ['d1', 'chef', 'custA', 'pos', 'md']) expect((await monitor(who[label].token)).status, label).toBe(403);
      expect((await monitor(who.admin.token, '')).status).toBe(400);
      expect((await monitor(who.admin.token, '?branchId=00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await request(app).get(`/api/v1/delivery/monitor?branchId=${branchA.id}`)).status).toBe(401);
      const ok = await monitor(who.admin.token);
      expect(ok.status).toBe(200);
      expect(ok.body.data.readOnly).toBe(false);
    });

    it('7. sections are bounded (100) with total / truncated and the oldest-ready order first; the four groups are filled correctly (legacy driver-owned rows included)', async () => {
      const branchC = await prisma.kitchenBranch.create({ data: { code: `p9a-c-${ts}`, name: 'P9A Branch C', address: 'C', city: 'Kollam' } });
      await prisma.order.createMany({
        data: Array.from({ length: 103 }, (_, i) => ({
          orderNumber: `P9A-${ts}-BULK-${i}`,
          totalAmount: 1,
          netAmount: 1,
          status: 'READY',
          paymentStatus: 'PAID',
          paymentMethod: 'ONLINE',
          orderType: 'DIRECT',
          kitchenBranchId: branchC.id,
          updatedAt: new Date(Date.now() - (200 - i) * 1000)
        }))
      });
      const bulk = await monitor(who.admin.token, `?branchId=${branchC.id}`);
      expect(bulk.body.data.sectionLimit).toBe(100);
      expect(bulk.body.data.sections.unclaimed.items).toHaveLength(100);
      expect(bulk.body.data.sections.unclaimed.total).toBe(103);
      expect(bulk.body.data.sections.unclaimed.truncated).toBe(true);
      expect(bulk.body.data.sections.unclaimed.items[0].orderNumber).toBe(`P9A-${ts}-BULK-0`); // oldest first

      const un = await mkOrder({ kitchenBranchId: branchB.id });
      const asg = await mkOrder({ kitchenBranchId: branchB.id });
      const out = await mkOrder({ kitchenBranchId: branchB.id, status: 'DISPATCHED' });
      const exc = await mkOrder({ kitchenBranchId: branchB.id, status: 'DISPATCHED' });
      await assignRow(asg.id, who.dB.employeeId!, { branchId: branchB.id });
      await assignRow(out.id, who.dB.employeeId!, { branchId: branchB.id, status: 'IN_TRANSIT' });
      await assignRow(exc.id, who.dB.employeeId!, { branchId: branchB.id, status: 'FAILED', deliveryNotes: serializeFailureNote('WRONG_ADDRESS', 'Number missing') });
      const m = await monitor(who.admin.token, `?branchId=${branchB.id}`);
      const s = m.body.data.sections;
      expect(s.unclaimed.items.map((o: { id: string }) => o.id)).toContain(un.id);
      expect(s.assigned.items.map((o: { id: string }) => o.id)).toContain(asg.id);
      expect(s.dispatched.items.map((o: { id: string }) => o.id)).toContain(out.id);
      expect(s.dispatched.items.map((o: { id: string }) => o.id)).not.toContain(exc.id);
      const excItem = s.exceptions.items.find((o: { id: string }) => o.id === exc.id);
      expect(excItem.exception).toEqual({ reasonCode: 'WRONG_ADDRESS', note: 'Number missing' });
      expect(excItem.assignment.driver).toMatchObject({ employeeId: who.dB.employeeId }); // history of a legacy driver stays readable
      piiAbsent(m);
    });

    it('8. the monitor DTO is an exact allow-list with the delivery AREA only: no name, phone, street, email, instructions, price, payment or refund data', async () => {
      const o = await mkOrder();
      await assignRow(o.id, who.d2.employeeId!);
      await prisma.orderEvent.create({ data: { orderId: o.id, fromStatus: 'PREPARING', toStatus: 'READY', actorRole: 'CHEF' } });
      const m = await monitor(who.admin.token);
      expect(m.status).toBe(200);
      const item = m.body.data.sections.assigned.items.find((x: { id: string }) => x.id === o.id);
      expect(Object.keys(item).sort()).toEqual(['area', 'assignment', 'canRetry', 'exception', 'id', 'items', 'kitchenBranch', 'maxAttempts', 'orderNumber', 'proofState', 'readyAt', 'retryPending', 'status']);
      expect(item.area).toEqual({ city: 'Kochi', postalCode: '682001' });
      expect(Object.keys(item.items[0]).sort()).toEqual(['id', 'quantity', 'title', 'variantName']);
      expect(item.assignment.driver).toMatchObject({ employeeId: who.d2.employeeId });
      expect(item.assignment.operator).toBeNull();
      piiAbsent(m);
      for (const word of ['paymentMethod', 'paymentStatus', 'netAmount', 'totalAmount', 'unitPrice', 'refund', 'providerPayment', 'passwordHash']) expect(text(m)).not.toContain(word);
    });
  });

  // ===================================================================================================== DELIVERED unreachable / legacy
  describe('DELIVERED is unreachable and the legacy API is retired', () => {
    it('9. GET /delivery/assignments and PATCH /delivery/assignments/:id/status are 404 for EVERY role, including with a DELIVERED body', async () => {
      const o = await mkOrder();
      const a = await assignRow(o.id, who.d1.employeeId!);
      for (const label of ['d1', 'd2', 'admin', 'md', 'chef', 'custA']) {
        expect((await request(app).get('/api/v1/delivery/assignments').set(bearer(who[label].token))).status, `GET ${label}`).toBe(404);
        const patch = await request(app).patch(`/api/v1/delivery/assignments/${a.id}/status`).set(bearer(who[label].token)).send({ status: 'DELIVERED' });
        expect(patch.status, `PATCH ${label}`).toBe(404);
      }
      expect((await assignmentOf(o.id))!.status).toBe('ASSIGNED');
      expect((await order(o.id)).status).toBe('READY');
    });

    it('10. no HTTP route can mark an order delivered: every deliver-like path and verb is 404 for every role, and nothing changes', async () => {
      const o = await mkOrder({ status: 'DISPATCHED' });
      await assignRow(o.id, who.d1.employeeId!, { status: 'IN_TRANSIT' });
      for (const label of ['d1', 'admin', 'md', 'chef', 'custA']) {
        for (const path of ['deliver', 'delivered', 'mark-delivered', 'complete', 'proof-of-delivery', 'pod', 'status']) {
          for (const verb of ['post', 'put', 'patch'] as const) {
            const r = await request(app)[verb](`/api/v1/delivery/orders/${o.id}/${path}`).set(bearer(who[label].token)).send({ status: 'DELIVERED' });
            expect(r.status, `${verb} ${path} ${label}`).toBe(404);
            const a = await request(app)[verb](`/api/v1/admin/delivery/orders/${o.id}/${path}`).set(bearer(who[label].token)).set('x-step-up-token', step).send({ status: 'DELIVERED' });
            expect([403, 404], `admin ${verb} ${path} ${label}`).toContain(a.status);
          }
        }
        for (const verb of ['post', 'put', 'patch'] as const) {
          expect((await request(app)[verb](`/api/v1/orders/${o.id}/status`).set(bearer(who[label].token)).send({ status: 'DELIVERED' })).status, `orders ${verb} ${label}`).toBe(404);
        }
      }
      expect((await order(o.id)).status).toBe('DISPATCHED');
      expect((await assignmentOf(o.id))!.status).toBe('IN_TRANSIT');
    });

    it('11. the transition service refuses DELIVERED for every human role, SYSTEM and a PROOF actor without verified evidence (only the proof-backed party exists)', async () => {
      const o = await mkOrder({ status: 'DISPATCHED' });
      const actors = [
        { kind: 'USER' as const, userId: who.d1.id, roles: [RoleEnum.DELIVERY], branchIds: [branchA.id] },
        { kind: 'USER' as const, userId: who.admin.id, roles: [RoleEnum.SUPER_ADMIN], isGlobal: true },
        { kind: 'USER' as const, userId: who.md.id, roles: [RoleEnum.MD], isGlobal: false },
        { kind: 'USER' as const, userId: who.chef.id, roles: [RoleEnum.CHEF], branchIds: [branchA.id] },
        { kind: 'USER' as const, userId: who.custA.id, roles: [RoleEnum.CUSTOMER], customerProfileId: who.custA.profileId },
        { kind: 'SYSTEM' as const, source: 'PAYMENT_VERIFICATION' as const }
      ];
      // a PROOF actor is only a claim: without a verified DeliveryProof row of THIS order the transition refuses
      await expect(OrderTransitionService.transition({ orderId: o.id, to: 'DELIVERED', actor: { kind: 'PROOF', method: 'PIN', proofId: 'nope', userId: who.d1.id, roles: [RoleEnum.DELIVERY] } })).rejects.toMatchObject({ errorCode: 'INVALID_ORDER_TRANSITION' });
      for (const actor of actors) {
        await expect(OrderTransitionService.transition({ orderId: o.id, to: 'DELIVERED', actor })).rejects.toMatchObject({ errorCode: 'ORDER_TRANSITION_FORBIDDEN' });
      }
      expect((await order(o.id)).status).toBe('DISPATCHED');
      expect(ORDER_TRANSITIONS.DISPATCHED).toEqual(['DELIVERED', 'CANCELLED']); // CANCELLED exists only for the evidence-gated undeliverable path (see deliveryResolution.test.ts)
    });

    it('12. static guard: no production source names DELIVERED outside the status catalogue, the transition service and the delivery PROOF service; the delivery module has no deliver route, no PICKED_UP and no payment-collection code', () => {
      const root = join(__dirname, '..');
      const offenders: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) {
            if (name === 'tests') continue;
            walk(full);
          } else if (full.endsWith('.ts') && !ALLOWED_DELIVERED_FILES.some((f) => full.endsWith(f))) {
            const code = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
            if (/['"`]DELIVERED['"`]/.test(code)) offenders.push(full);
          }
        }
      };
      walk(root);
      expect(offenders).toEqual([]);

      for (const file of ['delivery.routes.ts', 'deliveryAdmin.routes.ts', 'delivery.controller.ts', 'delivery.service.ts', 'delivery.dto.ts']) {
        const code = readFileSync(join(root, 'modules', 'delivery', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        expect(code, file).not.toMatch(/PICKED_UP|podImageUrl|temperatureC|deliveryTime/);
        expect(code, file).not.toMatch(/cash|collect|settle|\bCOD\b/i);
        expect(code, file).not.toMatch(/['"][^'"]*\/(deliver|delivered|mark-delivered|complete|pod|proof-of-delivery|status)['"]/i);
        expect(code, file).not.toMatch(/order\.(update|updateMany|upsert)\s*\(/);
      }
    });

    it('13. no source file still authorizes the DELIVERY role or builds a driver caller (the role survives only as retired vocabulary and in the retirement tooling)', () => {
      const root = join(__dirname, '..');
      const hits: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) {
            if (name !== 'tests') walk(full);
          } else if (full.endsWith('.ts')) {
            const code = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
            if (/RoleEnum\.DELIVERY|requireExactRoles\(\[[^\]]*DELIVERY|DriverCaller|listAssignableDrivers|TRANSITIONAL_ROLES|isEffectiveRole/.test(code)) hits.push(full.slice(root.length + 1).replace(/\\/g, '/'));
          }
        }
      };
      walk(root);
      expect(hits.sort()).toEqual(['authz/roleScopes.ts']); // the scope catalogue is keyed by every enum value until the enum itself shrinks (a later, separately approved migration)
    });
  });

  // ===================================================================================================== operational safety
  describe('operational safety', () => {
    it('14. the administrator delivery operations never change kitchen routing, payments or refunds; the Chef still cannot reach delivery', async () => {
      const o = await mkOrder();
      const op = (path: string, body: object = {}) => request(app).post(`/api/v1/admin/delivery/orders/${o.id}/${path}`).set(bearer(who.admin.token)).set('x-step-up-token', step).send(body);
      expect((await op('dispatch')).status).toBe(200);
      expect((await op('report-failure', { reasonCode: 'CUSTOMER_UNAVAILABLE' })).status).toBe(200);
      const after = await order(o.id);
      expect(after).toMatchObject({ paymentStatus: 'PAID', paymentMethod: 'ONLINE', kitchenBranchId: branchA.id, cancelledAt: null, status: 'DISPATCHED' });
      expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(0);
      expect(await prisma.payment.count({ where: { orderId: o.id } })).toBe(0);
      expect((await request(app).post(`/api/v1/kds/orders/${o.id}/mark-ready`).set(bearer(who.chef.token)).send({})).status).not.toBe(200); // a dispatched order is no longer in the chef's hands
      expect((await request(app).post(`/api/v1/admin/delivery/orders/${o.id}/dispatch`).set(bearer(who.chef.token)).set('x-step-up-token', step).send({})).status).toBe(403);
    });
  });
});

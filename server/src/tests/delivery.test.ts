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

describe('P9A - delivery claim / assignment / dispatch', () => {
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

  // ===================================================================================================== auth / RBAC
  describe('authentication and RBAC', () => {
    it('1. unauthenticated callers get 401 on every delivery endpoint', async () => {
      const o = await mkOrder();
      for (const r of [
        request(app).get('/api/v1/delivery/orders'),
        request(app).get(`/api/v1/delivery/orders/${o.id}`),
        request(app).post(`/api/v1/delivery/orders/${o.id}/claim`).send({}),
        request(app).post(`/api/v1/delivery/orders/${o.id}/dispatch`).send({}),
        request(app).post(`/api/v1/delivery/orders/${o.id}/report-failure`).send({ reasonCode: 'OTHER' }),
        request(app).get('/api/v1/delivery/monitor'),
        request(app).get('/api/v1/admin/delivery/drivers'),
        request(app).put(`/api/v1/admin/orders/${o.id}/delivery-assignment`).send({})
      ]) {
        expect((await r).status).toBe(401);
      }
    });

    it('2. only the exact DELIVERY role can use driver endpoints: customers, CHEF, POS, MD and SUPER_ADMIN get 403 and nothing changes', async () => {
      const o = await mkOrder();
      for (const label of ['custA', 'chef', 'pos', 'md', 'admin']) {
        expect((await queue(who[label].token)).status, `queue ${label}`).toBe(403);
        expect((await detail(who[label].token, o.id)).status, `detail ${label}`).toBe(403);
        expect((await claim(who[label].token, o.id)).status, `claim ${label}`).toBe(403);
        expect((await dispatch(who[label].token, o.id)).status, `dispatch ${label}`).toBe(403);
        expect((await fail(who[label].token, o.id)).status, `fail ${label}`).toBe(403);
      }
      expect(await assignmentOf(o.id)).toBeNull();
      expect((await order(o.id)).status).toBe('READY');
    });

    it('3. permission catalogue: SUPER_ADMIN reads + assigns but has no delivery:write; only DELIVERY writes; MD is read-only; only SUPER_ADMIN assigns', () => {
      expect(roleHasPermission(RoleEnum.SUPER_ADMIN, 'delivery:read')).toBe(true);
      expect(roleHasPermission(RoleEnum.SUPER_ADMIN, 'delivery:assign')).toBe(true);
      expect(roleHasPermission(RoleEnum.SUPER_ADMIN, 'delivery:write')).toBe(false);
      expect(roleHasPermission(RoleEnum.DELIVERY, 'delivery:write')).toBe(true);
      expect(roleHasPermission(RoleEnum.DELIVERY, 'delivery:assign')).toBe(false);
      expect(roleHasPermission(RoleEnum.MD, 'delivery:read')).toBe(true);
      expect(roleHasPermission(RoleEnum.MD, 'delivery:write')).toBe(false);
      expect(roleHasPermission(RoleEnum.MD, 'delivery:assign')).toBe(false);
      for (const r of [RoleEnum.CHEF, RoleEnum.POS, RoleEnum.PROCUREMENT, RoleEnum.CUSTOMER]) expect(roleHasPermission(r, 'delivery:assign')).toBe(false);
    });

    it('4. assignment endpoints: only SUPER_ADMIN (delivery:assign) AND a step-up proof; DELIVERY, MD, CHEF and customers are refused', async () => {
      const o = await mkOrder();
      const body = { driverEmployeeId: who.d1.employeeId, expectedDriverId: null, reason };
      for (const label of ['d1', 'md', 'chef', 'custA']) {
        expect((await assign(o.id, body, who[label].token)).status, label).toBe(403);
        expect((await request(app).get(`/api/v1/admin/delivery/drivers?branchId=${branchA.id}`).set(bearer(who[label].token))).status, `drivers ${label}`).toBe(403);
      }
      const noStep = await assign(o.id, body, who.admin.token, null);
      expect(noStep.status).toBe(403);
      expect(noStep.body.error).toBe('STEP_UP_REQUIRED');
      expect(await assignmentOf(o.id)).toBeNull();
    });

    it('5. the monitor is for SUPER_ADMIN and MD only (read-only), never for drivers, chefs or customers; an explicit branch is required', async () => {
      for (const label of ['d1', 'chef', 'custA', 'pos']) expect((await monitor(who[label].token)).status, label).toBe(403);
      for (const label of ['admin', 'md']) {
        expect((await monitor(who[label].token, '')).status, `${label} without branch`).toBe(400);
        expect((await monitor(who[label].token, '?branchId=00000000-0000-4000-8000-000000000000')).status, `${label} unknown branch`).toBe(404);
      }
      expect((await monitor(who.admin.token)).body.data.readOnly).toBe(false);
      expect((await monitor(who.md.token)).body.data.readOnly).toBe(true);
    });
  });

  // ===================================================================================================== queue
  describe('queue eligibility, branch isolation and DTO minimization', () => {
    it('6. only DIRECT + ONLINE + PAID READY orders of the caller\'s branch are available; COD, unpaid, refunded, unrouted, other statuses and foreign branches never appear', async () => {
      const ok = await mkOrder();
      const bad: Record<string, string> = {};
      bad.cod = (await mkOrder({ paymentMethod: 'COD' })).id;
      bad.unpaid = (await mkOrder({ paymentStatus: 'PENDING' })).id;
      bad.failedPay = (await mkOrder({ paymentStatus: 'FAILED' })).id;
      bad.refunded = (await mkOrder({ paymentStatus: 'REFUNDED' })).id;
      bad.partial = (await mkOrder({ paymentStatus: 'PARTIALLY_REFUNDED' })).id;
      bad.unrouted = (await mkOrder({ kitchenBranchId: null })).id;
      bad.foreign = (await mkOrder({ kitchenBranchId: branchB.id })).id;
      bad.mess = (await mkOrder({ orderType: 'MESS' })).id;
      for (const status of ['PENDING', 'CONFIRMED', 'ACCEPTED', 'PREPARING', 'DELIVERED', 'CANCELLED']) bad[status] = (await mkOrder({ status })).id;

      const res = await queue(who.d1.token);
      expect(res.status).toBe(200);
      expect(res.body.data.sections.available.items.map((o: { id: string }) => o.id)).toContain(ok.id);
      for (const [name, id] of Object.entries(bad)) expect(allIds(res), name).not.toContain(id);
    });

    it('7. a DISPATCHED order is listed only under "out for delivery" of its OWNER; another driver\'s READY and DISPATCHED work is not listed at all', async () => {
      const mine = await mkOrder();
      const theirs = await mkOrder();
      const theirsOut = await mkOrder({ status: 'DISPATCHED' });
      await assignRow(mine.id, who.d1.employeeId!);
      await assignRow(theirs.id, who.d2.employeeId!);
      await assignRow(theirsOut.id, who.d2.employeeId!, { status: 'IN_TRANSIT', pickupTime: new Date() });
      const res = await queue(who.d1.token);
      expect(res.body.data.sections.mine.items.map((o: { id: string }) => o.id)).toContain(mine.id);
      expect(allIds(res)).not.toContain(theirs.id);
      expect(allIds(res)).not.toContain(theirsOut.id);
      expect(res.body.data.sections.available.items.map((o: { id: string }) => o.id)).not.toContain(mine.id);
      const d2 = await queue(who.d2.token);
      expect(d2.body.data.sections.outForDelivery.items.map((o: { id: string }) => o.id)).toContain(theirsOut.id);
    });

    it('8. branch isolation from database scope: a foreign-branch driver sees nothing of branch A; no branch assignment = 403; multi-branch sees both; a foreign branchId is refused and audited', async () => {
      const a = await mkOrder();
      const b = await mkOrder({ kitchenBranchId: branchB.id });
      expect(allIds(await queue(who.dB.token))).not.toContain(a.id);
      expect(allIds(await queue(who.dB.token))).toContain(b.id);
      const none = await queue(who.dNone.token);
      expect(none.status).toBe(403);
      expect(none.body.error).toBe('NO_BRANCH_ASSIGNMENT');
      const both = await queue(who.dAB.token);
      expect(allIds(both)).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(both.body.data.branches.map((x: { id: string }) => x.id).sort()).toEqual([branchA.id, branchB.id].sort());
      const narrowed = await queue(who.dAB.token, `?branchId=${branchB.id}`);
      expect(allIds(narrowed)).toContain(b.id);
      expect(allIds(narrowed)).not.toContain(a.id);
      const denied = await queue(who.dB.token, `?branchId=${branchA.id}`);
      expect(denied.status).toBe(403);
      expect(denied.body.error).toBe('BRANCH_FORBIDDEN');
      expect(await prisma.auditLog.count({ where: { action: 'BRANCH_ACCESS_DENIED', userId: who.dB.id } })).toBeGreaterThan(0);
    });

    it('9. PRE-CLAIM DTO is an exact allow-list with area only: no name, phone, street, email, instructions, price, payment or refund data', async () => {
      const o = await mkOrder();
      await prisma.orderEvent.create({ data: { orderId: o.id, fromStatus: 'PREPARING', toStatus: 'READY', actorRole: 'CHEF' } });
      const res = await queue(who.d3.token);
      const dto = res.body.data.sections.available.items.find((x: { id: string }) => x.id === o.id);
      expect(Object.keys(dto).sort()).toEqual(['area', 'id', 'items', 'kitchenBranch', 'orderNumber', 'readyAt', 'status'].sort());
      expect(dto.area).toEqual({ city: 'Kochi', postalCode: '682001' });
      expect(Object.keys(dto.items[0]).sort()).toEqual(['id', 'quantity', 'title', 'variantName']);
      expect(dto.readyAt).not.toBeNull();
      expect(typeof res.body.data.serverTime).toBe('string');
      // whole payload (every item in the queue): none of the sentinel customer data
      piiAbsent(res);
      for (const word of ['paymentMethod', 'paymentStatus', 'netAmount', 'totalAmount', 'unitPrice', 'refund', 'providerPayment', 'passwordHash']) expect(text(res)).not.toContain(word);
    });

    it('10. POST-CLAIM DTO (assigned driver only) adds first name, phone, full snapshot address and instructions - and still no email, last name, prices or payment data', async () => {
      const o = await mkOrder();
      const c = await claim(who.d1.token, o.id);
      expect(c.status, text(c)).toBe(200);
      const dto = c.body.data.order;
      expect(Object.keys(dto).sort()).toEqual(['area', 'assignment', 'delivery', 'id', 'items', 'kitchenBranch', 'orderNumber', 'proof', 'readyAt', 'status'].sort());
      expect(Object.keys(dto.delivery).sort()).toEqual(['address', 'firstName', 'instructions', 'phone']);
      expect(dto.delivery).toMatchObject({ firstName: SECRET.first, phone: SECRET.phone, instructions: SECRET.instructions });
      expect(dto.delivery.address).toEqual({ line1: SECRET.street, line2: SECRET.line2, city: 'Kochi', state: 'Kerala', postalCode: '682001' });
      expect(dto.assignment).toEqual({ state: 'ASSIGNED', pickupTime: null, issueReported: false });
      for (const res of [c, await detail(who.d1.token, o.id), await queue(who.d1.token)]) {
        piiAbsent(res, ['first', 'phone', 'street', 'line2', 'instructions']);
        expect(text(res)).not.toContain(SECRET.last);
        for (const word of ['paymentMethod', 'paymentStatus', 'netAmount', 'unitPrice', 'refund', 'providerPayment']) expect(text(res)).not.toContain(word);
      }
    });

    it('11. another driver in the SAME branch gets none of the claimed order\'s private data: not in the queue, detail is 404, claim is 409, dispatch / report are 404', async () => {
      const o = await mkOrder();
      expect((await claim(who.d1.token, o.id)).status).toBe(200);
      const attempts = [await queue(who.d3.token), await detail(who.d3.token, o.id), await claim(who.d3.token, o.id), await dispatch(who.d3.token, o.id), await fail(who.d3.token, o.id)];
      expect(attempts.map((r) => r.status)).toEqual([200, 404, 409, 404, 404]);
      for (const r of attempts) piiAbsent(r);
      expect(allIds(attempts[0] as never)).not.toContain(o.id);
      // MD / SUPER_ADMIN monitoring is minimized too
      for (const label of ['md', 'admin']) piiAbsent(await monitor(who[label].token));
    });

    it('12. the delivery address comes from the IMMUTABLE order snapshot, not the customer\'s editable address book', async () => {
      const addr = await prisma.customerAddress.create({ data: { customerProfileId: who.custA.profileId!, addressLine1: SECRET.street, city: 'Kochi', postalCode: '682001' } });
      const o = await mkOrder({ deliveryAddressSnapshot: { addressId: addr.id, addressLine1: SECRET.street, city: 'Kochi', state: 'Kerala', postalCode: '682001', recipientName: SECRET.full, phone: SECRET.phone } });
      expect((await claim(who.d1.token, o.id)).status).toBe(200);
      await prisma.customerAddress.update({ where: { id: addr.id }, data: { addressLine1: 'Edited Later Road', city: 'Elsewhere', postalCode: '999999' } });
      const res = await detail(who.d1.token, o.id);
      expect(res.body.data.delivery.address).toMatchObject({ line1: SECRET.street, city: 'Kochi', postalCode: '682001' });
      expect(text(res)).not.toContain('Edited Later Road');
      // an order placed without instructions simply has none
      expect(res.body.data.delivery.instructions).toBeNull();
    });

    it('13. sections are bounded (100) with total / truncated, oldest-ready first, and the monitor groups orders correctly', async () => {
      const branchC = await prisma.kitchenBranch.create({ data: { code: `p9a-c-${ts}`, name: 'P9A Branch C', address: 'C', city: 'Kollam' } });
      await mkUser('dC', [RoleEnum.DELIVERY], [branchC.id]);
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
      const res = await queue(who.dC.token);
      expect(res.body.data.sectionLimit).toBe(100);
      expect(res.body.data.sections.available.items).toHaveLength(100);
      expect(res.body.data.sections.available.total).toBe(103);
      expect(res.body.data.sections.available.truncated).toBe(true);
      expect(res.body.data.sections.available.items[0].orderNumber).toBe(`P9A-${ts}-BULK-0`); // oldest first

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
      expect(excItem.assignment.driver).toMatchObject({ employeeId: who.dB.employeeId });
      piiAbsent(m);
    });
  });

  // ===================================================================================================== claim
  describe('claim', () => {
    it('14. a claim creates ONE assignment (driver, branch of the ORDER), audits DELIVERY_CLAIMED and changes nothing on the order', async () => {
      const o = await mkOrder();
      const before = await order(o.id);
      const res = await claim(who.d1.token, o.id);
      expect(res.status, text(res)).toBe(200);
      expect(res.body.data.changed).toBe(true);
      const row = await assignmentOf(o.id);
      expect(row).toMatchObject({ driverId: who.d1.employeeId, branchId: branchA.id, status: 'ASSIGNED', pickupTime: null });
      const after = await order(o.id);
      expect({ status: after.status, paymentStatus: after.paymentStatus, paymentMethod: after.paymentMethod, kitchenBranchId: after.kitchenBranchId }).toEqual({
        status: before.status,
        paymentStatus: before.paymentStatus,
        paymentMethod: before.paymentMethod,
        kitchenBranchId: before.kitchenBranchId
      });
      expect(await events(o.id)).toHaveLength(0);
      const audit = await audits('DELIVERY_CLAIMED', o.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].userId).toBe(who.d1.id);
    });

    it('15. an owner replay is a safe no-op (changed:false, no second audit row, still one assignment)', async () => {
      const o = await mkOrder();
      expect((await claim(who.d1.token, o.id)).body.data.changed).toBe(true);
      const again = await claim(who.d1.token, o.id);
      expect(again.status).toBe(200);
      expect(again.body.data.changed).toBe(false);
      expect(await audits('DELIVERY_CLAIMED', o.id)).toHaveLength(1);
      expect(await prisma.deliveryAssignment.count({ where: { orderId: o.id } })).toBe(1);
    });

    it('16. a second claimant gets 409 ALREADY_CLAIMED and the owner is unchanged; a null-owner assignment row is claimable', async () => {
      const o = await mkOrder();
      await claim(who.d1.token, o.id);
      const second = await claim(who.d2.token, o.id);
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('ALREADY_CLAIMED');
      expect((await assignmentOf(o.id))!.driverId).toBe(who.d1.employeeId);

      const nullOwner = await mkOrder();
      await assignRow(nullOwner.id, null);
      expect((await claim(who.d2.token, nullOwner.id)).body.data.changed).toBe(true);
      expect(await prisma.deliveryAssignment.count({ where: { orderId: nullOwner.id } })).toBe(1);
      expect((await assignmentOf(nullOwner.id))!.driverId).toBe(who.d2.employeeId);
    });

    it('17. not claimable states: a CONFIRMED order is 409; COD, unpaid, refunded, unrouted, foreign-branch and unknown orders are ONE indistinguishable 404 (existing ones audited)', async () => {
      const early = await mkOrder({ status: 'CONFIRMED' });
      const e = await claim(who.d1.token, early.id);
      expect(e.status).toBe(409);
      expect(e.body.error).toBe('ORDER_NOT_CLAIMABLE');

      const hidden = [
        await mkOrder({ paymentMethod: 'COD' }),
        await mkOrder({ paymentStatus: 'PENDING' }),
        await mkOrder({ paymentStatus: 'REFUNDED' }),
        await mkOrder({ kitchenBranchId: null }),
        await mkOrder({ kitchenBranchId: branchB.id })
      ];
      const unknown = await claim(who.d1.token, '00000000-0000-4000-8000-000000000000');
      expect(unknown.status).toBe(404);
      for (const o of hidden) {
        const r = await claim(who.d1.token, o.id);
        expect(r.status).toBe(404);
        expect(r.body).toEqual(unknown.body);
        expect(await assignmentOf(o.id)).toBeNull();
        expect(await prisma.auditLog.count({ where: { action: 'BRANCH_ACCESS_DENIED', entityId: o.id, userId: who.d1.id } })).toBe(1);
      }
      expect(await prisma.auditLog.count({ where: { action: 'BRANCH_ACCESS_DENIED', entityId: '00000000-0000-4000-8000-000000000000' } })).toBe(0);
    });

    it('18. SECURITY: no driver request can submit status, payment, amount, refund, customer, branch, driver, DELIVERED or any other field (strict bodies)', async () => {
      const o = await mkOrder();
      const forged: Array<Record<string, unknown>> = [
        { status: 'DISPATCHED' },
        { status: 'DELIVERED' },
        { orderStatus: 'DELIVERED' },
        { paymentStatus: 'PAID' },
        { paymentMethod: 'COD' },
        { amount: 1 },
        { refundAmount: 100 },
        { customerId: who.custA.profileId },
        { branchId: branchB.id },
        { kitchenBranchId: branchB.id },
        { driverId: who.d2.employeeId },
        { driverEmployeeId: who.d2.employeeId },
        { deliveryNotes: 'PBFAIL1:{"reasonCode":"OTHER"}' }
      ];
      for (const body of forged) {
        for (const send of [claim, dispatch]) {
          const r = await send(who.d1.token, o.id, body);
          expect(r.status, JSON.stringify(body)).toBe(422);
        }
        const f = await fail(who.d1.token, o.id, { reasonCode: 'OTHER', ...body });
        expect(f.status, JSON.stringify(body)).toBe(422);
      }
      expect(await assignmentOf(o.id)).toBeNull();
      const row = await order(o.id);
      expect(row).toMatchObject({ status: 'READY', paymentStatus: 'PAID', paymentMethod: 'ONLINE', kitchenBranchId: branchA.id });
    });

    it('19. database-authoritative branch scope: a driver whose branch assignment was removed loses access on the very next request', async () => {
      await mkUser('dTemp', [RoleEnum.DELIVERY], [branchA.id]);
      const o = await mkOrder();
      expect((await claim(who.dTemp.token, o.id)).status).toBe(200);
      await prisma.employeeBranchAssignment.deleteMany({ where: { employeeProfileId: who.dTemp.employeeId } });
      await prisma.employeeProfile.update({ where: { id: who.dTemp.employeeId }, data: { assignedBranchId: null } });
      const r = await dispatch(who.dTemp.token, o.id);
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('NO_BRANCH_ASSIGNMENT');
      expect((await order(o.id)).status).toBe('READY');
    });
  });

  // ===================================================================================================== dispatch
  describe('dispatch (READY -> DISPATCHED)', () => {
    it('20. the owner dispatches: Order DISPATCHED via the transition service (event + audit), assignment IN_TRANSIT with pickupTime; never PICKED_UP, never DELIVERED', async () => {
      const o = await mkOrder();
      await claim(who.d1.token, o.id);
      const res = await dispatch(who.d1.token, o.id);
      expect(res.status, text(res)).toBe(200);
      expect(res.body.data.changed).toBe(true);
      expect(res.body.data.order.status).toBe('DISPATCHED');
      expect(res.body.data.order.assignment).toMatchObject({ state: 'IN_TRANSIT', issueReported: false });
      expect((await order(o.id)).status).toBe('DISPATCHED');
      const row = await assignmentOf(o.id);
      expect(row!.status).toBe('IN_TRANSIT');
      expect(row!.pickupTime).not.toBeNull();
      expect(row!.deliveryTime).toBeNull();
      const ev = await events(o.id);
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ fromStatus: 'READY', toStatus: 'DISPATCHED', actorUserId: who.d1.id, actorRole: 'DELIVERY' });
      expect(await audits('ORDER_STATUS_CHANGED', o.id)).toHaveLength(1);
      expect((await order(o.id)).paymentStatus).toBe('PAID');
    });

    it('21. only the owner may dispatch: unclaimed, another driver\'s, a foreign-branch driver\'s and a non-existent order are the same 404; nothing changes', async () => {
      const unclaimed = await mkOrder();
      const owned = await mkOrder();
      await claim(who.d1.token, owned.id);
      const cases: Array<[string, string, string]> = [
        ['unclaimed', who.d1.token, unclaimed.id],
        ['other driver', who.d2.token, owned.id],
        ['foreign branch', who.dB.token, owned.id],
        ['unknown', who.d1.token, '00000000-0000-4000-8000-000000000000']
      ];
      for (const [name, token, id] of cases) {
        const r = await dispatch(token, id);
        expect(r.status, name).toBe(404);
        expect(r.body.error, name).toBe('ORDER_NOT_FOUND');
      }
      expect((await order(unclaimed.id)).status).toBe('READY');
      expect((await order(owned.id)).status).toBe('READY');
      expect((await assignmentOf(owned.id))!.status).toBe('ASSIGNED');
    });

    it('22. a dispatch replay is a no-op (changed:false, no second event or pickupTime change); an order that is not READY cannot be dispatched', async () => {
      const o = await mkOrder();
      await claim(who.d1.token, o.id);
      await dispatch(who.d1.token, o.id);
      const pickup = (await assignmentOf(o.id))!.pickupTime;
      const again = await dispatch(who.d1.token, o.id);
      expect(again.status).toBe(200);
      expect(again.body.data.changed).toBe(false);
      expect(await events(o.id)).toHaveLength(1);
      expect((await assignmentOf(o.id))!.pickupTime).toEqual(pickup);

      const early = await mkOrder({ status: 'PREPARING' });
      await assignRow(early.id, who.d1.employeeId!);
      const r = await dispatch(who.d1.token, early.id);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('INVALID_ORDER_TRANSITION');
      expect((await order(early.id)).status).toBe('PREPARING');
    });

    it('23. the payment gate is re-read under the order lock: a refund / payment change that commits before the dispatch makes it fail safely', async () => {
      const o = await mkOrder();
      await claim(who.d1.token, o.id);
      await prisma.order.update({ where: { id: o.id }, data: { paymentStatus: 'REFUNDED' } });
      const r = await dispatch(who.d1.token, o.id);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      expect((await order(o.id)).status).toBe('READY');
      expect((await assignmentOf(o.id))!.status).toBe('ASSIGNED');
      expect(await events(o.id)).toHaveLength(0);
      // ...and the order has dropped out of every queue
      expect(allIds(await queue(who.d1.token))).not.toContain(o.id);
    });

    it('24. concurrency: a payment change that holds the order lock while dispatch is already running wins - the dispatch then fails, nothing is half-applied', async () => {
      const o = await mkOrder();
      await claim(who.d1.token, o.id);
      let pending!: Promise<request.Response>;
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${o.id} FOR UPDATE`;
        await tx.order.updateMany({ where: { id: o.id }, data: { paymentStatus: 'REFUNDED' } });
        pending = Promise.resolve(dispatch(who.d1.token, o.id)).then((r) => r);
        await new Promise((r) => setTimeout(r, 400)); // the dispatch is now waiting on the row lock
      });
      const r = await pending;
      expect(r.status).toBe(409);
      expect((await order(o.id)).status).toBe('READY');
      expect((await assignmentOf(o.id))!.status).toBe('ASSIGNED');
    });
  });

  // ===================================================================================================== failure reporting
  describe('failure reporting', () => {
    const dispatched = async (driver = 'd1') => {
      const o = await mkOrder();
      expect((await claim(who[driver].token, o.id)).status).toBe(200);
      expect((await dispatch(who[driver].token, o.id)).status).toBe(200);
      return o;
    };

    it('25. the owner reports a failure: assignment FAILED, deliveryNotes in the ONE server format, Order stays DISPATCHED, no payment / refund / event change, audited', async () => {
      const o = await dispatched();
      const res = await fail(who.d1.token, o.id, { reasonCode: 'CUSTOMER_UNAVAILABLE', note: 'Rang the bell twice' });
      expect(res.status, text(res)).toBe(200);
      expect(res.body.data.changed).toBe(true);
      expect(res.body.data.order.assignment).toEqual({ state: 'FAILED', pickupTime: expect.any(String), issueReported: true });
      const row = await assignmentOf(o.id);
      expect(row!.status).toBe('FAILED');
      expect(row!.deliveryNotes).toBe('PBFAIL1:{"reasonCode":"CUSTOMER_UNAVAILABLE","note":"Rang the bell twice"}');
      const after = await order(o.id);
      expect(after).toMatchObject({ status: 'DISPATCHED', paymentStatus: 'PAID', paymentMethod: 'ONLINE', cancelledAt: null });
      expect(await events(o.id)).toHaveLength(1); // only the dispatch event
      expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(0);
      const audit = await audits('DELIVERY_FAILURE_REPORTED', o.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].payload).toMatchObject({ reasonCode: 'CUSTOMER_UNAVAILABLE' });
    });

    it('26. reasonCode is EXACTLY the five allowed codes; missing / unknown codes, a client-built deliveryNotes and extra keys are rejected and change nothing', async () => {
      const o = await dispatched();
      expect([...FAILURE_REASON_CODES]).toEqual(['CUSTOMER_UNAVAILABLE', 'CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'DELIVERY_REFUSED', 'OTHER']);
      for (const body of [{}, { reasonCode: 'NOPE' }, { reasonCode: 'customer_unavailable' }, { reasonCode: 'OTHER', deliveryNotes: 'PBFAIL1:{"reasonCode":"OTHER"}' }, { reasonCode: 'OTHER', status: 'CANCELLED' }, { reasonCode: 'OTHER', note: 5 }, { note: 'only a note' }]) {
        expect((await fail(who.d1.token, o.id, body)).status, JSON.stringify(body)).toBe(422);
      }
      expect((await assignmentOf(o.id))!.status).toBe('IN_TRANSIT');
      for (const code of FAILURE_REASON_CODES) {
        const each = await dispatched();
        expect((await fail(who.d1.token, each.id as string, { reasonCode: code })).status, code).toBe(200);
        expect((await assignmentOf(each.id))!.deliveryNotes).toBe(`PBFAIL1:{"reasonCode":"${code}"}`);
      }
    });

    it('27. the note is sanitized (control characters stripped, spaces collapsed, max 200) and the stored format round-trips even for hostile text', async () => {
      const o = await dispatched();
      const hostile = `  line1\r\nline2\t"quoted" PBFAIL1:{"reasonCode":"WRONG_ADDRESS"}\u0000​ ${'x'.repeat(400)}`;
      const res = await fail(who.d1.token, o.id, { reasonCode: 'OTHER', note: hostile });
      expect(res.status, text(res)).toBe(200);
      const stored = (await assignmentOf(o.id))!.deliveryNotes!;
      const parsed = parseFailureNote(stored)!;
      expect(parsed.reasonCode).toBe('OTHER'); // the injected prefix inside the note never changes the code
      expect(parsed.note!.length).toBeLessThanOrEqual(200);
      expect(parsed.note).toContain('line1 line2');
      // eslint-disable-next-line no-control-regex
      expect(parsed.note).not.toMatch(/[\u0000-\u001f\u007f​]/);
      expect(stored.startsWith(FAILURE_NOTE_PREFIX)).toBe(true);
      expect(serializeFailureNote(parsed.reasonCode, parsed.note)).toBe(stored);
    });

    it('28. the parser never trusts unknown formats: legacy free text, bad JSON, unknown reason codes and wrong types are all null', () => {
      for (const bad of [null, undefined, '', 'Customer was not home', 'PBFAIL1:', 'PBFAIL1:not json', 'PBFAIL1:[]', 'PBFAIL1:{"reasonCode":"HACKED"}', 'PBFAIL1:{"reasonCode":"OTHER","note":5}', 'PBFAIL2:{"reasonCode":"OTHER"}', ` ${serializeFailureNote('OTHER', null)}`]) {
        expect(parseFailureNote(bad as string | null | undefined), String(bad)).toBeNull();
      }
      expect(parseFailureNote(serializeFailureNote('DELIVERY_REFUSED', null))).toEqual({ reasonCode: 'DELIVERY_REFUSED', note: null });
    });

    it('29. only the OWNER of a DISPATCHED order can report: READY owner 409, others 404; a replay is a no-op that keeps the first reason', async () => {
      const ready = await mkOrder();
      await claim(who.d1.token, ready.id);
      const early = await fail(who.d1.token, ready.id);
      expect(early.status).toBe(409);
      expect(early.body.error).toBe('ORDER_NOT_DISPATCHED');

      const o = await dispatched();
      for (const label of ['d2', 'dB', 'dAB']) expect((await fail(who[label].token, o.id)).status, label).toBe(404);
      expect((await assignmentOf(o.id))!.status).toBe('IN_TRANSIT');
      expect((await fail(who.d1.token, o.id, { reasonCode: 'WRONG_ADDRESS' })).body.data.changed).toBe(true);
      const replay = await fail(who.d1.token, o.id, { reasonCode: 'OTHER', note: 'second' });
      expect(replay.status).toBe(200);
      expect(replay.body.data.changed).toBe(false);
      expect((await assignmentOf(o.id))!.deliveryNotes).toBe('PBFAIL1:{"reasonCode":"WRONG_ADDRESS"}');
      expect(await audits('DELIVERY_FAILURE_REPORTED', o.id)).toHaveLength(1);
    });

    it('30. exception visibility: SUPER_ADMIN (and read-only MD) see it in "exceptions"; the driver sees "issue reported"; there is no resolve action; the customer sees no failure details', async () => {
      const o = await dispatched();
      await fail(who.d1.token, o.id, { reasonCode: 'CUSTOMER_UNREACHABLE', note: 'Phone off' });
      for (const label of ['admin', 'md']) {
        const m = await monitor(who[label].token);
        const item = m.body.data.sections.exceptions.items.find((x: { id: string }) => x.id === o.id);
        expect(item.exception).toEqual({ reasonCode: 'CUSTOMER_UNREACHABLE', note: 'Phone off' });
        expect(m.body.data.sections.dispatched.items.map((x: { id: string }) => x.id)).not.toContain(o.id);
        piiAbsent(m);
      }
      const mine = (await queue(who.d1.token)).body.data.sections.outForDelivery.items.find((x: { id: string }) => x.id === o.id);
      expect(mine.assignment).toMatchObject({ state: 'FAILED', issueReported: true });
      for (const path of ['resolve', 'retry', 'cancel', 'refund', 'return-to-kitchen', 'deliver', 'delivered', 'complete']) {
        expect((await request(app).post(`/api/v1/delivery/orders/${o.id}/${path}`).set(bearer(who.d1.token)).send({})).status, path).toBe(404);
      }
      const customer = await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(who.custA.token));
      expect(customer.status).toBe(200);
      expect(customer.body.data.status).toBe('DISPATCHED');
      expect(text(customer)).not.toMatch(/PBFAIL1|CUSTOMER_UNREACHABLE|Phone off/);
    });

    it('31. after a failure the order stays DISPATCHED: dispatch is a no-op and it can no longer be assigned or unassigned', async () => {
      const o = await dispatched();
      await fail(who.d1.token, o.id);
      expect((await dispatch(who.d1.token, o.id)).body.data.changed).toBe(false);
      const r = await assign(o.id, { driverEmployeeId: null, expectedDriverId: who.d1.employeeId, reason });
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('ORDER_NOT_ASSIGNABLE');
      expect((await order(o.id)).status).toBe('DISPATCHED');
    });
  });

  // ===================================================================================================== SUPER_ADMIN assignment
  describe('SUPER_ADMIN assignment / reassignment / unassignment', () => {
    it('32. assign -> reassign -> unassign, each audited with its own action and reason, changing ONLY the assignment (order row untouched)', async () => {
      const o = await mkOrder();
      const before = await order(o.id);
      const a1 = await assign(o.id, { driverEmployeeId: who.d1.employeeId, expectedDriverId: null, reason });
      expect(a1.status, text(a1)).toBe(200);
      expect(a1.body.data).toMatchObject({ changed: true, action: 'ASSIGNED', previousDriverId: null, driverEmployeeId: who.d1.employeeId });
      expect(await assignmentOf(o.id)).toMatchObject({ driverId: who.d1.employeeId, branchId: branchA.id, status: 'ASSIGNED' });

      const a2 = await assign(o.id, { driverEmployeeId: who.d2.employeeId, expectedDriverId: who.d1.employeeId, reason });
      expect(a2.body.data).toMatchObject({ changed: true, action: 'REASSIGNED', previousDriverId: who.d1.employeeId });
      const a3 = await assign(o.id, { driverEmployeeId: null, expectedDriverId: who.d2.employeeId, reason });
      expect(a3.body.data).toMatchObject({ changed: true, action: 'UNASSIGNED', driverEmployeeId: null });
      expect((await assignmentOf(o.id))!.driverId).toBeNull();

      for (const [action, n] of [['DELIVERY_ASSIGNED', 1], ['DELIVERY_REASSIGNED', 1], ['DELIVERY_UNASSIGNED', 1]] as const) {
        const rows = await audits(action, o.id);
        expect(rows, action).toHaveLength(n);
        expect(rows[0].userId).toBe(who.admin.id);
        expect(rows[0].payload).toMatchObject({ reason });
      }
      const after = await order(o.id);
      expect({ status: after.status, paymentStatus: after.paymentStatus, paymentMethod: after.paymentMethod, netAmount: String(after.netAmount), kitchenBranchId: after.kitchenBranchId }).toEqual({
        status: before.status,
        paymentStatus: before.paymentStatus,
        paymentMethod: before.paymentMethod,
        netAmount: String(before.netAmount),
        kitchenBranchId: before.kitchenBranchId
      });
      expect(await events(o.id)).toHaveLength(0);
      // unassigned again = available again
      expect((await queue(who.d3.token)).body.data.sections.available.items.map((x: { id: string }) => x.id)).toContain(o.id);
    });

    it('33. a no-op writes nothing and no audit; a stale expectedDriverId is 409 DELIVERY_ASSIGNMENT_CHANGED', async () => {
      const o = await mkOrder();
      await assign(o.id, { driverEmployeeId: who.d1.employeeId, expectedDriverId: null, reason });
      const same = await assign(o.id, { driverEmployeeId: who.d1.employeeId, expectedDriverId: who.d1.employeeId, reason });
      expect(same.status).toBe(200);
      expect(same.body.data).toMatchObject({ changed: false, action: 'NONE' });
      expect(await audits('DELIVERY_ASSIGNED', o.id)).toHaveLength(1);
      const stale = await assign(o.id, { driverEmployeeId: who.d2.employeeId, expectedDriverId: null, reason });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe('DELIVERY_ASSIGNMENT_CHANGED');
      expect((await assignmentOf(o.id))!.driverId).toBe(who.d1.employeeId);
      const none = await assign(o.id, { driverEmployeeId: null, expectedDriverId: who.d2.employeeId, reason });
      expect(none.status).toBe(409);
    });

    it('34. validation: expectedDriverId key is required, uuids only, reason 3-200 and sanitized, and no other field (status / payment / amount) is accepted', async () => {
      const o = await mkOrder();
      const good = { driverEmployeeId: who.d1.employeeId, expectedDriverId: null, reason };
      for (const body of [
        { driverEmployeeId: who.d1.employeeId, reason },
        { ...good, driverEmployeeId: 'not-a-uuid' },
        { ...good, expectedDriverId: 'x' },
        { ...good, reason: 'ab' },
        { ...good, reason: '   ' },
        { ...good, reason: undefined },
        { ...good, status: 'DISPATCHED' },
        { ...good, paymentStatus: 'PAID' },
        { ...good, amount: 10 }
      ]) {
        expect((await assign(o.id, body as Record<string, unknown>)).status, JSON.stringify(body)).toBe(422);
      }
      expect(await assignmentOf(o.id)).toBeNull();
      const ok = await assign(o.id, { ...good, reason: '  needs\r\nthe closest\u0000   driver  ' });
      expect(ok.status).toBe(200);
      expect((await audits('DELIVERY_ASSIGNED', o.id))[0].payload).toMatchObject({ reason: 'needs the closest driver' });
    });

    it('35. the target must be an ACTIVE DELIVERY employee authorized for the order\'s branch (suspended, wrong role, wrong branch, unknown, customer all 422); a branch-assignment-only driver is fine', async () => {
      const o = await mkOrder();
      const body = (id: string | null | undefined) => ({ driverEmployeeId: id, expectedDriverId: null, reason });
      for (const [name, id] of [
        ['suspended', who.dSuspended.employeeId],
        ['chef', who.chef.employeeId],
        ['other branch', who.dB.employeeId],
        ['no branch', who.dNone.employeeId],
        ['unknown', '00000000-0000-4000-8000-000000000000']
      ] as const) {
        const r = await assign(o.id, body(id));
        expect(r.status, name).toBe(422);
        expect(r.body.error, name).toBe('DRIVER_INVALID');
      }
      expect(await assignmentOf(o.id)).toBeNull();
      expect((await assign(o.id, body(who.dAB.employeeId))).status).toBe(200);
    });

    it('36. only READY, eligible orders can be assigned: DISPATCHED, CONFIRMED, COD, unpaid and refunded are 409; an unknown order is 404; drivers never move after dispatch', async () => {
      const dispatchedOrder = await mkOrder();
      await claim(who.d1.token, dispatchedOrder.id);
      await dispatch(who.d1.token, dispatchedOrder.id);
      const targets = [dispatchedOrder, await mkOrder({ status: 'CONFIRMED' }), await mkOrder({ paymentMethod: 'COD' }), await mkOrder({ paymentStatus: 'PENDING' }), await mkOrder({ paymentStatus: 'REFUNDED' })];
      for (const t of targets) {
        const r = await assign(t.id, { driverEmployeeId: who.d2.employeeId, expectedDriverId: t === dispatchedOrder ? who.d1.employeeId : null, reason });
        expect(r.status, t.orderNumber).toBe(409);
        expect(r.body.error, t.orderNumber).toBe('ORDER_NOT_ASSIGNABLE');
      }
      expect((await assignmentOf(dispatchedOrder.id))!.driverId).toBe(who.d1.employeeId);
      expect((await assign('00000000-0000-4000-8000-000000000000', { driverEmployeeId: who.d2.employeeId, expectedDriverId: null, reason })).status).toBe(404);
    });

    it('37. an admin-assigned driver sees the full approved delivery data and can dispatch; other drivers still see nothing; SUPER_ADMIN still cannot dispatch or claim', async () => {
      const o = await mkOrder();
      await assign(o.id, { driverEmployeeId: who.d1.employeeId, expectedDriverId: null, reason });
      expect((await detail(who.d1.token, o.id)).body.data.delivery.phone).toBe(SECRET.phone);
      piiAbsent(await detail(who.d2.token, o.id));
      expect((await detail(who.d2.token, o.id)).status).toBe(404);
      expect((await claim(who.d2.token, o.id)).body.error).toBe('ALREADY_CLAIMED');
      expect((await dispatch(who.admin.token, o.id)).status).toBe(403);
      expect((await dispatch(who.d1.token, o.id)).status).toBe(200);
    });

    it('38. the assignable-driver list is limited to ACTIVE DELIVERY employees of that branch and carries staff identity only', async () => {
      const res = await request(app).get(`/api/v1/admin/delivery/drivers?branchId=${branchA.id}`).set(bearer(who.admin.token));
      expect(res.status).toBe(200);
      const ids = res.body.data.drivers.map((d: { employeeId: string }) => d.employeeId);
      expect(ids).toEqual(expect.arrayContaining([who.d1.employeeId, who.d2.employeeId, who.dAB.employeeId]));
      for (const excluded of [who.dB, who.dSuspended, who.chef, who.dNone]) expect(ids).not.toContain(excluded.employeeId);
      expect(Object.keys(res.body.data.drivers[0]).sort()).toEqual(['employeeCode', 'employeeId', 'fullName']);
      expect((await request(app).get('/api/v1/admin/delivery/drivers?branchId=nope').set(bearer(who.admin.token))).status).toBe(422);
    });
  });

  // ===================================================================================================== concurrency
  describe('database-decided concurrency', () => {
    it('39. two (three) drivers claim the same READY order at once: exactly one owner, the others 409 ALREADY_CLAIMED, one assignment row, one audit row', async () => {
      const o = await mkOrder();
      const rs = await Promise.all([claim(who.d1.token, o.id), claim(who.d2.token, o.id), claim(who.d3.token, o.id), claim(who.dAB.token, o.id)]);
      expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
      expect(rs.filter((r) => r.status === 409).every((r) => r.body.error === 'ALREADY_CLAIMED')).toBe(true);
      expect(rs.filter((r) => r.status === 200).length + rs.filter((r) => r.status === 409).length).toBe(4);
      expect(await prisma.deliveryAssignment.count({ where: { orderId: o.id } })).toBe(1);
      expect(await audits('DELIVERY_CLAIMED', o.id)).toHaveLength(1);
      const winner = (await assignmentOf(o.id))!.driverId;
      expect([who.d1, who.d2, who.d3, who.dAB].map((w) => w.employeeId)).toContain(winner);
    });

    it('40. the same owner claiming repeatedly at once (double click / two tabs) changes it exactly once', async () => {
      const o = await mkOrder();
      const rs = await Promise.all([claim(who.d1.token, o.id), claim(who.d1.token, o.id), claim(who.d1.token, o.id)]);
      expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(rs.filter((r) => r.body.data.changed)).toHaveLength(1);
      expect(await audits('DELIVERY_CLAIMED', o.id)).toHaveLength(1);
    });

    it('41. claim vs SUPER_ADMIN assignment: exactly one wins and the stored owner is the winner', async () => {
      for (let i = 0; i < 3; i++) {
        const o = await mkOrder();
        const [c, a] = await Promise.all([claim(who.d1.token, o.id), assign(o.id, { driverEmployeeId: who.d2.employeeId, expectedDriverId: null, reason })]);
        expect([c.status, a.status].filter((s) => s === 200)).toHaveLength(1);
        expect((await assignmentOf(o.id))!.driverId).toBe(c.status === 200 ? who.d1.employeeId : who.d2.employeeId);
      }
    });

    it('42. claim vs unassignment: the claim succeeds only if the unassignment came first; the final owner is consistent', async () => {
      for (let i = 0; i < 3; i++) {
        const o = await mkOrder();
        await assign(o.id, { driverEmployeeId: who.d2.employeeId, expectedDriverId: null, reason });
        const [c, u] = await Promise.all([claim(who.d1.token, o.id), assign(o.id, { driverEmployeeId: null, expectedDriverId: who.d2.employeeId, reason })]);
        expect(u.status).toBe(200);
        expect((await assignmentOf(o.id))!.driverId).toBe(c.status === 200 ? who.d1.employeeId : null);
        if (c.status !== 200) expect(c.body.error).toBe('ALREADY_CLAIMED');
      }
    });

    it('43. claim vs dispatch by the owner: the other driver can never take it (409) and the dispatch lands', async () => {
      const o = await mkOrder();
      await claim(who.d1.token, o.id);
      const [other, d] = await Promise.all([claim(who.d2.token, o.id), dispatch(who.d1.token, o.id)]);
      expect(other.status).toBe(409);
      expect(d.status).toBe(200);
      expect((await assignmentOf(o.id))!.driverId).toBe(who.d1.employeeId);
    });

    it('44. reassignment vs dispatch: exactly one wins; the final order / assignment pair is consistent (never DISPATCHED under the new driver, never READY under IN_TRANSIT)', async () => {
      for (let i = 0; i < 3; i++) {
        const o = await mkOrder();
        await claim(who.d1.token, o.id);
        const [d, r] = await Promise.all([dispatch(who.d1.token, o.id), assign(o.id, { driverEmployeeId: who.d2.employeeId, expectedDriverId: who.d1.employeeId, reason })]);
        expect([d.status, r.status].filter((s) => s === 200)).toHaveLength(1);
        const row = await assignmentOf(o.id);
        const ord = await order(o.id);
        if (d.status === 200) {
          expect(r.status).toBe(409);
          expect(r.body.error).toBe('ORDER_NOT_ASSIGNABLE');
          expect([ord.status, row!.driverId, row!.status]).toEqual(['DISPATCHED', who.d1.employeeId, 'IN_TRANSIT']);
        } else {
          expect(d.status).toBe(404);
          expect([ord.status, row!.driverId, row!.status]).toEqual(['READY', who.d2.employeeId, 'ASSIGNED']);
        }
      }
    });

    it('45. double dispatch at once (two tabs): one real transition, one OrderEvent, one audit row, a single pickupTime', async () => {
      const o = await mkOrder();
      await claim(who.d1.token, o.id);
      const rs = await Promise.all([dispatch(who.d1.token, o.id), dispatch(who.d1.token, o.id), dispatch(who.d1.token, o.id)]);
      expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(rs.filter((r) => r.body.data.changed)).toHaveLength(1);
      expect(await events(o.id)).toHaveLength(1);
      expect(await audits('ORDER_STATUS_CHANGED', o.id)).toHaveLength(1);
      expect((await assignmentOf(o.id))!.status).toBe('IN_TRANSIT');
    });

    it('46. stale cards: acting on an order whose state moved on gives clean safe errors (409 / 404), never a partial change', async () => {
      const o = await mkOrder();
      await claim(who.d1.token, o.id);
      await assign(o.id, { driverEmployeeId: who.d2.employeeId, expectedDriverId: who.d1.employeeId, reason });
      expect((await dispatch(who.d1.token, o.id)).status).toBe(404); // d1's card is stale: the order is d2's now
      expect((await claim(who.d1.token, o.id)).status).toBe(409);
      expect((await order(o.id)).status).toBe('READY');
      expect((await assignmentOf(o.id))!.driverId).toBe(who.d2.employeeId);
    });
  });

  // ===================================================================================================== MD
  describe('MD is read-only', () => {
    it('47. MD reads the minimized monitor of an explicit branch and can claim / assign / unassign / dispatch / report nothing', async () => {
      const o = await mkOrder();
      await claim(who.d1.token, o.id);
      const m = await monitor(who.md.token);
      expect(m.status).toBe(200);
      piiAbsent(m);
      const item = m.body.data.sections.assigned.items.find((x: { id: string }) => x.id === o.id);
      expect(Object.keys(item).sort()).toEqual(['area', 'assignment', 'exception', 'id', 'items', 'kitchenBranch', 'orderNumber', 'proofState', 'readyAt', 'status']);
      expect((await claim(who.md.token, o.id)).status).toBe(403);
      expect((await dispatch(who.md.token, o.id)).status).toBe(403);
      expect((await fail(who.md.token, o.id)).status).toBe(403);
      expect((await assign(o.id, { driverEmployeeId: null, expectedDriverId: who.d1.employeeId, reason }, who.md.token)).status).toBe(403);
      expect((await assignmentOf(o.id))!.driverId).toBe(who.d1.employeeId);
    });
  });

  // ===================================================================================================== DELIVERED unreachable / legacy
  describe('DELIVERED is unreachable and the legacy API is retired', () => {
    it('48. GET /delivery/assignments and PATCH /delivery/assignments/:id/status are 404 for EVERY role, including with a DELIVERED body', async () => {
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

    it('49. no HTTP route can mark an order delivered: every deliver-like path and verb is 404 for every role, and nothing changes', async () => {
      const o = await mkOrder({ status: 'DISPATCHED' });
      await assignRow(o.id, who.d1.employeeId!, { status: 'IN_TRANSIT' });
      for (const label of ['d1', 'admin', 'md', 'chef', 'custA']) {
        for (const path of ['deliver', 'delivered', 'mark-delivered', 'complete', 'proof-of-delivery', 'pod', 'status']) {
          for (const verb of ['post', 'put', 'patch'] as const) {
            const r = await request(app)[verb](`/api/v1/delivery/orders/${o.id}/${path}`).set(bearer(who[label].token)).send({ status: 'DELIVERED' });
            expect(r.status, `${verb} ${path} ${label}`).toBe(404);
          }
        }
        for (const verb of ['post', 'put', 'patch'] as const) {
          expect((await request(app)[verb](`/api/v1/orders/${o.id}/status`).set(bearer(who[label].token)).send({ status: 'DELIVERED' })).status, `orders ${verb} ${label}`).toBe(404);
        }
      }
      expect((await order(o.id)).status).toBe('DISPATCHED');
      expect((await assignmentOf(o.id))!.status).toBe('IN_TRANSIT');
    });

    it('50. the transition service refuses DELIVERED for DELIVERY, SUPER_ADMIN, MD, CHEF, the customer, SYSTEM and a PROOF actor without verified evidence (only the proof-backed party exists)', async () => {
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
      expect(ORDER_TRANSITIONS.DISPATCHED).toEqual(['DELIVERED']); // the edge itself stays for P9B
      expect(TRANSITION_PARTIES['DISPATCHED->DELIVERED']).toEqual(['DELIVERY_PROOF']);
      expect(TRANSITION_PARTIES['READY->DISPATCHED']).toEqual([RoleEnum.DELIVERY]);
    });

    it('51. static guard: no production source names DELIVERED outside the status catalogue, the transition service and the delivery PROOF service; the delivery module has no deliver route, no PICKED_UP and no payment-collection code', () => {
      const root = join(__dirname, '..');
      const offenders: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) {
            if (name === 'tests') continue;
            walk(full);
          } else if (full.endsWith('.ts') && ![join('order', 'orderStatus.ts'), join('order', 'orderTransition.service.ts'), join('delivery', 'deliveryProof.service.ts')].some((allowed) => full.endsWith(allowed))) {
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
        expect(code, file).not.toMatch(/cash|collect|settle|cod\b|payment(Status|Method)\s*:\s*['"]/i.source ? /cash|collect|settle|\bCOD\b/i : /x^/);
        expect(code, file).not.toMatch(/['"][^'"]*\/(deliver|delivered|mark-delivered|complete|pod|proof-of-delivery|status)['"]/i);
        expect(code, file).not.toMatch(/order\.(update|updateMany|upsert)\s*\(/);
      }
    });
  });

  // ===================================================================================================== retired KOT / misc
  describe('operational safety', () => {
    it('52. the Chef still cannot reach delivery and the delivery module never changes kitchen routing, payments or refunds', async () => {
      const o = await mkOrder();
      await claim(who.d1.token, o.id);
      await dispatch(who.d1.token, o.id);
      await fail(who.d1.token, o.id);
      const after = await order(o.id);
      expect(after).toMatchObject({ paymentStatus: 'PAID', paymentMethod: 'ONLINE', kitchenBranchId: branchA.id, cancelledAt: null });
      expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(0);
      expect(await prisma.payment.count({ where: { orderId: o.id } })).toBe(0);
      expect((await request(app).post(`/api/v1/kds/orders/${o.id}/mark-ready`).set(bearer(who.d1.token)).send({})).status).toBe(403);
    });
  });
});

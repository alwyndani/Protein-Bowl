import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * Customer order tracking: ONLY the owner can track an order; the tracking data is the server-derived order status, payment summary,
 * cancellation/refund state and the customer-safe delivery label (never the operator, driver, failure reason/notes, code, hash or any internal id).
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '2h' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('customer order tracking', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; email: string; token: string; profileId?: string };
  const who: Record<string, Who> = {};
  let branch: { id: string };

  const mkUser = async (label: string, roles: RoleEnum[]): Promise<void> => {
    const email = `track_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Track#Pass-2026-Long', 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer
          ? { customerProfile: { create: { fullName: `Customer ${label}`, referralCode: `PB-TRK${label.toUpperCase()}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `TRK-${label}-${ts}`, fullName: `Staff ${label}`, designation: 'Test' } } })
      },
      include: { customerProfile: true }
    });
    who[label] = { id: u.id, email, token: sign(u.id, email, roles), profileId: u.customerProfile?.id };
  };

  const mkOrder = async (owner: 'custA' | 'custB', status: string, delivery: Record<string, unknown> | null, over: Record<string, unknown> = {}) => {
    const n = ++seq;
    return prisma.order.create({
      data: {
        orderNumber: `TRK-${ts}-${n}`,
        totalAmount: 100,
        netAmount: '145.50',
        customerProfileId: who[owner].profileId,
        status,
        paymentStatus: 'PAID',
        paymentMethod: 'ONLINE',
        orderType: 'DIRECT',
        kitchenBranchId: branch.id,
        confirmedAt: new Date(),
        deliveryAddressSnapshot: { addressLine1: '12 Marine Drive', city: 'Kochi', postalCode: '682001' },
        items: { create: [{ itemTitle: `Bowl ${n}`, unitPrice: 100, quantity: 1, taxRate: 0.05, totalPrice: 100 }] },
        ...(delivery ? { delivery: { create: { branchId: branch.id, ...delivery } } } : {}),
        ...over
      } as never
    });
  };
  const get = (token: string | null, id: string) => {
    const r = request(app).get(`/api/v1/orders/${id}`);
    return token ? r.set(bearer(token)) : r;
  };
  const listOf = (body: { data: unknown }): Array<{ id: string }> => {
    const d = body.data as { items?: unknown[]; orders?: unknown[] } | unknown[];
    return (Array.isArray(d) ? d : d.items ?? d.orders ?? []) as Array<{ id: string }>;
  };

  beforeAll(async () => {
    branch = await prisma.kitchenBranch.create({ data: { code: `trk-${ts}`, name: 'Tracking Branch', address: 'A', city: 'Kochi' } });
    await mkUser('custA', [RoleEnum.CUSTOMER]);
    await mkUser('custB', [RoleEnum.CUSTOMER]);
    await mkUser('chef', [RoleEnum.CHEF]);
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('trainer', [RoleEnum.TRAINER]);
  }, 60000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('authentication: anonymous callers get 401 on both tracking reads', async () => {
    const o = await mkOrder('custA', 'CONFIRMED', null);
    expect((await get(null, o.id)).status).toBe(401);
    expect((await request(app).get('/api/v1/orders/my-orders')).status).toBe(401);
  });

  it('ownership: another customer gets the SAME 404 as for an unknown order, and never sees the order in their list', async () => {
    const o = await mkOrder('custA', 'CONFIRMED', null);
    const foreign = await get(who.custB.token, o.id);
    const unknown = await get(who.custB.token, '00000000-0000-4000-8000-000000000000');
    expect(foreign.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(foreign.body.error).toBe(unknown.body.error);
    expect(JSON.stringify(foreign.body)).not.toContain(o.orderNumber);
    const listB = await request(app).get('/api/v1/orders/my-orders').set(bearer(who.custB.token));
    expect(listB.status).toBe(200);
    expect(listOf(listB.body).map((x) => x.id)).not.toContain(o.id);
    const listA = await request(app).get('/api/v1/orders/my-orders').set(bearer(who.custA.token));
    expect(listOf(listA.body).map((x) => x.id)).toContain(o.id);
  });

  it('role: the customer tracking routes are CUSTOMER-only; staff accounts are refused with 403 even for an existing order', async () => {
    const o = await mkOrder('custA', 'CONFIRMED', null);
    for (const who2 of ['chef', 'admin', 'trainer']) {
      expect((await get(who[who2].token, o.id)).status, who2).toBe(403);
      expect((await request(app).get('/api/v1/orders/my-orders').set(bearer(who[who2].token))).status, who2).toBe(403);
    }
  });

  it('status and payment: the owner sees the server status, the PAID/ONLINE summary, the timeline, and no delivery label before dispatch', async () => {
    const o = await mkOrder('custA', 'PREPARING', null);
    const res = await get(who.custA.token, o.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: o.id, orderNumber: o.orderNumber, status: 'PREPARING', paymentStatus: 'PAID', paymentMethod: 'ONLINE', orderType: 'DIRECT' });
    expect(res.body.data.payment).toBeTruthy();
    expect(res.body.data.cancellation).toBeTruthy();
    expect(Array.isArray(res.body.data.timeline)).toBe(true);
    expect(res.body.data.delivery).toBeUndefined();
    expect(res.body.data.items).toHaveLength(1);
  });

  it('delivery label: ON_THE_WAY, DELIVERY_ISSUE, RETRY_PLANNED and DELIVERED, each with the attempt number and the maximum, on detail AND list', async () => {
    const cases: Array<[string, string, Record<string, unknown> | null, string, number]> = [
      ['DISPATCHED', 'ON_THE_WAY', { status: 'IN_TRANSIT', attemptNumber: 1, pickupTime: new Date() }, 'on the way', 1],
      ['DISPATCHED', 'DELIVERY_ISSUE', { status: 'FAILED', attemptNumber: 1, pickupTime: new Date(), failedAt: new Date() }, 'issue', 1],
      ['READY', 'RETRY_PLANNED', null, 'retry', 2],
      ['DELIVERED', 'DELIVERED', { status: 'DELIVERED', attemptNumber: 1, pickupTime: new Date(), deliveryTime: new Date() }, 'delivered', 1]
    ];
    for (const [status, expected, delivery, label, attempt] of cases) {
      // RETRY_PLANNED is a re-assigned job of a DISPATCHED order
      const o = expected === 'RETRY_PLANNED'
        ? await mkOrder('custA', 'DISPATCHED', { status: 'ASSIGNED', attemptNumber: 2, operatedByUserId: who.admin.id })
        : await mkOrder('custA', status, delivery);
      const res = await get(who.custA.token, o.id);
      expect(res.status, label).toBe(200);
      expect(res.body.data.status).toBe(expected === 'RETRY_PLANNED' ? 'DISPATCHED' : status);
      expect(res.body.data.delivery, label).toEqual({ state: expected, attemptNumber: attempt, maxAttempts: 3 });
      const listed = listOf((await request(app).get('/api/v1/orders/my-orders').set(bearer(who.custA.token))).body).find((x) => x.id === o.id) as { delivery?: unknown } | undefined;
      expect(listed?.delivery, `${label} (list)`).toEqual({ state: expected, attemptNumber: attempt, maxAttempts: 3 });
    }
  });

  it('privacy: the tracking payload never carries the operator, driver, failure reason or note, delivery code or hash, staff e-mail or internal ids', async () => {
    const notes = 'PBFAIL1:{"reasonCode":"CUSTOMER_UNREACHABLE","note":"Customer phone was off CANARY-NOTE"}';
    const o = await mkOrder('custA', 'DISPATCHED', { status: 'FAILED', attemptNumber: 1, pickupTime: new Date(), failedAt: new Date(), operatedByUserId: who.admin.id, deliveryNotes: notes });
    const detail = await get(who.custA.token, o.id);
    const list = await request(app).get('/api/v1/orders/my-orders').set(bearer(who.custA.token));
    for (const body of [JSON.stringify(detail.body), JSON.stringify(list.body)]) {
      expect(body).not.toContain('CANARY-NOTE');
      expect(body).not.toMatch(/CUSTOMER_UNREACHABLE|PBFAIL1|deliveryNotes|operatedBy|takenOverFrom|driverId|codeHash|verifiedBy|failedAt/);
      expect(body).not.toContain(who.admin.id);
      expect(body).not.toContain(who.admin.email);
    }
    expect(detail.body.data.delivery.state).toBe('DELIVERY_ISSUE');
  });

  it('a cancelled-as-undeliverable order is shown as UNDELIVERABLE_REFUND_PENDING with the attempt number', async () => {
    const o = await mkOrder('custA', 'CANCELLED', null, { cancelledAt: new Date() });
    await prisma.deliveryAttempt.create({ data: { orderId: o.id, attemptNumber: 3, outcome: 'UNDELIVERABLE_CANCELLED', failureReasonCode: 'OTHER', resolutionReasonCode: 'OTHER', proofCodeVersion: 1, resolvedByUserId: who.admin.id } });
    const res = await get(who.custA.token, o.id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.delivery).toEqual({ state: 'UNDELIVERABLE_REFUND_PENDING', attemptNumber: 3, maxAttempts: 3 });
  });

  it('read-only: tracking never changes the order, and other customers\' orders never receive another customer\'s delivery label', async () => {
    const a = await mkOrder('custA', 'DISPATCHED', { status: 'IN_TRANSIT', attemptNumber: 1, pickupTime: new Date() });
    const b = await mkOrder('custB', 'CONFIRMED', null);
    const before = await prisma.order.findUniqueOrThrow({ where: { id: a.id } });
    await get(who.custA.token, a.id);
    await request(app).get('/api/v1/orders/my-orders').set(bearer(who.custA.token));
    const after = await prisma.order.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.status).toBe('DISPATCHED');
    const bRes = await get(who.custB.token, b.id);
    expect(bRes.status).toBe(200);
    expect(bRes.body.data.delivery).toBeUndefined();
  });
});

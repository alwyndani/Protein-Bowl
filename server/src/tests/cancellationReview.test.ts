import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parsePaymentConfig, resetPaymentConfig, setPaymentConfigForTests } from '../config/paymentConfig.js';
import { getPaymentProvider } from '../modules/payment/providerRegistry.js';
import { MockPaymentProvider } from '../modules/payment/mock.provider.js';

/**
 * Staff-reviewed cancellation of PAID orders the kitchen has started: the customer only REQUESTS, SUPER_ADMIN decides,
 * an approval is one atomic cancellation + FULL refund intent, a failure rolls everything back. Real PostgreSQL, mock provider.
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const PASSWORD = 'Cr#Review-Pass-2026-xyz';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('staff-reviewed cancellation requests', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; token: string; profileId?: string };
  const who: Record<string, Who> = {};
  let branch: { id: string };
  let step = '';

  async function mkUser(label: string, roles: RoleEnum[], branchIds: string[] = []): Promise<Who> {
    const email = `cr_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer
          ? { customerProfile: { create: { fullName: `CR ${label}`, referralCode: `PB-CR${label.toUpperCase()}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `CR-${label}-${ts}`, fullName: `CR ${label}`, designation: 'Test', assignedBranchId: branchIds[0] ?? null } } })
      },
      include: { customerProfile: true, employeeProfile: true }
    });
    for (const branchId of branchIds) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile!.id, branchId } });
    return (who[label] = { id: u.id, token: sign(u.id, email, roles), profileId: u.customerProfile?.id });
  }

  /** A real PAID order (session + verification through the API), then moved to `status` as a test fixture. */
  async function paidOrder(status: string, customer = who.cust) {
    const n = ++seq;
    const order = await prisma.order.create({
      data: {
        orderNumber: `CR-${ts}-${n}`, totalAmount: 100, netAmount: '145.50', customerProfileId: customer.profileId, status: 'PENDING', paymentStatus: 'PENDING',
        paymentMethod: 'ONLINE', orderType: 'DIRECT', deliveryAddress: 'x', items: { create: [{ itemTitle: `Bowl ${n}`, sku: `S-${n}`, unitPrice: 100, quantity: 1, taxRate: 0.05, totalPrice: 100 }] }
      } as never
    });
    const s = await request(app).post(`/api/v1/orders/${order.id}/payment-attempts`).set(bearer(customer.token)).send({});
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const pay = mock.simulatePayment(s.body.data.providerOrderId, { status: 'CAPTURED' });
    const v = await request(app)
      .post(`/api/v1/orders/${order.id}/payment-attempts/${s.body.data.attemptId}/verify`)
      .set(bearer(customer.token))
      .send({ providerOrderId: s.body.data.providerOrderId, providerPaymentId: pay.providerPaymentId, signature: mock.signCheckout(s.body.data.providerOrderId, pay.providerPaymentId) });
    expect(v.status, JSON.stringify(v.body)).toBe(200);
    if (status !== 'CONFIRMED') await prisma.order.update({ where: { id: order.id }, data: { status, kitchenBranchId: branch.id } });
    return order;
  }

  const ask = (token: string, orderId: string, body: Record<string, unknown> = { reasonCode: 'CHANGED_MIND' }) => request(app).post(`/api/v1/orders/${orderId}/cancellation-request`).set(bearer(token)).send(body);
  const decide = (id: string, action: 'approve' | 'decline', body: Record<string, unknown> = {}, withStep = true) => {
    const r = request(app).post(`/api/v1/admin/cancellation-requests/${id}/${action}`).set(bearer(who.admin.token));
    return (withStep ? r.set('x-step-up-token', step) : r).send(body);
  };
  const orderView = async (token: string, id: string) => (await request(app).get(`/api/v1/orders/${id}`).set(bearer(token))).body.data;

  async function quiesce() {
    await prisma.payment.updateMany({ where: { provider: { not: null } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
    await prisma.refund.updateMany({ where: { status: { in: ['REQUESTED', 'SUBMITTING', 'UNKNOWN', 'PROCESSING'] } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
  }

  beforeAll(async () => {
    setPaymentConfigForTests(parsePaymentConfig({ PAYMENT_REFUND_INLINE_SUBMIT: 'false' }, 'test'));
    branch = await prisma.kitchenBranch.create({ data: { code: `cr-${ts}`, name: 'CR Branch', address: 'A', city: 'Kochi' } });
    await mkUser('cust', [RoleEnum.CUSTOMER]);
    await mkUser('other', [RoleEnum.CUSTOMER]);
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('chef', [RoleEnum.CHEF], [branch.id]);
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

  it('a CONFIRMED order uses the direct cancel route, not a request; unpaid and foreign orders are refused', async () => {
    const confirmed = await paidOrder('CONFIRMED');
    const r = await ask(who.cust.token, confirmed.id);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('CANCELLATION_REQUEST_NOT_ALLOWED');

    const unpaid = await prisma.order.create({ data: { orderNumber: `CR-U-${ts}`, totalAmount: 1, netAmount: 1, customerProfileId: who.cust.profileId, status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', orderType: 'DIRECT' } as never });
    expect((await ask(who.cust.token, unpaid.id)).status).toBe(409);

    const preparing = await paidOrder('PREPARING');
    expect((await ask(who.other.token, preparing.id)).status).toBe(404); // someone else's order is indistinguishable from a missing one
  });

  it('only the literal CUSTOMER role can request; staff cannot', async () => {
    const o = await paidOrder('PREPARING');
    for (const k of ['admin', 'chef']) expect((await ask(who[k].token, o.id)).status, k).toBe(403);
    expect((await request(app).post(`/api/v1/orders/${o.id}/cancellation-request`).send({ reasonCode: 'OTHER' })).status).toBe(401);
  });

  it('the request is validated strictly (typed reason, no money or status fields)', async () => {
    const o = await paidOrder('PREPARING');
    expect((await ask(who.cust.token, o.id, { reasonCode: 'NOPE' })).status).toBe(422);
    expect((await ask(who.cust.token, o.id, { reasonCode: 'OTHER', amount: 1 })).status).toBe(422);
    expect((await ask(who.cust.token, o.id, { reasonCode: 'OTHER', status: 'CANCELLED' })).status).toBe(422);
    expect(await prisma.cancellationRequest.count({ where: { orderId: o.id } })).toBe(0);
  });

  it('a request promises nothing: order unchanged, no refund, state REQUESTED; repeating it is idempotent', async () => {
    const o = await paidOrder('PREPARING');
    const before = await orderView(who.cust.token, o.id);
    expect(before.cancellationRequest).toEqual({ state: 'REQUESTABLE' });
    expect(before.cancellation.allowed).toBe(false);

    const first = await ask(who.cust.token, o.id, { reasonCode: 'WRONG_ORDER', note: 'please' });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const again = await ask(who.cust.token, o.id);
    expect(again.status).toBe(200);
    expect(again.body.data.requestId).toBe(first.body.data.requestId);
    expect(await prisma.cancellationRequest.count({ where: { orderId: o.id } })).toBe(1);

    const after = await orderView(who.cust.token, o.id);
    expect(after.status).toBe('PREPARING');
    expect(after.cancellationRequest).toEqual({ state: 'REQUESTED' });
    expect(after.refund.state).toBe('NO_REFUND');
    expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(0);
  });

  it('only SUPER_ADMIN sees and decides requests, and a decision needs a fresh step-up proof', async () => {
    const o = await paidOrder('READY');
    const req = (await ask(who.cust.token, o.id)).body.data.requestId as string;
    for (const k of ['cust', 'chef']) {
      expect((await request(app).get('/api/v1/admin/cancellation-requests').set(bearer(who[k].token))).status, k).toBe(403);
      expect((await request(app).post(`/api/v1/admin/cancellation-requests/${req}/approve`).set(bearer(who[k].token)).send({})).status, k).toBe(403);
    }
    // The queue is oldest-first and paged; earlier runs on this shared test database leave PENDING rows, so walk the pages until the new one appears.
    const seen: string[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const list = await request(app).get(`/api/v1/admin/cancellation-requests?status=PENDING&pageSize=100&page=${page}`).set(bearer(who.admin.token));
      expect(list.status).toBe(200);
      seen.push(...list.body.data.items.map((i: { id: string }) => i.id));
      totalPages = list.body.data.totalPages;
      page += 1;
    } while (page <= totalPages && !seen.includes(req));
    expect(seen).toContain(req);

    const noStep = await decide(req, 'approve', {}, false);
    expect(noStep.status).toBeGreaterThanOrEqual(400);
    expect(noStep.status).toBeLessThan(500);
    expect((await prisma.cancellationRequest.findUniqueOrThrow({ where: { id: req } })).status).toBe('PENDING');
  });

  it('declining needs an explanation, changes nothing about the order, and blocks a second request', async () => {
    const o = await paidOrder('PREPARING');
    const req = (await ask(who.cust.token, o.id)).body.data.requestId as string;
    expect((await decide(req, 'decline', {})).status).toBe(422);
    expect((await decide(req, 'decline', { note: 'ok' })).status).toBe(422); // too short to be an explanation

    const d = await decide(req, 'decline', { note: 'The meal is already cooked and on its way.' });
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    expect((await decide(req, 'decline', { note: 'The meal is already cooked and on its way.' })).body.data.alreadyDeclined).toBe(true);

    const view = await orderView(who.cust.token, o.id);
    expect(view.status).toBe('PREPARING');
    expect(view.cancellationRequest).toEqual({ state: 'DECLINED', declinedReason: 'The meal is already cooked and on its way.' });
    expect(view.refund.state).toBe('NO_REFUND');
    expect((await ask(who.cust.token, o.id)).body.error).toBe('CANCELLATION_REQUEST_DECLINED');
    expect((await decide(req, 'approve', {})).body.error).toBe('CANCELLATION_REQUEST_DECIDED');
  });

  it('approving cancels the order and creates ONE full refund intent atomically; the customer sees an accurate refund state', async () => {
    const o = await paidOrder('PREPARING');
    const req = (await ask(who.cust.token, o.id, { reasonCode: 'CHANGED_MIND' })).body.data.requestId as string;
    const ok = await decide(req, 'approve', { note: 'Approved' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(order.status).toBe('CANCELLED');
    const refunds = await prisma.refund.findMany({ where: { orderId: o.id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].status).toBe('REQUESTED');
    expect(refunds[0].amount.toFixed(2)).toBe('145.50'); // the COMPLETE captured amount, decided by the server
    expect((await prisma.cancellationRequest.findUniqueOrThrow({ where: { id: req } })).status).toBe('APPROVED');
    expect(await prisma.auditLog.count({ where: { entityId: o.id, action: { in: ['CANCELLATION_REQUESTED', 'CANCELLATION_REQUEST_APPROVED', 'ORDER_STATUS_CHANGED'] } } })).toBeGreaterThanOrEqual(3);

    const view = await orderView(who.cust.token, o.id);
    expect(view.status).toBe('CANCELLED');
    expect(view.refund.state).toBe('REFUND_PENDING'); // honest: requested, not yet refunded
    expect(view.cancellationRequest).toBeUndefined();

    const again = await decide(req, 'approve', {});
    expect(again.status).toBe(200);
    expect(again.body.data.alreadyApproved).toBe(true);
    expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(1); // no second refund
  });

  it('if the approval cannot complete, everything rolls back and the request stays PENDING', async () => {
    const o = await paidOrder('PREPARING');
    const req = (await ask(who.cust.token, o.id)).body.data.requestId as string;
    await prisma.order.update({ where: { id: o.id }, data: { status: 'DISPATCHED' } }); // the order moved on meanwhile
    const r = await decide(req, 'approve', {});
    expect(r.status).toBe(409);
    expect((await prisma.cancellationRequest.findUniqueOrThrow({ where: { id: req } })).status).toBe('PENDING');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('DISPATCHED');
    expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(0);
  });

  it('concurrent approvals produce exactly one cancellation and one refund', async () => {
    const o = await paidOrder('READY');
    const req = (await ask(who.cust.token, o.id)).body.data.requestId as string;
    const results = await Promise.all([1, 2, 3].map(() => decide(req, 'approve', {})));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('CANCELLED');
  });

  it('the generic admin cancel route still refuses a paid PREPARING order: only an approved request can cancel it', async () => {
    const o = await paidOrder('PREPARING');
    const r = await request(app).post(`/api/v1/admin/orders/${o.id}/cancel`).set(bearer(who.admin.token)).set('x-step-up-token', step).send({ reasonCode: 'OPERATIONAL_ISSUE' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('CANCELLATION_STATE_NOT_SUPPORTED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PREPARING');
  });
});

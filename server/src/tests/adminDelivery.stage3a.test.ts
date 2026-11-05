import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPaymentProvider } from '../modules/payment/providerRegistry.js';
import { MockPaymentProvider } from '../modules/payment/mock.provider.js';
import { roleHasPermission } from '../authz/permissions.js';
import { TRANSITION_PARTIES } from '../modules/order/orderStatus.js';
import { serializeFailureNote, parseFailureNote, FAILURE_REASON_CODES, FAILURE_NOTE_PREFIX } from '../modules/delivery/delivery.dto.js';

/**
 * Role simplification, Stage 3a: SUPER_ADMIN operates direct-order delivery (dispatch, takeover, verify the customer's code, report a failure, retry, resume).
 * The DELIVERY driver workflow no longer exists (B2a), so legacy driver-owned jobs are written directly as fixtures. Real PostgreSQL. Every state-changing action needs a fresh step-up proof; ownership is exactly one of driver / administrator;
 * historical rows are never rewritten; the Delivery Code logic is the single shared implementation.
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const PASSWORD = 'S3a#Operate-Delivery-Pass-2026';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '2h' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Stage 3a - SUPER_ADMIN delivery operations', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; email: string; token: string; profileId?: string; employeeId?: string };
  const who: Record<string, Who> = {};
  let branchA: { id: string };
  const steps: Record<string, string> = {};

  async function mkUser(label: string, roles: RoleEnum[], branchIds: string[] = []): Promise<Who> {
    const email = `s3a_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer
          ? { customerProfile: { create: { fullName: `Customer ${label}`, referralCode: `PB-S3A${label.toUpperCase()}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `S3A-${label}-${ts}`, fullName: `S3A ${label}`, designation: 'Test', assignedBranchId: branchIds[0] ?? null } } })
      },
      include: { customerProfile: true, employeeProfile: true }
    });
    for (const branchId of branchIds) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile!.id, branchId } });
    who[label] = { id: u.id, email, token: sign(u.id, email, roles), profileId: u.customerProfile?.id, employeeId: u.employeeProfile?.id };
    return who[label];
  }
  async function stepFor(label: string) {
    if (!steps[label]) {
      const su = await request(app).post('/api/v1/admin/step-up').set(bearer(who[label].token)).send({ password: PASSWORD });
      expect(su.status, JSON.stringify(su.body)).toBe(200);
      steps[label] = su.body.data.stepUpToken;
    }
    return steps[label];
  }

  /** A DIRECT + ONLINE + PAID order owned by custA in the given state; `delivery` is the assignment (none = unclaimed). */
  const order = async (status: 'READY' | 'DISPATCHED', delivery: Record<string, unknown> | null, over: Record<string, unknown> = {}) => {
    const n = ++seq;
    return prisma.order.create({
      data: {
        orderNumber: `S3A-${ts}-${n}`,
        totalAmount: 100,
        netAmount: '145.50',
        customerProfileId: who.custA.profileId,
        status,
        paymentStatus: 'PAID',
        paymentMethod: 'ONLINE',
        orderType: 'DIRECT',
        kitchenBranchId: branchA.id,
        confirmedAt: new Date(),
        deliveryAddressSnapshot: { addressLine1: '12 Secret Street', city: 'Kochi', postalCode: '682001', recipientName: 'Asha Verma-Secret', phone: '+91 98765 43210' },
        items: { create: [{ itemTitle: `Bowl ${n}`, unitPrice: 100, quantity: 1, taxRate: 0.05, totalPrice: 100 }] },
        ...(delivery ? { delivery: { create: { branchId: branchA.id, ...delivery } } } : {}),
        ...over
      } as never
    });
  };
  const ready = (over: Record<string, unknown> = {}) => order('READY', null, over);
  const byDriver = (status = 'IN_TRANSIT', extra: Record<string, unknown> = {}) =>
    order(status === 'ASSIGNED' ? 'READY' : 'DISPATCHED', { driverId: who.d1.employeeId, status, pickupTime: status === 'ASSIGNED' ? null : new Date(), ...extra });
  const byAdmin = (status = 'IN_TRANSIT', extra: Record<string, unknown> = {}) =>
    order(status === 'ASSIGNED' ? 'READY' : 'DISPATCHED', { driverId: null, operatedByUserId: who.admin.id, status, pickupTime: status === 'ASSIGNED' ? null : new Date(), ...extra });

  const path = (id: string, action = '') => `/api/v1/admin/delivery/orders/${id}${action ? '/' + action : ''}`;
  const post = async (id: string, action: string, body: unknown = {}, label = 'admin', stepToken: string | null | undefined = undefined) => {
    const r = request(app).post(path(id, action)).set(bearer(who[label].token));
    const s = stepToken === undefined ? await stepFor(label) : stepToken;
    return (s ? r.set('x-step-up-token', s) : r).send(body as object);
  };
  const dispatch = (id: string, label = 'admin') => post(id, 'dispatch', {}, label);
  const takeover = (id: string, body: Record<string, unknown> = {}, label = 'admin') => post(id, 'takeover', { expectedDriverId: who.d1.employeeId, reason: 'Driver account retired', ...body }, label);
  const verify = (id: string, code: unknown, label = 'admin') => post(id, 'verify-delivery', { code }, label);
  const report = (id: string, body: Record<string, unknown> = { reasonCode: 'CUSTOMER_UNAVAILABLE', note: 'Phone off' }, label = 'admin') => post(id, 'report-failure', body, label);
  const retry = (id: string, body: Record<string, unknown> = {}, label = 'admin') => post(id, 'retry', { expectedAttemptNumber: 1, reasonCode: 'CUSTOMER_AVAILABLE_NOW', ...body }, label);
  const resume = (id: string, label = 'admin') => post(id, 'resume', {}, label);
  const cIssue = (token: string, id: string) => request(app).post(`/api/v1/orders/${id}/delivery-code`).set(bearer(token)).send({});
  const issued = async (orderId: string) => {
    const r = await cIssue(who.custA.token, orderId);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.data.code as string;
  };
  const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

  const orderOf = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
  const assignmentOf = (orderId: string) => prisma.deliveryAssignment.findUniqueOrThrow({ where: { orderId } });
  const proofOf = (orderId: string) => prisma.deliveryProof.findUnique({ where: { orderId } });
  const attemptsOf = (orderId: string) => prisma.deliveryAttempt.findMany({ where: { orderId }, orderBy: { attemptNumber: 'asc' } });
  const events = (orderId: string) => prisma.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  const audits = (entityId: string, action?: string) => prisma.auditLog.findMany({ where: { entityId, ...(action ? { action } : {}) } });
  const text = (res: { body: unknown }) => JSON.stringify(res.body);

  beforeAll(async () => {
    branchA = await prisma.kitchenBranch.create({ data: { code: `s3a-a-${ts}`, name: 'S3A Branch A', address: 'A', city: 'Kochi' } });
    await mkUser('custA', [RoleEnum.CUSTOMER]);
    await mkUser('custB', [RoleEnum.CUSTOMER]);
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('admin2', [RoleEnum.SUPER_ADMIN]);
    await mkUser('md', [RoleEnum.MD]);
    await mkUser('chef', [RoleEnum.CHEF], [branchA.id]);
    await mkUser('d1', [RoleEnum.DELIVERY], [branchA.id]);
    await mkUser('d2', [RoleEnum.DELIVERY], [branchA.id]);
  }, 60000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await prisma.payment.updateMany({ where: { provider: { not: null } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
    await prisma.refund.updateMany({ where: { status: { in: ['REQUESTED', 'SUBMITTING', 'UNKNOWN', 'PROCESSING'] } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
    await prisma.$disconnect();
  });

  // ===================================================================================================== authorization and step-up
  describe('authorization and step-up', () => {
    it('1. the permission is SUPER_ADMIN-only; DELIVERY (retired), CHEF, customers and the retired MD hold none', () => {
      expect(roleHasPermission(RoleEnum.SUPER_ADMIN, 'delivery:operate')).toBe(true);
      expect(roleHasPermission(RoleEnum.SUPER_ADMIN, 'mess:delivery:operate')).toBe(true);
      for (const r of [RoleEnum.DELIVERY, RoleEnum.CHEF, RoleEnum.PROCUREMENT, RoleEnum.NUTRITIONIST, RoleEnum.TRAINER, RoleEnum.CUSTOMER, RoleEnum.MD]) {
        expect(roleHasPermission(r, 'delivery:operate'), r).toBe(false);
        expect(roleHasPermission(r, 'mess:delivery:operate'), r).toBe(false);
      }
      expect(TRANSITION_PARTIES['READY->DISPATCHED']).toEqual([RoleEnum.SUPER_ADMIN]); // B2a: the driver party is gone
      expect(TRANSITION_PARTIES['DISPATCHED->DELIVERED']).toEqual(['DELIVERY_PROOF']); // still only a verified proof
    });

    it('2. every endpoint refuses anonymous (401) and every non-administrator (403), changing nothing', async () => {
      const o = await ready();
      const actions: Array<[string, Record<string, unknown>]> = [['dispatch', {}], ['takeover', { expectedDriverId: who.d1.employeeId, reason: 'x y z' }], ['verify-delivery', { code: '123456' }], ['report-failure', { reasonCode: 'OTHER' }], ['retry', { expectedAttemptNumber: 1, reasonCode: 'OTHER' }], ['resume', {}]];
      for (const [action, body] of actions) {
        expect((await request(app).post(path(o.id, action)).send(body)).status, `anon ${action}`).toBe(401);
        for (const label of ['custA', 'chef', 'd1', 'md']) {
          const r = await request(app).post(path(o.id, action)).set(bearer(who[label].token)).send(body);
          expect([label, action, r.status]).toEqual([label, action, 403]);
        }
      }
      for (const label of ['custA', 'chef', 'd1', 'md']) expect((await request(app).get(path(o.id)).set(bearer(who[label].token))).status, label).toBe(403);
      expect((await request(app).get(path(o.id))).status).toBe(401);
      expect((await orderOf(o.id)).status).toBe('READY');
      expect(await prisma.deliveryAssignment.count({ where: { orderId: o.id } })).toBe(0);
    });

    it('3. EVERY state-changing action needs a fresh step-up proof (missing and invalid proofs are refused; reading does not need one)', async () => {
      const o = await byAdmin();
      const bodies: Array<[string, Record<string, unknown>]> = [['dispatch', {}], ['takeover', { expectedDriverId: who.d1.employeeId, reason: 'reason' }], ['verify-delivery', { code: '123456' }], ['report-failure', { reasonCode: 'OTHER' }], ['retry', { expectedAttemptNumber: 1, reasonCode: 'OTHER' }], ['resume', {}]];
      for (const [action, body] of bodies) {
        const none = await post(o.id, action, body, 'admin', null);
        expect([action, none.status, none.body.error]).toEqual([action, 403, 'STEP_UP_REQUIRED']);
        const bogus = await post(o.id, action, body, 'admin', 'not-a-proof');
        expect([action, bogus.status]).toEqual([action, 403]);
      }
      expect((await assignmentOf(o.id)).status).toBe('IN_TRANSIT');
      expect(await prisma.deliveryProof.count({ where: { orderId: o.id } })).toBe(0);
      expect((await request(app).get(path(o.id)).set(bearer(who.admin.token))).status).toBe(200); // read-only needs no step-up
    });

    it('4. strict bodies: status / payment / amount / branch / driver fields are rejected, never ignored', async () => {
      const o = await ready();
      for (const extra of [{ status: 'DELIVERED' }, { paymentStatus: 'PAID' }, { amount: 1 }, { branchId: branchA.id }, { driverId: who.d1.employeeId }]) {
        expect((await post(o.id, 'dispatch', extra)).status, JSON.stringify(extra)).toBe(422);
      }
      expect((await post(o.id, 'report-failure', { reasonCode: 'OTHER', status: 'DELIVERED' })).status).toBe(422);
      expect((await post(o.id, 'report-failure', { reasonCode: 'NOT_A_REASON' })).status).toBe(422);
      expect((await post(o.id, 'retry', { expectedAttemptNumber: 1, reasonCode: 'OTHER', driverEmployeeId: who.d1.employeeId })).status).toBe(422);
      expect((await orderOf(o.id)).status).toBe('READY');
    });
  });

  // ===================================================================================================== dispatch
  describe('dispatch', () => {
    it('5. READY -> DISPATCHED: assignment operated by the administrator (no driver), event + audit attribute the real SUPER_ADMIN, replay is changed:false', async () => {
      const o = await ready();
      const r = await dispatch(o.id);
      expect(r.status, text(r)).toBe(200);
      expect(r.body.data.changed).toBe(true);
      expect(r.body.data.order).toMatchObject({ id: o.id, status: 'DISPATCHED', assignment: { state: 'IN_TRANSIT', attemptNumber: 1 } });
      expect(await orderOf(o.id)).toMatchObject({ status: 'DISPATCHED', paymentStatus: 'PAID' });
      expect(await assignmentOf(o.id)).toMatchObject({ driverId: null, operatedByUserId: who.admin.id, takenOverFromDriverId: null, status: 'IN_TRANSIT' });
      const ev = (await events(o.id)).filter((e) => e.toStatus === 'DISPATCHED');
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ actorUserId: who.admin.id, actorRole: 'SUPER_ADMIN' });
      const a = await audits(o.id, 'DELIVERY_DISPATCHED_BY_ADMIN');
      expect(a).toHaveLength(1);
      expect(a[0].userId).toBe(who.admin.id);
      const again = await dispatch(o.id, 'admin2');
      expect(again.status).toBe(200);
      expect(again.body.data.changed).toBe(false);
      expect((await events(o.id)).filter((e) => e.toStatus === 'DISPATCHED')).toHaveLength(1);
    });

    it('6. the operated order DTO carries the approved delivery data and NEVER a code, hash, payment, refund, email or price', async () => {
      const o = await byAdmin();
      await issued(o.id);
      const r = await request(app).get(path(o.id)).set(bearer(who.admin.token));
      expect(r.status).toBe(200);
      const t = text(r);
      expect(r.body.data.order.delivery).toMatchObject({ firstName: 'Asha', phone: '+91 98765 43210' });
      expect(t).not.toMatch(/codeHash|"code"\s*:\s*"\d{6}"|paymentStatus|paymentMethod|refund|@test\.com|netAmount|unitPrice/i);
      // an order nobody operates (or a driver owns) is not exposed through this read
      const d = await byDriver();
      expect((await request(app).get(path(d.id)).set(bearer(who.admin.token))).status).toBe(404);
      expect((await request(app).get(path('00000000-0000-4000-8000-000000000000')).set(bearer(who.admin.token))).status).toBe(404);
    });

    it('7. ineligible orders are refused and nothing is created: unpaid, refunded, historical COD, unrouted, not READY, unknown', async () => {
      const bad: Record<string, string> = {};
      bad.unpaid = (await ready({ paymentStatus: 'PENDING' })).id;
      bad.refunded = (await ready({ paymentStatus: 'REFUNDED' })).id;
      bad.cod = (await ready({ paymentMethod: 'COD' })).id;
      bad.unrouted = (await ready({ kitchenBranchId: null })).id;
      bad.confirmed = (await ready({ status: 'CONFIRMED' })).id;
      for (const [k, id] of Object.entries(bad)) {
        const r = await dispatch(id);
        expect([k, r.status]).toEqual([k, 409]);
        expect(await prisma.deliveryAssignment.count({ where: { orderId: id } }), k).toBe(0);
        expect((await orderOf(id)).status, k).not.toBe('DISPATCHED');
      }
      expect((await dispatch('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    });

    it('8. a payment refunded between loading and dispatching is re-read under the order lock: the dispatch is refused', async () => {
      const o = await ready();
      await prisma.order.update({ where: { id: o.id }, data: { paymentStatus: 'REFUNDED' } });
      const r = await dispatch(o.id);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      expect((await orderOf(o.id)).status).toBe('READY');
    });

    it('9. a job a driver owns cannot be dispatched, verified, reported, retried or resumed by an administrator (take it over first)', async () => {
      const o = await byDriver('ASSIGNED');
      expect((await dispatch(o.id)).body.error).toBe('DELIVERY_OWNED_BY_DRIVER');
      const d = await byDriver('IN_TRANSIT');
      for (const [action, body] of [['verify-delivery', { code: '123456' }], ['report-failure', { reasonCode: 'OTHER' }], ['resume', {}], ['retry', { expectedAttemptNumber: 1, reasonCode: 'OTHER' }]] as const) {
        const r = await post(d.id, action, body);
        expect([action, r.status, r.body.error]).toEqual([action, 409, 'DELIVERY_OWNED_BY_DRIVER']);
      }
      expect(await assignmentOf(d.id)).toMatchObject({ driverId: who.d1.employeeId, operatedByUserId: null, status: 'IN_TRANSIT' });
    });

    it('10. concurrent dispatches by two administrators have exactly ONE effect', async () => {
      const o = await ready();
      const [a, b] = await Promise.all([dispatch(o.id, 'admin'), dispatch(o.id, 'admin2')]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect([a.body.data.changed, b.body.data.changed].filter(Boolean)).toHaveLength(1);
      expect((await events(o.id)).filter((e) => e.toStatus === 'DISPATCHED')).toHaveLength(1);
      expect(await prisma.deliveryAssignment.count({ where: { orderId: o.id } })).toBe(1);
    });

    it('11. an administrator-operated READY job (after a takeover) cannot be claimed by a driver or assigned to one: both routes no longer exist', async () => {
      const o = await byAdmin('ASSIGNED');
      const claim = await request(app).post(`/api/v1/delivery/orders/${o.id}/claim`).set(bearer(who.d2.token)).send({});
      expect(claim.status).toBe(404);
      const assign = await request(app)
        .put(`/api/v1/admin/orders/${o.id}/delivery-assignment`)
        .set(bearer(who.admin.token))
        .set('x-step-up-token', await stepFor('admin'))
        .send({ driverEmployeeId: who.d2.employeeId, expectedDriverId: null, reason: 'try to hand a job to a driver' });
      expect(assign.status).toBe(404);
      expect(await assignmentOf(o.id)).toMatchObject({ driverId: null, operatedByUserId: who.admin.id });
    });
  });

  // ===================================================================================================== takeover
  describe('takeover from a legacy driver', () => {
    it('12. moves ONLY the live row: status, attempt, timestamps, notes and the code state are untouched; the previous driver is recorded; the audit names the admin', async () => {
      const o = await byDriver('IN_TRANSIT');
      const before = await assignmentOf(o.id);
      const r = await takeover(o.id);
      expect(r.status, text(r)).toBe(200);
      expect(r.body.data.changed).toBe(true);
      const after = await assignmentOf(o.id);
      expect(after).toMatchObject({ driverId: null, operatedByUserId: who.admin.id, takenOverFromDriverId: who.d1.employeeId, status: 'IN_TRANSIT', attemptNumber: before.attemptNumber });
      expect(after.pickupTime?.getTime()).toBe(before.pickupTime?.getTime());
      expect(after.deliveryNotes).toBe(before.deliveryNotes);
      const a = await audits(o.id, 'DELIVERY_TAKEN_OVER');
      expect(a).toHaveLength(1);
      expect(a[0].userId).toBe(who.admin.id);
      expect(JSON.stringify(a[0].payload)).toContain(who.d1.employeeId!);
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
    });

    it('13. the former driver has no access (the driver routes are gone: 404); the takeover leaves the job with the administrator', async () => {
      const o = await byDriver('IN_TRANSIT');
      expect((await request(app).get(`/api/v1/delivery/orders/${o.id}`).set(bearer(who.d1.token))).status).toBe(404);
      await takeover(o.id);
      expect((await request(app).get(`/api/v1/delivery/orders/${o.id}`).set(bearer(who.d1.token))).status).toBe(404);
      expect((await request(app).post(`/api/v1/delivery/orders/${o.id}/report-failure`).set(bearer(who.d1.token)).send({ reasonCode: 'OTHER' })).status).toBe(404);
      expect((await request(app).post(`/api/v1/delivery/orders/${o.id}/verify-delivery`).set(bearer(who.d1.token)).send({ code: '123456' })).status).toBe(404);
      expect((await request(app).get('/api/v1/delivery/orders').set(bearer(who.d1.token))).status).toBe(404);
      expect(await assignmentOf(o.id)).toMatchObject({ driverId: null, operatedByUserId: who.admin.id });
    });

    it('14. replay is changed:false; a stale expected driver is 409; a missing / short reason is 422; ineligible orders are refused', async () => {
      const o = await byDriver('IN_TRANSIT');
      expect((await takeover(o.id)).body.data.changed).toBe(true);
      const replay = await takeover(o.id, {}, 'admin2');
      expect([replay.status, replay.body.data.changed]).toEqual([200, false]);
      expect(await audits(o.id, 'DELIVERY_TAKEN_OVER')).toHaveLength(1);
      const s = await byDriver('IN_TRANSIT');
      const stale = await takeover(s.id, { expectedDriverId: who.d2.employeeId });
      expect([stale.status, stale.body.error]).toEqual([409, 'DELIVERY_ASSIGNMENT_CHANGED']);
      expect((await takeover(s.id, { reason: 'ab' })).status).toBe(422);
      expect((await post(s.id, 'takeover', { expectedDriverId: who.d1.employeeId })).status).toBe(422);
      expect((await assignmentOf(s.id)).driverId).toBe(who.d1.employeeId);
      const refunded = await byDriver('IN_TRANSIT');
      await prisma.order.update({ where: { id: refunded.id }, data: { paymentStatus: 'REFUNDED' } });
      expect((await takeover(refunded.id)).status).toBe(409);
      const cancelled = await byDriver('IN_TRANSIT');
      await prisma.order.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } });
      expect((await takeover(cancelled.id)).status).toBe(409);
    });

    it('15. works for ASSIGNED (READY) and FAILED jobs and keeps their state; historical attempts keep their driver', async () => {
      const assigned = await byDriver('ASSIGNED');
      expect((await takeover(assigned.id)).status).toBe(200);
      expect(await assignmentOf(assigned.id)).toMatchObject({ status: 'ASSIGNED', operatedByUserId: who.admin.id, driverId: null });
      const failed = await byDriver('FAILED', { failedAt: new Date(), deliveryNotes: serializeFailureNote('CUSTOMER_UNAVAILABLE', null) });
      await prisma.deliveryAttempt.create({
        data: { orderId: failed.id, attemptNumber: 1, driverId: who.d1.employeeId, failureReasonCode: 'OTHER', proofCodeVersion: 1, outcome: 'RETRY_SAME_DRIVER', resolvedByUserId: who.admin.id, resolutionReasonCode: 'OTHER' }
      });
      await prisma.deliveryAssignment.update({ where: { orderId: failed.id }, data: { attemptNumber: 2 } });
      expect((await takeover(failed.id)).status).toBe(200);
      expect(await assignmentOf(failed.id)).toMatchObject({ status: 'FAILED', attemptNumber: 2, operatedByUserId: who.admin.id, takenOverFromDriverId: who.d1.employeeId });
      const hist = await attemptsOf(failed.id);
      expect(hist).toHaveLength(1);
      expect(hist[0]).toMatchObject({ driverId: who.d1.employeeId, operatedByUserId: null }); // history is never rewritten
    });

    it('16. two administrators taking over at once: exactly one effect', async () => {
      const o = await byDriver('IN_TRANSIT');
      const [a, b] = await Promise.all([takeover(o.id, {}, 'admin'), takeover(o.id, {}, 'admin2')]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect([a.body.data.changed, b.body.data.changed].filter(Boolean)).toHaveLength(1);
      expect(await audits(o.id, 'DELIVERY_TAKEN_OVER')).toHaveLength(1);
    });
  });

  // ===================================================================================================== verify the customer's code
  describe('verify the delivery code (single shared implementation)', () => {
    it('17. a valid code completes the delivery: verifiedByUserId (no employee), DELIVERED through the proof-backed transition, audit without the code', async () => {
      const o = await byAdmin();
      const code = await issued(o.id);
      const r = await verify(o.id, code);
      expect(r.status, text(r)).toBe(200);
      expect(r.body.data).toMatchObject({ changed: true, order: { id: o.id, status: 'DELIVERED' } });
      expect(text(r)).not.toContain(code);
      const p = await proofOf(o.id);
      expect(p).toMatchObject({ method: 'PIN', verifiedByUserId: who.admin.id, verifiedByEmployeeId: null });
      expect(await orderOf(o.id)).toMatchObject({ status: 'DELIVERED' });
      expect(await assignmentOf(o.id)).toMatchObject({ status: 'DELIVERED', operatedByUserId: who.admin.id });
      const ev = (await events(o.id)).filter((e) => e.toStatus === 'DELIVERED');
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ actorUserId: who.admin.id, actorRole: 'SUPER_ADMIN' });
      const a = await audits(o.id, 'DELIVERY_VERIFIED');
      expect(a).toHaveLength(1);
      expect(JSON.stringify(a[0].payload)).not.toContain(code);
      expect(JSON.stringify(a[0].payload)).toContain(who.admin.id);
      // replay by the same administrator with the correct code is changed:false; anybody else / a wrong code is ALREADY_DELIVERED
      const again = await verify(o.id, code);
      expect([again.status, again.body.data.changed]).toEqual([200, false]);
      const other = await verify(o.id, code, 'admin2');
      expect([other.status, other.body.error]).toEqual([409, 'ALREADY_DELIVERED']);
    });

    it('18. wrong codes: counted in the database (5 -> 15-minute lock; parallel guesses count exactly 5); the lock blocks even a correct code', async () => {
      const o = await byAdmin();
      const code = await issued(o.id);
      const w = wrong(code);
      const first = await verify(o.id, w);
      expect([first.status, first.body.error]).toEqual([422, 'INVALID_DELIVERY_CODE']);
      expect((await proofOf(o.id))!.failedAttempts).toBe(1);
      const parallel = await Promise.all(Array.from({ length: 9 }, () => verify(o.id, w)));
      const proof = await proofOf(o.id);
      expect(proof!.lockCycles).toBe(1);
      expect(proof!.failedAttempts).toBe(0);
      expect(parallel.length).toBe(9);
      expect(await audits(o.id, 'DELIVERY_VERIFY_FAILED')).toHaveLength(5); // exactly 5 guesses were counted overall; the rest met the lock
      const locked = await verify(o.id, code);
      expect([locked.status, locked.body.error]).toEqual([409, 'DELIVERY_CODE_LOCKED']);
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      expect(await audits(o.id, 'DELIVERY_VERIFY_LOCKED')).toHaveLength(1);
    });

    it('19. nothing completes a delivery without a valid code or outside the gates: no code issued, FAILED attempt, unpaid, malformed code', async () => {
      const noCode = await byAdmin();
      expect((await verify(noCode.id, '123456')).body.error).toBe('DELIVERY_CODE_NOT_ISSUED');
      const failed = await byAdmin('FAILED', { failedAt: new Date(), deliveryNotes: serializeFailureNote('OTHER', null) });
      expect((await verify(failed.id, '123456')).body.error).toBe('DELIVERY_IN_EXCEPTION');
      const unpaid = await byAdmin();
      const code = await issued(unpaid.id);
      await prisma.order.update({ where: { id: unpaid.id }, data: { paymentStatus: 'REFUNDED' } });
      expect((await verify(unpaid.id, code)).body.error).toBe('ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      const m = await byAdmin();
      await issued(m.id);
      for (const bad of ['12345', 'abcdef', '', '1234567']) expect((await verify(m.id, bad)).status, bad).toBe(422);
      expect((await proofOf(m.id))!.failedAttempts).toBe(0); // a malformed code is not counted
      for (const id of [noCode.id, failed.id, unpaid.id, m.id]) expect((await orderOf(id)).status).not.toBe('DELIVERED');
    });

    it('20. regenerating the customer code kills the old one: the old code is refused, the new one completes the delivery', async () => {
      const o = await byAdmin();
      const code = await issued(o.id);
      const regen = await request(app).post(`/api/v1/orders/${o.id}/delivery-code/regenerate`).set(bearer(who.custA.token)).send({});
      expect(regen.status, text(regen)).toBe(200);
      const newCode = regen.body.data.code as string;
      expect(newCode).toMatch(/^\d{6}$/);
      const oldTry = await verify(o.id, code === newCode ? wrong(newCode) : code);
      expect([oldTry.status, oldTry.body.error]).toEqual([422, 'INVALID_DELIVERY_CODE']);
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      const ok = await verify(o.id, newCode);
      expect(ok.status, text(ok)).toBe(200);
      expect((await orderOf(o.id)).status).toBe('DELIVERED');
    });
  });

  // ===================================================================================================== failure, retry, resume
  describe('failure, retry and resume', () => {
    it('21. report-failure: IN_TRANSIT -> FAILED with the structured note; replay keeps the first report; audit names the administrator', async () => {
      const o = await byAdmin();
      const r = await report(o.id);
      expect(r.status, text(r)).toBe(200);
      expect(r.body.data.changed).toBe(true);
      const a = await assignmentOf(o.id);
      expect(a.status).toBe('FAILED');
      expect(a.deliveryNotes).toBe(serializeFailureNote('CUSTOMER_UNAVAILABLE', 'Phone off'));
      expect(a.failedAt).toBeTruthy();
      expect((await orderOf(o.id)).status).toBe('DISPATCHED'); // the order stays DISPATCHED
      const again = await report(o.id, { reasonCode: 'WRONG_ADDRESS' }, 'admin2');
      expect(again.body.data.changed).toBe(false);
      expect((await assignmentOf(o.id)).deliveryNotes).toBe(serializeFailureNote('CUSTOMER_UNAVAILABLE', 'Phone off'));
      const au = await audits(o.id, 'DELIVERY_FAILURE_REPORTED');
      expect(au).toHaveLength(1);
      expect(au[0].userId).toBe(who.admin.id);
      const ready2 = await ready();
      expect((await report(ready2.id)).status).toBe(409); // only a dispatched, administrator-operated delivery
    });

    // ---- restored from the former driver suite (delivery.test.ts 12, 25-28, 31): these rules never depended on the driver role
    it('21b. reasonCode is EXACTLY the five allowed codes; missing / unknown codes, a client-built deliveryNotes and extra keys are 422 and change nothing; each valid code stores the ONE server format', async () => {
      expect([...FAILURE_REASON_CODES]).toEqual(['CUSTOMER_UNAVAILABLE', 'CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'DELIVERY_REFUSED', 'OTHER']);
      const o = await byAdmin();
      for (const body of [{}, { reasonCode: 'NOPE' }, { reasonCode: 'customer_unavailable' }, { reasonCode: 'OTHER', deliveryNotes: 'PBFAIL1:{"reasonCode":"OTHER"}' }, { reasonCode: 'OTHER', status: 'CANCELLED' }, { reasonCode: 'OTHER', paymentStatus: 'REFUNDED' }]) {
        expect((await report(o.id, body)).status, JSON.stringify(body)).toBe(422);
      }
      expect((await assignmentOf(o.id)).status).toBe('IN_TRANSIT');
      for (const code of FAILURE_REASON_CODES) {
        const each = await byAdmin();
        const before = await events(each.id);
        const r = await report(each.id, { reasonCode: code });
        expect(r.status, text(r)).toBe(200);
        expect((await assignmentOf(each.id)).deliveryNotes).toBe(`PBFAIL1:{"reasonCode":"${code}"}`);
        // a failure report never touches the order, the payment or the refunds
        expect(await orderOf(each.id)).toMatchObject({ status: 'DISPATCHED', paymentStatus: 'PAID', paymentMethod: 'ONLINE', cancelledAt: null });
        expect(await events(each.id)).toHaveLength(before.length);
        expect(await prisma.refund.count({ where: { orderId: each.id } })).toBe(0);
      }
    });

    it('21c. the note is sanitized (control characters stripped, spaces collapsed, max 200) and the stored format round-trips even for hostile text', async () => {
      const o = await byAdmin();
      const hostile = `  line1\r\nline2\t"quoted" PBFAIL1:{"reasonCode":"WRONG_ADDRESS"}\u0000​ ${'x'.repeat(400)}`;
      const res = await report(o.id, { reasonCode: 'OTHER', note: hostile });
      expect(res.status, text(res)).toBe(200);
      const stored = (await assignmentOf(o.id)).deliveryNotes!;
      const parsed = parseFailureNote(stored)!;
      expect(parsed.reasonCode).toBe('OTHER'); // the injected prefix inside the note never changes the code
      expect(parsed.note!.length).toBeLessThanOrEqual(200);
      expect(parsed.note).toContain('line1 line2');
      // eslint-disable-next-line no-control-regex
      expect(parsed.note).not.toMatch(/[\u0000-\u001f\u007f​]/);
      expect(stored.startsWith(FAILURE_NOTE_PREFIX)).toBe(true);
      expect(serializeFailureNote(parsed.reasonCode, parsed.note)).toBe(stored);
    });

    it('21d. the parser never trusts unknown formats: legacy free text, bad JSON, unknown reason codes and wrong types are all null', () => {
      for (const bad of [null, undefined, '', 'Customer was not home', 'PBFAIL1:', 'PBFAIL1:not json', 'PBFAIL1:[]', 'PBFAIL1:{"reasonCode":"HACKED"}', 'PBFAIL1:{"reasonCode":"OTHER","note":5}', 'PBFAIL2:{"reasonCode":"OTHER"}']) {
        expect(parseFailureNote(bad as string | null | undefined), String(bad)).toBeNull();
      }
      expect(parseFailureNote(serializeFailureNote('DELIVERY_REFUSED', null))).toEqual({ reasonCode: 'DELIVERY_REFUSED', note: null });
    });

    it('21e. after a failure the order stays DISPATCHED: dispatching again is a no-op or refused, and the failed job still belongs to the administrator', async () => {
      const o = await byAdmin();
      expect((await report(o.id)).status).toBe(200);
      const again = await dispatch(o.id);
      expect([200, 409]).toContain(again.status);
      if (again.status === 200) expect(again.body.data.changed).toBe(false);
      expect(await orderOf(o.id)).toMatchObject({ status: 'DISPATCHED', paymentStatus: 'PAID' });
      expect((await assignmentOf(o.id)).status).toBe('FAILED');
      expect((await assignmentOf(o.id)).operatedByUserId).toBe(who.admin.id);
    });

    it('21f. the delivery address comes from the IMMUTABLE order snapshot, not the customer\'s editable address book', async () => {
      const o = await byAdmin();
      const addr = await prisma.customerAddress.create({ data: { customerProfileId: who.custA.profileId!, title: 'Home', addressLine1: '12 Secret Street', city: 'Kochi', state: 'Kerala', postalCode: '682001' } });
      await prisma.customerAddress.update({ where: { id: addr.id }, data: { addressLine1: 'EDITED Lane 99', city: 'Elsewhere' } });
      const r = await request(app).get(path(o.id)).set(bearer(who.admin.token));
      expect(r.status).toBe(200);
      const t = text(r);
      expect(t).toContain('12 Secret Street');
      expect(t).not.toContain('EDITED Lane 99');
      expect(t).not.toContain('Elsewhere');
    });

    it('22. retry: the failed attempt is archived FIRST (operator recorded, no driver), attempt + 1, the old code can never work; resume starts the new attempt', async () => {
      const o = await byAdmin();
      const code1 = await issued(o.id);
      await report(o.id);
      const r = await retry(o.id);
      expect(r.status, text(r)).toBe(200);
      expect(r.body.data).toMatchObject({ changed: true, attemptNumber: 2, assignmentState: 'ASSIGNED' });
      const hist = await attemptsOf(o.id);
      expect(hist).toHaveLength(1);
      expect(hist[0]).toMatchObject({ attemptNumber: 1, driverId: null, operatedByUserId: who.admin.id, outcome: 'RETRY_SAME_DRIVER', resolvedByUserId: who.admin.id, failureReasonCode: 'CUSTOMER_UNAVAILABLE' });
      const a = await assignmentOf(o.id);
      expect(a).toMatchObject({ status: 'ASSIGNED', attemptNumber: 2, operatedByUserId: who.admin.id, driverId: null });
      const p = await proofOf(o.id);
      expect(p!.codeHash).toBeNull();
      expect(p!.codeVersion).toBe(2);
      // not resumed yet: neither the customer code nor a verification is possible
      expect((await verify(o.id, code1)).body.error).toBe('INVALID_DELIVERY_STATE'); // not resumed yet: no verification is possible
      const res = await resume(o.id);
      expect([res.status, res.body.data.changed]).toEqual([200, true]);
      expect((await assignmentOf(o.id)).status).toBe('IN_TRANSIT');
      const code2 = await issued(o.id);
      expect((await verify(o.id, code1 === code2 ? wrong(code2) : code1)).status).toBe(422); // the first attempt's code is dead
      expect((await verify(o.id, code2)).status).toBe(200);
      expect((await orderOf(o.id)).status).toBe('DELIVERED');
      expect((await resume(o.id)).status).toBe(409); // delivered orders are not resumable
    });

    it('23. retry guards: only a FAILED attempt, a matching attempt number, never beyond the third attempt', async () => {
      const notFailed = await byAdmin();
      expect((await retry(notFailed.id)).body.error).toBe('DELIVERY_NOT_FAILED');
      const o = await byAdmin('FAILED', { failedAt: new Date(), deliveryNotes: serializeFailureNote('OTHER', null) });
      const stale = await retry(o.id, { expectedAttemptNumber: 2 });
      expect([stale.status, stale.body.error]).toEqual([409, 'DELIVERY_ATTEMPT_CHANGED']);
      const third = await byAdmin('FAILED', { attemptNumber: 3, failedAt: new Date(), deliveryNotes: serializeFailureNote('OTHER', null) });
      const limit = await retry(third.id, { expectedAttemptNumber: 3 });
      expect([limit.status, limit.body.error]).toEqual([409, 'DELIVERY_ATTEMPT_LIMIT_REACHED']);
      expect(await attemptsOf(third.id)).toHaveLength(0); // nothing archived on a refusal
      expect((await resume(o.id)).body.error).toBe('DELIVERY_IN_EXCEPTION'); // a FAILED attempt is not silently revived
    });
  });

  // ===================================================================================================== existing safeguards still apply to administrator-operated jobs
  describe('existing resolution safeguards apply unchanged', () => {
    it('24. the exceptional override still works on an administrator-operated job and keeps its own audit trail', async () => {
      const o = await byAdmin();
      const r = await request(app)
        .post(`/api/v1/admin/orders/${o.id}/delivery-override`)
        .set(bearer(who.admin.token))
        .set('x-step-up-token', await stepFor('admin'))
        .send({ reasonCode: 'CUSTOMER_CANNOT_ACCESS_CODE', note: 'Customer phone died; confirmed by phone call', confirm: true });
      expect(r.status, text(r)).toBe(200);
      expect(await proofOf(o.id)).toMatchObject({ method: 'ADMIN_OVERRIDE', overrideByUserId: who.admin.id, verifiedByUserId: null, verifiedByEmployeeId: null });
      expect((await orderOf(o.id)).status).toBe('DELIVERED');
      expect(await audits(o.id, 'DELIVERY_OVERRIDE_APPLIED')).toHaveLength(1);
    });

    it('25. Cancel & Full Refund still works for an administrator-operated FAILED job: archived with the operator, order CANCELLED, ONE full refund intent, no provider call here', async () => {
      const o = await prisma.order.create({
        data: { orderNumber: `S3A-PAID-${ts}-${++seq}`, totalAmount: 100, netAmount: '145.50', customerProfileId: who.custA.profileId, status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', orderType: 'DIRECT' } as never
      });
      const s = await request(app).post(`/api/v1/orders/${o.id}/payment-attempts`).set(bearer(who.custA.token)).send({});
      expect(s.status, text(s)).toBe(200);
      const providerOrderId = s.body.data.providerOrderId as string;
      const pay = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
      const v = await request(app)
        .post(`/api/v1/orders/${o.id}/payment-attempts/${s.body.data.attemptId}/verify`)
        .set(bearer(who.custA.token))
        .send({ providerOrderId, providerPaymentId: pay.providerPaymentId, signature: mock.signCheckout(providerOrderId, pay.providerPaymentId) });
      expect(v.status, text(v)).toBe(200);
      await prisma.order.update({ where: { id: o.id }, data: { status: 'DISPATCHED', kitchenBranchId: branchA.id } });
      await prisma.deliveryAssignment.create({
        data: { orderId: o.id, driverId: null, operatedByUserId: who.admin.id, branchId: branchA.id, status: 'FAILED', attemptNumber: 1, pickupTime: new Date(Date.now() - 600000), failedAt: new Date(Date.now() - 300000), deliveryNotes: serializeFailureNote('CUSTOMER_UNAVAILABLE', null) }
      });
      const c = await request(app)
        .post(`/api/v1/admin/orders/${o.id}/delivery-undeliverable`)
        .set(bearer(who.admin.token))
        .set('x-step-up-token', await stepFor('admin'))
        .send({ reasonCode: 'CUSTOMER_REFUSED', note: 'Customer refused twice at the door', expectedAttemptNumber: 1, confirm: true });
      expect(c.status, text(c)).toBe(200);
      expect(await orderOf(o.id)).toMatchObject({ status: 'CANCELLED' });
      const hist = await attemptsOf(o.id);
      expect(hist).toHaveLength(1);
      expect(hist[0]).toMatchObject({ outcome: 'UNDELIVERABLE_CANCELLED', driverId: null, operatedByUserId: who.admin.id });
      const refunds = await prisma.refund.findMany({ where: { orderId: o.id } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ status: 'REQUESTED', trigger: expect.any(String) });
    });
  });

  // ===================================================================================================== visibility
  describe('monitor and queues', () => {
    it('26. the monitor lists an administrator-operated job with operator ADMIN (no driver); the driver queue never lists it; READY operated jobs are not "unclaimed"', async () => {
      const dispatched = await byAdmin();
      const readyOperated = await byAdmin('ASSIGNED');
      const unclaimed = await ready();
      const m = await request(app).get(`/api/v1/delivery/monitor?branchId=${branchA.id}`).set(bearer(who.admin.token));
      expect(m.status, text(m)).toBe(200);
      const all = Object.values(m.body.data.sections).flatMap((s) => (s as { items: Array<{ id: string; assignment: { operator: string | null; driver: unknown; state: string | null } }> }).items);
      const d = all.find((i) => i.id === dispatched.id)!;
      expect(d.assignment).toMatchObject({ operator: 'ADMIN', driver: null, state: 'IN_TRANSIT' });
      expect(m.body.data.sections.unclaimed.items.map((i: { id: string }) => i.id)).toContain(unclaimed.id);
      expect(m.body.data.sections.unclaimed.items.map((i: { id: string }) => i.id)).not.toContain(readyOperated.id);
      expect(m.body.data.sections.assigned.items.map((i: { id: string }) => i.id)).toContain(readyOperated.id);
      expect((await request(app).get('/api/v1/delivery/orders').set(bearer(who.d1.token))).status).toBe(404); // B2a: there is no driver queue any more
    });
  });

  // ===================================================================================================== static guarantees
  describe('static guarantees', () => {
    const dir = join(__dirname, '..', 'modules', 'delivery');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    it('27. every state-changing admin route is behind requireStepUp and the operate permission; no payment / COD / cash / refund concept is named', () => {
      const routes = strip(readFileSync(join(dir, 'deliveryOperate.routes.ts'), 'utf8'));
      const posts = routes.match(/router\.post\(/g) ?? [];
      expect(posts.length).toBe(6);
      for (const chunk of routes.split('router.post(').slice(1)) expect(chunk.slice(0, 400)).toMatch(/\.{3}write\(|requireStepUp\(/); // every POST is guarded
      expect(routes).toMatch(/const write = \(action: string\) => \[authenticateToken, requirePermission\('delivery:operate'\), deliveryActionRateLimiter, requireStepUp\(action\)\]/);
      const service = strip(readFileSync(join(dir, 'deliveryOperate.service.ts'), 'utf8'));
      for (const src of [routes, service]) expect(src).not.toMatch(/\bcod\b|cash|wallet|getPaymentProvider|createRefund|refund\.(create|update)|payment\.(update|create)|data:\s*\{[^}]*payment(Status|Method)/i); // payment fields may be READ (eligibility filters) but are never written
      expect(service).not.toMatch(/order\.update|status:\s*'DELIVERED'|to:\s*'DELIVERED'/); // delivery completion lives only in the proof service
    });

    it('28. the Delivery Code decision tree exists once: the admin path calls the shared implementation (no second copy of the attempt window)', () => {
      const service = readFileSync(join(dir, 'deliveryOperate.service.ts'), 'utf8');
      expect(service).toContain('DeliveryProofService.verifyAsAdmin');
      expect(service).not.toMatch(/MAX_ATTEMPTS_PER_WINDOW|failedAttempts|lockCycles|hashCode\(/);
      const proof = readFileSync(join(dir, 'deliveryProof.service.ts'), 'utf8');
      expect(proof.match(/MAX_ATTEMPTS_PER_WINDOW\)/g)!.length).toBe(1);
    });
  });
});

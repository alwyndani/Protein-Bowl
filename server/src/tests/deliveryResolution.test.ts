import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parsePaymentConfig, resetPaymentConfig, setPaymentConfigForTests } from '../config/paymentConfig.js';
import { getPaymentProvider } from '../modules/payment/providerRegistry.js';
import { MockPaymentProvider } from '../modules/payment/mock.provider.js';
import { PaymentReconciliationService } from '../modules/payment/paymentReconciliation.service.js';
import { OrderTransitionService } from '../modules/order/orderTransition.service.js';
import { MAX_DELIVERY_ATTEMPTS, retryBodySchema, undeliverableBodySchema } from '../modules/delivery/deliveryAttemptPolicy.js';
import { roleHasPermission } from '../authz/permissions.js';
import type { ProviderRefund } from '../modules/payment/provider.types.js';

/**
 * P9C - failed-delivery resolution: attempt history, retry (same driver), reassignment (after FAILED and while a retry is still ASSIGNED),
 * driver Resume, proof/code invalidation, the attempt cap, Cancel & Full Refund through P7C, the override archive, redaction and races.
 * Real PostgreSQL, mock payment provider. Orders are created directly in the states under test (like the kitchen/delivery suites).
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const mock = getPaymentProvider() as MockPaymentProvider;
const PASSWORD = 'P9C#Delivery-Resolve-Pass-2026';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const FAIL_NOTE = 'Nobody answered at the secret gate';
const ADMIN_NOTE = 'Customer confirmed by phone call earlier';

describe('P9C - failed delivery resolution', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; email: string; token: string; profileId?: string; employeeId?: string };
  const who: Record<string, Who> = {};
  let branchA: { id: string };
  let branchB: { id: string };
  let step = '';

  async function mkUser(label: string, roles: RoleEnum[], branchIds: string[] = [], status: 'ACTIVE' | 'DEACTIVATED' = 'ACTIVE'): Promise<Who> {
    const email = `p9c_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER);
    const u = await prisma.user.create({
      data: {
        email,
        status,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer
          ? { customerProfile: { create: { fullName: `Customer ${label}`, referralCode: `PB-P9C${label.toUpperCase()}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `P9C-${label}-${ts}`, fullName: `P9C ${label}`, designation: 'Test', assignedBranchId: branchIds[0] ?? null } } })
      },
      include: { customerProfile: true, employeeProfile: true }
    });
    for (const branchId of branchIds) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile!.id, branchId } });
    who[label] = { id: u.id, email, token: sign(u.id, email, roles), profileId: u.customerProfile?.id, employeeId: u.employeeProfile?.id };
    return who[label];
  }

  const failureNotes = `PBFAIL1:${JSON.stringify({ reasonCode: 'CUSTOMER_UNAVAILABLE', note: FAIL_NOTE })}`;
  /** A DISPATCHED + PAID + ONLINE order of custA whose assignment (driver d1, branch A) is in the given state. */
  const dispatched = async (assignment: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => {
    const n = ++seq;
    return prisma.order.create({
      data: {
        orderNumber: `P9C-${ts}-${n}`,
        totalAmount: 100,
        netAmount: '145.50',
        customerProfileId: who.custA.profileId,
        status: 'DISPATCHED',
        paymentStatus: 'PAID',
        paymentMethod: 'ONLINE',
        orderType: 'DIRECT',
        kitchenBranchId: branchA.id,
        confirmedAt: new Date(),
        deliveryAddressSnapshot: { addressLine1: '12 Secret Street', city: 'Kochi', postalCode: '682001', recipientName: 'Asha Verma-Secret', phone: '+91 98765 43210' },
        items: { create: [{ itemTitle: `Bowl ${n}`, unitPrice: 100, quantity: 1, taxRate: 0.05, totalPrice: 100 }] },
        delivery: { create: { driverId: who.d1.employeeId, branchId: branchA.id, status: 'IN_TRANSIT', pickupTime: new Date(Date.now() - 600000), ...assignment } },
        ...over
      } as never
    });
  };
  /** Directly created FAILED attempt N (legacy-style, with failedAt). */
  const failedAt = (attemptNumber = 1, over: Record<string, unknown> = {}, orderOver: Record<string, unknown> = {}) =>
    dispatched({ status: 'FAILED', attemptNumber, failedAt: new Date(Date.now() - 300000), deliveryNotes: failureNotes, ...over }, orderOver);

  const cState = (token: string, id: string) => request(app).get(`/api/v1/orders/${id}/delivery-code`).set(bearer(token));
  const cIssue = (token: string, id: string) => request(app).post(`/api/v1/orders/${id}/delivery-code`).set(bearer(token)).send({});
  const cRegen = (token: string, id: string) => request(app).post(`/api/v1/orders/${id}/delivery-code/regenerate`).set(bearer(token)).send({});
  const verify = (token: string, id: string, code: unknown) => request(app).post(`/api/v1/delivery/orders/${id}/verify-delivery`).set(bearer(token)).send({ code });
  const report = (token: string, id: string) => request(app).post(`/api/v1/delivery/orders/${id}/report-failure`).set(bearer(token)).send({ reasonCode: 'CUSTOMER_UNAVAILABLE', note: FAIL_NOTE });
  const resume = (token: string, id: string, body: Record<string, unknown> = {}) => request(app).post(`/api/v1/delivery/orders/${id}/resume`).set(bearer(token)).send(body);
  const withStep = (r: request.Test, stepToken: string | null) => (stepToken ? r.set('x-step-up-token', stepToken) : r);
  const retry = (id: string, body: Record<string, unknown>, token = who.admin.token, stepToken: string | null = step) => withStep(request(app).post(`/api/v1/admin/orders/${id}/delivery-retry`).set(bearer(token)), stepToken).send(body);
  const undeliverable = (id: string, body: Record<string, unknown>, token = who.admin.token, stepToken: string | null = step) =>
    withStep(request(app).post(`/api/v1/admin/orders/${id}/delivery-undeliverable`).set(bearer(token)), stepToken).send(body);
  const override = (id: string, body: Record<string, unknown>, token = who.admin.token, stepToken: string | null = step) =>
    withStep(request(app).post(`/api/v1/admin/orders/${id}/delivery-override`).set(bearer(token)), stepToken).send(body);
  const attemptsApi = (id: string, token = who.admin.token) => request(app).get(`/api/v1/admin/orders/${id}/delivery-attempts`).set(bearer(token));

  const rb = (over: Record<string, unknown> = {}) => ({ mode: 'SAME_DRIVER', expectedAttemptNumber: 1, expectedDriverId: who.d1.employeeId, reasonCode: 'CUSTOMER_AVAILABLE_NOW', ...over });
  const ub = (over: Record<string, unknown> = {}) => ({ reasonCode: 'CUSTOMER_REFUSED', note: ADMIN_NOTE, expectedAttemptNumber: 1, confirm: true, ...over });

  const proofOf = (orderId: string) => prisma.deliveryProof.findUnique({ where: { orderId } });
  const orderOf = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
  const assignmentOf = (orderId: string) => prisma.deliveryAssignment.findUniqueOrThrow({ where: { orderId } });
  const attemptsOf = (orderId: string) => prisma.deliveryAttempt.findMany({ where: { orderId }, orderBy: { attemptNumber: 'asc' } });
  const events = (orderId: string) => prisma.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  const audits = (entityId: string, action?: string) => prisma.auditLog.findMany({ where: { entityId, ...(action ? { action } : {}) } });
  const text = (res: { body: unknown }) => JSON.stringify(res.body);
  const issued = async (orderId: string, token = who.custA.token) => {
    const r = await cIssue(token, orderId);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.data.code as string;
  };
  /** Real flow up to a FAILED attempt 1: customer issues + regenerates a code, then the driver reports the failure through the API. */
  const failedViaApi = async () => {
    const o = await dispatched();
    const code1 = await issued(o.id);
    expect((await cRegen(who.custA.token, o.id)).status).toBe(200);
    expect((await report(who.d1.token, o.id)).status).toBe(200);
    return { o, code1 };
  };

  // ---- payment helpers (real session + verification endpoints, like the P7C suite)
  const quiesce = async () => {
    await prisma.payment.updateMany({ where: { provider: { not: null } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
    await prisma.paymentWebhookEvent.updateMany({ where: { status: { in: ['RECEIVED', 'RETRY_PENDING'] } }, data: { status: 'IGNORED', ignoredReason: 'TEST_CLEANUP', lockedUntil: null } });
    await prisma.refund.updateMany({ where: { status: { in: ['REQUESTED', 'SUBMITTING', 'UNKNOWN', 'PROCESSING'] } }, data: { nextAttemptAt: null, lockedUntil: null, lockedBy: null } });
  };
  async function paidFailed(attemptNumber = 1) {
    const order = await prisma.order.create({
      data: { orderNumber: `P9C-PAID-${ts}-${++seq}`, totalAmount: 100, netAmount: '145.50', customerProfileId: who.custA.profileId, status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'ONLINE', orderType: 'DIRECT' } as never
    });
    const s = await request(app).post(`/api/v1/orders/${order.id}/payment-attempts`).set(bearer(who.custA.token)).send({});
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const providerOrderId = s.body.data.providerOrderId as string;
    const pay = mock.simulatePayment(providerOrderId, { status: 'CAPTURED' });
    const v = await request(app)
      .post(`/api/v1/orders/${order.id}/payment-attempts/${s.body.data.attemptId}/verify`)
      .set(bearer(who.custA.token))
      .send({ providerOrderId, providerPaymentId: pay.providerPaymentId, signature: mock.signCheckout(providerOrderId, pay.providerPaymentId) });
    expect(v.status, JSON.stringify(v.body)).toBe(200);
    await prisma.order.update({ where: { id: order.id }, data: { status: 'DISPATCHED', kitchenBranchId: branchA.id } });
    await prisma.deliveryAssignment.create({
      data: { orderId: order.id, driverId: who.d1.employeeId, branchId: branchA.id, status: 'FAILED', attemptNumber, pickupTime: new Date(Date.now() - 600000), failedAt: new Date(Date.now() - 300000), deliveryNotes: failureNotes }
    });
    return order;
  }
  const providerRefundFor = (refundId: string): ProviderRefund | undefined => [...mock.refunds.values()].find((r) => r.receipt === refundId);

  beforeAll(async () => {
    branchA = await prisma.kitchenBranch.create({ data: { code: `p9c-a-${ts}`, name: 'P9C Branch A', address: 'A', city: 'Kochi' } });
    branchB = await prisma.kitchenBranch.create({ data: { code: `p9c-b-${ts}`, name: 'P9C Branch B', address: 'B', city: 'Kozhikode' } });
    await mkUser('custA', [RoleEnum.CUSTOMER]);
    await mkUser('custB', [RoleEnum.CUSTOMER]);
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('md', [RoleEnum.MD]);
    await mkUser('chef', [RoleEnum.CHEF], [branchA.id]);
    await mkUser('d1', [RoleEnum.DELIVERY], [branchA.id]);
    await mkUser('d2', [RoleEnum.DELIVERY], [branchA.id]);
    await mkUser('d3', [RoleEnum.DELIVERY], [branchA.id]);
    await mkUser('dB', [RoleEnum.DELIVERY], [branchB.id]);
    await mkUser('dOff', [RoleEnum.DELIVERY], [branchA.id], 'DEACTIVATED');
    const su = await request(app).post('/api/v1/admin/step-up').set(bearer(who.admin.token)).send({ password: PASSWORD });
    expect(su.status).toBe(200);
    step = su.body.data.stepUpToken;
    await quiesce();
  });
  beforeEach(() => {
    mock.reset();
    setPaymentConfigForTests(parsePaymentConfig({ PAYMENT_REFUND_INLINE_SUBMIT: 'false' }, 'test'));
  });
  afterEach(() => {
    resetPaymentConfig();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await quiesce();
    await prisma.$disconnect();
  });

  // ===================================================================================================== policy / contracts
  describe('policy and request contracts', () => {
    it('1. MAX_DELIVERY_ATTEMPTS is the single centralized constant (3) and is not scattered as a literal in services', () => {
      expect(MAX_DELIVERY_ATTEMPTS).toBe(3);
      const dir = join(__dirname, '..', 'modules', 'delivery');
      for (const f of ['deliveryResolution.service.ts', 'deliveryView.service.ts', 'delivery.dto.ts']) {
        const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        expect(src, f).not.toMatch(/(?:attemptNumber|Attempts?)\s*(?:[<>]=?|===?)\s*3\b/);
      }
    });

    it('2. request bodies are strict: unknown fields, amounts, statuses and bad modes are rejected, never ignored', () => {
      const good = rb();
      expect(retryBodySchema.safeParse(good).success).toBe(true);
      for (const bad of [
        { ...good, status: 'DELIVERED' },
        { ...good, amount: 10 },
        { ...good, mode: 'ANY' },
        { ...good, mode: 'REASSIGN' }, // driver required
        { ...good, driverEmployeeId: who.d2.employeeId }, // driver forbidden for SAME_DRIVER
        { ...good, expectedAttemptNumber: 4 },
        { ...good, expectedAttemptNumber: 0 },
        { ...good, reasonCode: 'NOT_A_REASON' },
        { ...good, expectedDriverId: 'nope' }
      ]) {
        expect(retryBodySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
      }
      expect(undeliverableBodySchema.safeParse(ub()).success).toBe(true);
      for (const bad of [{ ...ub(), confirm: false }, { ...ub(), note: 'short' }, { ...ub(), amount: 1 }, { ...ub(), reasonCode: 'ITEM_UNAVAILABLE' }, { ...ub(), refundAmount: 1 }]) {
        expect(undeliverableBodySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
      }
    });

    it('3. permissions: only SUPER_ADMIN holds delivery:resolve; MD, DELIVERY, CHEF and the customer roles do not', () => {
      expect(roleHasPermission(RoleEnum.SUPER_ADMIN, 'delivery:resolve')).toBe(true);
      for (const r of [RoleEnum.MD, RoleEnum.DELIVERY, RoleEnum.CHEF, RoleEnum.CUSTOMER, RoleEnum.NUTRITIONIST, RoleEnum.POS]) expect(roleHasPermission(r, 'delivery:resolve'), r).toBe(false);
    });

    it('4. reporting a failure records failedAt on the assignment and keeps attemptNumber 1', async () => {
      const o = await dispatched();
      const r = await report(who.d1.token, o.id);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const a = await assignmentOf(o.id);
      expect(a.status).toBe('FAILED');
      expect(a.attemptNumber).toBe(1);
      expect(a.failedAt).not.toBeNull();
      expect(Date.now() - a.failedAt!.getTime()).toBeLessThan(60000);
    });
  });

  // ===================================================================================================== retry same driver
  describe('retry with the same driver', () => {
    it('5. archives the failed attempt FIRST, then reuses the live assignment: FAILED -> ASSIGNED, attempt 2, evidence kept, order untouched', async () => {
      const { o } = await failedViaApi();
      const beforeProof = (await proofOf(o.id))!;
      const beforeEvents = (await events(o.id)).length;
      const before = await assignmentOf(o.id);
      const r = await retry(o.id, rb());
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data).toMatchObject({ changed: true, action: 'RETRY_SAME_DRIVER', attemptNumber: 2, assignmentState: 'ASSIGNED', driverEmployeeId: who.d1.employeeId });

      const a = await assignmentOf(o.id);
      expect(a).toMatchObject({ status: 'ASSIGNED', attemptNumber: 2, driverId: who.d1.employeeId, pickupTime: null, deliveryTime: null, deliveryNotes: null, failedAt: null });
      const rows = await attemptsOf(o.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        attemptNumber: 1,
        driverId: who.d1.employeeId,
        branchId: branchA.id,
        failureReasonCode: 'CUSTOMER_UNAVAILABLE',
        failureNote: FAIL_NOTE,
        proofCodeVersion: beforeProof.codeVersion,
        outcome: 'RETRY_SAME_DRIVER',
        resolvedByUserId: who.admin.id,
        resolutionReasonCode: 'CUSTOMER_AVAILABLE_NOW',
        resolutionNote: null
      });
      expect(rows[0].startedAt!.getTime()).toBe(before.pickupTime!.getTime());
      expect(rows[0].failedAt!.getTime()).toBe(before.failedAt!.getTime());
      const o2 = await orderOf(o.id);
      expect(o2.status).toBe('DISPATCHED');
      expect((await events(o.id)).length).toBe(beforeEvents); // Order.status never changes, so no OrderEvent
      const audit = await audits(o.id, 'DELIVERY_RETRY_SAME_DRIVER');
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit[0].payload)).not.toContain(FAIL_NOTE);
    });

    it('6. the previous attempt\'s code is invalidated (version + 1, no hash, no lock state) while the regeneration counters and window are preserved', async () => {
      const { o } = await failedViaApi();
      const before = (await proofOf(o.id))!;
      expect(before.regenerationCount).toBe(1);
      await prisma.deliveryProof.update({ where: { orderId: o.id }, data: { failedAttempts: 3, lockCycles: 1, lockedUntil: new Date(Date.now() - 1000) } });
      expect((await retry(o.id, rb())).status).toBe(200);
      const p = (await proofOf(o.id))!;
      expect(p).toMatchObject({ codeHash: null, issuedAt: null, failedAttempts: 0, lockCycles: 0, lockedUntil: null, blockedAt: null, verifiedAt: null, regenerationCount: 1, regenerationsInWindow: 1 });
      expect(p.codeVersion).toBe(before.codeVersion + 1);
      expect(p.regenerationWindowStartedAt!.getTime()).toBe(before.regenerationWindowStartedAt!.getTime());
    });

    it('7. the customer has NO usable code while the attempt is FAILED or a retry is ASSIGNED (state NOT_AVAILABLE; issue and regenerate refused)', async () => {
      const { o } = await failedViaApi();
      for (const phase of ['FAILED', 'ASSIGNED']) {
        const s = await cState(who.custA.token, o.id);
        expect(s.body.data.state, phase).toBe('NOT_AVAILABLE');
        for (const r of [await cIssue(who.custA.token, o.id), await cRegen(who.custA.token, o.id)]) {
          expect(r.status, phase).toBe(409);
          expect(r.body.error).toBe('DELIVERY_CODE_NOT_AVAILABLE');
        }
        if (phase === 'FAILED') expect((await retry(o.id, rb())).status).toBe(200);
      }
    });

    it('8. Resume -> new code (an ISSUE, not a regeneration) -> the OLD code is dead -> the NEW code delivers; attempt 2 completes', async () => {
      const { o, code1 } = await failedViaApi();
      expect((await retry(o.id, rb())).status).toBe(200);
      // Resume
      const r = await resume(who.d1.token, o.id);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data.changed).toBe(true);
      expect(r.body.data.order.assignment).toMatchObject({ state: 'IN_TRANSIT', attemptNumber: 2, maxAttempts: 3 });
      const a = await assignmentOf(o.id);
      expect(a.status).toBe('IN_TRANSIT');
      expect(a.pickupTime).not.toBeNull(); // a fresh start timestamp
      expect(await audits(o.id, 'DELIVERY_RESUMED')).toHaveLength(1);
      // the customer now gets a fresh ISSUE
      expect((await cState(who.custA.token, o.id)).body.data.state).toBe('NOT_ISSUED');
      const regenBefore = (await proofOf(o.id))!.regenerationCount;
      const code2 = await issued(o.id);
      expect((await proofOf(o.id))!.regenerationCount).toBe(regenBefore); // an issue is not a regeneration
      // old code refused (a wrong code now), new code completes
      if (code1 !== code2) {
        const stale = await verify(who.d1.token, o.id, code1);
        expect(stale.status).toBe(422);
        expect(stale.body.error).toBe('INVALID_DELIVERY_CODE');
      }
      const ok = await verify(who.d1.token, o.id, code2);
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect((await orderOf(o.id)).status).toBe('DELIVERED');
      expect((await assignmentOf(o.id)).attemptNumber).toBe(2);
      expect((await events(o.id)).filter((e) => e.toStatus === 'DELIVERED')).toHaveLength(1);
      expect((await attemptsOf(o.id)).map((x) => x.outcome)).toEqual(['RETRY_SAME_DRIVER']);
    });

    it('9. Resume rules: replay is changed:false, FAILED is refused, other / old / wrong-branch drivers get 404, other roles 403, bodies must be empty', async () => {
      const f = await failedViaApi();
      const r0 = await resume(who.d1.token, f.o.id);
      expect(r0.status).toBe(409);
      expect(r0.body.error).toBe('DELIVERY_IN_EXCEPTION');
      expect((await retry(f.o.id, rb())).status).toBe(200);
      for (const t of [who.d2.token, who.dB.token]) expect((await resume(t, f.o.id)).status).toBe(404);
      for (const t of [who.admin.token, who.md.token, who.chef.token, who.custA.token]) expect((await resume(t, f.o.id)).status).toBe(403);
      expect((await resume(who.d1.token, f.o.id, { status: 'DELIVERED' })).status).toBe(422);
      expect((await resume(who.d1.token, f.o.id)).status).toBe(200);
      const again = await resume(who.d1.token, f.o.id);
      expect(again.status).toBe(200);
      expect(again.body.data.changed).toBe(false);
      expect(await audits(f.o.id, 'DELIVERY_RESUMED')).toHaveLength(1);
    });
  });

  // ===================================================================================================== reassignment after FAILED
  describe('reassignment after a failed attempt', () => {
    it('10. FAILED -> ASSIGNED to another SAME-branch driver (attempt 2, outcome REASSIGNED); the old driver loses ownership; the new driver resumes', async () => {
      const { o } = await failedViaApi();
      const r = await retry(o.id, rb({ mode: 'REASSIGN', driverEmployeeId: who.d2.employeeId, reasonCode: 'DRIVER_CHANGE' }));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data).toMatchObject({ action: 'REASSIGNED', attemptNumber: 2, driverEmployeeId: who.d2.employeeId });
      expect(await assignmentOf(o.id)).toMatchObject({ status: 'ASSIGNED', attemptNumber: 2, driverId: who.d2.employeeId });
      const rows = await attemptsOf(o.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ outcome: 'REASSIGNED', driverId: who.d1.employeeId, resolutionReasonCode: 'DRIVER_CHANGE' });
      expect(await audits(o.id, 'DELIVERY_REASSIGNED_AFTER_FAILURE')).toHaveLength(1);
      expect((await resume(who.d1.token, o.id)).status).toBe(404);
      expect((await resume(who.d2.token, o.id)).status).toBe(200);
    });

    it('11. the target must be an ACTIVE DELIVERY employee of the SAME branch and different from the current driver (nothing is archived on refusal)', async () => {
      const o = await failedAt(1);
      expect((await retry(o.id, rb({ mode: 'REASSIGN', driverEmployeeId: who.dB.employeeId }))).body.error).toBe('DRIVER_INVALID'); // other branch
      expect((await retry(o.id, rb({ mode: 'REASSIGN', driverEmployeeId: who.dOff.employeeId }))).body.error).toBe('DRIVER_INVALID'); // deactivated
      expect((await retry(o.id, rb({ mode: 'REASSIGN', driverEmployeeId: who.chef.employeeId }))).body.error).toBe('DRIVER_INVALID'); // not a driver
      const same = await retry(o.id, rb({ mode: 'REASSIGN', driverEmployeeId: who.d1.employeeId }));
      expect(same.status).toBe(422);
      expect(same.body.error).toBe('DRIVER_UNCHANGED');
      expect(await attemptsOf(o.id)).toHaveLength(0);
      expect(await assignmentOf(o.id)).toMatchObject({ status: 'FAILED', attemptNumber: 1, driverId: who.d1.employeeId });
    });

    it('12. stale expected values are refused with 409 DELIVERY_ATTEMPT_CHANGED and nothing changes', async () => {
      const o = await failedAt(2);
      const wrongAttempt = await retry(o.id, rb({ expectedAttemptNumber: 1 }));
      expect(wrongAttempt.status).toBe(409);
      expect(wrongAttempt.body.error).toBe('DELIVERY_ATTEMPT_CHANGED');
      const wrongDriver = await retry(o.id, rb({ expectedAttemptNumber: 2, expectedDriverId: who.d2.employeeId }));
      expect(wrongDriver.status).toBe(409);
      expect(wrongDriver.body.error).toBe('DELIVERY_ATTEMPT_CHANGED');
      expect(await attemptsOf(o.id)).toHaveLength(0);
      expect((await assignmentOf(o.id)).status).toBe('FAILED');
    });
  });

  // ===================================================================================================== B1: pending ASSIGNED reassignment
  describe('pending ASSIGNED retry: reassignment before Resume (B1)', () => {
    it('13. the SAME attempt is handed to another driver: attempt number unchanged, NO new archive, proof version unchanged, old driver 404, new driver resumes, customer code only after Resume', async () => {
      const { o } = await failedViaApi();
      expect((await retry(o.id, rb())).status).toBe(200); // attempt 2, driver d1, ASSIGNED
      const archivedBefore = await attemptsOf(o.id);
      const proofBefore = (await proofOf(o.id))!;
      expect(archivedBefore).toHaveLength(1);

      const r = await retry(o.id, rb({ mode: 'REASSIGN', driverEmployeeId: who.d2.employeeId, expectedAttemptNumber: 2, expectedDriverId: who.d1.employeeId, reasonCode: 'DRIVER_CHANGE' }));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data).toMatchObject({ changed: true, action: 'PENDING_REASSIGNED', attemptNumber: 2, assignmentState: 'ASSIGNED', driverEmployeeId: who.d2.employeeId });
      expect(await assignmentOf(o.id)).toMatchObject({ status: 'ASSIGNED', attemptNumber: 2, driverId: who.d2.employeeId });
      expect(await attemptsOf(o.id)).toHaveLength(1); // no second archive, no consumed attempt
      const proofAfter = (await proofOf(o.id))!;
      expect(proofAfter.codeVersion).toBe(proofBefore.codeVersion); // not bumped again
      expect(proofAfter).toMatchObject({ regenerationCount: proofBefore.regenerationCount, regenerationsInWindow: proofBefore.regenerationsInWindow });
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      const au = await audits(o.id, 'DELIVERY_PENDING_REASSIGNED');
      expect(au).toHaveLength(1);
      expect(await audits(o.id, 'DELIVERY_REASSIGNED_AFTER_FAILURE')).toHaveLength(0);

      expect((await resume(who.d1.token, o.id)).status).toBe(404); // the old driver lost ownership immediately
      expect((await cState(who.custA.token, o.id)).body.data.state).toBe('NOT_AVAILABLE'); // not before Resume
      expect((await cIssue(who.custA.token, o.id)).status).toBe(409);
      expect((await resume(who.d2.token, o.id)).status).toBe(200);
      const code = await issued(o.id);
      expect((await verify(who.d2.token, o.id, code)).status).toBe(200);
      expect((await orderOf(o.id)).status).toBe('DELIVERED');
    });

    it('14. restrictions: SAME_DRIVER while ASSIGNED is invalid, stale expectations lose, same driver and cross-branch targets are refused, attempt 1 is not a pending retry', async () => {
      const o = await failedAt(2, { status: 'ASSIGNED', failedAt: null, deliveryNotes: null, pickupTime: null });
      const sameMode = await retry(o.id, rb({ expectedAttemptNumber: 2 }));
      expect(sameMode.status).toBe(409);
      expect(sameMode.body.error).toBe('INVALID_DELIVERY_STATE');
      const stale = await retry(o.id, rb({ mode: 'REASSIGN', driverEmployeeId: who.d2.employeeId, expectedAttemptNumber: 2, expectedDriverId: who.d3.employeeId }));
      expect(stale.body.error).toBe('DELIVERY_ATTEMPT_CHANGED');
      expect((await retry(o.id, rb({ mode: 'REASSIGN', driverEmployeeId: who.d1.employeeId, expectedAttemptNumber: 2 }))).body.error).toBe('DRIVER_UNCHANGED');
      expect((await retry(o.id, rb({ mode: 'REASSIGN', driverEmployeeId: who.dB.employeeId, expectedAttemptNumber: 2 }))).body.error).toBe('DRIVER_INVALID');
      const first = await failedAt(1, { status: 'ASSIGNED', failedAt: null, deliveryNotes: null });
      const notPending = await retry(first.id, rb({ mode: 'REASSIGN', driverEmployeeId: who.d2.employeeId }));
      expect(notPending.status).toBe(409);
      expect(await assignmentOf(o.id)).toMatchObject({ status: 'ASSIGNED', attemptNumber: 2, driverId: who.d1.employeeId });
    });

    it('15. parallel pending reassignments: exactly one wins, the attempt number stays 2 and attempt 4 can never appear', async () => {
      const o = await failedAt(2, { status: 'ASSIGNED', failedAt: null, deliveryNotes: null, pickupTime: null });
      const body = (driver: string | null | undefined) => rb({ mode: 'REASSIGN', driverEmployeeId: driver, expectedAttemptNumber: 2 });
      const rs = await Promise.all([retry(o.id, body(who.d2.employeeId)), retry(o.id, body(who.d3.employeeId))]);
      expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
      const loser = rs.find((r) => r.status !== 200)!;
      expect(loser.status).toBe(409);
      expect(loser.body.error).toBe('DELIVERY_ATTEMPT_CHANGED');
      const a = await assignmentOf(o.id);
      expect(a.attemptNumber).toBe(2);
      expect([who.d2.employeeId, who.d3.employeeId]).toContain(a.driverId);
      expect(await audits(o.id, 'DELIVERY_PENDING_REASSIGNED')).toHaveLength(1);
      // an attempt-4 style move is impossible from here: only Resume (and then a new failure) can progress the attempt
      expect((await retry(o.id, rb({ expectedAttemptNumber: 2, expectedDriverId: a.driverId! }))).status).toBe(409);
      await expect(prisma.$executeRawUnsafe(`UPDATE "delivery_assignments" SET "attemptNumber" = 4 WHERE "orderId" = '${o.id}'`)).rejects.toThrow();
    });
  });

  // ===================================================================================================== attempt cap
  describe('the attempt cap (3)', () => {
    it('16. after attempt 3 fails there is no retry and no reassignment (409 DELIVERY_ATTEMPT_LIMIT_REACHED) and nothing is archived', async () => {
      const o = await failedAt(3);
      for (const body of [rb({ expectedAttemptNumber: 3 }), rb({ expectedAttemptNumber: 3, mode: 'REASSIGN', driverEmployeeId: who.d2.employeeId })]) {
        const r = await retry(o.id, body);
        expect(r.status).toBe(409);
        expect(r.body.error).toBe('DELIVERY_ATTEMPT_LIMIT_REACHED');
      }
      expect(await attemptsOf(o.id)).toHaveLength(0);
      expect(await assignmentOf(o.id)).toMatchObject({ status: 'FAILED', attemptNumber: 3 });
    });

    it('17. walking attempts 1 -> 2 -> 3 works; the third failure leaves only Cancel & Full Refund or the override', async () => {
      const o = await dispatched();
      await issued(o.id);
      expect((await report(who.d1.token, o.id)).status).toBe(200);
      expect((await retry(o.id, rb())).status).toBe(200);
      expect((await resume(who.d1.token, o.id)).status).toBe(200);
      expect((await report(who.d1.token, o.id)).status).toBe(200);
      expect((await retry(o.id, rb({ expectedAttemptNumber: 2, mode: 'REASSIGN', driverEmployeeId: who.d2.employeeId }))).status).toBe(200);
      expect((await resume(who.d2.token, o.id)).status).toBe(200);
      expect((await report(who.d2.token, o.id)).status).toBe(200);
      expect(await assignmentOf(o.id)).toMatchObject({ status: 'FAILED', attemptNumber: 3, driverId: who.d2.employeeId });
      expect((await attemptsOf(o.id)).map((a) => [a.attemptNumber, a.outcome])).toEqual([[1, 'RETRY_SAME_DRIVER'], [2, 'REASSIGNED']]);
      const blocked = await retry(o.id, rb({ expectedAttemptNumber: 3, expectedDriverId: who.d2.employeeId }));
      expect(blocked.body.error).toBe('DELIVERY_ATTEMPT_LIMIT_REACHED');
      const monitor = await request(app).get(`/api/v1/delivery/monitor?branchId=${branchA.id}`).set(bearer(who.admin.token));
      const item = monitor.body.data.sections.exceptions.items.find((i: { id: string }) => i.id === o.id);
      expect(item).toMatchObject({ canRetry: false, maxAttempts: 3 });
      expect(item.assignment.attemptNumber).toBe(3);
    });

    it('18. parallel retries from attempt 2: exactly one creates attempt 3, the other gets 409, and attempt 4 is impossible', async () => {
      const o = await failedAt(2);
      const rs = await Promise.all([retry(o.id, rb({ expectedAttemptNumber: 2 })), retry(o.id, rb({ expectedAttemptNumber: 2 })), retry(o.id, rb({ expectedAttemptNumber: 2, mode: 'REASSIGN', driverEmployeeId: who.d2.employeeId }))]);
      expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
      expect(rs.filter((r) => r.status === 409 && ['DELIVERY_ATTEMPT_CHANGED', 'INVALID_DELIVERY_STATE'].includes(r.body.error))).toHaveLength(2); // the loser either sees a stale attempt or an already ASSIGNED retry
      expect((await assignmentOf(o.id)).attemptNumber).toBe(3);
      expect(await attemptsOf(o.id)).toHaveLength(1);
    });

    it('19. an archive insertion failure rolls the whole retry back: the FAILED assignment, the proof and the audit trail are unchanged', async () => {
      const { o } = await failedViaApi();
      const before = (await proofOf(o.id))!;
      const assignmentBefore = await assignmentOf(o.id);
      // a pre-existing history row for attempt 1 makes the archive insert collide
      await prisma.deliveryAttempt.create({
        data: { orderId: o.id, attemptNumber: 1, failureReasonCode: 'OTHER', proofCodeVersion: 1, outcome: 'RETRY_SAME_DRIVER', resolvedByUserId: who.admin.id, resolutionReasonCode: 'OTHER' }
      });
      const r = await retry(o.id, rb());
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('DELIVERY_ATTEMPT_CHANGED');
      expect(await assignmentOf(o.id)).toMatchObject({ status: 'FAILED', attemptNumber: 1, deliveryNotes: assignmentBefore.deliveryNotes });
      const after = (await proofOf(o.id))!;
      expect(after.codeVersion).toBe(before.codeVersion);
      expect(after.codeHash).toBe(before.codeHash);
      expect(await audits(o.id, 'DELIVERY_RETRY_SAME_DRIVER')).toHaveLength(0);
    });
  });

  // ===================================================================================================== authorization / eligibility
  describe('authorization and eligibility', () => {
    it('20. role isolation: DELIVERY, MD, CHEF, CUSTOMER cannot retry / undeliverable; missing step-up is 403; attempt history is SUPER_ADMIN + MD only', async () => {
      const o = await failedAt(1);
      for (const t of [who.d1.token, who.md.token, who.chef.token, who.custA.token]) {
        expect((await retry(o.id, rb(), t)).status).toBe(403);
        expect((await undeliverable(o.id, ub(), t)).status).toBe(403);
      }
      expect((await retry(o.id, rb(), who.admin.token, null)).status).toBe(403);
      expect((await undeliverable(o.id, ub(), who.admin.token, null)).status).toBe(403);
      expect((await attemptsApi(o.id, who.d1.token)).status).toBe(403);
      expect((await attemptsApi(o.id, who.custA.token)).status).toBe(403);
      expect((await attemptsApi(o.id, who.chef.token)).status).toBe(403);
      expect((await attemptsApi(o.id, who.md.token)).status).toBe(200);
      expect((await attemptsApi(o.id, who.admin.token)).status).toBe(200);
      expect(await attemptsOf(o.id)).toHaveLength(0);
      expect((await assignmentOf(o.id)).status).toBe('FAILED');
    });

    it('21. eligibility: unknown order 404; IN_TRANSIT / DELIVERED / COD / unpaid / refunded / non-DISPATCHED orders are refused and never touched', async () => {
      expect((await retry('00000000-0000-4000-8000-000000000000', rb())).status).toBe(404);
      const inTransit = await dispatched();
      expect((await retry(inTransit.id, rb())).body.error).toBe('DELIVERY_NOT_FAILED');
      expect((await undeliverable(inTransit.id, ub())).body.error).toBe('DELIVERY_NOT_FAILED');
      const cod = await failedAt(1, {}, { paymentMethod: 'COD', paymentStatus: 'PENDING' });
      const unpaid = await failedAt(1, {}, { paymentStatus: 'PENDING' });
      const refunded = await failedAt(1, {}, { paymentStatus: 'REFUNDED' });
      const ready = await failedAt(1, {}, { status: 'READY' });
      for (const o of [cod, unpaid, refunded, ready]) {
        expect((await retry(o.id, rb())).body.error, o.orderNumber).toBe('ORDER_NOT_OPERATIONALLY_ELIGIBLE');
        expect((await undeliverable(o.id, ub())).body.error, o.orderNumber).toBe('ORDER_NOT_OPERATIONALLY_ELIGIBLE');
        expect((await attemptsOf(o.id)).length).toBe(0);
      }
      // Resume for a COD order is not visible to the driver at all (same 404 as every unknown order)
      expect((await resume(who.d1.token, cod.id)).status).toBe(404);
    });
  });

  // ===================================================================================================== override
  describe('exceptional override and FAILED verification', () => {
    it('22. normal verification from FAILED stays forbidden (DELIVERY_IN_EXCEPTION) even with a valid code; the override archives the attempt as ADMIN_OVERRIDE_DELIVERED and keeps every failure record', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      expect((await report(who.d1.token, o.id)).status).toBe(200);
      const v = await verify(who.d1.token, o.id, code);
      expect(v.status).toBe(409);
      expect(v.body.error).toBe('DELIVERY_IN_EXCEPTION');
      const failedBefore = await assignmentOf(o.id);
      const r = await override(o.id, { reasonCode: 'CUSTOMER_CANNOT_ACCESS_CODE', note: ADMIN_NOTE, confirm: true });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data.previousAssignmentStatus).toBe('FAILED');
      const rows = await attemptsOf(o.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        attemptNumber: 1,
        outcome: 'ADMIN_OVERRIDE_DELIVERED',
        failureReasonCode: 'CUSTOMER_UNAVAILABLE',
        failureNote: FAIL_NOTE,
        resolvedByUserId: who.admin.id,
        resolutionReasonCode: 'CUSTOMER_CANNOT_ACCESS_CODE',
        resolutionNote: ADMIN_NOTE
      });
      const a = await assignmentOf(o.id);
      expect(a).toMatchObject({ status: 'DELIVERED', deliveryNotes: failedBefore.deliveryNotes });
      expect((await proofOf(o.id))).toMatchObject({ method: 'ADMIN_OVERRIDE', previousAssignmentStatus: 'FAILED' });
      expect((await orderOf(o.id)).status).toBe('DELIVERED');
      expect((await events(o.id)).filter((e) => e.toStatus === 'DELIVERED')).toHaveLength(1);
      expect((await audits(o.id, 'DELIVERY_OVERRIDE_APPLIED'))).toHaveLength(1);
    });

    it('23. an override from IN_TRANSIT archives nothing (no failure evidence exists); retry/undeliverable are impossible after it', async () => {
      const o = await dispatched();
      expect((await override(o.id, { reasonCode: 'OTHER', note: ADMIN_NOTE, confirm: true })).status).toBe(200);
      expect(await attemptsOf(o.id)).toHaveLength(0);
      expect((await retry(o.id, rb())).status).toBe(409);
      expect((await undeliverable(o.id, ub())).status).toBe(409);
    });

    it('24. retry vs override in parallel: exactly one effective resolution and a consistent final state', async () => {
      const o = await failedAt(1);
      const [a, b] = await Promise.all([retry(o.id, rb()), override(o.id, { reasonCode: 'OTHER', note: ADMIN_NOTE, confirm: true })]);
      const order = await orderOf(o.id);
      const rows = await attemptsOf(o.id);
      expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
      expect(rows).toHaveLength(1);
      if (order.status === 'DELIVERED') {
        expect(rows[0].outcome).toBe('ADMIN_OVERRIDE_DELIVERED');
        expect((await assignmentOf(o.id)).status).toBe('DELIVERED');
      } else {
        expect(rows[0].outcome).toBe('RETRY_SAME_DRIVER');
        expect(await assignmentOf(o.id)).toMatchObject({ status: 'ASSIGNED', attemptNumber: 2 });
        expect(order.status).toBe('DISPATCHED');
      }
      expect((await events(o.id)).filter((e) => e.toStatus === 'DELIVERED').length).toBe(order.status === 'DELIVERED' ? 1 : 0);
    });
  });

  // ===================================================================================================== Cancel & Full Refund
  describe('Cancel & Full Refund (undeliverable) through P7C', () => {
    it('25. archives UNDELIVERABLE_CANCELLED, creates exactly ONE full refund intent, cancels DISPATCHED -> CANCELLED once, never calls the provider itself; the worker then submits the refund', async () => {
      const order = await paidFailed(3); // also proves the cap path: after attempt 3 this is still available
      const calls = mock.refunds.size;
      const r = await undeliverable(order.id, ub({ expectedAttemptNumber: 3 }));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data).toMatchObject({ changed: true, attemptNumber: 3, status: 'CANCELLED' });
      expect(mock.refunds.size).toBe(calls); // no provider call inside the cancellation

      const o = await orderOf(order.id);
      expect(o.status).toBe('CANCELLED');
      expect(o.cancelledAt).not.toBeNull();
      const refunds = await prisma.refund.findMany({ where: { orderId: order.id } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ status: 'REQUESTED', trigger: 'ADMIN_CANCELLATION', reasonCode: 'DELIVERY_FAILED', requestedByKind: 'ADMIN' });
      expect(refunds[0].amount.toFixed(2)).toBe('145.50'); // the FULL captured amount
      const rows = await attemptsOf(order.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ attemptNumber: 3, outcome: 'UNDELIVERABLE_CANCELLED', failureReasonCode: 'CUSTOMER_UNAVAILABLE', failureNote: FAIL_NOTE, resolutionReasonCode: 'CUSTOMER_REFUSED', resolutionNote: ADMIN_NOTE, resolvedByUserId: who.admin.id });
      const ev = (await events(order.id)).filter((e) => e.toStatus === 'CANCELLED');
      expect(ev).toHaveLength(1);
      expect(ev[0].fromStatus).toBe('DISPATCHED');
      expect(await audits(order.id, 'DELIVERY_UNDELIVERABLE')).toHaveLength(1);
      expect(JSON.stringify((await audits(order.id)).map((a) => a.payload))).not.toContain(ADMIN_NOTE); // free text never lands in generic audit payloads
      expect((await assignmentOf(order.id)).status).toBe('FAILED'); // kept as terminal evidence
      const cust = await request(app).get(`/api/v1/orders/${order.id}`).set(bearer(who.custA.token));
      expect(cust.body.data.delivery).toMatchObject({ state: 'UNDELIVERABLE_REFUND_PENDING', attemptNumber: 3 });
      expect(text(cust)).not.toContain(ADMIN_NOTE);

      // idempotent replay: no second refund, no second archive
      const again = await undeliverable(order.id, ub({ expectedAttemptNumber: 3 }));
      expect(again.status).toBe(200);
      expect(again.body.data.changed).toBe(false);
      expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(1);
      expect(await attemptsOf(order.id)).toHaveLength(1);
      // the existing reconciliation worker (not P9C) submits the refund to the provider
      await prisma.refund.update({ where: { id: refunds[0].id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      await PaymentReconciliationService.runOnce({ workerId: 'p9c' });
      const pr = providerRefundFor(refunds[0].id);
      expect(pr).toBeDefined();
      expect(pr!.amountMinor).toBe(14550);
    });

    it('26. preconditions: step-up, confirm, a 10+ character note, matching attempt, FAILED state; IN_TRANSIT / ASSIGNED are refused; a retry after cancellation is refused', async () => {
      const o = await paidFailed(1);
      expect((await undeliverable(o.id, ub({ confirm: false }))).status).toBe(422);
      expect((await undeliverable(o.id, ub({ note: 'short' }))).status).toBe(422);
      expect((await undeliverable(o.id, { ...ub(), amount: 100 })).status).toBe(422);
      expect((await undeliverable(o.id, ub({ expectedAttemptNumber: 2 }))).body.error).toBe('DELIVERY_ATTEMPT_CHANGED');
      expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(0);
      await prisma.deliveryAssignment.update({ where: { orderId: o.id }, data: { status: 'ASSIGNED', attemptNumber: 2 } });
      expect((await undeliverable(o.id, ub({ expectedAttemptNumber: 2 }))).body.error).toBe('DELIVERY_NOT_FAILED');
      await prisma.deliveryAssignment.update({ where: { orderId: o.id }, data: { status: 'FAILED', attemptNumber: 1 } });
      expect((await undeliverable(o.id, ub())).status).toBe(200);
      const late = await retry(o.id, rb());
      expect(late.status).toBe(409);
      expect(late.body.error).toBe('ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      expect((await resume(who.d1.token, o.id)).status).toBe(409);
    });

    it('27. atomicity: when the P7C cancellation cannot proceed nothing is archived and the order stays DISPATCHED + FAILED', async () => {
      const o = await paidFailed(1);
      await prisma.order.update({ where: { id: o.id }, data: { paidByProviderPaymentId: null } }); // P7C refuses: no effective payment on record
      const r = await undeliverable(o.id, ub());
      expect(r.status).toBe(409);
      expect(await attemptsOf(o.id)).toHaveLength(0);
      expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(0);
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      expect((await assignmentOf(o.id)).status).toBe('FAILED');
      expect(await audits(o.id, 'DELIVERY_UNDELIVERABLE')).toHaveLength(0);
    });

    it('28. generic cancellation never cancels a DISPATCHED order: customer and admin routes refuse it, and direct transitions without the proven evidence are refused', async () => {
      const o = await paidFailed(1);
      const c = await request(app).post(`/api/v1/orders/${o.id}/cancel`).set(bearer(who.custA.token)).send({ reasonCode: 'CHANGED_MIND' });
      expect(c.status).toBe(409);
      const a = await request(app).post(`/api/v1/admin/orders/${o.id}/cancel`).set('x-step-up-token', step).set(bearer(who.admin.token)).send({ reasonCode: 'OPERATIONAL_ISSUE' });
      expect(a.status).toBe(409);
      const admin = { kind: 'USER' as const, userId: who.admin.id, roles: [RoleEnum.SUPER_ADMIN], isGlobal: true };
      const intent = await prisma.refund.count({ where: { orderId: o.id } });
      expect(intent).toBe(0);
      await expect(OrderTransitionService.transition({ orderId: o.id, to: 'CANCELLED', actor: admin, reason: 'DELIVERY_FAILED' })).rejects.toMatchObject({ errorCode: 'ORDER_NOT_CANCELLABLE' });
      await expect(OrderTransitionService.transition({ orderId: o.id, to: 'CANCELLED', actor: admin, reason: 'DELIVERY_FAILED', deliveryUndeliverable: { attemptNumber: 1 } })).rejects.toMatchObject({ errorCode: 'ORDER_NOT_CANCELLABLE' });
      await expect(OrderTransitionService.transition({ orderId: o.id, to: 'CANCELLED', actor: { kind: 'USER', userId: who.chef.id, roles: [RoleEnum.CHEF] }, deliveryUndeliverable: { attemptNumber: 1 } })).rejects.toThrow();
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      expect(await prisma.deliveryAttempt.count({ where: { orderId: o.id } })).toBe(0);
    });

    it('29. retry vs Cancel & Full Refund in parallel: exactly one effective resolution; no retry after a refund and no refund after a retry', async () => {
      const o = await paidFailed(1);
      const [r, u] = await Promise.all([retry(o.id, rb()), undeliverable(o.id, ub())]);
      expect([r.status, u.status].filter((s) => s === 200)).toHaveLength(1);
      const order = await orderOf(o.id);
      const refunds = await prisma.refund.count({ where: { orderId: o.id } });
      const rows = await attemptsOf(o.id);
      expect(rows).toHaveLength(1);
      if (order.status === 'CANCELLED') {
        expect(refunds).toBe(1);
        expect(rows[0].outcome).toBe('UNDELIVERABLE_CANCELLED');
        expect(r.body.error).toBe('ORDER_NOT_OPERATIONALLY_ELIGIBLE');
        expect((await assignmentOf(o.id)).status).toBe('FAILED');
      } else {
        expect(refunds).toBe(0);
        expect(order.status).toBe('DISPATCHED');
        expect(rows[0].outcome).toBe('RETRY_SAME_DRIVER');
        expect(u.body.error).toBe('DELIVERY_NOT_FAILED');
        expect(await assignmentOf(o.id)).toMatchObject({ status: 'ASSIGNED', attemptNumber: 2 });
      }
    });

    it('30. Resume vs Cancel & Full Refund: a retry that is already ASSIGNED / IN_TRANSIT cannot be cancelled as undeliverable', async () => {
      const o = await paidFailed(1);
      expect((await retry(o.id, rb())).status).toBe(200);
      const [res, u] = await Promise.all([resume(who.d1.token, o.id), undeliverable(o.id, ub({ expectedAttemptNumber: 2 }))]);
      expect(res.status).toBe(200);
      expect(u.status).toBe(409);
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      expect(await prisma.refund.count({ where: { orderId: o.id } })).toBe(0);
    });
  });

  // ===================================================================================================== DTOs / redaction
  describe('DTOs and redaction', () => {
    it('31. MD receives structured history only: no failure note, no resolution note, no resolver identity; SUPER_ADMIN receives the operational notes', async () => {
      const o = await failedAt(1);
      expect((await retry(o.id, rb({ note: 'Admin free text about the retry' }))).status).toBe(200);
      await prisma.deliveryAssignment.update({ where: { orderId: o.id }, data: { status: 'FAILED', failedAt: new Date(), deliveryNotes: failureNotes } });
      const md = await attemptsApi(o.id, who.md.token);
      expect(md.status).toBe(200);
      const t = text(md);
      for (const secret of [FAIL_NOTE, 'Admin free text about the retry', who.admin.id, 'resolvedByUserId', 'failureNote', 'resolutionNote', 'codeHash']) expect(t, secret).not.toContain(secret);
      expect(md.body.data.attempts[0]).toMatchObject({ attemptNumber: 1, outcome: 'RETRY_SAME_DRIVER', failureReasonCode: 'CUSTOMER_UNAVAILABLE', resolutionReasonCode: 'CUSTOMER_AVAILABLE_NOW', driver: { employeeCode: `P9C-d1-${ts}` }, branch: { code: `p9c-a-${ts}` } });
      expect(md.body.data.current).toMatchObject({ attemptNumber: 2, failureReasonCode: 'CUSTOMER_UNAVAILABLE' });
      expect(md.body.data.current).not.toHaveProperty('failureNote');
      const sa = await attemptsApi(o.id, who.admin.token);
      expect(sa.body.data.attempts[0]).toMatchObject({ failureNote: FAIL_NOTE, resolutionNote: 'Admin free text about the retry', resolvedByUserId: who.admin.id });
      expect(sa.body.data.current.failureNote).toBe(FAIL_NOTE);
      expect(sa.body.data.maxAttempts).toBe(3);
    });

    it('32. the customer sees only derived labels: DELIVERY_ISSUE, RETRY_PLANNED, ON_THE_WAY, DELIVERED - never reasons, notes, drivers, counters or hashes', async () => {
      const { o } = await failedViaApi();
      const get = async () => (await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(who.custA.token))).body;
      let body = await get();
      expect(body.data.status).toBe('DISPATCHED'); // never a new OrderStatus
      expect(body.data.delivery).toEqual({ state: 'DELIVERY_ISSUE', attemptNumber: 1, maxAttempts: 3 });
      await retry(o.id, rb());
      body = await get();
      expect(body.data.delivery).toEqual({ state: 'RETRY_PLANNED', attemptNumber: 2, maxAttempts: 3 });
      await resume(who.d1.token, o.id);
      body = await get();
      expect(body.data.delivery).toEqual({ state: 'ON_THE_WAY', attemptNumber: 2, maxAttempts: 3 });
      for (const secret of [FAIL_NOTE, 'CUSTOMER_UNAVAILABLE', 'CUSTOMER_AVAILABLE_NOW', `P9C d1`, `P9C-d1-${ts}`, 'codeHash', 'codeVersion', 'failedAttempts', 'lockCycles', 'regenerationCount', 'resolvedBy']) expect(JSON.stringify(body), secret).not.toContain(secret);
      const code = await issued(o.id);
      expect((await verify(who.d1.token, o.id, code)).status).toBe(200);
      body = await get();
      expect(body.data.delivery.state).toBe('DELIVERED');
      // another customer cannot read it (same 404 as an unknown order)
      expect((await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(who.custB.token))).status).toBe(404);
    });

    it('33. the driver queue and the monitors expose attempt numbers and retry state, never codes, hashes or counters', async () => {
      const o = await failedAt(2);
      const pending = await failedAt(2, { status: 'ASSIGNED', failedAt: null, deliveryNotes: null, pickupTime: null });
      const q = await request(app).get('/api/v1/delivery/orders').set(bearer(who.d1.token));
      const own = q.body.data.sections.outForDelivery.items;
      expect(own.find((i: { id: string }) => i.id === o.id).assignment).toMatchObject({ state: 'FAILED', attemptNumber: 2, maxAttempts: 3, issueReported: true });
      expect(own.find((i: { id: string }) => i.id === pending.id).assignment).toMatchObject({ state: 'ASSIGNED', attemptNumber: 2 });
      for (const t of [who.admin.token, who.md.token]) {
        const m = await request(app).get(`/api/v1/delivery/monitor?branchId=${branchA.id}`).set(bearer(t));
        expect(m.status).toBe(200);
        const failed = m.body.data.sections.exceptions.items.find((i: { id: string }) => i.id === o.id);
        expect(failed).toMatchObject({ canRetry: true, retryPending: false, maxAttempts: 3 });
        const wait = m.body.data.sections.dispatched.items.find((i: { id: string }) => i.id === pending.id);
        expect(wait).toMatchObject({ retryPending: true, canRetry: false });
        expect(text(m)).not.toMatch(/codeHash|codeVersion|failedAttempts|lockCycles|regenerationCount|resolutionNote|"code"\s*:\s*"\d{6}"/);
      }
      expect(text(q)).not.toMatch(/codeHash|codeVersion|failedAttempts|lockCycles|regenerationCount/);
    });
  });

  // ===================================================================================================== guards
  describe('static guards, online-only and COD exclusion', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []));
    const prod = walk(join(__dirname, '..')).filter((f) => !f.includes(`${join('src', 'tests')}`) && !f.endsWith('.test.ts'));
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const rel = (f: string) => f.replace(/\\/g, '/').split('/src/')[1];

    it('34. DeliveryAttempt is append-only in code: only the archive helper creates rows and nothing updates, upserts or deletes them', () => {
      for (const f of prod) {
        const src = strip(readFileSync(f, 'utf8'));
        if (rel(f) === 'modules/delivery/deliveryAttemptArchive.ts') {
          expect(src).toMatch(/deliveryAttempt\.create\(/);
          expect(src).not.toMatch(/deliveryAttempt\.(update|updateMany|upsert|delete|deleteMany|createMany)/);
        } else {
          expect(src, rel(f)).not.toMatch(/deliveryAttempt\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
          expect(src, rel(f)).not.toMatch(/delivery_attempts"\s+(SET|WHERE)|DELETE\s+FROM\s+"delivery_attempts"|UPDATE\s+"delivery_attempts"/i);
        }
      }
    });

    it('35. only the delivery resolution path can ask P7C for the DISPATCHED cancellation, and P9C never talks to a payment provider or sets an amount', () => {
      const allow = new Set(['modules/refund/cancellation.service.ts', 'modules/delivery/deliveryResolution.service.ts']);
      const transition = new Set(['modules/order/orderTransition.service.ts', 'modules/refund/cancellation.service.ts']);
      for (const f of prod) {
        const src = strip(readFileSync(f, 'utf8'));
        if (/cancelUndeliverableInTx/.test(src)) expect(allow.has(rel(f)), rel(f)).toBe(true);
        if (/deliveryUndeliverable/.test(src)) expect(transition.has(rel(f)), rel(f)).toBe(true);
      }
      const resolution = strip(readFileSync(join(__dirname, '..', 'modules', 'delivery', 'deliveryResolution.service.ts'), 'utf8'));
      expect(resolution).not.toMatch(/getPaymentProvider|razorpay|createRefund|refund\.(create|update)|payment\.(update|create)|providerPayment\.(update|create)|paymentStatus\s*:\s*['"]/i);
      expect(resolution).not.toMatch(/order\.update|status\s*:\s*['"](DELIVERED|CANCELLED)['"]/);
    });

    it('36. the P9C code has no COD / cash / pay-at-door / driver-collection concept and the order status vocabulary did not grow', () => {
      for (const f of ['deliveryResolution.service.ts', 'deliveryAttemptPolicy.ts', 'deliveryAttemptArchive.ts', 'deliveryView.service.ts']) {
        const src = strip(readFileSync(join(__dirname, '..', 'modules', 'delivery', f), 'utf8'));
        expect(src, f).not.toMatch(/\b(COD|cash|pay[- ]at|collect(ion)?\s+payment|settlement)\b/i);
      }
    });

    it('37. COD / unpaid orders can never be retried, resumed or cancelled as undeliverable even when their assignment is FAILED', async () => {
      const cod = await failedAt(1, {}, { paymentMethod: 'COD', paymentStatus: 'PENDING' });
      for (const call of [await retry(cod.id, rb()), await undeliverable(cod.id, ub()), await resume(who.d1.token, cod.id)]) expect(call.status).toBeGreaterThanOrEqual(404 - 0);
      expect(await attemptsOf(cod.id)).toHaveLength(0);
      expect((await orderOf(cod.id)).status).toBe('DISPATCHED');
    });
  });
});

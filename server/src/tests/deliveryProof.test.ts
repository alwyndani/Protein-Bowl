import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DeliveryProofConfigError, parseDeliveryProofConfig } from '../config/deliveryProofConfig.js';
import { DeliveryProofService, MAX_REGENERATIONS, REGENERATE_WINDOW_MS, generateCode, hashCode, normalizeCode } from '../modules/delivery/deliveryProof.service.js';
import { OrderTransitionService } from '../modules/order/orderTransition.service.js';
import { roleHasPermission } from '../authz/permissions.js';

/**
 * P9B - Delivery Code (proof of handover): issue / regenerate / customer state, driver verification, persisted attempt protection,
 * the proof-backed DISPATCHED -> DELIVERED transition, the exceptional SUPER_ADMIN override, and the leakage guarantees.
 * Real PostgreSQL. Orders are created directly in the states under test (like the kitchen/delivery suites).
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const PASSWORD = 'P9B#Delivery-Code-Pass-2026-xyz';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('P9B - Delivery Code proof of delivery', () => {
  const ts = Date.now();
  let seq = 0;
  type Who = { id: string; email: string; token: string; profileId?: string; employeeId?: string };
  const who: Record<string, Who> = {};
  let branchA: { id: string };
  let branchB: { id: string };
  let step = '';

  async function mkUser(label: string, roles: RoleEnum[], branchIds: string[] = []): Promise<Who> {
    const email = `p9b_${label}_${ts}@test.com`;
    const customer = roles.includes(RoleEnum.CUSTOMER);
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        ...(customer
          ? { customerProfile: { create: { fullName: `Customer ${label}`, referralCode: `PB-P9B${label.toUpperCase()}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `P9B-${label}-${ts}`, fullName: `P9B ${label}`, designation: 'Test', assignedBranchId: branchIds[0] ?? null } } })
      },
      include: { customerProfile: true, employeeProfile: true }
    });
    for (const branchId of branchIds) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile!.id, branchId } });
    who[label] = { id: u.id, email, token: sign(u.id, email, roles), profileId: u.customerProfile?.id, employeeId: u.employeeProfile?.id };
    return who[label];
  }

  /** A DISPATCHED + PAID + ONLINE order owned by custA, with an IN_TRANSIT assignment of driver d1 (branch A). */
  const dispatched = async (over: Record<string, unknown> = {}, assignment: Record<string, unknown> = {}) => {
    const n = ++seq;
    return prisma.order.create({
      data: {
        orderNumber: `P9B-${ts}-${n}`,
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
        delivery: { create: { driverId: who.d1.employeeId, branchId: branchA.id, status: 'IN_TRANSIT', pickupTime: new Date(), ...assignment } },
        ...over
      } as never
    });
  };

  const cState = (token: string, id: string) => request(app).get(`/api/v1/orders/${id}/delivery-code`).set(bearer(token));
  const cIssue = (token: string, id: string, body: Record<string, unknown> = {}) => request(app).post(`/api/v1/orders/${id}/delivery-code`).set(bearer(token)).send(body);
  const cRegen = (token: string, id: string, body: Record<string, unknown> = {}) => request(app).post(`/api/v1/orders/${id}/delivery-code/regenerate`).set(bearer(token)).send(body);
  const verify = (token: string, id: string, code: unknown) => request(app).post(`/api/v1/delivery/orders/${id}/verify-delivery`).set(bearer(token)).send({ code });
  const report = (token: string, id: string, reasonCode = 'CUSTOMER_UNAVAILABLE') => request(app).post(`/api/v1/delivery/orders/${id}/report-failure`).set(bearer(token)).send({ reasonCode });
  const override = (id: string, body: Record<string, unknown>, token = who.admin.token, stepToken: string | null = step) => {
    const r = request(app).post(`/api/v1/admin/orders/${id}/delivery-override`).set(bearer(token));
    return (stepToken ? r.set('x-step-up-token', stepToken) : r).send(body);
  };
  const goodOverride = { reasonCode: 'CUSTOMER_CANNOT_ACCESS_CODE', note: 'Customer phone died; confirmed by phone call', confirm: true };

  const proofOf = (orderId: string) => prisma.deliveryProof.findUnique({ where: { orderId } });
  const orderOf = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
  const assignmentOf = (orderId: string) => prisma.deliveryAssignment.findUniqueOrThrow({ where: { orderId } });
  const events = (orderId: string) => prisma.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  const audits = (entityId: string, action?: string) => prisma.auditLog.findMany({ where: { entityId, ...(action ? { action } : {}) } });
  /** Pretend the current code was issued a while ago (the persisted regeneration cooldown is derived from issuedAt). */
  const age = (orderId: string, ms = 5 * 60 * 1000) => prisma.deliveryProof.update({ where: { orderId }, data: { issuedAt: new Date(Date.now() - ms) } });
  /** Issue through the API and return the plaintext code (only ever held in test memory). */
  const issued = async (orderId: string, token = who.custA.token) => {
    const r = await cIssue(token, orderId);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.data.code as string;
  };
  const wrongCode = (real: string) => (real === '000000' ? '111111' : '000000');
  const text = (res: { body: unknown }) => JSON.stringify(res.body);

  beforeAll(async () => {
    branchA = await prisma.kitchenBranch.create({ data: { code: `p9b-a-${ts}`, name: 'P9B Branch A', address: 'A', city: 'Kochi' } });
    branchB = await prisma.kitchenBranch.create({ data: { code: `p9b-b-${ts}`, name: 'P9B Branch B', address: 'B', city: 'Kozhikode' } });
    await mkUser('custA', [RoleEnum.CUSTOMER]);
    await mkUser('custB', [RoleEnum.CUSTOMER]);
    await mkUser('admin', [RoleEnum.SUPER_ADMIN]);
    await mkUser('md', [RoleEnum.MD]);
    await mkUser('chef', [RoleEnum.CHEF], [branchA.id]);
    await mkUser('d1', [RoleEnum.DELIVERY], [branchA.id]);
    await mkUser('d2', [RoleEnum.DELIVERY], [branchA.id]);
    await mkUser('dB', [RoleEnum.DELIVERY], [branchB.id]);
    const su = await request(app).post('/api/v1/admin/step-up').set(bearer(who.admin.token)).send({ password: PASSWORD });
    expect(su.status).toBe(200);
    step = su.body.data.stepUpToken;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ===================================================================================================== unit: code, hash, config
  describe('code generation, hashing and configuration', () => {
    it('1. codes are 6 digits from the CSPRNG: always 6 characters, leading zeros kept, well spread, never derived from anything', () => {
      const codes = Array.from({ length: 3000 }, () => generateCode());
      for (const c of codes) expect(c).toMatch(/^\d{6}$/);
      expect(new Set(codes).size).toBeGreaterThan(2900); // not constant / not a tiny space
      expect(codes.some((c) => c.startsWith('0'))).toBe(true); // padding works
      const src = readFileSync(join(__dirname, '..', 'modules', 'delivery', 'deliveryProof.service.ts'), 'utf8');
      expect(src).toContain('randomInt(0, 10 ** CODE_LENGTH)');
      expect(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')).not.toMatch(/Math\.random/);
    });

    it('2. the HMAC binds domain, order id, code version and code; it is deterministic, 64 hex, and not the code', () => {
      const h = hashCode('order-1', 1, '123456');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect(hashCode('order-1', 1, '123456')).toBe(h);
      expect(hashCode('order-2', 1, '123456')).not.toBe(h);
      expect(hashCode('order-1', 2, '123456')).not.toBe(h);
      expect(hashCode('order-1', 1, '123457')).not.toBe(h);
      expect(h).not.toContain('123456');
    });

    it('3. DELIVERY_PROOF_SECRET: production fails closed without it, a short one is refused everywhere, development has a labelled fallback', () => {
      expect(() => parseDeliveryProofConfig({}, 'production')).toThrow(DeliveryProofConfigError);
      expect(() => parseDeliveryProofConfig({ DELIVERY_PROOF_SECRET: '   ' }, 'production')).toThrow(/must be set explicitly in production/);
      expect(() => parseDeliveryProofConfig({ DELIVERY_PROOF_SECRET: 'too-short' }, 'development')).toThrow(/at least 32/);
      expect(() => parseDeliveryProofConfig({ DELIVERY_PROOF_SECRET: 'too-short' }, 'production')).toThrow(/at least 32/);
      const ok = parseDeliveryProofConfig({ DELIVERY_PROOF_SECRET: 'x'.repeat(32) }, 'production');
      expect(ok.secretSource).toBe('ENVIRONMENT');
      const dev = parseDeliveryProofConfig({}, 'development');
      expect(dev.secretSource).toBe('DEVELOPMENT_FALLBACK');
      expect(dev.secret.length).toBeGreaterThanOrEqual(32);
      expect(parseDeliveryProofConfig({}, 'test').secretSource).toBe('DEVELOPMENT_FALLBACK');
    });

    it('4. normalization accepts 123456 / "123 456" / 123-456 and nothing else (and never echoes the input)', () => {
      expect(normalizeCode('123456')).toBe('123456');
      expect(normalizeCode(' 123 456 ')).toBe('123456');
      expect(normalizeCode('123-456')).toBe('123456');
      for (const bad of ['12345', '1234567', 'abcdef', '12 34 5a', '', '１２３４５６', '123_456']) expect(normalizeCode(bad), bad).toBeNull();
    });
  });

  // ===================================================================================================== customer API
  describe('customer issue / state / regenerate', () => {
    it('5. only the owning CUSTOMER can use the customer endpoints: unauthenticated 401; staff 403; another customer and unknown orders are the same 404', async () => {
      const o = await dispatched();
      expect((await request(app).get(`/api/v1/orders/${o.id}/delivery-code`)).status).toBe(401);
      for (const label of ['d1', 'admin', 'md', 'chef']) {
        expect((await cState(who[label].token, o.id)).status, label).toBe(403);
        expect((await cIssue(who[label].token, o.id)).status, label).toBe(403);
        expect((await cRegen(who[label].token, o.id)).status, label).toBe(403);
      }
      const missing = await cState(who.custB.token, '00000000-0000-4000-8000-000000000000');
      for (const r of [await cState(who.custB.token, o.id), await cIssue(who.custB.token, o.id), await cRegen(who.custB.token, o.id)]) {
        expect(r.status).toBe(404);
        expect(r.body).toEqual(missing.body);
      }
      expect(await proofOf(o.id)).toBeNull();
    });

    it('6. a code exists only for a DISPATCHED + ONLINE + PAID order: other states are NOT_AVAILABLE / 409 and nothing is created', async () => {
      for (const over of [{ status: 'READY' }, { status: 'CONFIRMED' }, { paymentStatus: 'PENDING' }, { paymentStatus: 'REFUNDED' }, { paymentMethod: 'COD' }]) {
        const o = await dispatched(over);
        const r = await cIssue(who.custA.token, o.id);
        expect(r.status, JSON.stringify(over)).toBe(409);
        expect(r.body.error).toBe('DELIVERY_CODE_NOT_AVAILABLE');
        expect(await proofOf(o.id)).toBeNull();
      }
      const ready = await dispatched({ status: 'READY' });
      expect((await cState(who.custA.token, ready.id)).body.data.state).toBe('NOT_AVAILABLE');
    });

    it('7. issue: 201 with a 6-digit code and no-store; ISSUED state afterwards WITHOUT the code; the database holds only the HMAC', async () => {
      const o = await dispatched();
      expect((await cState(who.custA.token, o.id)).body.data.state).toBe('NOT_ISSUED');
      const r = await cIssue(who.custA.token, o.id);
      expect(r.status).toBe(201);
      expect(r.headers['cache-control']).toMatch(/no-store/);
      const code = r.body.data.code as string;
      expect(code).toMatch(/^\d{6}$/);
      expect(Object.keys(r.body.data).sort()).toEqual(['code', 'issuedAt', 'lockedUntil', 'state']);

      const st = await cState(who.custA.token, o.id);
      expect(st.body.data).toMatchObject({ state: 'ISSUED', lockedUntil: null });
      expect(Object.keys(st.body.data).sort()).toEqual(['issuedAt', 'lockedUntil', 'state']);
      expect(text(st)).not.toContain(code);

      const row = (await proofOf(o.id))!;
      expect(row.codeHash).toBe(hashCode(o.id, 1, code));
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row).toMatchObject({ codeVersion: 1, regenerationCount: 0, failedAttempts: 0, lockCycles: 0, lockedUntil: null, blockedAt: null, verifiedAt: null });
      for (const v of Object.values(row)) expect(v, 'plaintext stored').not.toBe(code);
      const ev = await audits(o.id, 'DELIVERY_CODE_ISSUED');
      expect(ev).toHaveLength(1);
      expect(JSON.stringify(ev[0].payload)).not.toContain(`"${code}"`);
    });

    it('8. a double click / retry of ISSUE never creates a second code (409) and the first code keeps working; the body is strict', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      const before = (await proofOf(o.id))!.codeHash;
      const again = await cIssue(who.custA.token, o.id);
      expect(again.status).toBe(409);
      expect(again.body.error).toBe('DELIVERY_CODE_ALREADY_ISSUED');
      expect(text(again)).not.toContain(code);
      expect((await proofOf(o.id))!.codeHash).toBe(before);
      expect((await cIssue(who.custA.token, o.id, { code: '123456' })).status).toBe(422);
      expect((await cRegen(who.custA.token, o.id, { regenerate: true })).status).toBe(422);
      const parallel = await dispatched();
      const rs = await Promise.all([cIssue(who.custA.token, parallel.id), cIssue(who.custA.token, parallel.id), cIssue(who.custA.token, parallel.id)]);
      expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
      expect(rs.filter((r) => r.status === 409).every((r) => r.body.error === 'DELIVERY_CODE_ALREADY_ISSUED')).toBe(true);
    });

    it('9. regenerate: needs an issued code; then a NEW code replaces the old one (version + 1, old hash gone)', async () => {
      const o = await dispatched();
      const none = await cRegen(who.custA.token, o.id);
      expect(none.status).toBe(409);
      expect(none.body.error).toBe('DELIVERY_CODE_NOT_ISSUED');
      const first = await issued(o.id);
      expect((await proofOf(o.id))!.codeVersion).toBe(1);
      const r = await cRegen(who.custA.token, o.id);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.headers['cache-control']).toMatch(/no-store/);
      const second = r.body.data.code as string;
      expect(second).toMatch(/^\d{6}$/);
      const row = (await proofOf(o.id))!;
      expect(row).toMatchObject({ codeVersion: 2, regenerationCount: 1, regenerationsInWindow: 1 });
      expect(row.regenerationWindowStartedAt).not.toBeNull();
      expect(row.codeHash).toBe(hashCode(o.id, 2, second));
      expect(row.codeHash).not.toBe(hashCode(o.id, 1, first));
      expect(await audits(o.id, 'DELIVERY_CODE_REGENERATED')).toHaveLength(1);
    });

    it('10. the OLD code is dead immediately after regeneration (it is just a wrong code now) and the new one completes the delivery', async () => {
      const o = await dispatched();
      const first = await issued(o.id);
      await age(o.id);
      const second = (await cRegen(who.custA.token, o.id)).body.data.code as string;
      if (first !== second) {
        const stale = await verify(who.d1.token, o.id, first);
        expect(stale.status).toBe(422);
        expect(stale.body.error).toBe('INVALID_DELIVERY_CODE');
      }
      expect((await verify(who.d1.token, o.id, second)).status).toBe(200);
      expect((await orderOf(o.id)).status).toBe('DELIVERED');
    });

    it('11. the lifetime cap: regenerationCount is cumulative and never reset; at 10 regeneration is refused', async () => {
      const o = await dispatched();
      await issued(o.id);
      for (let i = 1; i <= 2; i++) {
        await age(o.id);
        expect((await cRegen(who.custA.token, o.id)).status).toBe(200);
        expect((await proofOf(o.id))!.regenerationCount).toBe(i);
      }
      await prisma.deliveryProof.update({ where: { orderId: o.id }, data: { regenerationCount: MAX_REGENERATIONS, issuedAt: new Date(Date.now() - 600000) } });
      const blocked = await cRegen(who.custA.token, o.id);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toBe('DELIVERY_CODE_REGENERATION_LIMIT');
      expect((await proofOf(o.id))!.regenerationCount).toBe(MAX_REGENERATIONS);
    });

    it('11b. 3 regenerations per hour per order (persisted window): the 4th is refused and changes NOTHING; the window then expires and a fresh one starts', async () => {
      const o = await dispatched();
      await issued(o.id);
      for (let i = 1; i <= 3; i++) {
        const r = await cRegen(who.custA.token, o.id);
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        expect(await proofOf(o.id)).toMatchObject({ regenerationCount: i, regenerationsInWindow: i, codeVersion: i + 1 });
      }
      // give the current code some security state that a rejected request must not touch
      await prisma.deliveryProof.update({ where: { orderId: o.id }, data: { failedAttempts: 2 } });
      const before = (await proofOf(o.id))!;
      const fourth = await cRegen(who.custA.token, o.id);
      expect(fourth.status).toBe(429);
      expect(fourth.body.error).toBe('DELIVERY_CODE_REGENERATE_LIMIT');
      expect(text(fourth)).not.toMatch(/d{6}/);
      const after = (await proofOf(o.id))!;
      expect(after).toMatchObject({ codeVersion: before.codeVersion, codeHash: before.codeHash, regenerationCount: 3, regenerationsInWindow: 3, failedAttempts: 2, lockCycles: before.lockCycles });
      expect(after.issuedAt!.getTime()).toBe(before.issuedAt!.getTime());
      expect(await audits(o.id, 'DELIVERY_CODE_REGENERATED')).toHaveLength(3);

      // the window is still active just before one hour...
      await prisma.deliveryProof.update({ where: { orderId: o.id }, data: { regenerationWindowStartedAt: new Date(Date.now() - (REGENERATE_WINDOW_MS - 60000)) } });
      expect((await cRegen(who.custA.token, o.id)).status).toBe(429);
      // ...and a fresh one starts once the hour has elapsed
      await prisma.deliveryProof.update({ where: { orderId: o.id }, data: { regenerationWindowStartedAt: new Date(Date.now() - REGENERATE_WINDOW_MS - 1000) } });
      const ok = await cRegen(who.custA.token, o.id);
      expect(ok.status).toBe(200);
      const row = (await proofOf(o.id))!;
      expect(row).toMatchObject({ regenerationCount: 4, regenerationsInWindow: 1, codeVersion: 5 });
      expect(Date.now() - row.regenerationWindowStartedAt!.getTime()).toBeLessThan(60000);
    });

    it('11c. the lifetime cap (10) is independent of the hourly window: an expired window cannot exceed it, and the window state survives a fresh service call (it lives in the database)', async () => {
      const o = await dispatched();
      await issued(o.id);
      await prisma.deliveryProof.update({ where: { orderId: o.id }, data: { regenerationCount: MAX_REGENERATIONS, regenerationsInWindow: 1, regenerationWindowStartedAt: new Date(Date.now() - REGENERATE_WINDOW_MS - 1000) } });
      const r = await cRegen(who.custA.token, o.id);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('DELIVERY_CODE_REGENERATION_LIMIT');
      expect(await proofOf(o.id)).toMatchObject({ regenerationCount: MAX_REGENERATIONS, regenerationsInWindow: 1, codeVersion: 1 });
      // service-level call with no HTTP/middleware state at all: the persisted window alone decides
      const o2 = await dispatched();
      await issued(o2.id);
      const cust = { userId: who.custA.id, customerProfileId: who.custA.profileId! };
      for (let i = 0; i < 3; i++) await DeliveryProofService.regenerate(o2.id, cust);
      await expect(DeliveryProofService.regenerate(o2.id, cust)).rejects.toMatchObject({ errorCode: 'DELIVERY_CODE_REGENERATE_LIMIT' });
    });

    it('11d. concurrency: 5 parallel regenerations succeed at most 3 times and the persisted counters match exactly the successes', async () => {
      const o = await dispatched();
      await issued(o.id);
      const rs = await Promise.all([1, 2, 3, 4, 5].map(() => cRegen(who.custA.token, o.id)));
      const ok = rs.filter((r) => r.status === 200);
      const refused = rs.filter((r) => r.status === 429);
      expect(ok).toHaveLength(3);
      expect(refused).toHaveLength(2);
      expect(refused.every((r) => r.body.error === 'DELIVERY_CODE_REGENERATE_LIMIT')).toBe(true);
      const row = (await proofOf(o.id))!;
      expect(row).toMatchObject({ regenerationCount: 3, regenerationsInWindow: 3, codeVersion: 4 });
      expect(await audits(o.id, 'DELIVERY_CODE_REGENERATED')).toHaveLength(3);
      // exactly the last committed code is valid
      const codes = ok.map((r) => r.body.data.code as string);
      const valid = codes.filter((c) => hashCode(o.id, 4, c) === row.codeHash);
      expect(valid).toHaveLength(1);
    });

    it('12. regeneration resets the CURRENT code\'s counters and block but keeps the cumulative count and the audit history', async () => {
      const o = await dispatched();
      await issued(o.id);
      await prisma.deliveryProof.update({
        where: { orderId: o.id },
        data: { failedAttempts: 3, lockCycles: 3, lockedUntil: new Date(Date.now() + 600000), blockedAt: new Date(), regenerationCount: 4, issuedAt: new Date(Date.now() - 600000) }
      });
      expect((await cState(who.custA.token, o.id)).body.data.state).toBe('CODE_BLOCKED');
      expect((await cRegen(who.custA.token, o.id)).status).toBe(200);
      expect(await proofOf(o.id)).toMatchObject({ failedAttempts: 0, lockCycles: 0, lockedUntil: null, blockedAt: null, regenerationCount: 5, codeVersion: 2 });
      expect((await cState(who.custA.token, o.id)).body.data.state).toBe('ISSUED');
      expect((await audits(o.id, 'DELIVERY_CODE_REGENERATED')).length).toBe(1); // evidence is kept, not rewritten
    });

    it('13. existing DISPATCHED orders without a proof row are simply NOT_ISSUED / CODE_NOT_ISSUED; nothing is auto-delivered', async () => {
      const o = await dispatched();
      expect((await cState(who.custA.token, o.id)).body.data.state).toBe('NOT_ISSUED');
      const q = await request(app).get('/api/v1/delivery/orders').set(bearer(who.d1.token));
      const item = q.body.data.sections.outForDelivery.items.find((x: { id: string }) => x.id === o.id);
      expect(item.proof).toEqual({ state: 'CODE_NOT_ISSUED', lockedUntil: null });
      expect((await verify(who.d1.token, o.id, '123456')).body.error).toBe('DELIVERY_CODE_NOT_ISSUED');
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      expect(await proofOf(o.id)).toBeNull(); // verification never creates rows
    });
  });

  // ===================================================================================================== normal verification
  describe('driver verification', () => {
    it('14. the owner completes delivery atomically: proof evidence, assignment DELIVERED + deliveryTime, ONE event, ONE status audit, payment untouched', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      const res = await verify(who.d1.token, o.id, code);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toMatchObject({ changed: true, order: { id: o.id, orderNumber: o.orderNumber, status: 'DELIVERED' } });
      expect(Object.keys(res.body.data.order).sort()).toEqual(['deliveredAt', 'id', 'orderNumber', 'status']);
      expect(text(res)).not.toMatch(/Asha|98765|Secret Street/); // no PII added to the driver

      const order = await orderOf(o.id);
      expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID', paymentMethod: 'ONLINE' });
      const a = await assignmentOf(o.id);
      expect(a.status).toBe('DELIVERED');
      expect(a.deliveryTime).not.toBeNull();
      const p = (await proofOf(o.id))!;
      expect(p).toMatchObject({ method: 'PIN', verifiedByEmployeeId: who.d1.employeeId, previousAssignmentStatus: 'IN_TRANSIT', failedAttempts: 0 });
      expect(p.verifiedAt).not.toBeNull();
      const ev = await events(o.id);
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ fromStatus: 'DISPATCHED', toStatus: 'DELIVERED', actorUserId: who.d1.id, actorRole: 'DELIVERY' });
      expect(await audits(o.id, 'ORDER_STATUS_CHANGED')).toHaveLength(1);
      expect(await audits(o.id, 'DELIVERY_VERIFIED')).toHaveLength(1);
      expect((await cState(who.custA.token, o.id)).body.data.state).toBe('VERIFIED');
      const q = await request(app).get('/api/v1/delivery/orders').set(bearer(who.d1.token));
      expect(JSON.stringify(q.body.data.sections)).not.toContain(o.id);
    });

    it('15. customer-friendly input works: "123 456" and "123-456"; malformed input is a fixed 422 that is not counted and never echoes the value', async () => {
      const o1 = await dispatched();
      const c1 = await issued(o1.id);
      expect((await verify(who.d1.token, o1.id, `${c1.slice(0, 3)} ${c1.slice(3)}`)).status).toBe(200);
      const o2 = await dispatched();
      const c2 = await issued(o2.id);
      expect((await verify(who.d1.token, o2.id, `${c2.slice(0, 3)}-${c2.slice(3)}`)).status).toBe(200);

      const o3 = await dispatched();
      await issued(o3.id);
      for (const bad of ['12345', 'abcdef', '1234567', '12 3x56']) {
        const r = await verify(who.d1.token, o3.id, bad);
        expect(r.status, bad).toBe(422);
        expect(r.body.error).toBe('INVALID_DELIVERY_CODE_FORMAT');
        expect(text(r)).not.toContain(bad);
      }
      expect((await proofOf(o3.id))!.failedAttempts).toBe(0);
      for (const body of [{}, { code: 123456 }, { code: '123456', extra: 1 }, { code: ['123456'] }]) {
        const r = await request(app).post(`/api/v1/delivery/orders/${o3.id}/verify-delivery`).set(bearer(who.d1.token)).send(body);
        expect(r.status).toBe(422);
        expect(text(r)).not.toContain('123456');
      }
    });

    it('16. only the assigned DELIVERY owner: customers, chef, MD and SUPER_ADMIN get 403; a same-branch driver and a foreign-branch driver get the SAME 404', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      for (const label of ['custA', 'chef', 'md', 'admin']) expect((await verify(who[label].token, o.id, code)).status, label).toBe(403);
      const unknown = await verify(who.d2.token, '00000000-0000-4000-8000-000000000000', code);
      for (const label of ['d2', 'dB']) {
        const r = await verify(who[label].token, o.id, code);
        expect(r.status, label).toBe(404);
        expect(r.body).toEqual(unknown.body);
      }
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      expect((await proofOf(o.id))!.failedAttempts).toBe(0); // a non-owner can never even burn attempts
    });

    it('17. an assignment that is not IN_TRANSIT cannot complete: FAILED is refused with DELIVERY_IN_EXCEPTION and nothing changes (no revival)', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      expect((await report(who.d1.token, o.id)).status).toBe(200);
      const r = await verify(who.d1.token, o.id, code);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('DELIVERY_IN_EXCEPTION');
      expect((await assignmentOf(o.id)).status).toBe('FAILED');
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      expect((await proofOf(o.id))!.verifiedAt).toBeNull();
      expect((await proofOf(o.id))!.failedAttempts).toBe(0);
      const q = await request(app).get('/api/v1/delivery/orders').set(bearer(who.d1.token));
      expect(q.body.data.sections.outForDelivery.items.find((x: { id: string }) => x.id === o.id).assignment.issueReported).toBe(true);
    });

    it('18. only DISPATCHED + PAID + ONLINE orders complete: a refund before verification blocks it (409), the order stays DISPATCHED', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      await prisma.order.update({ where: { id: o.id }, data: { paymentStatus: 'REFUNDED' } });
      const r = await verify(who.d1.token, o.id, code);
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      expect((await assignmentOf(o.id)).status).toBe('IN_TRANSIT');
      const cod = await dispatched({ paymentMethod: 'COD' });
      expect((await verify(who.d1.token, cod.id, '123456')).status).toBe(404); // historical COD is invisible to the delivery module
    });

    it('19. verify vs refund: a payment change that holds the order lock while verification is already waiting wins - nothing is half-applied', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      let pending!: Promise<request.Response>;
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${o.id} FOR UPDATE`;
        await tx.order.updateMany({ where: { id: o.id }, data: { paymentStatus: 'REFUNDED' } });
        pending = Promise.resolve(verify(who.d1.token, o.id, code)).then((r) => r);
        await new Promise((r) => setTimeout(r, 400));
      });
      const r = await pending;
      expect(r.status).toBe(409);
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      expect((await proofOf(o.id))!.verifiedAt).toBeNull();
      expect(await events(o.id)).toHaveLength(0);
    });

    it('20. double verify: the owner\'s replay with the correct code is changed:false; a wrong code after delivery is 409 ALREADY_DELIVERED and is NOT counted', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      expect((await verify(who.d1.token, o.id, code)).body.data.changed).toBe(true);
      const replay = await verify(who.d1.token, o.id, code);
      expect(replay.status).toBe(200);
      expect(replay.body.data.changed).toBe(false);
      const wrong = await verify(who.d1.token, o.id, wrongCode(code));
      expect(wrong.status).toBe(409);
      expect(wrong.body.error).toBe('ALREADY_DELIVERED');
      expect((await proofOf(o.id))!.failedAttempts).toBe(0);
      expect(await events(o.id)).toHaveLength(1);
      expect((await verify(who.d2.token, o.id, code)).status).toBe(404);
    });

    it('21. parallel correct verifications (two tabs / double click): exactly ONE completion, one event, one audit row', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      const rs = await Promise.all([verify(who.d1.token, o.id, code), verify(who.d1.token, o.id, code), verify(who.d1.token, o.id, code), verify(who.d1.token, o.id, code)]);
      expect(rs.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      expect(rs.filter((r) => r.body.data.changed)).toHaveLength(1);
      expect(await events(o.id)).toHaveLength(1);
      expect(await audits(o.id, 'DELIVERY_VERIFIED')).toHaveLength(1);
      expect(await audits(o.id, 'ORDER_STATUS_CHANGED')).toHaveLength(1);
    });
  });

  // ===================================================================================================== attempt policy
  describe('persisted attempt protection', () => {
    it('22. wrong attempts PERSIST: four wrong codes are counted (422), the fifth locks for 15 minutes (committed, not rolled back)', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      const bad = wrongCode(code);
      for (let i = 1; i <= 4; i++) {
        const r = await verify(who.d1.token, o.id, bad);
        expect(r.status).toBe(422);
        expect(r.body.error).toBe('INVALID_DELIVERY_CODE');
        expect((await proofOf(o.id))!.failedAttempts).toBe(i);
        expect(text(r)).not.toContain(bad);
      }
      const fifth = await verify(who.d1.token, o.id, bad);
      expect(fifth.status).toBe(409);
      expect(fifth.body.error).toBe('DELIVERY_CODE_LOCKED');
      const p = (await proofOf(o.id))!;
      expect(p).toMatchObject({ failedAttempts: 0, lockCycles: 1, blockedAt: null });
      const ms = p.lockedUntil!.getTime() - Date.now();
      expect(ms).toBeGreaterThan(14 * 60 * 1000);
      expect(ms).toBeLessThanOrEqual(15 * 60 * 1000);
      expect(await audits(o.id, 'DELIVERY_VERIFY_FAILED')).toHaveLength(5);
      expect(await audits(o.id, 'DELIVERY_VERIFY_LOCKED')).toHaveLength(1);
      // locked: even the CORRECT code is refused and nothing is counted
      const locked = await verify(who.d1.token, o.id, code);
      expect(locked.status).toBe(409);
      expect(locked.body.error).toBe('DELIVERY_CODE_LOCKED');
      expect((await proofOf(o.id))!).toMatchObject({ failedAttempts: 0, lockCycles: 1 });
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      // the customer and the driver see the lock as a SAFE state
      expect((await cState(who.custA.token, o.id)).body.data.state).toBe('LOCKED');
      const q = await request(app).get('/api/v1/delivery/orders').set(bearer(who.d1.token));
      const item = q.body.data.sections.outForDelivery.items.find((x: { id: string }) => x.id === o.id);
      expect(item.proof.state).toBe('LOCKED');
      expect(Object.keys(item.proof).sort()).toEqual(['lockedUntil', 'state']);
    });

    it('23. when the lock expires a NEW five-attempt window opens (and the correct code works again)', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      for (let i = 0; i < 5; i++) await verify(who.d1.token, o.id, wrongCode(code));
      await prisma.deliveryProof.update({ where: { orderId: o.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
      expect((await verify(who.d1.token, o.id, wrongCode(code))).status).toBe(422);
      expect((await proofOf(o.id))!.failedAttempts).toBe(1);
      expect((await verify(who.d1.token, o.id, code)).status).toBe(200);
    });

    it('24. three lock cycles permanently BLOCK the current code (even the correct code is refused); only regeneration clears it', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      for (let cycle = 1; cycle <= 3; cycle++) {
        for (let i = 0; i < 5; i++) await verify(who.d1.token, o.id, wrongCode(code));
        const p = (await proofOf(o.id))!;
        expect(p.lockCycles).toBe(cycle);
        if (cycle < 3) {
          expect(p.blockedAt).toBeNull();
          await prisma.deliveryProof.update({ where: { orderId: o.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
        } else {
          expect(p.blockedAt).not.toBeNull();
        }
      }
      expect(await audits(o.id, 'DELIVERY_VERIFY_FAILED')).toHaveLength(15);
      expect(await audits(o.id, 'DELIVERY_VERIFY_LOCKED')).toHaveLength(3);
      expect(await audits(o.id, 'DELIVERY_CODE_BLOCKED')).toHaveLength(1);
      const blocked = await verify(who.d1.token, o.id, code);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toBe('DELIVERY_CODE_BLOCKED');
      expect((await cState(who.custA.token, o.id)).body.data.state).toBe('CODE_BLOCKED');
      const q = await request(app).get('/api/v1/delivery/orders').set(bearer(who.d1.token));
      expect(q.body.data.sections.outForDelivery.items.find((x: { id: string }) => x.id === o.id).proof.state).toBe('CODE_BLOCKED');

      await age(o.id);
      const fresh = (await cRegen(who.custA.token, o.id)).body.data.code as string;
      expect((await verify(who.d1.token, o.id, fresh)).status).toBe(200);
    });

    it('25. ten PARALLEL wrong guesses cannot bypass the boundary: exactly five are counted, the rest meet the committed lock', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      const bad = wrongCode(code);
      const rs = await Promise.all(Array.from({ length: 10 }, () => verify(who.d1.token, o.id, bad)));
      expect(rs.filter((r) => r.status === 422)).toHaveLength(4);
      expect(rs.filter((r) => r.status === 409 && r.body.error === 'DELIVERY_CODE_LOCKED')).toHaveLength(6);
      expect(await audits(o.id, 'DELIVERY_VERIFY_FAILED')).toHaveLength(5);
      expect(await proofOf(o.id)).toMatchObject({ failedAttempts: 0, lockCycles: 1 });
    });

    it('26. a wrong guess racing the correct code: the delivery still completes once and the order is DELIVERED', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      const rs = await Promise.all([verify(who.d1.token, o.id, wrongCode(code)), verify(who.d1.token, o.id, code)]);
      expect(rs.some((r) => r.status === 200 && r.body.data.changed)).toBe(true);
      expect((await orderOf(o.id)).status).toBe('DELIVERED');
      expect(await events(o.id)).toHaveLength(1);
    });
  });

  // ===================================================================================================== races with regeneration / failure
  describe('races', () => {
    it('27. REGRESSION: a verification submitted BEFORE a regeneration committed is a stale code - it is answered DELIVERY_CODE_CHANGED and is NOT charged to the NEW code', async () => {
      const o = await dispatched();
      const oldCode = await issued(o.id);
      await age(o.id);
      const receivedAt = new Date(); // the driver's request arrived now...
      await new Promise((r) => setTimeout(r, 15));
      const fresh = (await cRegen(who.custA.token, o.id)).body.data.code as string; // ...the regeneration committed afterwards
      const caller = { userId: who.d1.id, employeeProfileId: who.d1.employeeId!, branchIds: [branchA.id] };
      const before = (await proofOf(o.id))!;
      await expect(DeliveryProofService.verifyDelivery(o.id, oldCode, caller, receivedAt)).rejects.toMatchObject({ errorCode: 'DELIVERY_CODE_CHANGED', statusCode: 409 });
      const after = (await proofOf(o.id))!;
      expect(after.failedAttempts).toBe(before.failedAttempts);
      expect(after.failedAttempts).toBe(0);
      expect(await audits(o.id, 'DELIVERY_VERIFY_FAILED')).toHaveLength(0);
      expect(after.codeVersion).toBe(2);
      // the new code is untouched and works
      expect((await verify(who.d1.token, o.id, fresh)).status).toBe(200);
    });

    it('28. verify vs regenerate in parallel: either the delivery completes (regeneration then refused) or the new code wins - never both, and a stale code never burns the new code', async () => {
      for (let i = 0; i < 4; i++) {
        const o = await dispatched();
        const code = await issued(o.id);
        await age(o.id);
        const [v, g] = await Promise.all([verify(who.d1.token, o.id, code), cRegen(who.custA.token, o.id)]);
        const delivered = (await orderOf(o.id)).status === 'DELIVERED';
        if (delivered) {
          expect(v.status).toBe(200);
          expect(g.status).toBe(409);
          expect(g.body.error).toBe('DELIVERY_CODE_NOT_AVAILABLE');
          expect(await events(o.id)).toHaveLength(1);
        } else {
          expect(g.status).toBe(200);
          expect([409, 422]).toContain(v.status);
          const p = (await proofOf(o.id))!;
          if (v.body.error === 'DELIVERY_CODE_CHANGED') expect(p.failedAttempts).toBe(0);
          expect(p.codeVersion).toBe(2);
        }
      }
    });

    it('29. verify vs failure report in parallel: exactly one wins (DELIVERED, or FAILED + DELIVERY_IN_EXCEPTION), never both', async () => {
      for (let i = 0; i < 4; i++) {
        const o = await dispatched();
        const code = await issued(o.id);
        const [v, f] = await Promise.all([verify(who.d1.token, o.id, code), report(who.d1.token, o.id)]);
        const order = await orderOf(o.id);
        const a = await assignmentOf(o.id);
        if (order.status === 'DELIVERED') {
          expect([v.status, f.status, a.status]).toEqual([200, 409, 'DELIVERED']);
          expect(f.body.error).toBe('ORDER_NOT_DISPATCHED');
        } else {
          expect([order.status, a.status, f.status, v.status]).toEqual(['DISPATCHED', 'FAILED', 200, 409]);
          expect(v.body.error).toBe('DELIVERY_IN_EXCEPTION');
        }
      }
    });
  });

  // ===================================================================================================== override
  describe('SUPER_ADMIN exceptional override', () => {
    it('30. permission + controls: only SUPER_ADMIN holds delivery:override; drivers, MD, chef and customers are 403; step-up, a structured reason, a 10+ char note and confirm=true are mandatory', async () => {
      expect(roleHasPermission(RoleEnum.SUPER_ADMIN, 'delivery:override')).toBe(true);
      for (const r of [RoleEnum.DELIVERY, RoleEnum.MD, RoleEnum.CHEF, RoleEnum.CUSTOMER]) expect(roleHasPermission(r, 'delivery:override')).toBe(false);
      const o = await dispatched();
      for (const label of ['d1', 'md', 'chef', 'custA']) expect((await override(o.id, goodOverride, who[label].token)).status, label).toBe(403);
      const noStep = await override(o.id, goodOverride, who.admin.token, null);
      expect(noStep.status).toBe(403);
      expect(noStep.body.error).toBe('STEP_UP_REQUIRED');
      for (const body of [
        {},
        { ...goodOverride, confirm: false },
        { ...goodOverride, confirm: undefined },
        { ...goodOverride, note: 'too short' },
        { ...goodOverride, note: '   ' },
        { ...goodOverride, reasonCode: 'BECAUSE' },
        { ...goodOverride, reasonCode: undefined },
        { ...goodOverride, status: 'DELIVERED' },
        { ...goodOverride, code: '123456' }
      ]) {
        expect((await override(o.id, body as Record<string, unknown>)).status, JSON.stringify(body)).toBe(422);
      }
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
    });

    it('31. override from IN_TRANSIT completes through the SAME proof-backed transition: order + assignment DELIVERED, method ADMIN_OVERRIDE, one event, safe audit', async () => {
      const o = await dispatched();
      const r = await override(o.id, goodOverride);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data).toMatchObject({ changed: true, status: 'DELIVERED', previousAssignmentStatus: 'IN_TRANSIT' });
      expect(await orderOf(o.id)).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID' });
      expect((await assignmentOf(o.id)).status).toBe('DELIVERED');
      expect(await proofOf(o.id)).toMatchObject({ method: 'ADMIN_OVERRIDE', overrideByUserId: who.admin.id, overrideReasonCode: 'CUSTOMER_CANNOT_ACCESS_CODE', previousAssignmentStatus: 'IN_TRANSIT', codeHash: null });
      const ev = await events(o.id);
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ fromStatus: 'DISPATCHED', toStatus: 'DELIVERED', actorUserId: who.admin.id, actorRole: 'SUPER_ADMIN' });
      const a = await audits(o.id, 'DELIVERY_OVERRIDE_APPLIED');
      expect(a).toHaveLength(1);
      expect(a[0].payload).toMatchObject({ method: 'ADMIN_OVERRIDE', reasonCode: 'CUSTOMER_CANNOT_ACCESS_CODE', previousAssignmentStatus: 'IN_TRANSIT' });
      expect(JSON.stringify(a[0].payload)).not.toContain(goodOverride.note);
      expect((await cState(who.custA.token, o.id)).body.data.state).toBe('VERIFIED');
    });

    it('32. override from FAILED is allowed ONLY as the exceptional path: previous status FAILED is recorded and the failure notes / audit are preserved', async () => {
      const o = await dispatched();
      expect((await report(who.d1.token, o.id, 'WRONG_ADDRESS')).status).toBe(200);
      const notesBefore = (await assignmentOf(o.id)).deliveryNotes;
      expect(notesBefore).toContain('WRONG_ADDRESS');
      const r = await override(o.id, { ...goodOverride, reasonCode: 'OPERATIONAL_EXCEPTION' });
      expect(r.status).toBe(200);
      expect(r.body.data.previousAssignmentStatus).toBe('FAILED');
      const a = await assignmentOf(o.id);
      expect(a.status).toBe('DELIVERED');
      expect(a.deliveryNotes).toBe(notesBefore);
      expect(await proofOf(o.id)).toMatchObject({ previousAssignmentStatus: 'FAILED', method: 'ADMIN_OVERRIDE' });
      expect(await audits(o.id, 'DELIVERY_FAILURE_REPORTED')).toHaveLength(1);
      expect((await audits(o.id, 'DELIVERY_OVERRIDE_APPLIED'))[0].payload).toMatchObject({ previousAssignmentStatus: 'FAILED' });
    });

    it('33. override preconditions: DISPATCHED + ONLINE + PAID only (READY, unpaid, refunded, COD are refused); unknown order 404; an existing issued code is irrelevant', async () => {
      for (const over of [{ status: 'READY' }, { status: 'CONFIRMED' }, { paymentStatus: 'REFUNDED' }, { paymentStatus: 'PENDING' }, { paymentMethod: 'COD' }]) {
        const o = await dispatched(over);
        expect((await override(o.id, goodOverride)).status, JSON.stringify(over)).toBe(409);
        expect((await orderOf(o.id)).status).toBe(over.status ?? 'DISPATCHED');
      }
      expect((await override('00000000-0000-4000-8000-000000000000', goodOverride)).status).toBe(404);
      const withCode = await dispatched();
      await issued(withCode.id);
      expect((await override(withCode.id, goodOverride)).status).toBe(200);
    });

    it('34. double override is changed:false (one event); override after a normal delivery is 409; the normal verify is refused for SUPER_ADMIN', async () => {
      const o = await dispatched();
      expect((await override(o.id, goodOverride)).body.data.changed).toBe(true);
      const again = await override(o.id, goodOverride);
      expect(again.status).toBe(200);
      expect(again.body.data.changed).toBe(false);
      expect(await events(o.id)).toHaveLength(1);
      const n = await dispatched();
      const code = await issued(n.id);
      await verify(who.d1.token, n.id, code);
      const late = await override(n.id, goodOverride);
      expect(late.status).toBe(409);
      expect(late.body.error).toBe('ALREADY_DELIVERED');
      const x = await dispatched();
      expect((await verify(who.admin.token, x.id, '123456')).status).toBe(403);
    });

    it('35. override vs verify and override vs failure in parallel: exactly one effective completion each time', async () => {
      for (let i = 0; i < 3; i++) {
        const o = await dispatched();
        const code = await issued(o.id);
        const [v, ov] = await Promise.all([verify(who.d1.token, o.id, code), override(o.id, goodOverride)]);
        expect([v.status, ov.status].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
        expect(await events(o.id)).toHaveLength(1);
        const p = (await proofOf(o.id))!;
        expect(p.verifiedAt).not.toBeNull();
        expect(await audits(o.id, 'DELIVERY_VERIFIED')).toHaveLength(p.method === 'PIN' ? 1 : 0);
        expect(await audits(o.id, 'DELIVERY_OVERRIDE_APPLIED')).toHaveLength(p.method === 'ADMIN_OVERRIDE' ? 1 : 0);
      }
      for (let i = 0; i < 3; i++) {
        const o = await dispatched();
        const [f, ov] = await Promise.all([report(who.d1.token, o.id), override(o.id, goodOverride)]);
        expect(ov.status).toBe(200);
        expect(await events(o.id)).toHaveLength(1);
        const p = (await proofOf(o.id))!;
        expect(p.previousAssignmentStatus).toBe(f.status === 200 ? 'FAILED' : 'IN_TRANSIT');
        expect((await assignmentOf(o.id)).status).toBe('DELIVERED');
      }
    });
  });

  // ===================================================================================================== DELIVERED guard
  describe('DELIVERED is impossible without verified proof', () => {
    it('36. a PROOF actor is only a claim: without a verified proof row of THIS order, the right method and PAID the transition refuses; no human actor can do it', async () => {
      const o = await dispatched();
      const other = await dispatched();
      const proofRow = await prisma.deliveryProof.create({ data: { orderId: other.id, codeHash: 'a'.repeat(64), issuedAt: new Date(), verifiedAt: new Date(), method: 'PIN', verifiedByEmployeeId: who.d1.employeeId } });
      const attempt = (actorOver: Record<string, unknown>) =>
        prisma.$transaction((tx) =>
          OrderTransitionService.transition({ orderId: o.id, to: 'DELIVERED', actor: { kind: 'PROOF', method: 'PIN', proofId: 'missing', userId: who.d1.id, roles: [RoleEnum.DELIVERY], ...actorOver } as never }, tx)
        );
      await expect(attempt({})).rejects.toMatchObject({ errorCode: 'ORDER_TRANSITION_FORBIDDEN' }); // no such proof
      await expect(attempt({ proofId: proofRow.id })).rejects.toMatchObject({ errorCode: 'ORDER_TRANSITION_FORBIDDEN' }); // another order's proof
      const mine = await prisma.deliveryProof.create({ data: { orderId: o.id } }); // exists but NOT verified
      await expect(attempt({ proofId: mine.id })).rejects.toMatchObject({ errorCode: 'ORDER_TRANSITION_FORBIDDEN' });
      await prisma.deliveryProof.update({ where: { id: mine.id }, data: { codeHash: 'b'.repeat(64), verifiedAt: new Date(), method: 'PIN', verifiedByEmployeeId: who.d1.employeeId } });
      await expect(attempt({ proofId: mine.id, method: 'ADMIN_OVERRIDE' })).rejects.toMatchObject({ errorCode: 'ORDER_TRANSITION_FORBIDDEN' }); // method mismatch
      await prisma.order.update({ where: { id: o.id }, data: { paymentStatus: 'REFUNDED' } });
      await expect(attempt({ proofId: mine.id })).rejects.toMatchObject({ errorCode: 'ORDER_NOT_OPERATIONALLY_ELIGIBLE' }); // financial state re-checked
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
      // and without the caller's transaction a PROOF actor is refused outright
      await expect(OrderTransitionService.transition({ orderId: o.id, to: 'DELIVERED', actor: { kind: 'PROOF', method: 'PIN', proofId: mine.id, userId: who.d1.id, roles: [RoleEnum.DELIVERY] } })).rejects.toMatchObject({ errorCode: 'INVALID_ORDER_TRANSITION' });
      // a PROOF actor can perform no other edge
      const ready = await dispatched({ status: 'READY' });
      await expect(
        prisma.$transaction((tx) => OrderTransitionService.transition({ orderId: ready.id, to: 'DISPATCHED', actor: { kind: 'PROOF', method: 'PIN', proofId: mine.id, userId: who.d1.id, roles: [RoleEnum.DELIVERY] } }, tx))
      ).rejects.toMatchObject({ errorCode: 'ORDER_TRANSITION_FORBIDDEN' });
    });

    it('37. static guard: only the delivery PROOF service constructs a PROOF actor or writes DELIVERED; nothing writes Order.status directly; no human role is a party of the edge', () => {
      const root = join(__dirname, '..');
      const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      const proofActorFiles: string[] = [];
      const deliveredFiles: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) {
            if (name !== 'tests') walk(full);
          } else if (full.endsWith('.ts')) {
            const code = strip(readFileSync(full, 'utf8'));
            if (/kind:\s*'PROOF'/.test(code)) proofActorFiles.push(full.slice(root.length + 1).replace(/\\/g, '/'));
            if (/['"`]DELIVERED['"`]/.test(code)) deliveredFiles.push(full.slice(root.length + 1).replace(/\\/g, '/'));
          }
        }
      };
      walk(root);
      expect(proofActorFiles.sort()).toEqual(['modules/delivery/deliveryProof.service.ts', 'modules/order/orderTransition.service.ts']); // the service constructs it; the transition only declares/checks it
      expect(deliveredFiles.sort()).toEqual(['modules/delivery/deliveryProof.service.ts', 'modules/order/orderStatus.ts', 'modules/order/orderTransition.service.ts']);
      const svc = strip(readFileSync(join(root, 'modules', 'delivery', 'deliveryProof.service.ts'), 'utf8'));
      expect(svc).not.toMatch(/\.order\.(update|updateMany|upsert)\s*\(/);
      expect(svc).not.toMatch(/console\.|Math\.random|cash|\bCOD\b|collect|settle/i);
      const status = strip(readFileSync(join(root, 'modules', 'order', 'orderStatus.ts'), 'utf8'));
      expect(status).toMatch(/'DISPATCHED->DELIVERED':\s*\['DELIVERY_PROOF'\]/);
    });
  });

  // ===================================================================================================== DTOs and leakage
  describe('safe DTOs and no leakage', () => {
    it('38. driver, monitor and customer payloads carry proof STATE only - never the code, hash, version, counters or lock cycles', async () => {
      const o = await dispatched();
      const code = await issued(o.id);
      await verify(who.d1.token, o.id, wrongCode(code));
      const hash = (await proofOf(o.id))!.codeHash!;
      const payloads = [
        await request(app).get('/api/v1/delivery/orders').set(bearer(who.d1.token)),
        await request(app).get(`/api/v1/delivery/orders/${o.id}`).set(bearer(who.d1.token)),
        await request(app).get(`/api/v1/delivery/monitor?branchId=${branchA.id}`).set(bearer(who.admin.token)),
        await request(app).get(`/api/v1/delivery/monitor?branchId=${branchA.id}`).set(bearer(who.md.token)),
        await cState(who.custA.token, o.id),
        await request(app).get(`/api/v1/orders/${o.id}`).set(bearer(who.custA.token)),
        await request(app).get('/api/v1/orders/my-orders').set(bearer(who.custA.token))
      ];
      for (const r of payloads) {
        expect(r.status).toBe(200);
        const t = text(r);
        expect(t).not.toContain(hash);
        expect(t).not.toContain(`"${code}"`);
        expect(t).not.toMatch(/codeHash|codeVersion|failedAttempts|lockCycles|regenerationCount|overrideNote|DELIVERY_PROOF_SECRET/);
      }
      const monitorItem = payloads[2].body.data.sections.dispatched.items.find((x: { id: string }) => x.id === o.id);
      expect(monitorItem.proofState).toBe('ISSUED');
      const mine = payloads[0].body.data.sections.outForDelivery.items.find((x: { id: string }) => x.id === o.id);
      expect(mine.proof).toEqual({ state: 'READY_FOR_VERIFICATION', lockedUntil: null });
      expect(JSON.stringify(mine)).not.toMatch(/attempt/i);
    });

    it('39. the code never reaches the console, the audit log or any error body (wrong, correct, malformed, locked and stale submissions)', async () => {
      const logs: string[] = [];
      for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' ')));
      const o = await dispatched();
      const code = await issued(o.id);
      const bad = wrongCode(code);
      const bodies: string[] = [];
      for (const c of [bad, '12', bad, bad, bad, bad, code]) bodies.push(text(await verify(who.d1.token, o.id, c)));
      await prisma.deliveryProof.update({ where: { orderId: o.id }, data: { lockedUntil: null } });
      bodies.push(text(await verify(who.d1.token, o.id, code)));
      expect(bodies.join('\n')).not.toContain(code);
      expect(bodies.join('\n')).not.toContain(bad);
      expect(logs.join('\n')).not.toContain(code);
      expect(logs.join('\n')).not.toContain(bad);
      const rows = await prisma.auditLog.findMany({ where: { entityId: o.id } });
      const blob = JSON.stringify(rows.map((r) => r.payload));
      expect(blob).not.toContain(`"${code}"`);
      expect(blob).not.toContain(`"${bad}"`);
      expect(blob).not.toMatch(/codeHash|DELIVERY_PROOF_SECRET/);
    });

    it('40. P9A boundaries still hold: legacy delivery routes are 404, deliver-like paths are 404, claim/dispatch bodies stay strict, and no COD/cash path exists', async () => {
      const o = await dispatched();
      for (const label of ['d1', 'admin', 'md']) {
        expect((await request(app).get('/api/v1/delivery/assignments').set(bearer(who[label].token))).status).toBe(404);
        expect((await request(app).patch('/api/v1/delivery/assignments/x/status').set(bearer(who[label].token)).send({ status: 'DELIVERED' })).status).toBe(404);
      }
      for (const p of ['deliver', 'delivered', 'mark-delivered', 'complete', 'status']) {
        expect((await request(app).post(`/api/v1/delivery/orders/${o.id}/${p}`).set(bearer(who.d1.token)).send({ status: 'DELIVERED' })).status, p).toBe(404);
      }
      expect((await request(app).post(`/api/v1/delivery/orders/${o.id}/dispatch`).set(bearer(who.d1.token)).send({ status: 'DELIVERED' })).status).toBe(422);
      expect((await orderOf(o.id)).status).toBe('DISPATCHED');
    });
  });
});

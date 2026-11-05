import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * B2a follow-up: a retired DELIVERY account (a still-valid access token, DELIVERY role rows in the database) must be refused on EVERY active
 * administrator delivery route - direct orders and Kerala Mess - and on the customer handover-code routes, BEFORE any lookup or state change
 * (a missing id answers 403, never 404), with or without a forged step-up header. A DELIVERY role next to CHEF adds no delivery authority.
 * SUPER_ADMIN, on the same routes, is NOT refused for its role (it reaches the step-up check), so the matrix is meaningful.
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const PASSWORD = 'B2A#Retired-Delivery-Pass-2026';
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('B2a - retired DELIVERY accounts on the active administrator delivery routes', () => {
  const ts = Date.now();
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const missing = '00000000-0000-4000-8000-0000000000b1';
  const missing2 = '00000000-0000-4000-8000-0000000000b2';
  let branchId = '';

  async function mk(label: string, roles: RoleEnum[]) {
    const email = `b2a_ret_${label}_${ts}@test.com`;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        roles: { create: roles.map((role) => ({ role })) },
        employeeProfile: { create: { employeeCode: `B2ARET-${label}-${ts}`, fullName: label, designation: 'Test', assignedBranchId: branchId } }
      },
      include: { employeeProfile: true }
    });
    await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile!.id, branchId } });
    ids[label] = u.id;
    tokens[label] = sign(u.id, email, roles);
  }

  const direct = (suffix: string) => `/api/v1/admin/delivery/orders/${missing}${suffix}`;
  const mess = (suffix: string) => `/api/v1/admin/mess/delivery${suffix}`;
  const ROUTES: Array<[string, string, string, object]> = [
    ['get', 'direct order detail', direct(''), {}],
    ['post', 'direct dispatch', direct('/dispatch'), {}],
    ['post', 'direct takeover', direct('/takeover'), { expectedDriverId: missing2, reason: 'abc' }],
    ['post', 'direct verify', direct('/verify-delivery'), { code: '123456' }],
    ['post', 'direct report-failure', direct('/report-failure'), { reasonCode: 'OTHER' }],
    ['post', 'direct retry', direct('/retry'), { expectedAttemptNumber: 1, reasonCode: 'OTHER' }],
    ['post', 'direct resume', direct('/resume'), {}],
    ['post', 'delivery override', `/api/v1/admin/orders/${missing}/delivery-override`, { reasonCode: 'OTHER', note: 'long enough note', confirm: true }],
    ['get', 'attempt history', `/api/v1/admin/orders/${missing}/delivery-attempts`, {}],
    ['post', 'cancel & full refund', `/api/v1/admin/orders/${missing}/delivery-undeliverable`, { reasonCode: 'CUSTOMER_REFUSED', note: 'long enough note', expectedAttemptNumber: 1, confirm: true }],
    ['post', 'mess claim', mess(`/runs/${missing}/claim`), {}],
    ['post', 'mess dispatch', mess(`/runs/${missing}/dispatch`), {}],
    ['post', 'mess takeover', mess(`/runs/${missing}/takeover`), { expectedEmployeeId: missing2, reason: 'abc' }],
    ['post', 'mess verify', mess(`/runs/${missing}/stops/${missing2}/verify`), { code: '123456' }],
    ['post', 'mess fail', mess(`/runs/${missing}/stops/${missing2}/fail`), { reasonCode: 'VEHICLE_ISSUE' }],
    ['post', 'mess retry', mess(`/runs/${missing}/stops/${missing2}/retry`), {}],
    ['post', 'mess stop override', mess(`/stops/${missing}/override`), { reasonCode: 'OPERATIONAL_EXCEPTION', note: 'long enough note', confirm: true }],
    ['get', 'direct monitor', `/api/v1/delivery/monitor?branchId=__BRANCH__`, {}],
    ['get', 'mess monitor', `/api/v1/mess/delivery/monitor?branchId=__BRANCH__`, {}]
  ];

  beforeAll(async () => {
    branchId = (await prisma.kitchenBranch.create({ data: { code: `b2a-ret-${ts}`, name: 'B2A RET', address: 'A', city: 'Kochi' } })).id;
    await mk('driver', [RoleEnum.DELIVERY]);
    await mk('driverChef', [RoleEnum.DELIVERY, RoleEnum.CHEF]);
    await mk('admin', [RoleEnum.SUPER_ADMIN]);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const call = (method: string, url: string, token: string | null, body: object, step?: string) => {
    let r = (request(app) as any)[method](url.replace('__BRANCH__', branchId));
    if (token) r = r.set(bearer(token));
    if (step) r = r.set('x-step-up-token', step);
    return method === 'get' ? r : r.send(body);
  };

  it('a DELIVERY-only token is refused NO_APPROVED_ROLE on every active administrator delivery route (direct and Mess), before any lookup, with or without a step-up header', async () => {
    for (const [method, name, url, body] of ROUTES) {
      for (const step of [undefined, 'forged-step-up-proof']) {
        const res = await call(method, url, tokens.driver, body, step);
        expect([name, step ?? 'none', res.status, res.body.error]).toEqual([name, step ?? 'none', 403, 'NO_APPROVED_ROLE']);
      }
    }
  });

  it('a DELIVERY role next to CHEF adds nothing: the retired role is dropped and CHEF holds no delivery operate / resolve / override permission (403, never a lookup)', async () => {
    for (const [method, name, url, body] of ROUTES) {
      const res = await call(method, url, tokens.driverChef, body, 'forged-step-up-proof');
      expect([name, res.status]).toEqual([name, 403]);
      expect(res.body.error, name).not.toBe('NO_APPROVED_ROLE'); // the account is valid (CHEF); it is simply not authorized here
    }
  });

  it('anonymous callers get 401 on every route; the SUPER_ADMIN is NOT refused for its role on the same routes (the matrix is meaningful): it reaches the step-up check', async () => {
    for (const [method, name, url, body] of ROUTES) {
      const anon = await call(method, url, null, body);
      expect([name, anon.status]).toEqual([name, 401]);
    }
    for (const [method, name, url, body] of ROUTES.filter(([m]) => m === 'post')) {
      const res = await call(method, url, tokens.admin, body); // no step-up proof
      expect([name, res.status, res.body.error]).toEqual([name, 403, 'STEP_UP_REQUIRED']);
    }
  });

  it('the customer handover-code routes also refuse a retired DELIVERY token (customer-context routes are CUSTOMER-only)', async () => {
    const base = `/api/v1/mess/subscriptions/${missing}/meals/${missing2}/handover-code`;
    for (const [method, url] of [['get', base], ['post', base], ['post', `${base}/regenerate`]] as const) {
      const res = await call(method, url, tokens.driver, {});
      expect([method, url, res.status]).toEqual([method, url, 403]);
    }
  });

  it('refusal changes nothing: no audit row names the retired account as an actor of a delivery action', async () => {
    const rows = await prisma.auditLog.count({ where: { userId: ids.driver, action: { startsWith: 'DELIVERY' } } });
    expect(rows).toBe(0);
    expect(await prisma.deliveryAssignment.count({ where: { OR: [{ driverId: null, operatedByUserId: ids.driver }] } })).toBe(0);
  });
});

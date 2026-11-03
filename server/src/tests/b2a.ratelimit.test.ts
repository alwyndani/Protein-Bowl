import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * B2a follow-up: the per-user limiters of the ACTIVE administrator delivery routes that had no direct coverage:
 *   deliveryResolveRateLimiter        POST /admin/orders/:orderId/delivery-undeliverable   (Cancel & Full Refund)
 *   messDeliveryOverrideRateLimiter   POST /admin/mess/delivery/stops/:id/override         (exceptional Mess handover)
 *   messDeliveryReadRateLimiter       GET  /mess/delivery/monitor                           (SUPER_ADMIN monitor)
 *   deliveryReadRateLimiter           GET  /admin/orders/:orderId/delivery-attempts         (attempt history)
 * Each test (1) pins the configured limit exactly, (2) proves the limiter runs AFTER authentication / permission (a caller without the permission is
 * refused 403 and never consumes budget), (3) proves it runs BEFORE the step-up check (a request without a proof still counts), and (4) proves the
 * budget is per user. Low limits must be set BEFORE the app is imported (Vitest isolates modules per test file).
 */
process.env.RL_DELIVERY_RESOLVE_MAX = '2';
process.env.RL_MESS_DELIVERY_OVERRIDE_MAX = '1';
process.env.RL_MESS_DELIVERY_READ_MAX = '3';
process.env.RL_DELIVERY_READ_MAX = '3';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('B2a - rate limits of the active administrator delivery routes', () => {
  let app: any;
  const ts = Date.now();
  const tokens: Record<string, string> = {};
  let branchId = '';
  const missingOrder = '00000000-0000-4000-8000-0000000000a1';
  const missingStop = '00000000-0000-4000-8000-0000000000a2';
  const auth = (label: string) => ({ Authorization: `Bearer ${tokens[label]}` });

  async function mk(label: string, role: RoleEnum) {
    const email = `b2a_rl_${label}_${ts}@test.com`;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: { role } },
        employeeProfile: { create: { employeeCode: `B2ARL-${label}-${ts}`, fullName: label, designation: 'Test', assignedBranchId: branchId } }
      },
      include: { employeeProfile: true }
    });
    await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile!.id, branchId } });
    tokens[label] = jwt.sign({ userId: u.id, email, roles: [role] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  }

  beforeAll(async () => {
    app = (await import('../app.js')).default;
    branchId = (await prisma.kitchenBranch.create({ data: { code: `b2a-rl-${ts}`, name: 'B2A RL', address: 'A', city: 'Kochi' } })).id;
    await mk('admin1', RoleEnum.SUPER_ADMIN);
    await mk('admin2', RoleEnum.SUPER_ADMIN);
    await mk('admin3', RoleEnum.SUPER_ADMIN);
    await mk('admin4', RoleEnum.SUPER_ADMIN);
    await mk('admin5', RoleEnum.SUPER_ADMIN);
    await mk('chef', RoleEnum.CHEF);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('wiring: each limiter is attached to its intended route, after the permission check and before the step-up check', () => {
    const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const admin = src('modules/delivery/deliveryAdmin.routes.ts');
    const undeliverable = admin.slice(admin.indexOf("'/orders/:orderId/delivery-undeliverable'"));
    expect(undeliverable.slice(0, undeliverable.indexOf('validateParams'))).toMatch(/requirePermission\('delivery:resolve'\),\s*deliveryResolveRateLimiter,\s*requireStepUp\('delivery\.undeliverable'\)/);
    const attempts = admin.slice(admin.indexOf("'/orders/:orderId/delivery-attempts'"));
    expect(attempts.slice(0, 400)).toMatch(/deliveryReadRateLimiter/);
    const mess = src('modules/mess/messAdmin.routes.ts');
    const override = mess.slice(mess.indexOf("'/mess/delivery/stops/:id/override'"));
    expect(override.slice(0, override.indexOf('validateParams'))).toMatch(/requireExactRoles\(\[RoleEnum\.SUPER_ADMIN\]\),\s*requirePermission\('mess:delivery:override'\),\s*messDeliveryOverrideRateLimiter,\s*requireStepUp\('mess\.delivery\.override'\)/);
    const monitor = src('modules/mess/messDelivery.routes.ts');
    expect(monitor).toMatch(/router\.get\('\/monitor',[^;]*requirePermission\('mess:delivery:read'\),\s*messDeliveryReadRateLimiter/);
  });

  it('Cancel & Full Refund: 2 requests per user (configured), counted before the step-up check; a caller without delivery:resolve never consumes budget; budgets are per user', async () => {
    const call = (who: string) => request(app).post(`/api/v1/admin/orders/${missingOrder}/delivery-undeliverable`).set(auth(who)).send({});
    const s: number[] = [];
    for (let i = 0; i < 3; i++) s.push((await call('admin1')).status);
    expect(s).toEqual([403, 403, 429]); // 403 = STEP_UP_REQUIRED (no proof), the third is limited
    expect((await call('admin2')).status).toBe(403); // another administrator keeps their own budget
    for (let i = 0; i < 4; i++) expect((await call('chef')).status).toBe(403); // refused by the permission check; never 429
    const res = await call('admin1');
    expect(res.status).toBe(429);
  });

  it('exceptional Mess handover: 1 request per user (configured), counted before the step-up check; non-administrators never consume budget', async () => {
    const call = (who: string) => request(app).post(`/api/v1/admin/mess/delivery/stops/${missingStop}/override`).set(auth(who)).send({});
    expect([(await call('admin1')).status, (await call('admin1')).status]).toEqual([403, 429]);
    expect((await call('admin2')).status).toBe(403);
    for (let i = 0; i < 3; i++) expect((await call('chef')).status).toBe(403);
  });

  it('Mess delivery monitor: 3 reads per user (configured); a non-administrator is refused without consuming budget; budgets are per user', async () => {
    const read = (who: string) => request(app).get(`/api/v1/mess/delivery/monitor?branchId=${branchId}`).set(auth(who));
    const s: number[] = [];
    for (let i = 0; i < 4; i++) s.push((await read('admin3')).status);
    expect(s).toEqual([200, 200, 200, 429]);
    expect((await read('admin4')).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await read('chef')).status).toBe(403);
  });

  it('attempt history read: shares the delivery read budget (3 per user); a non-administrator never consumes it', async () => {
    const read = (who: string) => request(app).get(`/api/v1/admin/orders/${missingOrder}/delivery-attempts`).set(auth(who));
    const s: number[] = [];
    for (let i = 0; i < 4; i++) s.push((await read('admin5')).status);
    expect(s.slice(0, 3).every((x) => x === 404)).toBe(true); // the order does not exist, but the request was served and counted
    expect(s[3]).toBe(429);
    for (let i = 0; i < 5; i++) expect((await read('chef')).status).toBe(403);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Low limits must be set BEFORE the app (and its limiters) are imported. Vitest isolates modules per test file.
process.env.RL_DELIVERY_CODE_READ_MAX = '3';
process.env.RL_DELIVERY_CODE_ISSUE_MAX = '2';
process.env.RL_DELIVERY_CODE_REGEN_MAX = '1';
process.env.RL_DELIVERY_VERIFY_MAX = '2';
process.env.RL_DELIVERY_OVERRIDE_MAX = '1';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('P9B - Delivery Code rate limits (secondary to the persisted per-proof attempt state)', () => {
  let app: any;
  const ts = Date.now();
  const tokens: Record<string, string> = {};
  let branchId = '';
  const missing = (n: number) => `00000000-0000-4000-8000-00000000009${n}`;
  const auth = (label: string) => ({ Authorization: `Bearer ${tokens[label]}` });

  async function mk(label: string, role: RoleEnum) {
    const email = `p9b_rl_${label}_${ts}@test.com`;
    const customer = role === RoleEnum.CUSTOMER;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: { role } },
        ...(customer
          ? { customerProfile: { create: { fullName: `RL ${label}`, referralCode: `PB-RLB${label}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `P9BRL-${label}-${ts}`, fullName: label, designation: 'Test', assignedBranchId: branchId } } })
      },
      include: { employeeProfile: true }
    });
    if (u.employeeProfile) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile.id, branchId } });
    tokens[label] = jwt.sign({ userId: u.id, email, roles: [role] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  }

  beforeAll(async () => {
    app = (await import('../app.js')).default;
    branchId = (await prisma.kitchenBranch.create({ data: { code: `p9b-rl-${ts}`, name: 'RL', address: 'A', city: 'Kochi' } })).id;
    await mk('c1', RoleEnum.CUSTOMER);
    await mk('c2', RoleEnum.CUSTOMER);
    await mk('d', RoleEnum.DELIVERY);
    await mk('admin', RoleEnum.SUPER_ADMIN);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('customer state reads are limited per user; another customer keeps their own budget', async () => {
    const s: number[] = [];
    for (let i = 0; i < 4; i++) s.push((await request(app).get(`/api/v1/orders/${missing(0)}/delivery-code`).set(auth('c1'))).status);
    expect(s).toEqual([404, 404, 404, 429]);
    expect((await request(app).get(`/api/v1/orders/${missing(0)}/delivery-code`).set(auth('c2'))).status).toBe(404);
  });

  it('issue and regenerate are limited per user AND order (a different order has its own budget)', async () => {
    const issue = (n: number) => request(app).post(`/api/v1/orders/${missing(n)}/delivery-code`).set(auth('c1')).send({});
    expect([(await issue(1)).status, (await issue(1)).status, (await issue(1)).status]).toEqual([404, 404, 429]);
    expect((await issue(2)).status).toBe(404);
    const regen = (n: number) => request(app).post(`/api/v1/orders/${missing(n)}/delivery-code/regenerate`).set(auth('c1')).send({});
    expect([(await regen(3)).status, (await regen(3)).status]).toEqual([404, 429]);
    expect((await regen(4)).status).toBe(404);
  });

  it('driver verification is limited per user (the PERSISTED per-proof lock is what actually bounds guessing)', async () => {
    const v = () => request(app).post(`/api/v1/delivery/orders/${missing(5)}/verify-delivery`).set(auth('d')).send({ code: '123456' });
    expect([(await v()).status, (await v()).status, (await v()).status]).toEqual([404, 404, 429]);
  });

  it('the override limiter sits before the step-up check and is the tightest', async () => {
    const o = () => request(app).post(`/api/v1/admin/orders/${missing(6)}/delivery-override`).set(auth('admin')).send({});
    expect((await o()).status).toBe(403); // no step-up proof, but the request counted
    expect((await o()).status).toBe(429);
  });
});

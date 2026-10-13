import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Low limits must be set BEFORE the app (and its limiters) are imported. Vitest isolates modules per test file.
process.env.RL_MESS_DELIVERY_ACTION_MAX = '2';
process.env.RL_MESS_DELIVERY_VERIFY_MAX = '2';
process.env.RL_MESS_HANDOVER_MAX = '2';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('P10C - bulk delivery and handover rate limits (per user)', () => {
  let app: any;
  const ts = Date.now();
  const tokens: Record<string, string> = {};
  const auth = (label: string) => ({ Authorization: `Bearer ${tokens[label]}` });
  const missing = '00000000-0000-4000-8000-000000000012';

  async function mk(label: string, role: RoleEnum, branchId?: string) {
    const email = `p10c_rl_${label}_${ts}@test.com`;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: { role } },
        ...(role === RoleEnum.CUSTOMER
          ? { customerProfile: { create: { fullName: `RL ${label}`, referralCode: `PB-RLC${label}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `P10CRL-${label}-${ts}`, fullName: label, designation: 'Test', assignedBranchId: branchId } } })
      },
      include: { employeeProfile: true }
    });
    if (u.employeeProfile && branchId) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile.id, branchId } });
    tokens[label] = jwt.sign({ userId: u.id, email, roles: [role] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  }

  beforeAll(async () => {
    app = (await import('../app.js')).default;
    const branchId = (await prisma.kitchenBranch.create({ data: { code: `p10c-rl-${ts}`, name: 'RL', address: 'A', city: 'Kochi' } })).id;
    await mk('d1', RoleEnum.DELIVERY, branchId);
    await mk('d2', RoleEnum.DELIVERY, branchId);
    await mk('c1', RoleEnum.CUSTOMER);
    await mk('c2', RoleEnum.CUSTOMER);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('driver actions share a per-user budget (the limiter runs before ownership); another driver keeps their own', async () => {
    const s: number[] = [];
    for (let i = 0; i < 3; i++) s.push((await request(app).post(`/api/v1/mess/delivery/runs/${missing}/claim`).set(auth('d1')).send({})).status);
    expect(s).toEqual([404, 404, 429]);
    expect((await request(app).post(`/api/v1/mess/delivery/runs/${missing}/claim`).set(auth('d2')).send({})).status).toBe(404);
  });

  it('handover code verification has its OWN stricter budget', async () => {
    const s: number[] = [];
    for (let i = 0; i < 3; i++) s.push((await request(app).post(`/api/v1/mess/delivery/runs/${missing}/stops/${missing}/verify`).set(auth('d2')).send({ code: '123456' })).status);
    expect(s[2]).toBe(429);
    expect(s.slice(0, 2).every((x) => x === 404 || x === 409)).toBe(true);
  });

  it('a resident asking for the handover code has a per-user budget; another resident keeps their own', async () => {
    const s: number[] = [];
    for (let i = 0; i < 3; i++) s.push((await request(app).get(`/api/v1/mess/subscriptions/${missing}/meals/${missing}/handover-code`).set(auth('c1'))).status);
    expect(s).toEqual([404, 404, 429]);
    expect((await request(app).post(`/api/v1/mess/subscriptions/${missing}/meals/${missing}/handover-code`).set(auth('c2')).send({})).status).toBe(404);
  });
});

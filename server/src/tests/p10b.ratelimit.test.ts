import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Low limits must be set BEFORE the app (and its limiters) are imported. Vitest isolates modules per test file.
process.env.RL_MESS_KITCHEN_MAX = '3';
process.env.RL_MESS_PAUSE_MAX = '2';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('P10B - Mess kitchen and pause rate limits (per user)', () => {
  let app: any;
  const ts = Date.now();
  const tokens: Record<string, string> = {};
  const auth = (label: string) => ({ Authorization: `Bearer ${tokens[label]}` });
  const missing = '00000000-0000-4000-8000-000000000011';

  async function mk(label: string, role: RoleEnum, branchId?: string) {
    const email = `p10b_rl_${label}_${ts}@test.com`;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: { role } },
        ...(role === RoleEnum.CUSTOMER
          ? { customerProfile: { create: { fullName: `RL ${label}`, referralCode: `PB-RLB${label}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `P10BRL-${label}-${ts}`, fullName: label, designation: 'Test', assignedBranchId: branchId } } })
      },
      include: { employeeProfile: true }
    });
    if (u.employeeProfile && branchId) await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: u.employeeProfile.id, branchId } });
    tokens[label] = jwt.sign({ userId: u.id, email, roles: [role] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  }

  let branchId = '';
  beforeAll(async () => {
    app = (await import('../app.js')).default;
    branchId = (await prisma.kitchenBranch.create({ data: { code: `p10b-rl-${ts}`, name: 'RL', address: 'A', city: 'Kochi' } })).id;
    await mk('chef', RoleEnum.CHEF, branchId);
    await mk('chef2', RoleEnum.CHEF, branchId);
    await mk('c1', RoleEnum.CUSTOMER);
    await mk('c2', RoleEnum.CUSTOMER);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('kitchen reads and chef actions share a per-user budget; another chef keeps their own', async () => {
    const s: number[] = [];
    for (let i = 0; i < 4; i++) s.push((await request(app).get('/api/v1/mess/kitchen/demand').set(auth('chef'))).status);
    expect(s).toEqual([200, 200, 200, 429]);
    expect((await request(app).get('/api/v1/mess/kitchen/demand').set(auth('chef2'))).status).toBe(200);
  });

  it('pause/resume have their own budget (the limiter runs before validation and ownership)', async () => {
    const s: number[] = [];
    for (let i = 0; i < 3; i++) s.push((await request(app).post(`/api/v1/mess/subscriptions/${missing}/meals/${missing}/pause`).set(auth('c1')).send({})).status);
    expect(s).toEqual([404, 404, 429]);
    expect((await request(app).post(`/api/v1/mess/subscriptions/${missing}/meals/${missing}/resume`).set(auth('c2')).send({})).status).toBe(404);
  });
});

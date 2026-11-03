import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Low limits must be set BEFORE the app (and its limiters) are imported. Vitest isolates modules per test file.
process.env.RL_DELIVERY_ACTION_MAX = '2';
process.env.RL_DELIVERY_READ_MAX = '3';
process.env.RL_DELIVERY_OVERRIDE_MAX = '1'; // unrelated here; the override limiter is covered in p9b.ratelimit

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('B2a - delivery rate limits that still protect active endpoints (per authenticated user)', () => {
  let app: any;
  const ts = Date.now();
  const tokens: Record<string, string> = {};
  let branchId = '';

  async function mk(label: string, role: RoleEnum) {
    const email = `p9a_rl_${label}_${ts}@test.com`;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: { role } },
        employeeProfile: { create: { employeeCode: `P9ARL-${label}-${ts}`, fullName: label, designation: 'Test', assignedBranchId: branchId } }
      }
    });
    await prisma.employeeBranchAssignment.create({ data: { employeeProfileId: (await prisma.employeeProfile.findUniqueOrThrow({ where: { userId: u.id } })).id, branchId } });
    tokens[label] = jwt.sign({ userId: u.id, email, roles: [role] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  }
  const auth = (label: string) => ({ Authorization: `Bearer ${tokens[label]}` });
  const missing = '00000000-0000-4000-8000-000000000001';

  beforeAll(async () => {
    app = (await import('../app.js')).default;
    branchId = (await prisma.kitchenBranch.create({ data: { code: `p9a-rl-${ts}`, name: 'RL', address: 'A', city: 'Kochi' } })).id;
    await mk('a', RoleEnum.DELIVERY);
    await mk('b', RoleEnum.DELIVERY);
    await mk('admin', RoleEnum.SUPER_ADMIN);
    await mk('admin2', RoleEnum.SUPER_ADMIN);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('the removed driver surface stays removed: every former driver route is 404 for a legacy driver token, so no driver limiter is reachable', async () => {
    for (let i = 0; i < 4; i++) {
      expect((await request(app).post(`/api/v1/delivery/orders/${missing}/claim`).set(auth('a')).send({})).status).toBe(404);
      expect((await request(app).get('/api/v1/delivery/orders').set(auth('b'))).status).toBe(404);
    }
    expect((await request(app).put(`/api/v1/admin/orders/${missing}/delivery-assignment`).set(auth('admin')).send({})).status).toBe(404);
  });

  it('SUPER_ADMIN delivery operations share a per-user action budget that runs before the step-up check', async () => {
    const op = () => request(app).post(`/api/v1/admin/delivery/orders/${missing}/dispatch`).set(auth('admin')).send({});
    expect((await op()).status).toBe(403); // no step-up proof, but the request counted
    expect((await op()).status).toBe(403);
    expect((await op()).status).toBe(429); // RL_DELIVERY_ACTION_MAX = 2
  });

  it('the monitor read has its own (more generous) per-user budget', async () => {
    const m = () => request(app).get(`/api/v1/delivery/monitor?branchId=${branchId}`).set(auth('admin2'));
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await m()).status);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429); // RL_DELIVERY_READ_MAX = 3
  });
});

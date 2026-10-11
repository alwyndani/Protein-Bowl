import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Low limits must be set BEFORE the app (and its limiters) are imported. Vitest isolates modules per test file.
process.env.RL_DELIVERY_ACTION_MAX = '2';
process.env.RL_DELIVERY_READ_MAX = '3';
process.env.RL_DELIVERY_ASSIGN_MAX = '1';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('P9A - delivery rate limits (per authenticated user)', () => {
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
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('driver actions are limited per user (claim / dispatch / report share a budget); another driver keeps its own', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await request(app).post(`/api/v1/delivery/orders/${missing}/claim`).set(auth('a')).send({})).status);
    expect(statuses.slice(0, 2)).toEqual([404, 404]);
    expect(statuses[2]).toBe(429);
    expect((await request(app).post(`/api/v1/delivery/orders/${missing}/dispatch`).set(auth('b')).send({})).status).toBe(404);
  });

  it('queue reads have their own (more generous) per-user budget', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await request(app).get('/api/v1/delivery/orders').set(auth('b'))).status);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });

  it('SUPER_ADMIN assignment is the tightest limiter and sits before the step-up check', async () => {
    const put = () => request(app).put(`/api/v1/admin/orders/${missing}/delivery-assignment`).set(auth('admin')).send({});
    expect((await put()).status).toBe(403); // no step-up proof, but the request counted
    expect((await put()).status).toBe(429);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Low limits must be set BEFORE the app (and its limiters) are imported. Vitest isolates modules per test file.
process.env.RL_CANCEL_MAX = '2';
process.env.RL_REFUND_ADMIN_MAX = '2';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('P7C — financial endpoint rate limits (identity-aware)', () => {
  let app: any;
  const ts = Date.now();
  const tokens: Record<string, string> = {};

  async function mk(label: string, role: RoleEnum) {
    const email = `p7c_rl_${label}_${ts}@test.com`;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: { role } },
        ...(role === RoleEnum.CUSTOMER ? { customerProfile: { create: { fullName: `RL ${label}`, referralCode: `PB-RLC${label}${ts}` } } } : {})
      }
    });
    tokens[label] = jwt.sign({ userId: u.id, email, roles: [role] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  }

  beforeAll(async () => {
    app = (await import('../app.js')).default;
    await mk('a', RoleEnum.CUSTOMER);
    await mk('b', RoleEnum.CUSTOMER);
    await mk('admin', RoleEnum.SUPER_ADMIN);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('customer cancellation is limited per authenticated user; another user on the same IP keeps its own budget', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post(`/api/v1/orders/00000000-0000-4000-8000-00000000000${i}/cancel`).set({ Authorization: `Bearer ${tokens.a}` }).send({ reasonCode: 'OTHER' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 2)).toEqual([404, 404]);
    expect(statuses[2]).toBe(429);
    const other = await request(app).post('/api/v1/orders/00000000-0000-4000-8000-000000000009/cancel').set({ Authorization: `Bearer ${tokens.b}` }).send({ reasonCode: 'OTHER' });
    expect(other.status).toBe(404);
  });

  it('admin financial mutations are limited per authenticated admin, and the limiter runs before the step-up check can be hammered', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post(`/api/v1/admin/provider-payments/00000000-0000-4000-8000-00000000000${i}/refund`).set({ Authorization: `Bearer ${tokens.admin}` }).send({});
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 2)).toEqual([403, 403]); // step-up required
    expect(statuses[2]).toBe(429);
  });
});

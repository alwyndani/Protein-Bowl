import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Low limits must be set BEFORE the app (and its limiters) are imported. Vitest isolates modules per test file.
process.env.RL_ACCEPT_INVITE_MAX = '3';
process.env.RL_STEPUP_MAX = '3';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('P6B — credential-sensitive endpoint rate limits', () => {
  let app: any;
  let adminToken: string;

  beforeAll(async () => {
    app = (await import('../app.js')).default;
    const ts = Date.now();
    const admin = await prisma.user.create({
      data: { email: `p6b_rl_admin_${ts}@test.com`, passwordHash: await bcrypt.hash('Rate-Limit#Admin-Pass-1', 10), roles: { create: { role: RoleEnum.SUPER_ADMIN } } }
    });
    adminToken = jwt.sign({ userId: admin.id, email: admin.email, roles: [RoleEnum.SUPER_ADMIN] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accept-invite is strongly rate limited (429 after the configured max)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/v1/auth/staff/accept-invite')
        .send({ token: crypto.randomBytes(32).toString('hex'), password: 'Some-Strong#Pass-2026' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([400, 400, 400]);
    expect(statuses[3]).toBe(429);
  });

  it('the step-up password check is rate limited so it cannot be used to brute-force the admin password', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/v1/admin/step-up').set({ Authorization: `Bearer ${adminToken}` }).send({ password: `wrong-guess-${i}` });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses[3]).toBe(429);
  });

  it('the existing login/register/refresh limiters were not weakened (defaults unchanged)', async () => {
    const { env } = await import('../config/env.js');
    expect([env.RL_LOGIN_MAX, env.RL_REGISTER_MAX, env.RL_REFRESH_MAX, env.RL_GENERAL_MAX]).toEqual([20, 10, 60, 600]);
  });
});

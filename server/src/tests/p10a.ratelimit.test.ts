import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Low limits must be set BEFORE the app (and its limiters) are imported. Vitest isolates modules per test file.
process.env.RL_MESS_READ_MAX = '3';
process.env.RL_MESS_WRITE_MAX = '2';
process.env.RL_MESS_PURCHASE_MAX = '2';
process.env.RL_MESS_ADMIN_MAX = '2';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('P10A - Kerala Mess rate limits (per user, secondary to the database-enforced rules)', () => {
  let app: any;
  const ts = Date.now();
  const tokens: Record<string, string> = {};
  const auth = (label: string) => ({ Authorization: `Bearer ${tokens[label]}` });

  async function mk(label: string, role: RoleEnum) {
    const email = `p10a_rl_${label}_${ts}@test.com`;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: { role } },
        ...(role === RoleEnum.CUSTOMER ? { customerProfile: { create: { fullName: `RL ${label}`, referralCode: `PB-RLA${label}${ts}` } } } : {})
      }
    });
    tokens[label] = jwt.sign({ userId: u.id, email, roles: [role] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  }

  beforeAll(async () => {
    app = (await import('../app.js')).default;
    await mk('c1', RoleEnum.CUSTOMER);
    await mk('c2', RoleEnum.CUSTOMER);
    await mk('admin', RoleEnum.SUPER_ADMIN);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('customer reads are limited per user; another customer keeps their own budget', async () => {
    const s: number[] = [];
    for (let i = 0; i < 4; i++) s.push((await request(app).get('/api/v1/mess/account').set(auth('c1'))).status);
    expect(s).toEqual([200, 200, 200, 429]);
    expect((await request(app).get('/api/v1/mess/account').set(auth('c2'))).status).toBe(200);
  });

  it('account writes and purchases have their own, separate budgets', async () => {
    const writes: number[] = [];
    for (let i = 0; i < 3; i++) writes.push((await request(app).put('/api/v1/mess/account').set(auth('c2')).send({})).status);
    expect(writes).toEqual([422, 422, 429]);
    const buys: number[] = [];
    for (let i = 0; i < 3; i++) buys.push((await request(app).post('/api/v1/mess/subscriptions').set(auth('c2')).set('x-idempotency-key', `rl-key-${ts}-${i}-abcdef`).send({})).status);
    expect(buys).toEqual([422, 422, 429]);
  });

  it('admin Mess writes are limited per administrator (the limiter runs before step-up and validation)', async () => {
    const s: number[] = [];
    for (let i = 0; i < 3; i++) s.push((await request(app).post('/api/v1/admin/mess/plans').set(auth('admin')).send({})).status);
    expect(s[2]).toBe(429);
    expect(s[0]).not.toBe(429);
  });

  it('the retired legacy endpoints stay answerable (410) and are not a way around the limiter', async () => {
    expect((await request(app).post('/api/v1/mess/pause-meal').set(auth('c1')).send({})).status).toBe(410);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Low limits must be set BEFORE the app (and its limiters) are imported. Vitest isolates modules per test file.
process.env.RL_PAYMENT_ATTEMPT_MAX = '3';
process.env.RL_PAYMENT_VERIFY_MAX = '3';
process.env.RL_WEBHOOK_MAX = '5';
process.env.RL_GENERAL_MAX = '12'; // the webhook (6 calls after ~9 other calls) must NOT be counted by this

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('P7B — payment endpoint rate limits', () => {
  let app: any;
  const ts = Date.now();
  const tokens: Record<string, { id: string; profileId: string; token: string }> = {};

  async function mk(label: string) {
    const email = `p7b_rl_${label}_${ts}@test.com`;
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('Password123!', 4),
        roles: { create: { role: RoleEnum.CUSTOMER } },
        customerProfile: { create: { fullName: `RL ${label}`, referralCode: `PB-RL${label}${ts}` } }
      },
      include: { customerProfile: true }
    });
    tokens[label] = { id: u.id, profileId: u.customerProfile!.id, token: jwt.sign({ userId: u.id, email, roles: [RoleEnum.CUSTOMER] }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' }) };
  }

  beforeAll(async () => {
    app = (await import('../app.js')).default;
    await mk('a');
    await mk('b');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('attempt creation is limited per authenticated user; another user is unaffected (identity-aware, not shared per-IP)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post(`/api/v1/orders/00000000-0000-4000-8000-00000000000${i}/payment-attempts`).set({ Authorization: `Bearer ${tokens.a.token}` }).send({});
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([404, 404, 404]);
    expect(statuses[3]).toBe(429);
    const other = await request(app).post('/api/v1/orders/00000000-0000-4000-8000-000000000009/payment-attempts').set({ Authorization: `Bearer ${tokens.b.token}` }).send({});
    expect(other.status).toBe(404); // user B shares the IP but has its own budget
  });

  it('verification is limited per authenticated user', async () => {
    const body = { providerOrderId: 'order_x', providerPaymentId: 'pay_x', signature: 'a'.repeat(64) };
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/v1/orders/00000000-0000-4000-8000-000000000001/payment-attempts/00000000-0000-4000-8000-000000000002/verify')
        .set({ Authorization: `Bearer ${tokens.a.token}` })
        .send(body);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([404, 404, 404]);
    expect(statuses[3]).toBe(429);
  });

  it('the webhook has its own generous limiter and is NOT hampered by the general API limiter', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post('/api/v1/payments/webhook').set({ 'content-type': 'application/octet-stream', 'x-razorpay-signature': '0'.repeat(64) }).send(Buffer.from('{}'));
      statuses.push(res.status);
    }
    // ~9 calls already used the general budget of 12: if it applied here, the 4th call would be 429; the webhook's own ceiling (5) is what trips
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);
  });

  it('the general limiter still protects ordinary API routes', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await request(app).get('/api/v1/products')).status);
    expect(statuses).toContain(429);
  });
});

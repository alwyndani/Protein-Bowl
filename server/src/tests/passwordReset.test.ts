import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { LogMailer } from '../modules/email/mailer.js';

/** Forgot / reset password: no enumeration, single use, expiry, session revocation, policy per identity, audit without secrets. */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const OLD = 'Old#Password-2026-abc';
const NEW_CUSTOMER = 'brand-new-pass-1';
const NEW_STAFF = 'Brisk#Morning-Kettle-2026';

describe('password reset', () => {
  const ts = Date.now();
  const email = (l: string) => `pr_${l}_${ts}@test.com`;

  async function mk(label: string, role: RoleEnum, status: 'ACTIVE' | 'PENDING' | 'DEACTIVATED' = 'ACTIVE') {
    return prisma.user.create({
      data: {
        email: email(label), passwordHash: await bcrypt.hash(OLD, 4), status,
        roles: { create: [{ role }] },
        ...(role === RoleEnum.CUSTOMER
          ? { customerProfile: { create: { fullName: `PR ${label}`, referralCode: `PB-PR${label.toUpperCase()}${ts}` } } }
          : { employeeProfile: { create: { employeeCode: `PR-${label}-${ts}`, fullName: `PR ${label}`, designation: 'Test' } } })
      }
    });
  }
  const forgot = (e: string) => request(app).post('/api/v1/auth/forgot-password').send({ email: e });
  const reset = (token: string, password: string) => request(app).post('/api/v1/auth/reset-password').send({ token, password });
  const login = (e: string, p: string) => request(app).post('/api/v1/auth/login').send({ email: e, password: p });
  /** The newest emailed token for an address (the mail is a test-only in-memory outbox). */
  const tokenFor = (e: string) => {
    const mail = [...LogMailer.outbox].reverse().find((m) => m.to === e);
    return mail?.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1] ?? '';
  };

  beforeAll(async () => {
    await Promise.all([mk('cust', RoleEnum.CUSTOMER), mk('chef', RoleEnum.CHEF), mk('pending', RoleEnum.CHEF, 'PENDING'), mk('off', RoleEnum.CUSTOMER, 'DEACTIVATED')]);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('answers identically for known and unknown addresses, and mails only the real account', async () => {
    const before = LogMailer.outbox.length;
    const known = await forgot(email('cust'));
    const unknown = await forgot(`nobody_${ts}@test.com`);
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(LogMailer.outbox.length).toBe(before + 1);
    expect(LogMailer.outbox.at(-1)?.to).toBe(email('cust'));
  });

  it('sends nothing for pending or deactivated accounts, but still answers 202', async () => {
    const before = LogMailer.outbox.length;
    expect((await forgot(email('pending'))).status).toBe(202);
    expect((await forgot(email('off'))).status).toBe(202);
    expect(LogMailer.outbox.length).toBe(before);
  });

  it('a per-account cooldown stops inbox flooding while the answer stays identical', async () => {
    await mk('cool', RoleEnum.CUSTOMER);
    const { env } = await import('../config/env.js');
    const saved = env.PASSWORD_RESET_COOLDOWN_SECONDS;
    env.PASSWORD_RESET_COOLDOWN_SECONDS = 300;
    try {
      const before = LogMailer.outbox.length;
      const first = await forgot(email('cool'));
      const second = await forgot(email('cool'));
      expect(first.body).toEqual(second.body);
      expect(LogMailer.outbox.length).toBe(before + 1); // the second request created no token and sent no email
      expect(await prisma.passwordResetToken.count({ where: { user: { email: email('cool') } } })).toBe(1);
    } finally {
      env.PASSWORD_RESET_COOLDOWN_SECONDS = saved;
    }
  });

  it('validates input strictly', async () => {
    expect((await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nope' })).status).toBe(422);
    expect((await request(app).post('/api/v1/auth/forgot-password').send({ email: email('cust'), extra: 1 })).status).toBe(422);
    expect((await reset('short', 'longenough1')).status).toBe(422);
  });

  it('resets a customer password once: old password dies, sessions are revoked, the link is single-use', async () => {
    const session = await login(email('cust'), OLD);
    expect(session.status).toBe(200);
    const cookie = session.headers['set-cookie'];

    await forgot(email('cust'));
    const token = tokenFor(email('cust'));
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    expect((await reset(token, 'short')).status).toBe(422); // customer policy: min 8 — and the token is NOT consumed by a rejected password
    const ok = await reset(token, NEW_CUSTOMER);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);

    expect((await login(email('cust'), OLD)).status).toBe(401);
    expect((await login(email('cust'), NEW_CUSTOMER)).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401); // old session revoked

    const again = await reset(token, 'another-pass-2');
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('INVALID_RESET_TOKEN');
  });

  it('only the newest link works', async () => {
    await forgot(email('cust'));
    const first = tokenFor(email('cust'));
    await forgot(email('cust'));
    const second = tokenFor(email('cust'));
    expect(first).not.toBe(second);
    expect((await reset(first, 'whatever-pass-3')).body.error).toBe('INVALID_RESET_TOKEN');
    expect((await reset(second, 'whatever-pass-3')).status).toBe(200);
  });

  it('expired, unknown and malformed tokens get the same error', async () => {
    await forgot(email('cust'));
    const token = tokenFor(email('cust'));
    await prisma.passwordResetToken.updateMany({ where: { user: { email: email('cust') }, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await reset(token, 'whatever-pass-4');
    const unknown = await reset('f'.repeat(64), 'whatever-pass-4');
    expect(expired.status).toBe(400);
    expect(expired.body).toEqual(unknown.body);
  });

  it('staff keep the strict staff password policy', async () => {
    await forgot(email('chef'));
    const token = tokenFor(email('chef'));
    const weak = await reset(token, 'weakpass1');
    expect(weak.status).toBe(422);
    expect(weak.body.error).toBe('PASSWORD_POLICY');
    expect((await reset(token, NEW_STAFF)).status).toBe(200);
    expect((await login(email('chef'), NEW_STAFF)).status).toBe(200);
  });

  it('a token for an account that was deactivated meanwhile is refused', async () => {
    const u = await mk('late', RoleEnum.CUSTOMER);
    await forgot(email('late'));
    const token = tokenFor(email('late'));
    await prisma.user.update({ where: { id: u.id }, data: { status: 'DEACTIVATED' } });
    expect((await reset(token, 'whatever-pass-5')).body.error).toBe('INVALID_RESET_TOKEN');
  });

  it('concurrent use of one link succeeds exactly once', async () => {
    await mk('race', RoleEnum.CUSTOMER);
    await forgot(email('race'));
    const token = tokenFor(email('race'));
    const results = await Promise.all([1, 2, 3, 4].map((i) => reset(token, `race-pass-${i}-xyz`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('the database holds only a hash; audit rows never contain the token or password', async () => {
    await forgot(email('cust'));
    const token = tokenFor(email('cust'));
    expect(await prisma.passwordResetToken.count({ where: { tokenHash: token } })).toBe(0);
    await reset(token, 'final-pass-77');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: email('cust') } });
    const rows = await prisma.auditLog.findMany({ where: { entityId: user.id, action: { startsWith: 'PASSWORD_RESET' } } });
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED']));
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(token);
    expect(dump).not.toContain('final-pass-77');
  });
});

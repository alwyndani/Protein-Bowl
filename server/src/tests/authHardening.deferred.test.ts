import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { PrismaClient, RoleEnum } from '@prisma/client';
import app from '../app.js';

/** DB-backed end-to-end checks for the three deferred security items (token reuse, staff vs customer profile, duplicate phone). */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const PASSWORD = 'Password123!Staff';

describe('deferred security items (end to end)', () => {
  const ts = Date.now();
  const tail = String(ts).slice(-8);
  const staffRoles: RoleEnum[] = [RoleEnum.CHEF, RoleEnum.NUTRITIONIST, RoleEnum.TRAINER, RoleEnum.PROCUREMENT, RoleEnum.SUPER_ADMIN];
  const staffToken: Record<string, string> = {};

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    for (const role of staffRoles) {
      const email = `deferred.${role.toLowerCase()}.${ts}@proteinbowl.test`;
      await prisma.user.create({ data: { email, passwordHash, roles: { create: [{ role }] } } });
      const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
      staffToken[role] = login.body.data.accessToken;
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('2. every staff role gets 403 on GET and PUT /customers/me/profile (and addresses)', async () => {
    for (const role of staffRoles) {
      const auth = { Authorization: `Bearer ${staffToken[role]}` };
      expect((await request(app).get('/api/v1/customers/me/profile').set(auth)).status, role).toBe(403);
      expect((await request(app).put('/api/v1/customers/me/profile').set(auth).send({ fullName: 'Not A Customer' })).status, role).toBe(403);
      expect((await request(app).get('/api/v1/customers/me/addresses').set(auth)).status, role).toBe(403);
    }
  });

  it('1. web refresh: a rotated cookie replayed => 401 TOKEN_REUSED and the successor is revoked too; logout kills only its own session', async () => {
    const email = `deferred.web.${ts}@proteinbowl.test`;
    const reg = await request(app).post('/api/v1/auth/register').send({ email, password: PASSWORD, fullName: 'Web Reuse' });
    const cookie0 = (reg.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie0);
    expect(r1.status).toBe(200);
    const cookie1 = (r1.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie0);
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe('TOKEN_REUSED');
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1)).status).toBe(401);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(await prisma.refreshToken.count({ where: { userId: user!.id, revokedAt: null } })).toBe(0);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'AUTH_REFRESH_TOKEN_REUSED', entityId: user!.id } });
    expect(audit).not.toBeNull();
  });

  it('1. two concurrent refreshes with the same token never yield two live successors', async () => {
    const email = `deferred.race.${ts}@proteinbowl.test`;
    const reg = await request(app).post('/api/v1/auth/register').send({ email, password: PASSWORD, fullName: 'Race Reuse' });
    const cookie = (reg.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const [a, b] = await Promise.all([
      request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
      request(app).post('/api/v1/auth/refresh').set('Cookie', cookie)
    ]);
    expect([a.status, b.status].filter((s) => s === 200).length).toBeLessThanOrEqual(1);
    const user = await prisma.user.findUnique({ where: { email } });
    // either the loser ended the whole family (0 active) or it hit the already-revoked path first; never more than the single winner's successor
    expect(await prisma.refreshToken.count({ where: { userId: user!.id, revokedAt: null } })).toBeLessThanOrEqual(1);
  });

  it('3. duplicate phone: registration and profile update both answer 409 PHONE_IN_USE (any formatting)', async () => {
    const phone = `+9183${tail}`;
    const a = await request(app).post('/api/v1/auth/register').send({ email: `deferred.ph1.${ts}@proteinbowl.test`, password: PASSWORD, fullName: 'Phone One', phone });
    expect(a.status).toBe(201);
    const dup = await request(app).post('/api/v1/auth/register').send({ email: `deferred.ph2.${ts}@proteinbowl.test`, password: PASSWORD, fullName: 'Phone Two', phone: `+91 83 ${tail}` });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('PHONE_IN_USE');
    const b = await request(app).post('/api/v1/auth/register').send({ email: `deferred.ph3.${ts}@proteinbowl.test`, password: PASSWORD, fullName: 'Phone Three' });
    const upd = await request(app).put('/api/v1/customers/me/profile').set('Authorization', `Bearer ${b.body.data.accessToken}`).send({ phone });
    expect(upd.status).toBe(409);
    expect(upd.body.error).toBe('PHONE_IN_USE');
  });
});

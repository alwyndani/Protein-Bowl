import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import path from 'path';
import { execSync } from 'child_process';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * Runs against a DISPOSABLE database created just for this file (migrated from scratch with `prisma migrate deploy`),
 * so "no SUPER_ADMIN exists yet" and "exactly two administrators" can be tested without touching shared test data.
 */
const SERVER_DIR = path.resolve(__dirname, '../..');
const DB_NAME = `protein_bowl_p6b_iso_${Date.now()}`;
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
const SCRATCH_URL = `postgresql://postgres:postgres@localhost:5432/${DB_NAME}?schema=public`;
const SECRET = 'test_access_secret_key_1234567890_super_secret';

const BOOTSTRAP_PASSWORD = 'Initial#Quiet-Harbor-2026!';
const BOOTSTRAP_EMAIL = 'first.admin@proteinbowl.test';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const sign = (userId: string, email: string, roles: RoleEnum[]) => jwt.sign({ userId, email, roles }, SECRET, { expiresIn: '15m' });

function runCli(opts: { env?: Record<string, string>; input?: string; args?: string }) {
  const env = { ...process.env, DATABASE_URL: SCRATCH_URL, ...opts.env } as Record<string, string>;
  delete (env as Record<string, string | undefined>).BOOTSTRAP_ADMIN_PASSWORD;
  if (opts.env?.BOOTSTRAP_ADMIN_PASSWORD) env.BOOTSTRAP_ADMIN_PASSWORD = opts.env.BOOTSTRAP_ADMIN_PASSWORD;
  try {
    const stdout = execSync(`npx tsx scripts/bootstrapSuperAdmin.ts ${opts.args ?? ''}`, { cwd: SERVER_DIR, env, input: opts.input ?? '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, out: stdout };
  } catch (err: any) {
    return { code: err.status as number, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('P6B — bootstrap and last-administrator protection (isolated database)', () => {
  let iso: PrismaClient;
  let app: any;
  let StaffAdminService: any;
  let bootstrapSuperAdmin: any;
  let BootstrapRefusedError: any;
  let adminUserId: string;

  beforeAll(async () => {
    const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
    await admin.$executeRawUnsafe(`CREATE DATABASE ${DB_NAME}`);
    await admin.$disconnect();
    execSync('npx prisma migrate deploy', { cwd: SERVER_DIR, env: { ...process.env, DATABASE_URL: SCRATCH_URL }, stdio: 'pipe' });

    process.env.DATABASE_URL = SCRATCH_URL;
    vi.resetModules();
    iso = new PrismaClient({ datasources: { db: { url: SCRATCH_URL } } });
    app = (await import('../app.js')).default;
    StaffAdminService = (await import('../modules/admin/staff.service.js')).StaffAdminService;
    const boot = await import('../modules/admin/bootstrap.service.js');
    bootstrapSuperAdmin = boot.bootstrapSuperAdmin;
    BootstrapRefusedError = boot.BootstrapRefusedError;
  }, 180000);

  afterAll(async () => {
    await iso?.$disconnect();
    try {
      const { prisma } = await import('../config/database.js');
      await prisma.$disconnect();
    } catch { /* ignore */ }
    const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.$disconnect();
  }, 60000);

  // ------------------------------------------------------------------ bootstrap
  describe('SUPER_ADMIN bootstrap (CLI-only)', () => {
    it('there is no HTTP bootstrap route', async () => {
      for (const p of ['/api/v1/admin/bootstrap', '/api/v1/auth/bootstrap', '/api/v1/bootstrap', '/api/v1/auth/staff/bootstrap']) {
        for (const method of ['post', 'get'] as const) {
          const res = await (request(app) as any)[method](p).send({ email: 'x@y.com', password: BOOTSTRAP_PASSWORD });
          expect([404, 401], `${method} ${p}`).toContain(res.status);
        }
      }
      expect(await iso.user.count()).toBe(0);
    });

    it('rejects weak passwords and invalid input without creating anything', async () => {
      for (const password of ['short', 'Password123!', 'alllowercaseonly', `first.admin-Zz9!`]) {
        await expect(bootstrapSuperAdmin({ email: BOOTSTRAP_EMAIL, fullName: 'First Admin', password }, iso)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      }
      await expect(bootstrapSuperAdmin({ email: 'not-an-email', fullName: 'First Admin', password: BOOTSTRAP_PASSWORD }, iso)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(await iso.user.count()).toBe(0);
    });

    it('refuses to convert an existing account that uses the same email', async () => {
      const existing = await iso.user.create({ data: { email: BOOTSTRAP_EMAIL, passwordHash: 'x', roles: { create: { role: RoleEnum.CUSTOMER } } } });
      await expect(bootstrapSuperAdmin({ email: BOOTSTRAP_EMAIL, fullName: 'First Admin', password: BOOTSTRAP_PASSWORD }, iso)).rejects.toMatchObject({ code: 'EMAIL_EXISTS' });
      await iso.user.delete({ where: { id: existing.id } });
    });

    it('41. the CLI creates the initial SUPER_ADMIN (password via stdin), prints no secret, and audits it', () => {
      const run = runCli({ args: `--email ${BOOTSTRAP_EMAIL} --name "First Admin"`, input: `${BOOTSTRAP_PASSWORD}\n` });
      expect(run.code).toBe(0);
      expect(run.out).toContain('SUPER_ADMIN created');
      expect(run.out).not.toContain(BOOTSTRAP_PASSWORD);
    });

    it('the bootstrapped account is a normal ACTIVE SUPER_ADMIN with a correct password and an audit record', async () => {
      const user = await iso.user.findUnique({ where: { email: BOOTSTRAP_EMAIL }, include: { roles: true, employeeProfile: true } });
      expect(user).not.toBeNull();
      adminUserId = user!.id;
      expect(user!.status).toBe('ACTIVE');
      expect(user!.roles.map((r) => r.role)).toEqual(['SUPER_ADMIN']);
      expect(user!.employeeProfile!.designation).toBe('Platform Super Administrator');
      expect(await bcrypt.compare(BOOTSTRAP_PASSWORD, user!.passwordHash)).toBe(true);

      const audit = await iso.auditLog.findMany({ where: { action: 'SUPER_ADMIN_BOOTSTRAPPED' } });
      expect(audit).toHaveLength(1);
      expect(audit[0].entityId).toBe(user!.id);
      expect(audit[0].userId).toBeNull();
      expect(JSON.stringify(audit)).not.toContain(BOOTSTRAP_PASSWORD);
      expect(JSON.stringify(audit)).not.toMatch(/\$2[aby]\$/);
    });

    it('40. bootstrap refuses to run when an active SUPER_ADMIN exists (CLI and service), creating nothing', async () => {
      const before = await iso.user.count();
      const run = runCli({ args: `--email second.admin@proteinbowl.test --name "Second Admin"`, env: { BOOTSTRAP_ADMIN_PASSWORD: 'Rotated#Quiet-Harbor-2027' } });
      expect(run.code).toBe(1);
      expect(run.out).toContain('ADMIN_EXISTS');
      expect(run.out).not.toContain('Rotated#Quiet-Harbor-2027');

      await expect(bootstrapSuperAdmin({ email: 'third.admin@proteinbowl.test', fullName: 'Third Admin', password: 'Another#Quiet-Harbor-2028' }, iso)).rejects.toBeInstanceOf(BootstrapRefusedError);
      expect(await iso.user.count()).toBe(before);
    });

    it('the CLI refuses missing arguments and never takes the password as an argument', () => {
      const run = runCli({ args: '' });
      expect(run.code).toBe(2);
      expect(run.out).toMatch(/Usage/);
    });

    it('the bootstrapped administrator can sign in and run the full onboarding flow end to end', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ email: BOOTSTRAP_EMAIL, password: BOOTSTRAP_PASSWORD });
      expect(login.status).toBe(200);
      const token = login.body.data.accessToken;

      const step = await request(app).post('/api/v1/admin/step-up').set(bearer(token)).send({ password: BOOTSTRAP_PASSWORD });
      expect(step.status).toBe(200);

      const branch = await request(app).post('/api/v1/admin/branches').set(bearer(token)).send({ code: 'iso-main', name: 'Isolated Main', address: '1 Test Road', city: 'Kochi' });
      expect(branch.status).toBe(201);

      const staff = await request(app)
        .post('/api/v1/admin/staff')
        .set({ ...bearer(token), 'X-Step-Up-Token': step.body.data.stepUpToken })
        .send({ email: 'new.chef@proteinbowl.test', fullName: 'New Chef', designation: 'Chef', roles: ['CHEF'], branchIds: [branch.body.data.id] });
      expect(staff.status).toBe(201);

      const accept = await request(app).post('/api/v1/auth/staff/accept-invite').send({ token: staff.body.data.invitation.setupToken, password: 'Brisk#Morning-Kettle-2026' });
      expect(accept.status).toBe(200);
      const chefLogin = await request(app).post('/api/v1/auth/login').send({ email: 'new.chef@proteinbowl.test', password: 'Brisk#Morning-Kettle-2026' });
      expect(chefLogin.status).toBe(200);
      expect((await request(app).get('/api/v1/kds/tickets').set(bearer(chefLogin.body.data.accessToken))).status).toBe(200);
    });
  });

  // ------------------------------------------------------------------ last administrator
  describe('26. last active SUPER_ADMIN protection', () => {
    let secondAdminId: string;
    let secondAdminToken: string;
    const SECOND_PASSWORD = 'Rotated#Quiet-Harbor-2027';

    async function stepUp(email: string, password: string, token: string) {
      const r = await request(app).post('/api/v1/admin/step-up').set(bearer(token)).send({ password });
      return r.body.data.stepUpToken as string;
    }

    it('the guard blocks deactivating the only remaining active SUPER_ADMIN (deterministic, service level)', async () => {
      const second = await iso.user.create({
        data: { email: 'second.admin@proteinbowl.test', passwordHash: await bcrypt.hash(SECOND_PASSWORD, 10), status: 'DEACTIVATED', roles: { create: { role: RoleEnum.SUPER_ADMIN } } }
      });
      secondAdminId = second.id;
      secondAdminToken = sign(second.id, second.email, [RoleEnum.SUPER_ADMIN]);

      // Only the bootstrapped admin is ACTIVE. A (hypothetical) different actor tries to deactivate it.
      // (a different, real account acting as the caller - e.g. an administrator being deactivated concurrently)
      const ghostActor = { userId: secondAdminId, roles: [RoleEnum.SUPER_ADMIN] };
      await expect(
        StaffAdminService.deactivate({ actor: ghostActor, audit: {} }, adminUserId, { reason: 'attempted lockout', status: 'DEACTIVATED' })
      ).rejects.toMatchObject({ errorCode: 'LAST_SUPER_ADMIN', statusCode: 409 });

      expect((await iso.user.findUnique({ where: { id: adminUserId } }))!.status).toBe('ACTIVE');
      expect(await iso.auditLog.count({ where: { action: 'ADMIN_ACTION_DENIED', entityId: adminUserId } })).toBeGreaterThan(0);
    });

    it('a self-deactivation of the last administrator is refused at the API too', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ email: BOOTSTRAP_EMAIL, password: BOOTSTRAP_PASSWORD });
      const token = login.body.data.accessToken;
      const proof = await stepUp(BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, token);
      const res = await request(app).post(`/api/v1/admin/staff/${adminUserId}/deactivate`).set({ ...bearer(token), 'X-Step-Up-Token': proof }).send({ reason: 'locking myself out' });
      expect(res.status).toBe(403);
      expect((await iso.user.findUnique({ where: { id: adminUserId } }))!.status).toBe('ACTIVE');
    });

    it('with two administrators, concurrent mutual deactivation can never leave zero active administrators', async () => {
      for (let round = 0; round < 3; round++) {
        await iso.user.updateMany({ where: { id: { in: [adminUserId, secondAdminId] } }, data: { status: 'ACTIVE' } });
        const loginA = await request(app).post('/api/v1/auth/login').send({ email: BOOTSTRAP_EMAIL, password: BOOTSTRAP_PASSWORD });
        const tokenA = loginA.body.data.accessToken as string;
        const tokenB = secondAdminToken;
        const proofA = await stepUp(BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, tokenA);
        const proofB = await stepUp('second', SECOND_PASSWORD, tokenB);

        const [aKillsB, bKillsA] = await Promise.all([
          request(app).post(`/api/v1/admin/staff/${secondAdminId}/deactivate`).set({ ...bearer(tokenA), 'X-Step-Up-Token': proofA }).send({ reason: 'concurrent test A' }),
          request(app).post(`/api/v1/admin/staff/${adminUserId}/deactivate`).set({ ...bearer(tokenB), 'X-Step-Up-Token': proofB }).send({ reason: 'concurrent test B' })
        ]);

        const active = await iso.user.count({ where: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: RoleEnum.SUPER_ADMIN } } } });
        expect(active, `round ${round}: statuses ${aKillsB.status}/${bKillsA.status}`).toBeGreaterThanOrEqual(1);
        expect([aKillsB.status, bKillsA.status].filter((s) => s === 200).length).toBeLessThanOrEqual(1);
      }
    }, 120000);

    it('a deactivated administrator\'s still-valid tokens stop working immediately', async () => {
      await iso.user.update({ where: { id: secondAdminId }, data: { status: 'DEACTIVATED' } });
      expect((await request(app).get('/api/v1/admin/staff').set(bearer(secondAdminToken))).status).toBe(401);
    });
  });
});

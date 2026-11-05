import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSeedPlan, isProductionEnv, DEV_SEED_DEFAULT_PASSWORD } from '../../prisma/seedGuard.js';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

function token(userId: string, email: string, roles: RoleEnum[]) {
  const secret = process.env.JWT_ACCESS_SECRET || 'test_access_secret_key_1234567890_super_secret';
  return jwt.sign({ userId, email, roles }, secret, { expiresIn: '15m' });
}

const STAFF_ROLES: RoleEnum[] = [
  RoleEnum.SUPER_ADMIN,
  RoleEnum.MD,
  RoleEnum.NUTRITIONIST,
  RoleEnum.CHEF,
  RoleEnum.POS,
  RoleEnum.TRAINER,
];

describe('Phase 4C — Security & Commerce Hardening', () => {
  const ts = Date.now();
  const tokens: Record<string, string> = {};
  let customerAddressId: string;
  let customerProfileId: string;

  const auth = (key: string) => ({ Authorization: `Bearer ${tokens[key]}` });

  async function makeUser(label: string, role: RoleEnum, withProfile: boolean) {
    const pwdHash = await bcrypt.hash('Password123!', 10);
    const user = await prisma.user.create({
      data: {
        email: `hard_${label}_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role } },
        ...(withProfile
          ? { customerProfile: { create: { fullName: `Hardening ${label}`, referralCode: `PB-H${label.toUpperCase().slice(0, 6)}${ts}` } } }
          : {}),
      },
      include: { customerProfile: true },
    });
    tokens[label] = token(user.id, user.email, [role]);
    return user;
  }

  beforeAll(async () => {
    const customer = await makeUser('customer', RoleEnum.CUSTOMER, true);
    customerProfileId = customer.customerProfile!.id;
    await makeUser('messlegacy', RoleEnum.MESS_CUSTOMER, true);
    for (const role of STAFF_ROLES) {
      // Staff WITH a customer profile: they must still be blocked from customer-context APIs.
      await makeUser(role.toLowerCase(), role, true);
    }
    const addr = await prisma.customerAddress.create({
      data: {
        customerProfileId,
        title: 'Home',
        addressLine1: '1 Test Street',
        city: 'Kochi',
        state: 'Kerala',
        postalCode: '682001',
      },
    });
    customerAddressId = addr.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================
  // Customer-context authorization (no SUPER_ADMIN / staff bypass)
  // ============================================================
  describe('customer cart / address / checkout / orders', () => {
    it('SUPER_ADMIN cannot use the customer cart', async () => {
      const get = await request(app).get('/api/v1/cart').set(auth('super_admin'));
      const add = await request(app).post('/api/v1/cart/items').set(auth('super_admin')).send({ productId: 'x', quantity: 1 });
      const del = await request(app).delete('/api/v1/cart').set(auth('super_admin'));
      expect([get.status, add.status, del.status]).toEqual([403, 403, 403]);
    });

    it('SUPER_ADMIN cannot use customer /me address APIs', async () => {
      const list = await request(app).get('/api/v1/customers/me/addresses').set(auth('super_admin'));
      const create = await request(app).post('/api/v1/customers/me/addresses').set(auth('super_admin')).send({});
      const update = await request(app).put(`/api/v1/customers/me/addresses/${customerAddressId}`).set(auth('super_admin')).send({});
      const remove = await request(app).delete(`/api/v1/customers/me/addresses/${customerAddressId}`).set(auth('super_admin'));
      expect([list.status, create.status, update.status, remove.status]).toEqual([403, 403, 403, 403]);
    });

    it('SUPER_ADMIN cannot perform customer checkout or order APIs', async () => {
      const preview = await request(app).post('/api/v1/checkout/preview').set(auth('super_admin')).send({});
      const order = await request(app)
        .post('/api/v1/orders')
        .set(auth('super_admin'))
        .set('x-idempotency-key', `hard-${ts}`)
        .send({ addressId: customerAddressId });
      const history = await request(app).get('/api/v1/orders/my-orders').set(auth('super_admin'));
      expect([preview.status, order.status, history.status]).toEqual([403, 403, 403]);
    });

    it('SUPER_ADMIN cannot use customer /me profile APIs', async () => {
      const res = await request(app).get('/api/v1/customers/me/profile').set(auth('super_admin'));
      expect(res.status).toBe(403);
    });

    it('CUSTOMER retains cart, address and order-history access', async () => {
      const cart = await request(app).get('/api/v1/cart').set(auth('customer'));
      const addrs = await request(app).get('/api/v1/customers/me/addresses').set(auth('customer'));
      const orders = await request(app).get('/api/v1/orders/my-orders').set(auth('customer'));
      expect([cart.status, addrs.status, orders.status]).toEqual([200, 200, 200]);
    });

    it('unauthenticated requests still get 401', async () => {
      const res = await request(app).get('/api/v1/cart');
      expect(res.status).toBe(401);
    });
  });

  // ============================================================
  // Diet customer endpoints
  // ============================================================
  describe('diet customer vs nutritionist endpoints', () => {
    const customerEndpoints: Array<['get' | 'post', string]> = [
      ['post', '/api/v1/diets/requests'],
      ['get', '/api/v1/diets/my-requests'],
      ['get', '/api/v1/diets/my-plans'],
      ['post', '/api/v1/diets/plans/some-plan/approve'],
      ['post', '/api/v1/diets/plans/some-plan/request-revision'],
    ];

    it('staff roles cannot call customer diet endpoints', async () => {
      for (const role of STAFF_ROLES) {
        for (const [method, path] of customerEndpoints) {
          const res = await request(app)[method](path).set(auth(role.toLowerCase())).send({});
          expect(res.status, `${role} ${method} ${path}`).toBe(403);
        }
      }
    });

    it('legacy MESS_CUSTOMER cannot use CUSTOMER-only diet APIs', async () => {
      for (const [method, path] of customerEndpoints) {
        const res = await request(app)[method](path).set(auth('messlegacy')).send({});
        expect(res.status, `${method} ${path}`).toBe(403);
      }
    });

    it('CUSTOMER retains customer diet endpoints', async () => {
      const mine = await request(app).get('/api/v1/diets/my-requests').set(auth('customer'));
      const plans = await request(app).get('/api/v1/diets/my-plans').set(auth('customer'));
      expect([mine.status, plans.status]).toEqual([200, 200]);
    });

    it('NUTRITIONIST retains nutritionist endpoints; CUSTOMER cannot use them', async () => {
      const queue = await request(app).get('/api/v1/diets/nutritionist/unassigned-queue').set(auth('nutritionist'));
      const claimed = await request(app).get('/api/v1/diets/nutritionist/my-claimed-queue').set(auth('nutritionist'));
      const custQueue = await request(app).get('/api/v1/diets/nutritionist/unassigned-queue').set(auth('customer'));
      expect([queue.status, claimed.status]).toEqual([200, 200]);
      expect(custQueue.status).toBe(403);
    });
  });

  // ============================================================
  // Kerala Mess boundaries
  // ============================================================
  describe('Kerala Mess customer vs staff endpoints', () => {
    it('staff roles cannot use customer Mess endpoints', async () => {
      for (const role of STAFF_ROLES) {
        const key = role.toLowerCase();
        const account = await request(app).get('/api/v1/mess/account').set(auth(key));
        const save = await request(app).put('/api/v1/mess/account').set(auth(key)).send({});
        const buy = await request(app).post('/api/v1/mess/subscriptions').set(auth(key)).send({});
        expect([account.status, save.status, buy.status], role).toEqual([403, 403, 403]);
        // P10A: the legacy mutation endpoints are retired for EVERYONE (410, nothing changes)
        const pause = await request(app).post('/api/v1/mess/pause-meal').set(auth(key)).send({});
        expect(pause.status, role).toBe(410);
      }
    });

    it('CUSTOMER can use customer Mess endpoints', async () => {
      const res = await request(app).get('/api/v1/mess/account').set(auth('customer'));
      expect(res.status).toBe(200);
    });

    it('a retired MESS_CUSTOMER account has no approved role and is refused everywhere (403 NO_APPROVED_ROLE)', async () => {
      const res = await request(app).get('/api/v1/mess/account').set(auth('messlegacy'));
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('NO_APPROVED_ROLE');
    });

    it('mess plans stay public', async () => {
      const res = await request(app).get('/api/v1/mess/plans');
      expect(res.status).toBe(200);
    });

    it('the legacy gate-pass endpoint is retired for every role (410, no mutation, MD included)', async () => {
      for (const role of [RoleEnum.POS, RoleEnum.CHEF, RoleEnum.MD, RoleEnum.SUPER_ADMIN, RoleEnum.CUSTOMER, RoleEnum.NUTRITIONIST]) {
        const res = await request(app).post('/api/v1/mess/verify-gatepass').set(auth(role.toLowerCase())).send({ code: 'NO-SUCH-CODE' });
        expect(res.status, role).toBe(410);
        expect(res.body.error).toBe('MESS_ENDPOINT_RETIRED');
      }
    });

    it('missing customer profile returns a valid HTTP 404 (not the invalid 4404)', async () => {
      const bare = await prisma.user.create({
        data: {
          email: `hard_noprofile_${ts}@test.com`,
          passwordHash: 'x',
          roles: { create: { role: RoleEnum.CUSTOMER } },
        },
      });
      const t = token(bare.id, bare.email, [RoleEnum.CUSTOMER]);
      const res = await request(app).get('/api/v1/mess/account').set('Authorization', `Bearer ${t}`);
      expect(res.status).toBe(404);
    });
  });

  // ============================================================
  // CORS + origin protection
  // ============================================================
  describe('CORS and origin validation', () => {
    it('configured origin receives CORS headers with credentials', async () => {
      const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:3000');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('a second configured origin is accepted', async () => {
      const res = await request(app).get('/api/v1/health').set('Origin', 'https://app.proteinbowl.test');
      expect(res.headers['access-control-allow-origin']).toBe('https://app.proteinbowl.test');
    });

    it('unauthorized origin gets no CORS headers and no 500', async () => {
      const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('preflight from an unauthorized origin gets no CORS grant and no 500', async () => {
      const res = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.status).toBeLessThan(500);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('state-changing request from a disallowed browser origin is rejected with 403', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://evil.example')
        .send({ email: 'a@b.com', password: 'x' });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('state-changing request from an allowed origin is processed', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: 'nobody@nowhere.test', password: 'wrong-password' });
      expect(res.status).toBe(401);
    });

    it('requests without an Origin header (mobile/curl) remain supported', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@nowhere.test', password: 'wrong-password' });
      expect(res.status).toBe(401);
    });

    it('production requires explicit CORS origins and rejects wildcards', async () => {
      const { parseAllowedOrigins } = await import('../config/env.js');
      expect(() => parseAllowedOrigins('*')).toThrow();
      expect(() => parseAllowedOrigins('not a url')).toThrow();
      expect(parseAllowedOrigins('https://a.example/, http://localhost:3000')).toEqual([
        'https://a.example',
        'http://localhost:3000',
      ]);

      const savedNodeEnv = process.env.NODE_ENV;
      const savedCors = process.env.CORS_ALLOWED_ORIGINS;
      const savedInvite = process.env.INVITE_DELIVERY;
      vi.resetModules();
      process.env.NODE_ENV = 'production';
      const savedEmail = process.env.EMAIL_PROVIDER;
      process.env.INVITE_DELIVERY = 'manual'; // an otherwise valid production configuration
      process.env.EMAIL_PROVIDER = 'none';
      delete process.env.CORS_ALLOWED_ORIGINS;
      const savedJwt = { a: process.env.JWT_ACCESS_SECRET, r: process.env.JWT_REFRESH_SECRET };
      process.env.JWT_ACCESS_SECRET = 'k9Qm2vXz7LpR4tYw8NbC5dFh3JsGa6Ue'; // a production configuration needs non-placeholder secrets
      process.env.JWT_REFRESH_SECRET = 'Zt4Hn8Vb1KxQ6mWe3RyP9cLd5SgJa2Uf';
      try {
        await expect(import('../config/env.js')).rejects.toThrow(/CORS_ALLOWED_ORIGINS/);
      } finally {
        process.env.JWT_ACCESS_SECRET = savedJwt.a;
        process.env.JWT_REFRESH_SECRET = savedJwt.r;
        if (savedEmail === undefined) delete process.env.EMAIL_PROVIDER;
        else process.env.EMAIL_PROVIDER = savedEmail;
        process.env.NODE_ENV = savedNodeEnv;
        process.env.CORS_ALLOWED_ORIGINS = savedCors;
        if (savedInvite === undefined) delete process.env.INVITE_DELIVERY;
        else process.env.INVITE_DELIVERY = savedInvite;
        vi.resetModules();
      }
    });
  });

  // ============================================================
  // Request body limit
  // ============================================================
  describe('request body limit', () => {
    it('oversized JSON body returns 413 (not 500)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(300 * 1024) }));
      expect(res.status).toBe(413);
      expect(res.body.error).toBe('PAYLOAD_TOO_LARGE');
    });

    it('malformed JSON returns 400 (not 500)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": ');
      expect(res.status).toBe(400);
    });

    it('a legitimately large diet-plan-sized body (>80KB) passes the body parser', async () => {
      const meal = {
        mealType: 'Lunch',
        recipeName: 'Bowl',
        calories: 500,
        protein: 40,
        carbs: 50,
        fat: 10,
        instructions: 'x'.repeat(450),
      };
      const days = Array.from({ length: 30 }, (_, i) => ({
        dayNumber: i + 1,
        dayName: `Day ${i + 1}`,
        meals: Array.from({ length: 6 }, () => meal),
      }));
      const body = { requestId: 'none', targetCalories: 2000, proteinGrams: 100, carbsGrams: 200, fatGrams: 60, days };
      expect(JSON.stringify(body).length).toBeGreaterThan(80 * 1024);
      const res = await request(app).post('/api/v1/diets/plans').set(auth('nutritionist')).send(body);
      expect(res.status).not.toBe(413);
    });
  });

  // ============================================================
  // Payment safety
  // ============================================================
  describe('payment safety', () => {
    it('a new Payment record defaults to PENDING, never SUCCESS', async () => {
      const order = await prisma.order.create({
        data: {
          orderNumber: `HARD-${ts}`,
          customerProfileId,
          totalAmount: 100,
          netAmount: 100,
        },
      });
      const payment = await prisma.payment.create({
        data: { orderId: order.id, amount: 100, method: 'UPI' },
      });
      expect(payment.status).toBe('PENDING');
      expect(payment.status).not.toBe('SUCCESS');
    });

    it('the payments.status column default is PENDING at the database level', async () => {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT column_default FROM information_schema.columns WHERE table_name='payments' AND column_name='status'`
      );
      expect(String(rows[0].column_default)).toContain('PENDING');
    });
  });

  // ============================================================
  // Seed credential guard
  // ============================================================
  describe('seed credential production guard', () => {
    it('production never seeds demo users or a demo password', () => {
      const plan = resolveSeedPlan({ NODE_ENV: 'production', SEED_DEFAULT_PASSWORD: 'anything' } as NodeJS.ProcessEnv);
      expect(plan.seedDemoData).toBe(false);
      expect(plan.demoPassword).toBeNull();
    });

    const LOCAL = 'postgresql://u:p@localhost:5432/pb_dev?schema=public';
    it('a LOCAL development database uses the documented dev default unless overridden by a strong value', () => {
      expect(resolveSeedPlan({ NODE_ENV: 'development', DATABASE_URL: LOCAL } as NodeJS.ProcessEnv).demoPassword).toBe(DEV_SEED_DEFAULT_PASSWORD);
      expect(resolveSeedPlan({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x' } as NodeJS.ProcessEnv).seedDemoData).toBe(true); // NODE_ENV unset, local
      const custom = resolveSeedPlan({ NODE_ENV: 'development', DATABASE_URL: LOCAL, SEED_DEFAULT_PASSWORD: 'Custom#Dev1-long' } as NodeJS.ProcessEnv);
      expect(custom.seedDemoData).toBe(true);
      expect(custom.demoPassword).toBe('Custom#Dev1-long');
    });

    it('a NON-local database never receives demo users, even with NODE_ENV unset; only an explicit ALLOW_DEMO_SEED=true opts in', () => {
      const remote = 'postgresql://u:p@db.internal.example:5432/prod?schema=public';
      for (const env of [{ DATABASE_URL: remote }, { NODE_ENV: 'development', DATABASE_URL: remote }, { NODE_ENV: 'test', DATABASE_URL: remote }, {}, { DATABASE_URL: 'not a url' }]) {
        const plan = resolveSeedPlan(env as NodeJS.ProcessEnv);
        expect(plan.seedDemoData, JSON.stringify(Object.keys(env))).toBe(false);
        expect(plan.demoPassword).toBeNull();
      }
      expect(resolveSeedPlan({ DATABASE_URL: remote, ALLOW_DEMO_SEED: 'true' } as NodeJS.ProcessEnv).seedDemoData).toBe(true);
      // production still wins over the opt-in
      expect(resolveSeedPlan({ NODE_ENV: 'production', DATABASE_URL: LOCAL, ALLOW_DEMO_SEED: 'true' } as NodeJS.ProcessEnv).seedDemoData).toBe(false);
    });

    it('NODE_ENV=production NEVER seeds demo users, even with ALLOW_DEMO_SEED=true, a local OR remote OR missing database URL, any spelling of "production", and any password override', () => {
      const urls = [LOCAL, 'postgresql://u:p@127.0.0.1:5432/x', 'postgresql://u:p@[::1]:5432/x', 'postgresql://u:p@db.internal.example:5432/prod', 'not a url', undefined];
      for (const nodeEnv of ['production', 'Production', 'PRODUCTION', ' production ', 'production\n']) {
        for (const url of urls) {
          for (const allow of ['true', 'TRUE', '1', undefined]) {
            for (const pw of [undefined, 'Sup3r-Long-Override-Pass!']) {
              const plan = resolveSeedPlan({ NODE_ENV: nodeEnv, DATABASE_URL: url, ALLOW_DEMO_SEED: allow, SEED_DEFAULT_PASSWORD: pw } as NodeJS.ProcessEnv);
              expect(plan.seedDemoData, `${JSON.stringify(nodeEnv)} ${url ?? 'no-url'} allow=${allow} pw=${pw ? 'set' : 'unset'}`).toBe(false);
              expect(plan.demoPassword).toBeNull();
            }
          }
        }
      }
      expect(isProductionEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true);
      expect(isProductionEnv({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false);
    });

    it('remote databases: only the exact opt-in ALLOW_DEMO_SEED=true seeds; "TRUE", "1", "yes", empty and unset do not', () => {
      const remote = 'postgresql://u:p@db.internal.example:5432/test';
      for (const allow of ['TRUE', 'True', '1', 'yes', '', ' true', undefined]) {
        expect(resolveSeedPlan({ NODE_ENV: 'test', DATABASE_URL: remote, ALLOW_DEMO_SEED: allow } as NodeJS.ProcessEnv).seedDemoData, String(allow)).toBe(false);
      }
      for (const host of ['db.localhost.example.com', 'localhost.evil.example', '10.0.0.5', '192.168.1.20', '0.0.0.0', 'host.docker.internal']) {
        expect(resolveSeedPlan({ NODE_ENV: 'development', DATABASE_URL: `postgresql://u:p@${host}:5432/x` } as NodeJS.ProcessEnv).seedDemoData, host).toBe(false);
      }
    });

    it('the seed script re-checks production on its own (defence in depth) before any user is created', () => {
      const seed = readFileSync(join(__dirname, '../../prisma/seed.ts'), 'utf8');
      const check = seed.indexOf('if (isProductionEnv())');
      expect(check).toBeGreaterThan(0);
      expect(check).toBeLessThan(seed.indexOf('prisma.user.upsert')); // the first user is created only after the refusal
      expect(seed).toMatch(/throw new Error\('Refusing to create demo users: NODE_ENV is production'\)/);
    });

    it('a weak SEED_DEFAULT_PASSWORD override disables demo users; the reason never contains the password or the connection string', () => {
      const weak = resolveSeedPlan({ NODE_ENV: 'development', DATABASE_URL: LOCAL, SEED_DEFAULT_PASSWORD: 'short1!' } as NodeJS.ProcessEnv);
      expect(weak.seedDemoData).toBe(false);
      const reasons = [weak.reason, resolveSeedPlan({ NODE_ENV: 'production', DATABASE_URL: LOCAL, SEED_DEFAULT_PASSWORD: 'Sup3r-Secret-Pass!' } as NodeJS.ProcessEnv).reason, resolveSeedPlan({ DATABASE_URL: 'postgresql://user:hunter2pw@db.example:5432/x' } as NodeJS.ProcessEnv).reason].join(' ');
      expect(reasons).not.toMatch(/short1|Sup3r-Secret|hunter2pw|postgresql:/);
    });

    it('the isolated E2E API is pinned: refuses production, fixed to localhost/pb_ci_test, mock payments, log mailer, development mode', () => {
      const s = readFileSync(join(__dirname, '../../scripts/startIsolatedApi.ts'), 'utf8');
      expect(s).toMatch(/NODE_ENV === 'production'[\s\S]{0,200}process\.exit\(1\)/);
      expect(s).toContain("@localhost:${port}/pb_ci_test");
      expect(s).toMatch(/PAYMENT_PROVIDER = 'mock'/);
      expect(s).toMatch(/EMAIL_PROVIDER = 'log'/);
      expect(s).toMatch(/NODE_ENV = 'development'/);
      expect(s).not.toMatch(/process\.env\.DATABASE_URL\s*=\s*process\.env/); // never derives the target from the ambient environment
    });

    it('the seed script itself only creates users through the plan and the default password is not used outside the guard', () => {
      const seed = readFileSync(join(__dirname, '../../prisma/seed.ts'), 'utf8');
      expect(seed).toMatch(/resolveSeedPlan\(\)/);
      expect(seed).toMatch(/if \(!plan\.seedDemoData\)/);
      expect(seed).not.toContain(DEV_SEED_DEFAULT_PASSWORD);
    });
  });
});

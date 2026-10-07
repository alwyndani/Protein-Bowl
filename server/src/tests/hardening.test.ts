import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { resolveSeedPlan, DEV_SEED_DEFAULT_PASSWORD } from '../../prisma/seedGuard.js';

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
        const register = await request(app).post('/api/v1/mess/register').set(auth(key)).send({});
        const pause = await request(app).post('/api/v1/mess/pause-meal').set(auth(key)).send({});
        expect([account.status, register.status, pause.status], role).toEqual([403, 403, 403]);
      }
    });

    it('CUSTOMER can use customer Mess endpoints', async () => {
      const res = await request(app).get('/api/v1/mess/account').set(auth('customer'));
      expect(res.status).toBe(200);
    });

    it('legacy MESS_CUSTOMER can still use customer Mess endpoints (backward compatibility)', async () => {
      const res = await request(app).get('/api/v1/mess/account').set(auth('messlegacy'));
      expect(res.status).toBe(200);
    });

    it('mess plans stay public', async () => {
      const res = await request(app).get('/api/v1/mess/plans');
      expect(res.status).toBe(200);
    });

    it('POS/CHEF/MD/SUPER_ADMIN keep gate-pass verification access; others do not', async () => {
      for (const role of [RoleEnum.POS, RoleEnum.CHEF, RoleEnum.MD, RoleEnum.SUPER_ADMIN]) {
        const res = await request(app)
          .post('/api/v1/mess/verify-gatepass')
          .set(auth(role.toLowerCase()))
          .send({ code: 'NO-SUCH-CODE' });
        // Authorized: reaches the service, which rejects the unknown code (not 401/403).
        expect([401, 403], role).not.toContain(res.status);
      }
      const customer = await request(app).post('/api/v1/mess/verify-gatepass').set(auth('customer')).send({ code: 'X' });
      const nutritionist = await request(app).post('/api/v1/mess/verify-gatepass').set(auth('nutritionist')).send({ code: 'X' });
      expect([customer.status, nutritionist.status]).toEqual([403, 403]);
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
      vi.resetModules();
      process.env.NODE_ENV = 'production';
      delete process.env.CORS_ALLOWED_ORIGINS;
      try {
        await expect(import('../config/env.js')).rejects.toThrow(/CORS_ALLOWED_ORIGINS/);
      } finally {
        process.env.NODE_ENV = savedNodeEnv;
        process.env.CORS_ALLOWED_ORIGINS = savedCors;
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

    it('development uses the documented dev default unless overridden', () => {
      expect(resolveSeedPlan({ NODE_ENV: 'development' } as NodeJS.ProcessEnv).demoPassword).toBe(DEV_SEED_DEFAULT_PASSWORD);
      const custom = resolveSeedPlan({ NODE_ENV: 'development', SEED_DEFAULT_PASSWORD: 'Custom#Dev1' } as NodeJS.ProcessEnv);
      expect(custom.seedDemoData).toBe(true);
      expect(custom.demoPassword).toBe('Custom#Dev1');
    });
  });
});

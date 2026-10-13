import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';

// The minimum version is CONFIGURATION: it must be set before the app (and its env) are imported.
process.env.MOBILE_MIN_APP_VERSION = '1.2.0';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

describe('P11A — configurable minimum mobile app version', () => {
  let app: any;
  beforeAll(async () => {
    app = (await import('../app.js')).default;
  });
  const call = (client: string) => request(app).post('/api/v1/auth/mobile/login').set('X-PB-Client', client).send({ email: 'nobody@nowhere.test', password: 'x' });

  it('refuses a version below the configured minimum with 426 APP_VERSION_UNSUPPORTED (before any credential check)', async () => {
    for (const v of ['1.1.9', '1.0.0', '0.9.99']) {
      const res = await call(`protein-bowl-mobile/${v} (android)`);
      expect(res.status, v).toBe(426);
      expect(res.body.error, v).toBe('APP_VERSION_UNSUPPORTED');
    }
  });

  it('accepts the minimum and anything newer (numeric, not lexical, comparison)', async () => {
    for (const v of ['1.2.0', '1.2.1', '1.10.0', '2.0.0', '10.0.0']) {
      const res = await call(`protein-bowl-mobile/${v} (ios)`);
      expect(res.status, v).toBe(401); // passes the contract, then fails on credentials
    }
  });

  it('records the refusal as an audit event without credentials', async () => {
    await call('protein-bowl-mobile/1.0.1 (android)');
    await new Promise((r) => setTimeout(r, 200));
    const rows = await prisma.auditLog.findMany({ where: { action: 'MOBILE_AUTH_VERSION_REFUSED', createdAt: { gte: new Date(Date.now() - 30_000) } } });
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toMatch(/password|nobody@nowhere/);
  });

  it('a malformed MOBILE_MIN_APP_VERSION fails configuration validation', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    process.env.MOBILE_MIN_APP_VERSION = '1.2';
    await expect(import('../config/env.js')).rejects.toThrow();
    process.env.MOBILE_MIN_APP_VERSION = '1.2.0';
    vi.resetModules();
  });
});

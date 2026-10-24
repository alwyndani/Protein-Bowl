import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import os from 'node:os';

// Proxy-trust behaviour of the REAL app (rate limiters included) for the local Cloudflare quick-tunnel topology: cloudflared runs on the
// same host and connects from loopback, so TRUST_PROXY=loopback must trust X-Forwarded-For from a loopback peer and from nothing else.
// TRUST_PROXY and the limiter ceilings are read when the app module loads, so every scenario re-imports the app with its own settings.
// The login-free /auth/refresh route is used because it sits behind a default (IP-keyed) limiter and answers without touching the database.

const SAVED = { TRUST_PROXY: process.env.TRUST_PROXY, RL_REFRESH_MAX: process.env.RL_REFRESH_MAX };

async function loadApp(trustProxy?: string) {
  vi.resetModules();
  process.env.RL_REFRESH_MAX = '2';
  if (trustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = trustProxy;
  return (await import('../app.js')).default as any;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const refresh = (app: any, forwardedFor?: string) => {
  const r = request(app).post('/api/v1/auth/refresh');
  return (forwardedFor ? r.set('X-Forwarded-For', forwardedFor) : r).send({});
};

/** True when console.error received the express-rate-limit ValidationError with this code. */
const sawValidationError = (spy: ReturnType<typeof vi.spyOn>, code: string) =>
  spy.mock.calls.some((args: unknown[]) => args.some((a) => !!a && typeof a === 'object' && (a as { code?: string }).code === code));

const lanIp = Object.values(os.networkInterfaces())
  .flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;

describe('TRUST_PROXY=loopback (cloudflared on the same host)', () => {
  it('trusts the forwarded client IP of a loopback peer: each forwarded IP has its OWN bucket and no proxy validation error is logged', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = await loadApp('loopback');
    expect(app.get('trust proxy')).toBe('loopback');
    expect(app.get('trust proxy')).not.toBe(true); // never the permissive setting

    const a = [(await refresh(app, '203.0.113.5')).status, (await refresh(app, '203.0.113.5')).status, (await refresh(app, '203.0.113.5')).status];
    expect(a[0]).not.toBe(429);
    expect(a[1]).not.toBe(429);
    expect(a[2]).toBe(429); // client A exhausted ITS budget
    expect((await refresh(app, '203.0.113.6')).status).not.toBe(429); // client B is untouched
    expect((await refresh(app, '203.0.113.6')).status).not.toBe(429);
    expect((await refresh(app, '203.0.113.6')).status).toBe(429);
    expect(sawValidationError(spy, 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR')).toBe(false);
    expect(sawValidationError(spy, 'ERR_ERL_PERMISSIVE_TRUST_PROXY')).toBe(false);
  });

  it('classifies peers correctly: only loopback addresses are trusted proxies', async () => {
    const app = await loadApp('loopback');
    const trusted = app.get('trust proxy fn') as (addr: string, i: number) => boolean;
    for (const addr of ['127.0.0.1', '127.5.5.5', '::1', '::ffff:127.0.0.1']) expect(trusted(addr, 0), addr).toBe(true);
    for (const addr of ['203.0.113.9', '192.168.1.20', '10.0.0.5', '172.16.4.4', '2001:db8::1']) expect(trusted(addr, 0), addr).toBe(false);
  });

  it('a forwarded header from an UNTRUSTED peer is ignored (spoofing): rotating X-Forwarded-For values cannot escape the limit', async () => {
    // supertest always connects from loopback, so "an untrusted peer" is expressed by trusting a range that excludes loopback.
    const app = await loadApp('uniquelocal');
    const statuses: number[] = [];
    for (const spoof of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) statuses.push((await refresh(app, spoof)).status);
    expect(statuses[0]).not.toBe(429);
    expect(statuses[1]).not.toBe(429);
    expect(statuses[2]).toBe(429); // all three share the real peer's bucket
  });

  it.skipIf(!lanIp)('a REAL non-loopback peer (this machine\'s LAN address) cannot spoof its client IP with X-Forwarded-For', async () => {
    const app = await loadApp('loopback');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, lanIp, () => resolve()));
    const port = (server.address() as { port: number }).port;
    const post = (spoof: string) =>
      new Promise<number>((resolve, reject) => {
        const req = http.request({ host: lanIp, port, path: '/api/v1/auth/refresh', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': 2, 'x-forwarded-for': spoof } }, (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        });
        req.on('error', reject);
        req.end('{}');
      });
    try {
      const statuses = [await post('198.51.100.11'), await post('198.51.100.12'), await post('198.51.100.13')];
      expect(statuses[0]).not.toBe(429);
      expect(statuses[1]).not.toBe(429);
      expect(statuses[2]).toBe(429); // the peer's own address was used, not the forged header
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('keeps webhook signature verification: a forwarded header changes nothing about authentication', async () => {
    const app = await loadApp('loopback');
    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set({ 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', 'x-razorpay-signature': '0'.repeat(64) })
      .send('{}');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'INVALID_SIGNATURE' });
  });
});

describe('TRUST_PROXY unset (existing behaviour, unchanged)', () => {
  it('trust proxy stays false, the request is still served, the library logs its validation error, and forwarded clients share ONE bucket', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = await loadApp(undefined);
    expect(app.get('trust proxy')).toBe(false);
    const statuses: number[] = [];
    for (const ip of ['203.0.113.21', '203.0.113.22', '203.0.113.23']) statuses.push((await refresh(app, ip)).status);
    expect(statuses.every((s) => s < 500)).toBe(true); // validation is a log line, never a failure
    expect(statuses[0]).not.toBe(429);
    expect(statuses[1]).not.toBe(429);
    expect(statuses[2]).toBe(429); // different forwarded IPs cannot be told apart without trusting the proxy
    expect(sawValidationError(spy, 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR')).toBe(true);
  });
});

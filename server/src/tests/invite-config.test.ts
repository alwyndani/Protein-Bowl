import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * INVITE_DELIVERY configuration policy:
 *  - development/test: optional, defaults to "manual"
 *  - production: MUST be set explicitly, and only supported values are accepted (currently only "manual")
 * Each case imports config/env.ts fresh with a controlled process.env and restores everything afterwards.
 */
const KEYS = ['NODE_ENV', 'INVITE_DELIVERY', 'CORS_ALLOWED_ORIGINS', 'EMAIL_PROVIDER', 'EMAIL_FROM', 'RESEND_API_KEY', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'WEB_BASE_URL'] as const;

describe('INVITE_DELIVERY configuration', () => {
  const saved: Record<string, string | undefined> = {};
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000'; // a valid production CORS config, so only INVITE_DELIVERY varies
    process.env.EMAIL_PROVIDER = 'none'; // a valid explicit production email setting
    process.env.JWT_ACCESS_SECRET = 'k9Qm2vXz7LpR4tYw8NbC5dFh3JsGa6Ue'; // production-grade, non-placeholder secrets (the shared test secrets are refused in production)
    process.env.JWT_REFRESH_SECRET = 'Zt4Hn8Vb1KxQ6mWe3RyP9cLd5SgJa2Uf';
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    errorSpy.mockRestore();
    vi.resetModules();
  });

  const load = async (nodeEnv: string, invite?: string) => {
    process.env.NODE_ENV = nodeEnv;
    if (invite === undefined) delete process.env.INVITE_DELIVERY;
    else process.env.INVITE_DELIVERY = invite;
    return (await import('../config/env.js')).env;
  };

  it('1. production + missing INVITE_DELIVERY fails configuration validation (no silent manual fallback)', async () => {
    await expect(load('production')).rejects.toThrow(/INVITE_DELIVERY must be set explicitly in production/);
  });

  it('2. production + INVITE_DELIVERY=manual is valid', async () => {
    const env = await load('production', 'manual');
    expect(env.inviteDelivery).toBe('manual');
    expect(env.NODE_ENV).toBe('production');
  });

  it('3. development and test default to manual when INVITE_DELIVERY is not set', async () => {
    expect((await load('development')).inviteDelivery).toBe('manual');
    vi.resetModules();
    expect((await load('test')).inviteDelivery).toBe('manual');
  });

  it('4. unsupported values are rejected in every environment (including empty)', async () => {
    for (const nodeEnv of ['development', 'test', 'production']) {
      for (const value of ['smtp', 'sms', 'MANUAL', 'none', '']) {
        vi.resetModules();
        await expect(load(nodeEnv, value), `${nodeEnv}/${JSON.stringify(value)}`).rejects.toThrow(/Invalid environment variables/);
      }
    }
  });

  it('production requires distinct JWT secrets of at least 32 characters; development keeps the shorter minimum', async () => {
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(20);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);
    await expect(load('production', 'manual')).rejects.toThrow(/at least 32 characters/);
    vi.resetModules();
    process.env.JWT_ACCESS_SECRET = 'c'.repeat(40);
    process.env.JWT_REFRESH_SECRET = 'c'.repeat(40);
    await expect(load('production', 'manual')).rejects.toThrow(/must be different/);
    vi.resetModules();
    process.env.JWT_REFRESH_SECRET = 'd'.repeat(40);
    expect((await load('production', 'manual')).NODE_ENV).toBe('production');
    vi.resetModules();
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(20);
    expect((await load('development')).NODE_ENV).toBe('development');
  });

  it('fail-closed choke point: a NODE_ENV that is not exactly development / test / production ("Production", " production ", "prod") stops the server from starting at all', async () => {
    for (const spelled of ['Production', 'PRODUCTION', ' production ', 'prod', 'staging']) {
      vi.resetModules();
      await expect(load(spelled, 'manual'), JSON.stringify(spelled)).rejects.toThrow(/Invalid environment variables/);
    }
  });

  it('production refuses development, test, end-to-end and placeholder JWT secrets (they are public in the repository); development accepts them', async () => {
    const strong = 'Zt4Hn8Vb1KxQ6mWe3RyP9cLd5SgJa2Uf';
    for (const bad of ['e2e-isolated-access-secret-valid-only-for-this-local-run', 'test_access_secret_key_1234567890_super_secret', 'h1-test-access-secret-0123456789', 'please-changeme-before-production-0000', 'your-secret-goes-here-replace-me-now']) {
      for (const slot of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        vi.resetModules();
        process.env.JWT_ACCESS_SECRET = strong;
        process.env.JWT_REFRESH_SECRET = 'Qp7Ld3Wx9Rk2Vn5Ty8Hc4Bm6Fa1Js0Ge';
        process.env[slot] = bad;
        await expect(load('production', 'manual'), `${slot} ${bad.slice(0, 8)}`).rejects.toThrow(/must not be development, test or placeholder/);
      }
    }
    // the same values are fine outside production (that is what the isolated E2E API and the test suite use)
    vi.resetModules();
    process.env.JWT_ACCESS_SECRET = 'e2e-isolated-access-secret-valid-only-for-this-local-run';
    process.env.JWT_REFRESH_SECRET = 'e2e-isolated-refresh-secret-valid-only-for-this-local-run';
    expect((await load('development')).NODE_ENV).toBe('development');
  });

  it('email configuration: production must choose a provider explicitly; "log" is refused; email invitations need a sender', async () => {
    delete process.env.EMAIL_PROVIDER;
    await expect(load('production', 'manual')).rejects.toThrow(/EMAIL_PROVIDER must be set explicitly in production/);
    vi.resetModules();
    process.env.EMAIL_PROVIDER = 'log';
    await expect(load('production', 'manual')).rejects.toThrow(/development-only/);
    vi.resetModules();
    process.env.EMAIL_PROVIDER = 'resend';
    await expect(load('production', 'email')).rejects.toThrow(/RESEND_API_KEY and EMAIL_FROM/);
    vi.resetModules();
    process.env.EMAIL_PROVIDER = 'none';
    await expect(load('production', 'email')).rejects.toThrow(/INVITE_DELIVERY=email requires/);
    vi.resetModules();
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_key_not_real';
    process.env.EMAIL_FROM = 'Protein Bowl <no-reply@example.test>';
    await expect(load('production', 'email')).rejects.toThrow(/WEB_BASE_URL must be set explicitly in production/); // emailed links need an explicit public address
    vi.resetModules();
    process.env.WEB_BASE_URL = 'https://app.example.com';
    const env = await load('production', 'email');
    expect(env.inviteDelivery).toBe('email');
    expect(env.emailProvider).toBe('resend');
  });

  it('email delivery reports sentByEmail only when the provider accepted the message', async () => {
    process.env.EMAIL_PROVIDER = 'log';
    await load('development', 'email');
    const { getInvitationDelivery } = await import('../modules/admin/invitationDelivery.js');
    const { LogMailer } = await import('../modules/email/mailer.js');
    const input = { rawToken: 'b'.repeat(64), expiresAt: new Date(Date.now() + 3600_000), staff: { id: 'u1', email: 'staff@example.com', fullName: 'Staff Person' } };
    const ok = await getInvitationDelivery().deliver(input);
    expect(ok.deliveryMode).toBe('email');
    expect(ok.sentByEmail).toBe(true);
    expect(LogMailer.outbox.at(-1)?.to).toBe('staff@example.com');
    expect(LogMailer.outbox.at(-1)?.text).toContain('#token=' + 'b'.repeat(64));

    const { ResendMailer } = await import('../modules/email/mailer.js');
    await expect(new ResendMailer('k'.repeat(12), 'a@b.test', (async () => new Response('x', { status: 500 })) as typeof fetch).send({ to: 'a@b.test', subject: 's', text: 't' })).rejects.toThrow(/HTTP 500/);
  });

  it('production manual delivery never claims an email was sent', async () => {
    await load('production', 'manual');
    const { getInvitationDelivery } = await import('../modules/admin/invitationDelivery.js');
    const delivery = getInvitationDelivery();
    expect(delivery.mode).toBe('manual');

    const handoff = await delivery.deliver({
      rawToken: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 3600_000),
      staff: { id: 'u1', email: 'staff@example.com', fullName: 'Staff Person' }
    });
    expect(handoff.deliveryMode).toBe('manual');
    expect(handoff.sentByEmail).toBe(false);
    expect(handoff.note).toMatch(/No email was sent/);
    expect(JSON.stringify(handoff)).not.toMatch(/email (was )?sent to|emailed to/i);
  });
});

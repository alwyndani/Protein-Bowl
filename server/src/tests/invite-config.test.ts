import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * INVITE_DELIVERY configuration policy:
 *  - development/test: optional, defaults to "manual"
 *  - production: MUST be set explicitly, and only supported values are accepted (currently only "manual")
 * Each case imports config/env.ts fresh with a controlled process.env and restores everything afterwards.
 */
const KEYS = ['NODE_ENV', 'INVITE_DELIVERY', 'CORS_ALLOWED_ORIGINS'] as const;

describe('INVITE_DELIVERY configuration', () => {
  const saved: Record<string, string | undefined> = {};
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000'; // a valid production CORS config, so only INVITE_DELIVERY varies
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
      for (const value of ['email', 'smtp', 'sms', 'MANUAL', 'none', '']) {
        vi.resetModules();
        await expect(load(nodeEnv, value), `${nodeEnv}/${JSON.stringify(value)}`).rejects.toThrow(/Invalid environment variables/);
      }
    }
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

import { describe, expect, it, vi } from 'vitest';
import { EmailNotConfiguredError, LogMailer, ResendMailer } from '../modules/email/mailer.js';

/** Resend integration against a fake fetch: no network, no real key. */
describe('ResendMailer (fake transport)', () => {
  const KEY = 're_test_key_do_not_leak_123';
  const mail = { to: 'person@example.test', subject: 'Hello', text: 'secret link #token=abc' };

  it('posts one JSON request to the Resend API with a bearer key and exactly the message fields', async () => {
    const fetchFake = vi.fn(async () => new Response('{"id":"x"}', { status: 200 }));
    await new ResendMailer(KEY, 'Protein Bowl <no-reply@example.test>', fetchFake as unknown as typeof fetch).send(mail);
    expect(fetchFake).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(init.body))).toEqual({ from: 'Protein Bowl <no-reply@example.test>', to: ['person@example.test'], subject: 'Hello', text: 'secret link #token=abc' });
    expect(init.signal).toBeDefined(); // bounded by a timeout
  });

  it('provider rejection and network failure both throw, without leaking the key or the message body', async () => {
    for (const fake of [async () => new Response('{"message":"bad key"}', { status: 401 }), async () => { throw new Error('socket hang up'); }]) {
      const err = await new ResendMailer(KEY, 'a@b.test', fake as unknown as typeof fetch).send(mail).then(() => null, (e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect(String(err!.message)).not.toContain(KEY);
      expect(String(err!.message)).not.toContain('secret link');
    }
  });
});

describe('LogMailer and the unconfigured mailer', () => {
  it('the development mailer keeps mail in memory only', async () => {
    const m = new LogMailer();
    await m.send({ to: 'a@b.test', subject: 's', text: 't' });
    expect(LogMailer.outbox.at(-1)).toEqual({ to: 'a@b.test', subject: 's', text: 't' });
  });

  it('EmailNotConfiguredError is a distinct, catchable type', () => {
    expect(new EmailNotConfiguredError()).toBeInstanceOf(Error);
    expect(new EmailNotConfiguredError().name).toBe('EmailNotConfiguredError');
  });
});

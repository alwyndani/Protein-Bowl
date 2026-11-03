import { env } from '../../config/env.js';

export interface Mail {
  to: string;
  subject: string;
  /** Plain text. May contain a one-time secret link: NEVER log or audit this. */
  text: string;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('Email is not configured');
    this.name = 'EmailNotConfiguredError';
  }
}

export interface Mailer {
  readonly provider: 'none' | 'log' | 'resend';
  send(mail: Mail): Promise<void>;
}

class NoneMailer implements Mailer {
  public readonly provider = 'none' as const;
  public async send(): Promise<void> {
    throw new EmailNotConfiguredError();
  }
}

/** Development/test only: keeps mails in process memory (inspectable by tests); nothing is sent or logged. */
export class LogMailer implements Mailer {
  public readonly provider = 'log' as const;
  public static readonly outbox: Mail[] = [];
  public async send(mail: Mail): Promise<void> {
    LogMailer.outbox.push({ ...mail });
    if (LogMailer.outbox.length > 200) LogMailer.outbox.shift();
  }
}

/** Resend HTTPS API (no SDK dependency). A non-2xx answer or a network failure throws; the body is never included in errors. */
export class ResendMailer implements Mailer {
  public readonly provider = 'resend' as const;
  constructor(private readonly apiKey: string, private readonly from: string, private readonly fetchImpl: typeof fetch = fetch) {}

  public async send(mail: Mail): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) throw new Error(`Email provider rejected the message (HTTP ${res.status})`);
  }
}

let cached: Mailer | null = null;

export function getMailer(): Mailer {
  if (cached) return cached;
  switch (env.emailProvider) {
    case 'resend':
      cached = new ResendMailer(env.RESEND_API_KEY!, env.EMAIL_FROM!);
      break;
    case 'log':
      cached = new LogMailer();
      break;
    default:
      cached = new NoneMailer();
  }
  return cached;
}

/** Public web origin for links inside emails. */
export function webBaseUrl(): string {
  return (env.WEB_BASE_URL ?? env.STAFF_INVITE_BASE_URL ?? env.allowedOrigins[0] ?? env.CLIENT_URL).replace(/\/+$/, '');
}

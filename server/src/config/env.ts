import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),
  CLIENT_URL: z.string().default('http://localhost:3000'),

  // CORS / origin validation: comma-separated list of exact browser origins.
  // Development/test fall back to CLIENT_URL. Production REQUIRES an explicit list.
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  // Express "trust proxy" (e.g. "1" behind one reverse proxy) so rate limits key on the real client IP.
  TRUST_PROXY: z.string().optional(),

  // Request body size limit for JSON / urlencoded bodies (binary uploads need dedicated handling later).
  JSON_BODY_LIMIT: z.string().default('256kb'),

  // Rate limits (requests per window per IP). Defaults are the approved production values.
  RL_LOGIN_MAX: positiveInt(20),
  RL_LOGIN_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_REGISTER_MAX: positiveInt(10),
  RL_REGISTER_WINDOW_MS: positiveInt(60 * 60 * 1000),
  RL_REFRESH_MAX: positiveInt(60),
  RL_REFRESH_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_GENERAL_MAX: positiveInt(600),
  RL_GENERAL_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_ACCEPT_INVITE_MAX: positiveInt(10),
  RL_ACCEPT_INVITE_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_STEPUP_MAX: positiveInt(10),
  RL_STEPUP_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_PAYMENT_ATTEMPT_MAX: positiveInt(20),
  RL_PAYMENT_ATTEMPT_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_PAYMENT_VERIFY_MAX: positiveInt(30),
  RL_PAYMENT_VERIFY_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_CANCEL_MAX: positiveInt(10),
  RL_CANCEL_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_REFUND_ADMIN_MAX: positiveInt(20),
  RL_REFUND_ADMIN_WINDOW_MS: positiveInt(15 * 60 * 1000),
  // P8 kitchen: chef actions and SUPER_ADMIN kitchen routing (per user). Optional; defaults are safe.
  RL_KITCHEN_ACTION_MAX: positiveInt(120),
  RL_KITCHEN_ACTION_WINDOW_MS: positiveInt(60 * 1000),
  RL_KITCHEN_ROUTING_MAX: positiveInt(30),
  RL_KITCHEN_ROUTING_WINDOW_MS: positiveInt(15 * 60 * 1000),
  // P9A delivery: driver reads (polling), driver actions (claim / dispatch / report-failure) and SUPER_ADMIN assignment (per user). Optional; defaults are safe.
  RL_DELIVERY_READ_MAX: positiveInt(240),
  RL_DELIVERY_READ_WINDOW_MS: positiveInt(60 * 1000),
  RL_DELIVERY_ACTION_MAX: positiveInt(60),
  RL_DELIVERY_ACTION_WINDOW_MS: positiveInt(60 * 1000),
  // P9B Delivery Code: customer state reads, customer issue/regenerate (per user AND order, secondary to the persisted limits), driver verify, SUPER_ADMIN override. Optional; defaults are safe.
  RL_DELIVERY_CODE_READ_MAX: positiveInt(60),
  RL_DELIVERY_CODE_READ_WINDOW_MS: positiveInt(60 * 1000),
  RL_DELIVERY_CODE_ISSUE_MAX: positiveInt(5),
  RL_DELIVERY_CODE_ISSUE_WINDOW_MS: positiveInt(60 * 60 * 1000),
  RL_DELIVERY_CODE_REGEN_MAX: positiveInt(3),
  RL_DELIVERY_CODE_REGEN_WINDOW_MS: positiveInt(60 * 60 * 1000),
  RL_DELIVERY_VERIFY_MAX: positiveInt(20),
  RL_DELIVERY_VERIFY_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_DELIVERY_OVERRIDE_MAX: positiveInt(5),
  RL_DELIVERY_OVERRIDE_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_DELIVERY_RESOLVE_MAX: positiveInt(20),
  RL_DELIVERY_RESOLVE_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_MESS_READ_MAX: positiveInt(120),
  RL_MESS_READ_WINDOW_MS: positiveInt(60 * 1000),
  RL_MESS_WRITE_MAX: positiveInt(30),
  RL_MESS_WRITE_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_MESS_PURCHASE_MAX: positiveInt(10),
  RL_MESS_PURCHASE_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_MESS_KITCHEN_MAX: positiveInt(120),
  RL_MESS_KITCHEN_WINDOW_MS: positiveInt(60 * 1000),
  RL_MESS_PAUSE_MAX: positiveInt(60),
  RL_MESS_PAUSE_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_MESS_DELIVERY_READ_MAX: positiveInt(240),
  RL_MESS_DELIVERY_READ_WINDOW_MS: positiveInt(60 * 1000),
  RL_MESS_DELIVERY_ACTION_MAX: positiveInt(60),
  RL_MESS_DELIVERY_ACTION_WINDOW_MS: positiveInt(60 * 1000),
  RL_MESS_DELIVERY_VERIFY_MAX: positiveInt(20),
  RL_MESS_DELIVERY_VERIFY_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_MESS_HANDOVER_MAX: positiveInt(30),
  RL_MESS_HANDOVER_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_MESS_DELIVERY_OVERRIDE_MAX: positiveInt(5),
  RL_MESS_DELIVERY_OVERRIDE_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_MESS_ADMIN_MAX: positiveInt(60),
  RL_MESS_ADMIN_WINDOW_MS: positiveInt(15 * 60 * 1000),
  RL_WEBHOOK_MAX: positiveInt(3000),
  RL_WEBHOOK_WINDOW_MS: positiveInt(15 * 60 * 1000),
  // Honoured only outside production.
  RL_DISABLED: z.enum(['true', 'false']).default('false'),

  // Staff onboarding. Until an email provider exists the ONLY supported mode is "manual": the one-time setup link is
  // returned once to the authorizing SUPER_ADMIN, who hands it over out of band. Nothing is emailed.
  // REQUIRED in production (startup fails without it); development/test default to "manual". Unsupported values fail validation.
  INVITE_DELIVERY: z.enum(['manual', 'email']).optional(),
  // Transactional email. "none" = no email is ever sent (password reset is then unavailable, 503); "log" = development only (nothing leaves the process);
  // "resend" = Resend HTTPS API (needs RESEND_API_KEY + EMAIL_FROM). REQUIRED explicitly in production; "log" is refused there.
  EMAIL_PROVIDER: z.enum(['none', 'log', 'resend']).optional(),
  EMAIL_FROM: z.string().trim().min(3).max(200).optional(),
  RESEND_API_KEY: z.string().trim().min(10).optional(),
  // Public web origin used in emailed links (defaults to STAFF_INVITE_BASE_URL, then the first allowed CORS origin).
  WEB_BASE_URL: z.string().url().optional(),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(10).max(24 * 60).default(60),
  // Unpaid online orders (PENDING, no payment evidence at all) are cancelled by the expiry job after this many minutes of inactivity
  // (counted from the later of order creation and the last payment-session activity). 0 disables expiry. Business default proposal: 15.
  UNPAID_ORDER_EXPIRY_MINUTES: z.coerce.number().int().min(0).max(24 * 60).default(15),
  // Minimum seconds between reset emails for one account (stops inbox flooding; the response is identical either way).
  PASSWORD_RESET_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
  // Invitation lifetime in hours (default 72h = 3 days; max 14 days).
  INVITE_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 14).default(72),
  // Public web origin used to build the setup link (defaults to the first allowed CORS origin).
  STAFF_INVITE_BASE_URL: z.string().url().optional(),
  // Lifetime of the password step-up proof in seconds (default 5 min; max 15 min).
  STEP_UP_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
  // P11A: minimum supported customer mobile app version (strict MAJOR.MINOR.PATCH). Unset = no minimum enforced. Configuration, never a hard-coded value.
  MOBILE_MIN_APP_VERSION: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/, 'MOBILE_MIN_APP_VERSION must be MAJOR.MINOR.PATCH').optional()
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('Invalid environment variables:', _env.error.format());
  throw new Error('Invalid environment variables');
}

/**
 * Parse a comma-separated origin list into normalized exact origins ("scheme://host[:port]").
 * Wildcards and malformed entries are rejected.
 */
export function parseAllowedOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      if (entry === '*') {
        throw new Error('CORS_ALLOWED_ORIGINS must list explicit origins; wildcard "*" is not allowed');
      }
      let origin: string;
      try {
        origin = new URL(entry).origin;
      } catch {
        throw new Error(`Invalid origin in CORS_ALLOWED_ORIGINS: "${entry}"`);
      }
      if (origin === 'null') {
        throw new Error(`Invalid origin in CORS_ALLOWED_ORIGINS: "${entry}"`);
      }
      return origin;
    });
}

function resolveAllowedOrigins(data: z.infer<typeof envSchema>): string[] {
  const explicit = data.CORS_ALLOWED_ORIGINS?.trim();
  if (explicit) {
    return parseAllowedOrigins(explicit);
  }
  if (data.NODE_ENV === 'production') {
    throw new Error('CORS_ALLOWED_ORIGINS must be set explicitly in production (deployment configuration required)');
  }
  return parseAllowedOrigins(data.CLIENT_URL);
}

/** Production signing secrets must be strong and different from each other (development/test keep the 16-character minimum of the schema). */
function assertProductionSecrets(data: z.infer<typeof envSchema>): void {
  if (data.NODE_ENV !== 'production') return;
  if (data.JWT_ACCESS_SECRET.length < 32 || data.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('In production JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must each be at least 32 characters');
  }
  if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
    throw new Error('In production JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values');
  }
  // Development / test / end-to-end secrets are public (they sit in the repository): a production deployment must never run on one of them.
  if (DEV_SECRET_MARKERS.test(data.JWT_ACCESS_SECRET) || DEV_SECRET_MARKERS.test(data.JWT_REFRESH_SECRET)) {
    throw new Error('In production the JWT secrets must not be development, test or placeholder values (generate fresh random secrets)');
  }
}

const DEV_SECRET_MARKERS = /e2e-isolated|valid-only-for-this-local-run|h1-test-|test[_-](access|refresh)[_-]secret|dev(elopment)?[_-](access|refresh)|changeme|change[_-]me|your[_-]|placeholder|replace[_-]me|super_secret|0123456789|1234567890/i;

function resolveEmailProvider(data: z.infer<typeof envSchema>): 'none' | 'log' | 'resend' {
  const production = data.NODE_ENV === 'production';
  if (production && !data.EMAIL_PROVIDER) {
    throw new Error("EMAIL_PROVIDER must be set explicitly in production ('resend', or 'none' to disable password-reset email)");
  }
  const provider = data.EMAIL_PROVIDER ?? 'log';
  if (production && provider === 'log') throw new Error("EMAIL_PROVIDER 'log' is development-only and is refused in production");
  if (provider === 'resend' && (!data.RESEND_API_KEY || !data.EMAIL_FROM)) {
    throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM');
  }
  return provider;
}

function resolveInviteDelivery(data: z.infer<typeof envSchema>): 'manual' | 'email' {
  // Production must be explicit: delivery of staff invitations is a conscious deployment decision, never a silent default.
  // Development/test default to "manual". 'email' needs a real sending provider (not 'none').
  if (!data.INVITE_DELIVERY && data.NODE_ENV === 'production') {
    throw new Error("INVITE_DELIVERY must be set explicitly in production ('manual': the one-time link is returned once to the SUPER_ADMIN; 'email': it is also emailed)");
  }
  const mode = data.INVITE_DELIVERY ?? 'manual';
  if (mode === 'email' && (data.EMAIL_PROVIDER ?? 'log') === 'none') throw new Error("INVITE_DELIVERY=email requires EMAIL_PROVIDER other than 'none'");
  return mode;
}

assertProductionSecrets(_env.data);

export const env = {
  ..._env.data,
  inviteDelivery: resolveInviteDelivery(_env.data),
  emailProvider: resolveEmailProvider(_env.data),
  allowedOrigins: resolveAllowedOrigins(_env.data),
  rateLimitDisabled: _env.data.NODE_ENV !== 'production' && _env.data.RL_DISABLED === 'true'
};

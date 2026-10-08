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
  // Honoured only outside production.
  RL_DISABLED: z.enum(['true', 'false']).default('false'),

  // Staff onboarding. Until an email provider exists the ONLY supported mode is "manual": the one-time setup link is
  // returned once to the authorizing SUPER_ADMIN, who hands it over out of band. Nothing is emailed.
  // REQUIRED in production (startup fails without it); development/test default to "manual". Unsupported values fail validation.
  INVITE_DELIVERY: z.enum(['manual']).optional(),
  // Invitation lifetime in hours (default 72h = 3 days; max 14 days).
  INVITE_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 14).default(72),
  // Public web origin used to build the setup link (defaults to the first allowed CORS origin).
  STAFF_INVITE_BASE_URL: z.string().url().optional(),
  // Lifetime of the password step-up proof in seconds (default 5 min; max 15 min).
  STEP_UP_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(300)
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

function resolveInviteDelivery(data: z.infer<typeof envSchema>): 'manual' {
  // Production must be explicit: delivery of staff invitations is a conscious deployment decision, never a silent default.
  // Development/test default to "manual". (Unsupported values are rejected by the schema above.)
  if (!data.INVITE_DELIVERY && data.NODE_ENV === 'production') {
    throw new Error("INVITE_DELIVERY must be set explicitly in production (supported: 'manual' - no email is sent; the one-time setup link is returned once to the SUPER_ADMIN)");
  }
  return data.INVITE_DELIVERY ?? 'manual';
}

export const env = {
  ..._env.data,
  inviteDelivery: resolveInviteDelivery(_env.data),
  allowedOrigins: resolveAllowedOrigins(_env.data),
  rateLimitDisabled: _env.data.NODE_ENV !== 'production' && _env.data.RL_DISABLED === 'true'
};

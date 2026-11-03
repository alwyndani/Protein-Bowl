/**
 * Seed safety guard.
 *
 * Demo users/operational demo data use a predictable development password and must NEVER be
 * created in production. In production only the non-credential catalog imports (recipes, products) run.
 *
 * The guard does not rely on NODE_ENV alone (it is often simply unset when a script is run by hand): demo users are created only when
 *   - NODE_ENV is not "production", AND
 *   - the target database is on this machine (localhost / 127.0.0.1 / ::1) or the operator set ALLOW_DEMO_SEED=true on purpose, AND
 *   - the password is not a weak override (SEED_DEFAULT_PASSWORD, when set, must be at least 12 characters, the same floor as staff passwords).
 * Anything else imports the catalog only. The reason text never contains the password or the connection string.
 */
export const DEV_SEED_DEFAULT_PASSWORD = 'Password123!';

export interface SeedPlan {
  seedDemoData: boolean;
  demoPassword: string | null;
  reason: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Host of a connection string, or null if it cannot be parsed. Never returns or logs credentials. */
export function databaseHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const catalogOnly = (reason: string): SeedPlan => ({ seedDemoData: false, demoPassword: null, reason });

/** True for "production" however it is spelled ("Production", " PRODUCTION "): the check must not be bypassable by a casing or whitespace slip. */
export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

export function resolveSeedPlan(env: NodeJS.ProcessEnv = process.env): SeedPlan {
  if (isProductionEnv(env)) {
    return catalogOnly('NODE_ENV=production: demo users/demo data are never seeded (catalog imports only)');
  }
  const host = databaseHost(env.DATABASE_URL);
  const local = host !== null && LOCAL_HOSTS.has(host);
  if (!local && env.ALLOW_DEMO_SEED !== 'true') {
    return catalogOnly('the target database is not on this machine (or DATABASE_URL is missing/unreadable): demo users are not seeded; set ALLOW_DEMO_SEED=true only for a disposable remote test database');
  }
  const override = env.SEED_DEFAULT_PASSWORD?.trim();
  if (override && override.length < 12) {
    return catalogOnly('SEED_DEFAULT_PASSWORD is shorter than 12 characters: demo users are not seeded');
  }
  return {
    seedDemoData: true,
    demoPassword: override || DEV_SEED_DEFAULT_PASSWORD,
    reason: 'development/test seed on a local database'
  };
}

/**
 * Seed safety guard.
 *
 * Demo users/operational demo data use a predictable development password and must NEVER be
 * created in production. In production only the non-credential catalog imports (recipes, products) run.
 */
export const DEV_SEED_DEFAULT_PASSWORD = 'Password123!';

export interface SeedPlan {
  seedDemoData: boolean;
  demoPassword: string | null;
  reason: string;
}

export function resolveSeedPlan(env: NodeJS.ProcessEnv = process.env): SeedPlan {
  if (env.NODE_ENV === 'production') {
    return {
      seedDemoData: false,
      demoPassword: null,
      reason: 'NODE_ENV=production: demo users/demo data are never seeded (catalog imports only)'
    };
  }
  return {
    seedDemoData: true,
    demoPassword: env.SEED_DEFAULT_PASSWORD?.trim() || DEV_SEED_DEFAULT_PASSWORD,
    reason: 'development/test seed'
  };
}

/** TanStack Query keys for workouts (in-memory only; the cache is cleared on sign-out). */
export const wk = {
  plans: ['workouts', 'plans'] as const,
  logs: (planId: string) => ['workouts', 'logs', planId] as const
};

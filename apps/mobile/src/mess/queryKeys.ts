/** TanStack Query keys for Kerala Mess. In-memory only (the query cache is never persisted and is cleared on sign-out). */
export const mk = {
  all: ['mess'] as const,
  servicePoints: ['mess', 'service-points'] as const,
  plans: (servicePointId: string | null) => ['mess', 'plans', servicePointId ?? 'all'] as const,
  account: ['mess', 'account'] as const,
  subscriptions: ['mess', 'subscriptions'] as const,
  subscription: (id: string) => ['mess', 'subscription', id] as const,
  calendar: (id: string) => ['mess', 'calendar', id] as const,
  /** The handover STATE (never the code). */
  handover: (subscriptionId: string, mealId: string) => ['mess', 'handover', subscriptionId, mealId] as const
};

export const MESS_STATIC_STALE_MS = 60_000;

export type PlanDurationDays = 3 | 7 | 20 | 30;

export const PLAN_DURATIONS: readonly PlanDurationDays[] = [3, 7, 20, 30];

/** Accepts a stored/typed number and returns a supported plan length; anything else falls back to the default (30). */
export function toPlanDuration(value: unknown, fallback: PlanDurationDays = 30): PlanDurationDays {
  return PLAN_DURATIONS.includes(value as PlanDurationDays) ? (value as PlanDurationDays) : fallback;
}

import type { CustomerProfile } from '../types';
import { BLANK_CUSTOMER_PROFILE } from '../data/blankProfile';

/**
 * Health profile plumbing. The forms use 0 / '' to mean "the customer did not enter this"; nothing is ever invented in its place.
 * Required measurements (height, weight) are never pruned: the server validates them.
 */

const OPTIONAL_NUMBERS = new Set([
  'targetWeightKg', 'muscleMassKg', 'sleepDuration', 'workoutDuration', 'dailyStepCount', 'cardioSessions', 'strengthSessions',
  'mealsPerDay', 'waterIntakeL', 'stressLevel', 'planDurationDays', 'planFrequency'
]);
const NESTED = ['circumferences', 'limbCircumferences', 'mealTimings', 'bloodTestResults'] as const;

const entered = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && (Number.isNaN(v) || v <= 0));

/** Remove everything the customer left empty so the server stores "not provided" instead of a zero or a blank. */
export function pruneUnentered(profile: Partial<CustomerProfile>): Partial<CustomerProfile> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profile)) {
    if ((NESTED as readonly string[]).includes(key)) {
      const kept = Object.fromEntries(Object.entries((value ?? {}) as Record<string, unknown>).filter(([, v]) => entered(v)));
      if (Object.keys(kept).length > 0) out[key] = kept;
    } else if (typeof value === 'string') {
      if (value.trim() !== '') out[key] = value;
    } else if (typeof value === 'number' && OPTIONAL_NUMBERS.has(key)) {
      if (entered(value)) out[key] = value;
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as Partial<CustomerProfile>;
}

/** Yes/No questions are TRI-STATE: unanswered (null) is never the same as "No". The select value for null is ''. */
export const triToSelect = (v: boolean | null | undefined): '' | 'yes' | 'no' => (v === null || v === undefined ? '' : v ? 'yes' : 'no');
export const selectToTri = (s: string): boolean | null => (s === 'yes' ? true : s === 'no' ? false : null);

/**
 * A health profile is "complete" when the customer has stored the measurements every saved profile requires (the server refuses a save
 * without height, weight, goal and activity level). A customer who is complete goes straight to the dashboard after sign-in; anyone else is
 * shown the health-capture step, prefilled with whatever is stored.
 */
export function isHealthProfileComplete(p: Partial<CustomerProfile> | null | undefined): boolean {
  return !!p && typeof p.heightCm === 'number' && p.heightCm > 0 && typeof p.weightKg === 'number' && p.weightKg > 0;
}

/** A server profile only carries what was stored; absent fields stay at the blank profile's neutral values. */
export function withBlankDefaults(stored: Partial<CustomerProfile>): CustomerProfile {
  return { ...BLANK_CUSTOMER_PROFILE, ...stored };
}

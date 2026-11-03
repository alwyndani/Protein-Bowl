import { calculateBiometrics } from '../../utils/biometricsCalculator.js';

/**
 * THE ONE place that turns saved health inputs into the figures a client may see (customer profile, and both Nutritionist reads).
 *
 * Rules:
 *  - Derived figures (BMI, BMR, TDEE, calories, macros, water, ideal weight, deficit) are ALWAYS recalculated from the CURRENT saved inputs.
 *    Values stored in `health_biometrics` are never returned: they cannot be verified against the inputs (older rows were computed with an
 *    assumed age and sex), so they stay in the database untouched and are simply not used.
 *  - Nothing is assumed: calories and macros are ABSENT (not 0, not a default) unless the date of birth and an explicitly calculable sex
 *    (male/female) are saved. Sex "other" is unavailable until a calculation policy is approved.
 *  - `calculation` says whether the calorie figures are available and what is missing.
 */

/** Columns of `health_biometrics` that are derived from other inputs; they are removed from anything sent to a client. */
export const DERIVED_KEYS = [
  'bmi', 'bmiCategory', 'bmr', 'tdee', 'maintenanceCalories', 'targetCalories', 'macroTargets',
  'waterRequirementL', 'idealBodyWeightKg', 'calorieDeficitSurplus'
] as const;

export interface BiometricInputs {
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: string | null;
  goal?: string | null;
  hasExercise?: boolean | null;
  dob?: Date | string | null;
  gender?: string | null;
}

export interface DerivedForClient {
  calculation?: { available: boolean; missing: string[] };
  bmi?: number;
  bmiCategory?: string;
  bmr?: number;
  tdee?: number;
  maintenanceCalories?: number;
  targetCalories?: number;
  macroTargets?: { proteinGrams: number; carbsGrams: number; fatGrams: number; fiberGrams: number };
  waterRequirementL?: number;
  idealBodyWeightKg?: number;
  calorieDeficitSurplus?: number;
}

/** Whole years from a saved date of birth, or undefined when none is saved (no default age). */
export function ageFromDob(dob: Date | string | null | undefined): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
  return age > 0 && age < 120 ? age : undefined;
}

/** Fresh derived figures from the saved inputs; an empty object when height, weight, activity level and goal are not all saved. */
export function deriveForClient(input: BiometricInputs): DerivedForClient {
  if (!input.heightCm || !input.weightKg || !input.activityLevel || !input.goal) return {};
  const calc = calculateBiometrics({
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    dob: input.dob,
    gender: input.gender,
    activityLevel: input.activityLevel,
    goal: input.goal,
    hasExercise: input.hasExercise
  });
  return {
    calculation: { available: calc.available, missing: calc.missing },
    bmi: calc.bmi,
    bmiCategory: calc.bmiCategory,
    bmr: calc.available ? calc.bmr : undefined,
    tdee: calc.available ? calc.tdee : undefined,
    maintenanceCalories: calc.available ? calc.maintenanceCalories : undefined,
    targetCalories: calc.available ? calc.targetCalories : undefined,
    macroTargets: calc.available ? calc.macroTargets : undefined,
    waterRequirementL: calc.waterRequirementL,
    idealBodyWeightKg: calc.idealBodyWeightKg,
    calorieDeficitSurplus: calc.available ? calc.calorieDeficitSurplus : undefined
  };
}

/** A stored `health_biometrics` row as a client may see it: stored derived columns dropped, fresh verified ones added. */
export function presentBiometrics<T extends Record<string, unknown>>(bio: T | null | undefined, profile: { dob?: Date | string | null; gender?: string | null }): Record<string, unknown> | null {
  if (!bio) return null;
  const rest: Record<string, unknown> = { ...bio };
  for (const key of DERIVED_KEYS) delete rest[key];
  return {
    ...rest,
    ...deriveForClient({
      heightCm: bio.heightCm as number | null | undefined,
      weightKg: bio.weightKg as number | null | undefined,
      activityLevel: bio.activityLevel as string | null | undefined,
      goal: bio.goal as string | null | undefined,
      hasExercise: bio.hasExercise as boolean | null | undefined,
      dob: profile.dob,
      gender: profile.gender
    })
  };
}

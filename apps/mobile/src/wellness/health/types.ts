/**
 * Health profile as served by GET /customers/me/profile (the server's formatted response). Every health field is OPTIONAL:
 * a value the customer never provided is absent and is shown as "Not provided" - never defaulted. Derived figures (BMI, calories,
 * macros ...) come only from the server and are shown verbatim.
 */
export type Gender = 'female' | 'male' | 'other';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
export type HealthGoal = 'weight_loss' | 'muscle_gain' | 'maintenance' | 'wellness' | 'diabetic' | 'other';

export interface HealthProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** YYYY-MM-DD, or '' when none is saved. */
  dob: string;
  age?: number;
  gender?: string;

  heightCm?: number;
  weightKg?: number;
  targetWeightKg?: number;
  goal?: string;
  primaryGoals?: string[];
  activityLevel?: string;
  /** true / false when answered; ABSENT when the customer has not answered. */
  hasExercise?: boolean;

  medicalConditions?: string[];
  currentMedications?: string;
  foodPreference?: string;
  allergies?: string[];
  foodDislikes?: string[];

  // ---- derived by the server from the saved inputs (shown verbatim; absent until calculable)
  calculation?: { available: boolean; missing: string[] };
  bmi?: number;
  bmiCategory?: string;
  targetCalories?: number;
  maintenanceCalories?: number;
  macroTargets?: { proteinGrams: number; carbsGrams: number; fatGrams: number; fiberGrams: number };
  waterRequirementL?: number;
  idealBodyWeightKg?: number;
}

/**
 * PUT /customers/me/profile body (the subset this app edits). `hasExercise` is OMITTED when unanswered: on the server an omitted
 * value means "unchanged", and the server does not accept null, so an unanswered question can never be sent as "No".
 */
export interface HealthProfileInput {
  fullName?: string;
  dob?: string;
  gender?: Gender;
  heightCm?: number;
  weightKg?: number;
  targetWeightKg?: number;
  goal?: HealthGoal;
  primaryGoals?: string[];
  activityLevel?: ActivityLevel;
  hasExercise?: boolean;
  medicalConditions?: string[];
  currentMedications?: string;
  foodPreference?: string;
  allergies?: string[];
  foodDislikes?: string[];
}

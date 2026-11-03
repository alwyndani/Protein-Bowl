import type { CustomerProfile } from '../types';

/**
 * The profile shown before (or without) a signed-in customer's real data. Deliberately EMPTY: no person, measurement, condition or goal is invented.
 * The enum fields the type requires carry neutral placeholders that are never presented as the customer's data (zeros / empty lists mean "not provided").
 */
export const BLANK_CUSTOMER_PROFILE: CustomerProfile = {
  id: '',
  name: '',
  email: '',
  phone: '',
  dob: '',
  age: 0,
  heightCm: 0,
  weightKg: 0,
  goal: 'maintenance',
  activityLevel: 'sedentary',
  medicalConditions: [],
  allergies: [],
  foodDislikes: [],
  bmi: 0,
  bmiCategory: 'Normal',
  bmr: 0,
  maintenanceCalories: 0,
  targetCalories: 0,
  macroTargets: { proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fiberGrams: 0 }
};

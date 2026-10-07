import { z } from 'zod';

export const bloodTestResultsSchema = z.object({
  fastingBloodSugar: z.number().optional(),
  hbA1c: z.number().optional(),
  totalCholesterol: z.number().optional(),
  hdl: z.number().optional(),
  ldl: z.number().optional(),
  triglycerides: z.number().optional(),
  hemoglobin: z.number().optional(),
  vitaminD: z.number().optional(),
  vitaminB12: z.number().optional(),
  ferritin: z.number().optional(),
  uricAcid: z.number().optional(),
  creatinine: z.number().optional(),
  tsh: z.number().optional(),
  sgot: z.number().optional(),
  sgpt: z.number().optional()
}).optional();

export const circumferencesSchema = z.object({
  waistCm: z.number().optional(),
  hipCm: z.number().optional(),
  chestCm: z.number().optional(),
  neckCm: z.number().optional()
}).optional();

export const limbCircumferencesSchema = z.object({
  leftArmCm: z.number().optional(),
  rightArmCm: z.number().optional(),
  leftThighCm: z.number().optional(),
  rightThighCm: z.number().optional(),
  leftCalfCm: z.number().optional(),
  rightCalfCm: z.number().optional()
}).optional();

export const updateCustomerProfileSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').optional(),
  dob: z.string().optional(), // YYYY-MM-DD
  gender: z.enum(['female', 'male', 'other']).optional(),
  deliveryAddress: z.string().optional(),

  // Physical biometrics
  heightCm: z.number().min(50).max(250, 'Height in cm must be realistic'),
  weightKg: z.number().min(20).max(300, 'Weight in kg must be realistic'),
  targetWeightKg: z.number().optional(),
  muscleMassKg: z.number().optional(),
  occupation: z.string().optional(),
  workSchedule: z.string().optional(),
  sleepDuration: z.number().optional(),
  wakeUpTime: z.string().optional(),
  bedTime: z.string().optional(),

  // Circumferences
  circumferences: circumferencesSchema,
  limbCircumferences: limbCircumferencesSchema,

  // Goals & Activity
  goal: z.string().min(1, 'Health goal is required'),
  primaryGoals: z.array(z.string()).optional(),
  activityLevel: z.string().min(1, 'Activity level is required'),

  // Exercise
  hasExercise: z.boolean().optional(),
  workoutTypes: z.array(z.string()).optional(),
  workoutFrequency: z.string().optional(),
  workoutDuration: z.number().optional(),
  dailyStepCount: z.number().optional(),
  cardioSessions: z.number().optional(),
  strengthSessions: z.number().optional(),

  // Medical
  medicalConditions: z.array(z.string()).optional(),
  currentMedications: z.string().optional(),
  supplements: z.array(z.string()).optional(),
  bloodTestResults: bloodTestResultsSchema,

  // Food
  foodPreference: z.string().optional(),
  allergies: z.array(z.string()).optional(),
  foodDislikes: z.array(z.string()).optional(),
  customQuery: z.string().optional(),

  // Meals & Lifestyle
  mealsPerDay: z.number().min(1).max(6).optional(),
  mealTimings: z.record(z.string()).optional(),
  waterIntakeL: z.number().optional(),
  digestiveHealth: z.array(z.string()).optional(),
  smoking: z.string().optional(),
  alcohol: z.string().optional(),
  tobacco: z.string().optional(),
  stressLevel: z.number().min(1).max(10).optional(),
  sleepQuality: z.string().optional(),

  // Women-Only
  isPregnant: z.boolean().optional(),
  isBreastfeeding: z.boolean().optional(),
  menstrualCycle: z.enum(['Regular', 'Irregular']).optional(),
  isMenopause: z.boolean().optional(),

  // Plan Selection
  planDurationDays: z.number().optional(),
  planFrequency: z.number().optional(),
  preferredSlot: z.string().optional(),
  addonSlots: z.array(z.string()).optional()
});

export type UpdateCustomerProfileDto = z.infer<typeof updateCustomerProfileSchema>;

export const createAddressSchema = z.object({
  title: z.string().default('Home'),
  addressLine1: z.string().min(3, 'Address line 1 is required'),
  addressLine2: z.string().optional().nullable(),
  city: z.string().min(2, 'City is required'),
  state: z.string().default('Kerala'),
  postalCode: z.string().min(4, 'Postal code is required'),
  isDefault: z.boolean().optional().default(false),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export const updateAddressSchema = createAddressSchema.partial();


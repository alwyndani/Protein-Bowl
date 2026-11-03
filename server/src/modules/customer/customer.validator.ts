import { z } from 'zod';
import { normalizePhone } from '../../utils/phone.js';

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
  // YYYY-MM-DD, a real calendar date, not in the future and not before 1900 (an invalid string used to reach the database layer).
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD').refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= '1900-01-01' && d.getTime() <= Date.now();
  }, 'Enter a real date of birth in the past').optional(),
  gender: z.enum(['female', 'male', 'other']).optional(),
  deliveryAddress: z.string().optional(),
  // Mobile number: never silently ignored. Omitted = unchanged; present = validated here, normalised and checked for duplicates in the service.
  phone: z.string().trim().max(32).refine((v) => normalizePhone(v) !== null, 'Enter a valid mobile number (8-15 digits, optional leading +)').optional(),

  // Physical biometrics
  // The four measurements below are required TOGETHER the first time a health profile is stored (enforced in the service); a request that
  // carries only the basics (name, date of birth, gender, address, phone) is accepted and stores no health profile at all.
  heightCm: z.number().min(50).max(250, 'Height in cm must be realistic').optional(),
  weightKg: z.number().min(20).max(300, 'Weight in kg must be realistic').optional(),
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
  goal: z.string().min(1, 'Health goal is required').optional(),
  primaryGoals: z.array(z.string()).optional(),
  activityLevel: z.string().min(1, 'Activity level is required').optional(),

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
  // The customer chooses the label and the state: there is no silent default (a defaulted label/state could store an address the customer never confirmed).
  title: z.string().trim().min(1, 'Address label is required').max(60),
  addressLine1: z.string().min(3, 'Address line 1 is required'),
  addressLine2: z.string().optional().nullable(),
  city: z.string().min(2, 'City is required'),
  state: z.string().trim().min(1, 'State is required').max(60),
  postalCode: z.string().min(4, 'Postal code is required'),
  isDefault: z.boolean().optional().default(false),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export const updateAddressSchema = createAddressSchema.partial();


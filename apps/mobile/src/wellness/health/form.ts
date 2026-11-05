import type { ActivityLevel, Gender, HealthGoal, HealthProfile, HealthProfileInput } from './types';

export const NOT_PROVIDED = 'Not provided';

export type ExerciseAnswer = 'yes' | 'no' | 'unanswered';

export const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' }
];

export const ACTIVITY_OPTIONS: Array<{ value: ActivityLevel; label: string }> = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'athlete', label: 'Athlete' }
];

export const GOAL_OPTIONS: Array<{ value: HealthGoal; label: string }> = [
  { value: 'weight_loss', label: 'Weight loss' },
  { value: 'muscle_gain', label: 'Muscle gain' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'wellness', label: 'General wellness' },
  { value: 'diabetic', label: 'Diabetic care' },
  { value: 'other', label: 'Other' }
];

export const PRIMARY_GOAL_OPTIONS = ['Lose weight', 'Build muscle', 'Improve stamina', 'Eat healthier', 'Manage a condition'];

/** Label for a stored value; an unknown stored value is shown as recorded, an absent one as "Not provided". */
export function labelFor(options: Array<{ value: string; label: string }>, value: string | undefined | null): string {
  if (value === undefined || value === null || value === '') return NOT_PROVIDED;
  return options.find((o) => o.value === value)?.label ?? value;
}

export const listText = (v: string[] | undefined): string => (v && v.length > 0 ? v.join(', ') : NOT_PROVIDED);
export const textOrNotProvided = (v: string | undefined | null): string => (v && v.trim() !== '' ? v : NOT_PROVIDED);
export const numberOrNotProvided = (v: number | undefined | null, unit: string): string => (typeof v === 'number' ? `${v} ${unit}` : NOT_PROVIDED);

/** Tri-state: a missing value is "not answered", never "No". */
export const exerciseAnswerOf = (v: boolean | undefined | null): ExerciseAnswer => (v === true ? 'yes' : v === false ? 'no' : 'unanswered');
export const exerciseLabel = (v: boolean | undefined | null): string => (v === true ? 'Yes' : v === false ? 'No' : 'Not answered');

// ------------------------------------------------------------------------------------------------------------------ form
export interface HealthForm {
  fullName: string;
  dob: string;
  gender: Gender | '';
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  activityLevel: ActivityLevel | '';
  exercise: ExerciseAnswer;
  goal: HealthGoal | '';
  primaryGoals: string[];
  foodPreference: string;
  allergies: string;
  foodDislikes: string;
  medicalConditions: string;
  currentMedications: string;
}

const csv = (v: string[] | undefined) => (v ?? []).join(', ');

/** Prefill from what the server stores. Nothing is defaulted: an absent value is an empty field. */
export function formFromProfile(p: HealthProfile | undefined): HealthForm {
  return {
    fullName: p?.name ?? '',
    dob: p?.dob ?? '',
    gender: (p?.gender as Gender | undefined) ?? '',
    heightCm: p?.heightCm !== undefined ? String(p.heightCm) : '',
    weightKg: p?.weightKg !== undefined ? String(p.weightKg) : '',
    targetWeightKg: p?.targetWeightKg !== undefined ? String(p.targetWeightKg) : '',
    activityLevel: (p?.activityLevel as ActivityLevel | undefined) ?? '',
    exercise: exerciseAnswerOf(p?.hasExercise),
    goal: (p?.goal as HealthGoal | undefined) ?? '',
    primaryGoals: p?.primaryGoals ?? [],
    foodPreference: p?.foodPreference ?? '',
    allergies: csv(p?.allergies),
    foodDislikes: csv(p?.foodDislikes),
    medicalConditions: csv(p?.medicalConditions),
    currentMedications: p?.currentMedications ?? ''
  };
}

export const splitList = (v: string): string[] =>
  v
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');

const NUMBER = /^\d+(\.\d+)?$/;
const num = (v: string): number => Number(v.trim());

export type FormErrors = Partial<Record<keyof HealthForm | 'requiredTogether', string>>;
export type StepId = 'basics' | 'body' | 'goals' | 'food';
export const STEPS: Array<{ id: StepId; title: string }> = [
  { id: 'basics', title: 'Basics' },
  { id: 'body', title: 'Body and activity' },
  { id: 'goals', title: 'Goals' },
  { id: 'food', title: 'Food and health' }
];

function validDob(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= '1900-01-01' && d.getTime() <= Date.now();
}

const filled = (f: HealthForm) => [f.heightCm.trim() !== '', f.weightKg.trim() !== '', f.goal !== '', f.activityLevel !== ''];

/** Mirrors the server rules (which stay authoritative). Returns the errors of ONE step. */
export function validateStep(step: StepId, f: HealthForm): FormErrors {
  const e: FormErrors = {};
  if (step === 'basics') {
    if (f.fullName.trim() !== '' && f.fullName.trim().length < 2) e.fullName = 'Enter your full name.';
    if (f.dob.trim() !== '' && !validDob(f.dob.trim())) e.dob = 'Enter a real date of birth in the past as YYYY-MM-DD.';
  }
  if (step === 'body') {
    if (f.heightCm.trim() !== '' && (!NUMBER.test(f.heightCm.trim()) || num(f.heightCm) < 50 || num(f.heightCm) > 250)) e.heightCm = 'Height must be between 50 and 250 cm.';
    if (f.weightKg.trim() !== '' && (!NUMBER.test(f.weightKg.trim()) || num(f.weightKg) < 20 || num(f.weightKg) > 300)) e.weightKg = 'Weight must be between 20 and 300 kg.';
    if (f.targetWeightKg.trim() !== '' && (!NUMBER.test(f.targetWeightKg.trim()) || num(f.targetWeightKg) < 20 || num(f.targetWeightKg) > 300)) e.targetWeightKg = 'Target weight must be between 20 and 300 kg.';
  }
  return e;
}

/** Whole-form validation before saving, including the server rule that the four core measurements travel together. */
export function validateForm(f: HealthForm): FormErrors {
  const e: FormErrors = { ...validateStep('basics', f), ...validateStep('body', f) };
  const f4 = filled(f);
  const some = f4.some(Boolean);
  const all = f4.every(Boolean);
  const otherHealth =
    f.targetWeightKg.trim() !== '' || f.exercise !== 'unanswered' || f.primaryGoals.length > 0 || f.foodPreference.trim() !== '' || f.allergies.trim() !== '' || f.foodDislikes.trim() !== '' || f.medicalConditions.trim() !== '' || f.currentMedications.trim() !== '';
  if ((some || otherHealth) && !all) e.requiredTogether = 'Height, weight, goal and activity level are needed together to save health details.';
  return e;
}

/**
 * Build the PUT body. hasExercise is sent ONLY when answered (an omitted value means "unchanged" on the server, which accepts no null).
 * Text clearing (medications) is sent only when something is stored, so an untouched empty field sends nothing.
 */
export function buildInput(f: HealthForm, stored: HealthProfile | undefined): HealthProfileInput {
  const out: HealthProfileInput = {};
  if (f.fullName.trim() !== '') out.fullName = f.fullName.trim();
  if (f.dob.trim() !== '') out.dob = f.dob.trim();
  if (f.gender !== '') out.gender = f.gender;
  if (filled(f).every(Boolean)) {
    out.heightCm = num(f.heightCm);
    out.weightKg = num(f.weightKg);
    out.goal = f.goal as HealthGoal;
    out.activityLevel = f.activityLevel as ActivityLevel;
    if (f.targetWeightKg.trim() !== '') out.targetWeightKg = num(f.targetWeightKg);
    if (f.exercise === 'yes') out.hasExercise = true;
    if (f.exercise === 'no') out.hasExercise = false;
    out.primaryGoals = f.primaryGoals;
    out.allergies = splitList(f.allergies);
    out.foodDislikes = splitList(f.foodDislikes);
    out.medicalConditions = splitList(f.medicalConditions);
    if (f.foodPreference.trim() !== '' || stored?.foodPreference) out.foodPreference = f.foodPreference.trim();
    if (f.currentMedications.trim() !== '' || stored?.currentMedications) out.currentMedications = f.currentMedications.trim();
  }
  return out;
}

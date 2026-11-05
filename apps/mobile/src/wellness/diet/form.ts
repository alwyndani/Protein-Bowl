import type { HealthProfile } from '../health/types';
import type { DietRequest, DietRequestInput, PlanType } from './types';

export const NOT_PROVIDED = 'Not provided';

export const PLAN_TYPE_OPTIONS: Array<{ value: PlanType; label: string }> = [
  { value: 'complete', label: 'Complete plan' },
  { value: '2meal', label: 'Two meals a day' },
  { value: '1meal', label: 'One meal a day' }
];

export const planTypeLabel = (v: string | null | undefined): string => (v ? PLAN_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v : NOT_PROVIDED);

export const REQUEST_STATUS: Record<string, { label: string; tone: 'neutral' | 'good' | 'warn' | 'bad'; open: boolean }> = {
  SUBMITTED: { label: 'Submitted - waiting for a nutritionist', tone: 'warn', open: true },
  ASSIGNED: { label: 'A nutritionist has taken your request', tone: 'warn', open: true },
  IN_REVIEW: { label: 'Being reviewed', tone: 'warn', open: true },
  PLAN_CREATED: { label: 'Plan ready for your review', tone: 'good', open: true },
  REVISION_REQUESTED: { label: 'Revision requested', tone: 'warn', open: true },
  COMPLETED: { label: 'Completed', tone: 'good', open: false },
  REJECTED: { label: 'Not accepted', tone: 'bad', open: false },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', open: false }
};

export const requestStatus = (s: string) => REQUEST_STATUS[s] ?? { label: 'Status unavailable', tone: 'neutral' as const, open: false };

export const PLAN_STATUS: Record<string, { label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' }> = {
  SUBMITTED: { label: 'Ready for your review', tone: 'good' },
  APPROVED: { label: 'Approved by you', tone: 'good' },
  REVISED: { label: 'Revision requested', tone: 'warn' }
};

export const planStatus = (s: string) => PLAN_STATUS[s] ?? { label: 'Status unavailable', tone: 'neutral' as const };

export const MEAL_TYPE_LABEL: Record<string, string> = {
  BREAKFAST: 'Breakfast',
  MORNING_SNACK: 'Morning snack',
  LUNCH: 'Lunch',
  EVENING_SNACK: 'Evening snack',
  DINNER: 'Dinner'
};

export const mealTypeLabel = (t: string): string => MEAL_TYPE_LABEL[t] ?? t;

export const amount = (v: number | null | undefined, unit: string): string => (typeof v === 'number' ? `${v} ${unit}` : NOT_PROVIDED);

/**
 * Whether the app offers "Request a diet plan". The server itself only needs an existing profile, so this is UX derived from
 * server data: the health profile must hold the four core measurements the nutritionist works from, and there must be no open
 * request already (a second one would only duplicate it).
 */
export function dietRequestGate(profile: HealthProfile | undefined, requests: DietRequest[] | undefined): { allowed: boolean; reason?: 'profile' | 'open' } {
  const complete = !!profile && profile.heightCm !== undefined && profile.weightKg !== undefined && !!profile.goal && !!profile.activityLevel;
  if (!complete) return { allowed: false, reason: 'profile' };
  if ((requests ?? []).some((r) => requestStatus(r.status).open)) return { allowed: false, reason: 'open' };
  return { allowed: true };
}

export interface DietRequestForm {
  goal: string;
  planType: PlanType | '';
  durationDays: string;
  allergiesExclusions: string;
  notes: string;
}

export type DietRequestErrors = Partial<Record<keyof DietRequestForm, string>>;

export function validateRequest(f: DietRequestForm): DietRequestErrors {
  const e: DietRequestErrors = {};
  if (f.goal.trim().length < 2) e.goal = 'Tell us your goal (at least 2 characters).';
  if (f.planType === '') e.planType = 'Choose a plan type.';
  if (f.durationDays.trim() !== '' && (!/^\d+$/.test(f.durationDays.trim()) || Number(f.durationDays) < 1 || Number(f.durationDays) > 365)) e.durationDays = 'Enter a whole number of days from 1 to 365, or leave it empty.';
  return e;
}

export function buildRequest(f: DietRequestForm): DietRequestInput {
  return {
    goal: f.goal.trim(),
    planType: f.planType as PlanType,
    ...(f.durationDays.trim() !== '' ? { durationDays: Number(f.durationDays) } : {}),
    ...(f.allergiesExclusions.trim() !== '' ? { allergiesExclusions: f.allergiesExclusions.trim() } : {}),
    ...(f.notes.trim() !== '' ? { notes: f.notes.trim() } : {})
  };
}

/** Diet plan data exactly as the customer endpoints serve it (internal clinical notes are never sent to the customer). */
export type PlanType = 'complete' | '2meal' | '1meal';

export interface DietMeal {
  id: string;
  mealType: string;
  timingLabel?: string | null;
  recipeName: string;
  portionGrams?: number | null;
  portionSize?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  instructions?: string | null;
  customizationNote?: string | null;
  slotRemarks?: string | null;
}

export interface DietDay {
  id: string;
  dayNumber: number;
  dayName: string;
  notes?: string | null;
  meals: DietMeal[];
}

export interface DietPlan {
  id: string;
  requestId?: string | null;
  name: string;
  versionNumber: number;
  parentPlanId?: string | null;
  isLatestVersion?: boolean;
  targetCalories?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  fiberGrams?: number | null;
  /** SUBMITTED (ready for the customer), APPROVED, REVISED (revision requested). */
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  customerVisibleNotes?: string | null;
  customerFeedback?: string | null;
  createdAt: string;
  request?: { id: string; status: string; planType?: string | null; durationDays?: number | null } | null;
  days: DietDay[];
}

export interface DietRequestPlanSummary {
  id: string;
  name: string;
  versionNumber: number;
  status: string;
  customerVisibleNotes?: string | null;
  customerFeedback?: string | null;
  createdAt: string;
}

export interface DietRequest {
  id: string;
  goal: string;
  /** SUBMITTED, ASSIGNED, IN_REVIEW, PLAN_CREATED, REVISION_REQUESTED, COMPLETED, REJECTED, CANCELLED. */
  status: string;
  planType?: string | null;
  durationDays?: number | null;
  allergiesExclusions?: string | null;
  notes?: string | null;
  revisionNotes?: string | null;
  createdAt: string;
  dietPlans?: DietRequestPlanSummary[];
}

/** POST /diets/requests. No price is ever sent: pricing belongs to the server. */
export interface DietRequestInput {
  goal: string;
  planType: PlanType;
  durationDays?: number;
  allergiesExclusions?: string;
  notes?: string;
}

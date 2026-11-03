import type { CustomerProfile, DietPlanRequest } from '../types';

const STATUS: Record<string, DietPlanRequest['status']> = {
  SUBMITTED: 'pending_review',
  ASSIGNED: 'under_review',
  IN_REVIEW: 'under_review',
  PLAN_CREATED: 'plan_ready',
  REVISION_REQUESTED: 'revision_requested',
  COMPLETED: 'approved',
  REJECTED: 'rejected'
};

interface ApiMeal {
  mealType: string;
  timingLabel?: string | null;
  recipeId?: string | null;
  recipeName: string;
  portionGrams?: number | null;
  portionSize?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  customizationNote?: string | null;
  slotRemarks?: string | null;
}
interface ApiDay { dayNumber: number; dayName?: string | null; meals: ApiMeal[] }
interface ApiRequest {
  id: string;
  goal: string;
  status: string;
  planType?: string | null;
  durationDays: number;
  dietaryPreference?: string | null;
  cuisinePreference?: string | null;
  grainPreference?: string | null;
  spiceLevel?: string | null;
  allergiesExclusions?: string | null;
  customQuery?: string | null;
  addonSlots?: string[];
  preferredCategories?: string[];
  calculatedPrice?: number | null;
  revisionNotes?: string | null;
  createdAt: string;
  dietPlans?: Array<{ customerVisibleNotes?: string | null; days?: ApiDay[] }>;
}

/** Maps the signed-in customer's OWN diet requests (GET /diets/my-requests) to the UI model. Nothing is invented: absent stays empty. */
export function mapCustomerRequests(rows: unknown, profile: CustomerProfile): DietPlanRequest[] {
  if (!Array.isArray(rows)) return [];
  return (rows as ApiRequest[]).map((r) => {
    const plan = r.dietPlans?.[0];
    const dayWisePlan = (plan?.days ?? []).map((d) => {
      const bySlot = new Map<string, ApiMeal[]>();
      for (const m of d.meals) bySlot.set(m.mealType, [...(bySlot.get(m.mealType) ?? []), m]);
      const meals = [...bySlot.entries()].map(([mealType, items]) => ({
        mealType,
        timingLabel: items[0].timingLabel ?? mealType,
        slotRemarks: items[0].slotRemarks ?? '',
        items: items.map((i, idx) => ({
          id: `${r.id}-${d.dayNumber}-${mealType}-${idx}`,
          recipeId: i.recipeId ?? '',
          recipeName: i.recipeName,
          portionSize: i.portionSize ?? '',
          portionGrams: i.portionGrams ?? 0,
          calories: i.calories,
          protein: i.protein,
          carbs: i.carbs,
          fat: i.fat,
          customizationNote: i.customizationNote ?? ''
        }))
      }));
      const all = d.meals;
      return {
        dayNumber: d.dayNumber,
        dayName: d.dayName ?? `Day ${d.dayNumber}`,
        meals,
        totalCalories: Math.round(all.reduce((a, m) => a + m.calories, 0)),
        totalProtein: Math.round(all.reduce((a, m) => a + m.protein, 0)),
        totalCarbs: Math.round(all.reduce((a, m) => a + m.carbs, 0)),
        totalFat: Math.round(all.reduce((a, m) => a + m.fat, 0))
      };
    });
    return {
      id: r.id,
      customerId: profile.id,
      customerName: profile.name,
      customerEmail: profile.email,
      customerPhone: profile.phone,
      bmi: profile.bmi,
      goal: r.goal as DietPlanRequest['goal'],
      targetCalories: profile.targetCalories,
      planType: (r.planType ?? 'complete') as DietPlanRequest['planType'],
      durationDays: r.durationDays,
      preferredCategories: r.preferredCategories ?? [],
      dietaryPreference: (r.dietaryPreference ?? 'veg') as DietPlanRequest['dietaryPreference'],
      cuisinePreference: r.cuisinePreference ?? '',
      grainPreference: r.grainPreference ?? '',
      spiceLevel: (r.spiceLevel ?? 'Medium') as DietPlanRequest['spiceLevel'],
      allergiesExclusions: r.allergiesExclusions ?? '',
      customQuery: r.customQuery ?? undefined,
      addonSlots: r.addonSlots ?? [],
      status: STATUS[r.status] ?? 'under_review',
      dayWisePlan: dayWisePlan.length ? (dayWisePlan as unknown as DietPlanRequest['dayWisePlan']) : undefined,
      dieticianNotes: plan?.customerVisibleNotes ?? undefined,
      revisionNotes: r.revisionNotes ?? undefined,
      calculatedPrice: r.calculatedPrice ?? undefined,
      createdAt: r.createdAt
    } satisfies DietPlanRequest;
  });
}

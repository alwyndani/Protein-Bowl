import { z } from 'zod';

export const createDietRequestSchema = z.object({
  goal: z.string().min(2, 'Goal is required'),
  notes: z.string().optional(),
  planType: z.enum(['complete', '2meal', '1meal']).optional().default('complete'),
  durationDays: z.number().min(1).max(365).optional().default(30),
  dietaryPreference: z.string().optional(),
  cuisinePreference: z.string().optional(),
  grainPreference: z.string().optional(),
  spiceLevel: z.enum(['Mild', 'Medium', 'Spicy']).optional(),
  allergiesExclusions: z.string().optional(),
  customQuery: z.string().optional(),
  addonSlots: z.array(z.string()).optional(),
  preferredCategories: z.array(z.string()).optional(),
  calculatedPrice: z.number().optional()
});

export const mealItemSchema = z.object({
  mealType: z.string(),
  timingLabel: z.string().optional(),
  recipeId: z.string().optional(),
  recipeName: z.string().min(1, 'Recipe name is required'),
  portionScale: z.number().optional().default(1.0),
  portionGrams: z.number().optional().default(200),
  portionSize: z.string().optional(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  instructions: z.string().optional(),
  customizationNote: z.string().optional(),
  slotRemarks: z.string().optional()
});

export const dayPlanSchema = z.object({
  dayNumber: z.number().min(1).max(365),
  dayName: z.string(),
  notes: z.string().optional(),
  meals: z.array(mealItemSchema)
});

export const createDietPlanSchema = z.object({
  requestId: z.string().min(1, 'Request ID is required'),
  name: z.string().optional().default('Custom Diet Plan'),
  targetCalories: z.number().min(500).max(10000),
  proteinGrams: z.number().min(0),
  carbsGrams: z.number().min(0),
  fatGrams: z.number().min(0),
  fiberGrams: z.number().optional().default(30),
  internalClinicalNotes: z.string().optional(),
  customerVisibleNotes: z.string().optional(),
  days: z.array(dayPlanSchema).min(1, 'At least 1 day plan is required')
});

export const approvePlanSchema = z.object({
  customerFeedback: z.string().optional()
});

export const requestRevisionSchema = z.object({
  revisionNotes: z.string().min(3, 'Revision notes must be at least 3 characters')
});

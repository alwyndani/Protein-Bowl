import { z } from 'zod';

export const getRecipesQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 20)),
  category: z.string().optional(),
  dietaryTag: z.string().optional(),
  dietary: z.string().optional(),
  cuisine: z.string().optional(),
  spiceLevel: z.string().optional(),
  search: z.string().optional(),
  q: z.string().optional(),
  minCalories: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
  maxCalories: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
  minProtein: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
  maxProtein: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
  isPublished: z.string().optional().transform((val) => (val !== undefined ? val === 'true' : undefined)),
});

export const recipeIngredientInputSchema = z.object({
  name: z.string().min(1, 'Ingredient name is required'),
  quantity: z.number().min(0, 'Quantity must be non-negative'),
  unit: z.string().default('grams'),
});

export const createRecipeSchema = z.object({
  code: z.string().optional(),
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  servingSize: z.string().default('1 Portion'),
  servingGrams: z.number().int().positive().default(200),
  prepTimeMins: z.number().int().nonnegative().default(15),
  cookTimeMins: z.number().int().nonnegative().default(15),
  chefInstructions: z.string().optional(),
  calories: z.number().int().nonnegative(),
  proteinGrams: z.number().nonnegative(),
  carbsGrams: z.number().nonnegative(),
  fatGrams: z.number().nonnegative(),
  fiberGrams: z.number().nonnegative().default(5),
  dietaryTag: z.string().default('non-veg'),
  cuisine: z.string().default('Kerala Traditional'),
  flourGrainPreference: z.string().optional().nullable(),
  spiceLevel: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  rating: z.number().default(4.8),
  prepSteps: z.array(z.string()).optional().default([]),
  ingredientsList: z.array(recipeIngredientInputSchema).optional().default([]),
  isPublished: z.boolean().optional().default(false),
});

export const updateRecipeSchema = createRecipeSchema.partial();

import { describe, it, expect } from 'vitest';
import { createRecipeSchema, updateRecipeSchema } from '../modules/recipe/recipe.validator.js';
import { updateCustomerProfileSchema } from '../modules/customer/customer.validator.js';

/** DB-free: request validators for the recipe rating (nothing invented) and the tri-state hasExercise answer. */
describe('recipe rating: never invented', () => {
  const base = { title: 'Bowl', category: 'Bowls', calories: 400, proteinGrams: 30, carbsGrams: 40, fatGrams: 10 };

  it('a missing rating stays absent (no 4.8 default) on create and update', () => {
    const created = createRecipeSchema.parse(base);
    expect('rating' in created && created.rating !== undefined).toBe(false);
    expect(updateRecipeSchema.parse({}).rating).toBeUndefined();
  });

  it('an explicit rating (including 0) is kept; out-of-range or non-numeric is rejected', () => {
    expect(createRecipeSchema.parse({ ...base, rating: 0 }).rating).toBe(0);
    expect(createRecipeSchema.parse({ ...base, rating: 4.2 }).rating).toBe(4.2);
    for (const bad of [-1, 5.1, '4', null]) expect(createRecipeSchema.safeParse({ ...base, rating: bad }).success, String(bad)).toBe(false);
  });
});

describe('customer profile hasExercise: true / false / null (unanswered) / omitted (unchanged)', () => {
  it('accepts true, false and explicit null; omitted stays undefined', () => {
    expect(updateCustomerProfileSchema.parse({ hasExercise: true }).hasExercise).toBe(true);
    expect(updateCustomerProfileSchema.parse({ hasExercise: false }).hasExercise).toBe(false);
    expect(updateCustomerProfileSchema.parse({ hasExercise: null }).hasExercise).toBeNull();
    expect(updateCustomerProfileSchema.parse({}).hasExercise).toBeUndefined();
  });

  it('rejects every non-boolean, non-null value', () => {
    for (const bad of ['yes', 'true', 1, 0, [], {}]) expect(updateCustomerProfileSchema.safeParse({ hasExercise: bad }).success, JSON.stringify(bad)).toBe(false);
  });
});

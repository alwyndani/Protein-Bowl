import { describe, expect, it } from 'vitest';
import type { DayPlan, MealSlotItem, RecipeItem } from '../../types';
import {
  incompleteItemCount,
  isItemComplete,
  itemFromLegacySlot,
  itemFromRecipe,
  missingParts,
  parsePortionInput,
  planIncompleteCount,
  portionRatioLabel,
  recalculateDayTotals,
  sumKnown,
  withPortion
} from './nutritionPlan';

const VALUES = ['calories', 'protein', 'carbs', 'fat', 'portionGrams'] as const;
const valuesOf = (i: MealSlotItem) => VALUES.map((k) => i[k]);

const item = (over: Partial<MealSlotItem> = {}): MealSlotItem => ({
  id: 'i1', recipeId: 'r1', recipeName: 'Dish', portionSize: '100g', portionGrams: 100, calories: 200, protein: 10, carbs: 20, fat: 5, ...over
});
const recipe = (over: Partial<RecipeItem> = {}) => ({ id: 'r1', name: 'Dish', servingGrams: 200, calories: 400, protein: 20, carbs: 40, fat: 10, ...over }) as RecipeItem;
const day = (items: MealSlotItem[]): DayPlan => ({ dayNumber: 1, meals: [{ mealType: 'breakfast', items }], totalCalories: 999, totalProtein: 999, totalCarbs: 999, totalFat: 999 });

describe('missing nutrition is never turned into 0 or a default portion', () => {
  it('a legacy single-dish slot keeps only what it recorded: missing values and portion stay null', () => {
    const it1 = itemFromLegacySlot('x', { mealType: 'breakfast', recipeId: 'r1', recipeName: 'Dish' });
    expect(it1).toMatchObject({ calories: null, protein: null, carbs: null, fat: null, portionGrams: null, portionSize: 'Not provided' });
    expect(missingParts(it1)).toEqual(['calories', 'protein', 'carbohydrates', 'fat', 'portion size']);
    expect(isItemComplete(it1)).toBe(false);
  });

  it('genuine zero values are preserved and count as provided', () => {
    const it1 = itemFromLegacySlot('x', { mealType: 'breakfast', recipeId: 'r1', recipeName: 'Tea', customPortionGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(it1).toMatchObject({ calories: 0, protein: 0, carbs: 0, fat: 0, portionGrams: 100 });
    expect(isItemComplete(it1)).toBe(true);
  });

  it('a zero or negative portion size is not a portion', () => {
    expect(missingParts(item({ portionGrams: 0 }))).toEqual(['portion size']);
    expect(withPortion(item(), 0).portionGrams).toBeNull();
    expect(withPortion(item(), null)).toMatchObject({ portionGrams: null, portionSize: 'Not provided' });
  });

  it('a catalogue recipe without a serving size or a value gives a dish with those parts missing (nothing invented)', () => {
    const it1 = itemFromRecipe('x', recipe({ servingGrams: 0, fat: undefined as unknown as number }));
    expect(it1).toMatchObject({ portionGrams: null, fat: null, calories: 400 });
    expect(missingParts(it1)).toEqual(['fat', 'portion size']);
  });

  it('a complete catalogue dish carries all of its values and its serving size', () => {
    expect(itemFromRecipe('x', recipe())).toMatchObject({ portionGrams: 200, calories: 400, protein: 20, carbs: 40, fat: 10, portionSize: '200g (1 Portion)' });
  });
});

describe('totals add up only the values that exist and say when they are incomplete', () => {
  it('a missing value contributes nothing; a genuine 0 and real values do', () => {
    const items = [item({ calories: 200 }), item({ id: 'i2', calories: null }), item({ id: 'i3', calories: 0 })];
    expect(sumKnown(items, 'calories')).toBe(200);
    const d = recalculateDayTotals(day(items));
    expect(d.totalCalories).toBe(200);
    expect(incompleteItemCount(d)).toBe(1);
  });

  it('a stored total is replaced by the recomputed one', () => {
    expect(recalculateDayTotals(day([item({ calories: 50 })])).totalCalories).toBe(50);
  });

  it('counts incomplete dishes across the whole plan', () => {
    const plan = [day([item(), item({ id: 'b', fat: null })]), day([item({ id: 'c', portionGrams: null })])];
    expect(planIncompleteCount(plan)).toBe(2);
    expect(planIncompleteCount([day([item()])])).toBe(0);
  });
});

describe('portion changes', () => {
  it('rescale from the catalogue recipe, and restore values the dish was missing', () => {
    const out = withPortion(item({ calories: null, protein: null, carbs: null, fat: null, portionGrams: null }), 100, recipe());
    expect(out).toMatchObject({ portionGrams: 100, calories: 200, protein: 10, carbs: 20, fat: 5, portionSize: '100g (0.5 portion)' });
    expect(isItemComplete(out)).toBe(true);
  });

  it('without a catalogue recipe, rescale from the dish\'s own recorded portion and values', () => {
    expect(withPortion(item(), 200)).toMatchObject({ portionGrams: 200, calories: 400, fat: 10, portionSize: '200g' });
  });

  it('without a recorded portion and without a catalogue recipe nothing can be derived: the values become missing, never 0', () => {
    const out = withPortion(item({ portionGrams: null }), 150);
    expect(out).toMatchObject({ portionGrams: 150, calories: null, protein: null, carbs: null, fat: null });
    expect(isItemComplete(out)).toBe(false);
  });

  it('the portion label is "Not provided" when either side is unknown', () => {
    expect(portionRatioLabel(item({ portionGrams: 100 }), recipe())).toBe('0.5 portion');
    expect(portionRatioLabel(item({ portionGrams: null }), recipe())).toBe('Not provided');
    expect(portionRatioLabel(item(), undefined)).toBe('Not provided');
  });
});

// --------------------------------------------------------------------------------------------------- the immutable basis
// Awkward numbers on purpose: fractional values and a serving size that does not divide evenly, so any rounding of an intermediate result shows.
const awkward = () => recipe({ id: 'c1', name: 'Curry', servingGrams: 250, calories: 333, protein: 20.4, carbs: 31.7, fat: 7.3 });

describe('every portion change is calculated from the immutable original basis', () => {
  it('catalogue dish: 100 g -> 33 g -> 100 g -> original portion restores the exact original values (fractions included)', () => {
    const r = awkward();
    const start = itemFromRecipe('x', r);
    expect(valuesOf(start)).toEqual([333, 20.4, 31.7, 7.3, 250]); // the catalogue's values, untouched
    const a = withPortion(start, 100, r);
    const b = withPortion(a, 33, r);
    const c = withPortion(b, 100, r);
    expect(valuesOf(c)).toEqual(valuesOf(a)); // 100 g gives the same values however we got there
    const back = withPortion(c, 250, r);
    expect(valuesOf(back)).toEqual(valuesOf(start)); // exactly the original, not 332 / 20 / 32 / 7
  });

  it('many repeated changes accumulate nothing: the result depends only on the basis and the LAST portion', () => {
    const r = awkward();
    const start = itemFromRecipe('x', r);
    let cur = start;
    for (const g of [33, 77, 12.5, 400, 1, 250, 99, 3, 640, 250, 17]) cur = withPortion(cur, g, r);
    expect(valuesOf(cur)).toEqual(valuesOf(withPortion(start, 17, r)));
    expect(valuesOf(withPortion(cur, 250, r))).toEqual(valuesOf(start));
  });

  it('typing a number digit by digit (1 -> 12 -> 125) gives the same values as entering 125 directly - with and without the catalogue recipe', () => {
    const r = awkward();
    const start = itemFromRecipe('x', r);
    const typed = ['1', '12', '125'].reduce((cur, s) => withPortion(cur, Number(s), r), start);
    expect(valuesOf(typed)).toEqual(valuesOf(withPortion(start, 125, r)));
    // the same when the catalogue recipe is no longer available: the dish carries its own basis
    const typedNoRecipe = ['1', '12', '125'].reduce((cur, s) => withPortion(cur, Number(s)), start);
    expect(valuesOf(typedNoRecipe)).toEqual(valuesOf(withPortion(start, 125, r)));
  });

  it('a catalogue dish keeps the values it was added with even if the catalogue entry changes later', () => {
    const start = itemFromRecipe('x', awkward());
    const changed = awkward();
    changed.calories = 999;
    changed.servingGrams = 100;
    const out = withPortion(start, 125, changed);
    expect(out.calories).toBe(Math.round((333 * 125) / 250)); // from the original basis, not from 999 kcal per 100 g
    expect(withPortion(out, 250, changed).calories).toBe(333);
  });

  it('legacy dish without a catalogue recipe: its own recorded portion and values are the immutable basis', () => {
    const legacy = itemFromLegacySlot('x', { mealType: 'breakfast', recipeId: 'gone', recipeName: 'Old dish', customPortionGrams: 100, calories: 10, protein: 3, carbs: 7, fat: 1 });
    expect(legacy.basis).toMatchObject({ source: 'recorded', grams: 100, calories: 10, protein: 3, carbs: 7, fat: 1 });
    // 10 kcal per 100 g: a naive chain 100 -> 33 -> 100 would give 3 and then 9 kcal
    const there = withPortion(legacy, 33);
    expect(there.calories).toBe(3);
    const back = withPortion(there, 100);
    expect(valuesOf(back)).toEqual(valuesOf(legacy));
    const typed = ['1', '12', '125'].reduce((cur, s) => withPortion(cur, Number(s)), legacy);
    expect(valuesOf(typed)).toEqual(valuesOf(withPortion(legacy, 125)));
  });

  it('a complete recorded basis is never replaced by catalogue values', () => {
    const legacy = itemFromLegacySlot('x', { mealType: 'breakfast', recipeId: 'c1', recipeName: 'Curry', customPortionGrams: 100, calories: 10, protein: 3, carbs: 7, fat: 1 });
    const out = withPortion(legacy, 200, awkward()); // the catalogue has the dish, with different numbers
    expect(valuesOf(out)).toEqual([20, 6, 14, 2, 200]);
  });

  it('genuine zero values stay zero through every change and back', () => {
    const zero = recipe({ calories: 0, protein: 0, carbs: 0, fat: 0, servingGrams: 250 });
    let cur = itemFromRecipe('x', zero);
    for (const g of [33, 500, 7.5, 250]) {
      cur = withPortion(cur, g, zero);
      expect([cur.calories, cur.protein, cur.carbs, cur.fat]).toEqual([0, 0, 0, 0]);
    }
    const legacy = itemFromLegacySlot('y', { mealType: 'breakfast', recipeId: 'w', recipeName: 'Water', customPortionGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 });
    for (const g of [33, 250, 100]) expect([withPortion(legacy, g).calories, withPortion(legacy, g).fat]).toEqual([0, 0]);
    // a zero beside real values stays zero as well
    const mixed = itemFromRecipe('z', recipe({ fat: 0, servingGrams: 100, calories: 100 }));
    expect(withPortion(mixed, 50).fat).toBe(0);
    expect(withPortion(mixed, 50).calories).toBe(50);
  });

  it('missing values stay null (never 0, never invented) through every change and back', () => {
    const legacy = itemFromLegacySlot('x', { mealType: 'breakfast', recipeId: 'gone', recipeName: 'Old dish', customPortionGrams: 100, calories: 10, protein: 3 });
    for (const g of [33, 100, 250]) {
      const out = withPortion(legacy, g);
      expect([out.carbs, out.fat]).toEqual([null, null]);
      expect(typeof out.calories).toBe('number');
    }
    expect(valuesOf(withPortion(withPortion(legacy, 33), 100))).toEqual(valuesOf(legacy));
    // no recorded portion at all: nothing can be derived, so everything stays missing
    const noPortion = itemFromLegacySlot('y', { mealType: 'breakfast', recipeId: 'gone', recipeName: 'Old dish', calories: 10, protein: 3, carbs: 7, fat: 1 });
    expect(withPortion(noPortion, 150)).toMatchObject({ portionGrams: 150, calories: null, protein: null, carbs: null, fat: null });
    // a catalogue recipe with a missing value does not get one invented
    const partial = itemFromRecipe('z', recipe({ fat: undefined as unknown as number }));
    expect(withPortion(partial, 100, recipe({ fat: undefined as unknown as number })).fat).toBeNull();
  });

  it('an unusable (incomplete) basis is restored from the catalogue once, and that basis is then immutable', () => {
    const empty = itemFromLegacySlot('x', { mealType: 'breakfast', recipeId: 'c1', recipeName: 'Curry' });
    const restored = withPortion(empty, 125, awkward());
    expect(valuesOf(restored)).toEqual([Math.round((333 * 125) / 250), Math.round((20.4 * 125) / 250), Math.round((31.7 * 125) / 250), Math.round((7.3 * 125) / 250), 125]);
    const other = awkward();
    other.calories = 1;
    expect(withPortion(restored, 250, other).calories).toBe(333); // the catalogue basis it was restored from, not the newer entry
  });

  it('clearing the portion keeps the basis: entering a portion again restores exactly', () => {
    const r = awkward();
    const start = itemFromRecipe('x', r);
    const cleared = withPortion(start, null, r);
    expect(cleared).toMatchObject({ portionGrams: null, portionSize: 'Not provided' });
    expect(cleared.basis).toEqual(start.basis);
    expect(valuesOf(withPortion(cleared, 250, r))).toEqual(valuesOf(start));
  });

  it('the basis is client-only data: it is a plain property that the publish payload never copies', () => {
    expect(Object.keys(itemFromRecipe('x', awkward()))).toContain('basis');
  });
});

describe('portion input validation: nothing typed is replaced by another number', () => {
  it('an empty box is "empty" (portion cleared), not invalid', () => {
    expect(parsePortionInput('')).toEqual({ kind: 'empty' });
    expect(parsePortionInput('   ')).toEqual({ kind: 'empty' });
  });

  it('zero, negative, non-numeric and non-finite entries are invalid', () => {
    for (const raw of ['0', '-5', '-0.1', 'abc', 'NaN', 'Infinity', '1e999']) expect(parsePortionInput(raw)).toEqual({ kind: 'invalid' });
  });

  it('any positive number is accepted exactly as typed: no minimum, no rounding', () => {
    expect(parsePortionInput('1')).toEqual({ kind: 'ok', grams: 1 });
    expect(parsePortionInput('0.5')).toEqual({ kind: 'ok', grams: 0.5 });
    expect(parsePortionInput('12.5')).toEqual({ kind: 'ok', grams: 12.5 });
    expect(parsePortionInput('250')).toEqual({ kind: 'ok', grams: 250 });
  });

  it('a small portion is used as entered (the old silent 10 g minimum is gone)', () => {
    const r = recipe({ servingGrams: 100, calories: 200 });
    const out = withPortion(itemFromRecipe('x', r), 3, r);
    expect(out.portionGrams).toBe(3);
    expect(out.calories).toBe(6);
  });
});

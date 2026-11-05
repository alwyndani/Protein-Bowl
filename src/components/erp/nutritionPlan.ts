import type { DayMealSlot, DayPlan, MealSlotItem, NutritionBasis, RecipeItem } from '../../types';

/**
 * Pure rules for the nutritionist's plan builder. Clinical values are shown and stored exactly as recorded:
 *  - a missing calorie / protein / carbohydrate / fat value or portion size is `null` ("Not provided"), never 0 and never a made-up 200 g;
 *  - a genuine 0 is kept (0 g of fat is a real value);
 *  - day totals add up ONLY the values that exist, and the plan is "incomplete" while any dish is missing a value;
 *  - an incomplete plan cannot be published (the server contract is unchanged: it still receives real numbers only);
 *  - every portion change is calculated from the dish's IMMUTABLE BASIS (the portion and values it started from), never from the last rescaled
 *    (and rounded) values, so changing the portion many times and returning to the original restores the original values exactly.
 */

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);
const positiveOrNull = (v: unknown): number | null => (isNum(v) && v > 0 ? v : null);

export type Macro = 'calories' | 'protein' | 'carbs' | 'fat';
const MACROS: readonly Macro[] = ['calories', 'protein', 'carbs', 'fat'];
const LABEL: Record<Macro | 'portion', string> = { calories: 'calories', protein: 'protein', carbs: 'carbohydrates', fat: 'fat', portion: 'portion size' };

/** A dish whose every required value is present (what the server accepts). */
export type CompleteItem = MealSlotItem & { portionGrams: number; calories: number; protein: number; carbs: number; fat: number };

/** Names of the values this dish does not have ("Not provided"). */
export function missingParts(item: MealSlotItem): string[] {
  const out: string[] = [];
  for (const m of MACROS) if (!isNum(item[m])) out.push(LABEL[m]);
  if (!isNum(item.portionGrams) || item.portionGrams <= 0) out.push(LABEL.portion);
  return out;
}

export const isItemComplete = (item: MealSlotItem): item is CompleteItem => missingParts(item).length === 0;

export const incompleteItemCount = (day: DayPlan): number =>
  day.meals.reduce((n, slot) => n + (slot.items || []).filter((it) => !isItemComplete(it)).length, 0);

export const planIncompleteCount = (plan: DayPlan[]): number => plan.reduce((n, d) => n + incompleteItemCount(d), 0);

/** Sum of the values that exist; a missing value contributes nothing (and is reported separately as "incomplete"). */
export const sumKnown = (items: readonly MealSlotItem[], key: Macro): number => items.reduce((n, it) => n + (isNum(it[key]) ? it[key] : 0), 0);

export function recalculateDayTotals(day: DayPlan): DayPlan {
  const items = day.meals.flatMap((slot) => slot.items || []);
  return {
    ...day,
    totalCalories: Math.round(sumKnown(items, 'calories')),
    totalProtein: Math.round(sumKnown(items, 'protein')),
    totalCarbs: Math.round(sumKnown(items, 'carbs')),
    totalFat: Math.round(sumKnown(items, 'fat'))
  };
}

// ------------------------------------------------------------------------------------------------ the immutable basis

/** The catalogue recipe's portion (its serving size) and values, exactly as the catalogue states them. */
export const basisOfRecipe = (recipe: RecipeItem): NutritionBasis => ({
  source: 'catalogue',
  grams: positiveOrNull(recipe.servingGrams),
  calories: numOrNull(recipe.calories),
  protein: numOrNull(recipe.protein),
  carbs: numOrNull(recipe.carbs),
  fat: numOrNull(recipe.fat)
});

/** A saved dish's own recorded portion and values: the original of a dish that has no basis yet. */
const recordedBasis = (item: Pick<MealSlotItem, 'portionGrams' | 'calories' | 'protein' | 'carbs' | 'fat'>): NutritionBasis => ({
  source: 'recorded',
  grams: positiveOrNull(item.portionGrams),
  calories: numOrNull(item.calories),
  protein: numOrNull(item.protein),
  carbs: numOrNull(item.carbs),
  fat: numOrNull(item.fat)
});

const isCompleteBasis = (b: NutritionBasis): boolean => b.grams !== null && MACROS.every((m) => b[m] !== null);

/**
 * The basis a portion change is calculated from. A dish keeps the basis it started with (catalogue values for a catalogue dish, its own recorded
 * values for a saved dish). Only a basis that cannot be used (no portion, or a missing value) may be replaced, and only by the catalogue's complete
 * statement when the recipe is available; a complete basis is never replaced.
 */
export function resolveBasis(item: MealSlotItem, recipe?: RecipeItem): NutritionBasis {
  const own = item.basis ?? recordedBasis(item);
  if (isCompleteBasis(own)) return own;
  if (recipe) {
    const fromCatalogue = basisOfRecipe(recipe);
    if (fromCatalogue.grams !== null) return fromCatalogue;
  }
  return own;
}

/** One value at `grams`: exactly the basis value at the basis portion, otherwise proportional and rounded - always computed from the basis. */
function valueAt(basis: NutritionBasis, macro: Macro, grams: number): number | null {
  const v = basis[macro];
  if (v === null || basis.grams === null) return null;
  return grams === basis.grams ? v : Math.round((v * grams) / basis.grams);
}

/** A dish added from the catalogue: its available nutrition information, nothing invented for what the catalogue lacks. */
export function itemFromRecipe(id: string, recipe: RecipeItem): MealSlotItem {
  const basis = basisOfRecipe(recipe);
  return {
    id,
    recipeId: recipe.id,
    recipeName: recipe.name,
    portionSize: basis.grams === null ? 'Not provided' : `${basis.grams}g (1 Portion)`,
    portionGrams: basis.grams,
    calories: basis.calories,
    protein: basis.protein,
    carbs: basis.carbs,
    fat: basis.fat,
    basis,
    customizationNote: ''
  };
}

/** A saved single-dish slot (older plans) becomes a dish that keeps ITS OWN recorded values as its basis; whatever was not recorded stays missing. */
export function itemFromLegacySlot(id: string, slot: DayMealSlot): MealSlotItem {
  const portionGrams = positiveOrNull(slot.customPortionGrams);
  const item: MealSlotItem = {
    id,
    recipeId: slot.recipeId || '',
    recipeName: slot.recipeName || '',
    portionSize: portionGrams === null ? 'Not provided' : `${portionGrams}g`,
    portionGrams,
    calories: numOrNull(slot.calories),
    protein: numOrNull(slot.protein),
    carbs: numOrNull(slot.carbs),
    fat: numOrNull(slot.fat),
    customizationNote: ''
  };
  return { ...item, basis: recordedBasis(item) };
}

/** A portion size the nutritionist typed: a finite number greater than 0 (no minimum, no rounding, no replacement). */
export function parsePortionInput(raw: string): { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; grams: number } {
  if (raw.trim() === '') return { kind: 'empty' };
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? { kind: 'ok', grams: n } : { kind: 'invalid' };
}

export const INVALID_PORTION_MESSAGE = 'Enter a portion size greater than 0 grams.';

/**
 * The nutritionist sets a portion size (grams). Values are ALWAYS calculated from the dish's immutable basis (see resolveBasis), so repeated
 * changes cannot accumulate rounding, and returning to the basis portion gives back the original values exactly. A value that cannot be derived
 * stays missing. `null` clears the portion (the basis is kept, so entering a portion again restores the values).
 */
export function withPortion(item: MealSlotItem, grams: number | null, recipe?: RecipeItem): MealSlotItem {
  const basis = resolveBasis(item, recipe);
  if (grams === null || !isNum(grams) || grams <= 0) {
    return { ...item, basis, portionGrams: null, portionSize: 'Not provided' };
  }
  const out: MealSlotItem = { ...item, basis, portionGrams: grams };
  for (const m of MACROS) out[m] = valueAt(basis, m, grams);
  out.portionSize = basis.source === 'catalogue' && basis.grams !== null ? `${grams}g (${(grams / basis.grams).toFixed(1)} portion)` : `${grams}g`;
  return out;
}

/** "1.0 portion" text, or "Not provided" when the catalogue serving size or the portion is unknown. */
export function portionRatioLabel(item: MealSlotItem, recipe?: RecipeItem): string {
  const base = item.basis?.source === 'catalogue' && item.basis.grams !== null ? item.basis.grams : recipe ? positiveOrNull(recipe.servingGrams) : null;
  if (!isNum(item.portionGrams) || item.portionGrams <= 0 || base === null) return 'Not provided';
  return `${(item.portionGrams / base).toFixed(1)} portion`;
}

export const incompleteSummary = (count: number): string =>
  `${count} ${count === 1 ? 'dish has' : 'dishes have'} missing nutrition values or portion size`;

import { RecipeItem } from '../types';
import { YOGURT_AND_OVERNIGHT_RECIPES } from './recipes/yogurtAndOvernight';
import { KERALA_BREAKFAST_AND_LUNCH_RECIPES } from './recipes/keralaBreakfastAndLunch';
import { DESSERTS_AND_SNACKS_RECIPES } from './recipes/dessertsAndSnacks';
import { QUINOA_AND_RICE_RECIPES } from './recipes/quinoaAndRice';
import { PROTEINS_AND_GRILLS_RECIPES } from './recipes/proteinsAndGrills';
import { SALAD_RECIPES } from './recipes/salads';
import { SANDWICHES_AND_SMOOTHIES_RECIPES } from './recipes/sandwichesAndSmoothies';

export const ALL_RECIPES: RecipeItem[] = [
  ...YOGURT_AND_OVERNIGHT_RECIPES,
  ...KERALA_BREAKFAST_AND_LUNCH_RECIPES,
  ...DESSERTS_AND_SNACKS_RECIPES,
  ...QUINOA_AND_RICE_RECIPES,
  ...PROTEINS_AND_GRILLS_RECIPES,
  ...SALAD_RECIPES,
  ...SANDWICHES_AND_SMOOTHIES_RECIPES
];

export function getRecipeById(id: string): RecipeItem | undefined {
  return ALL_RECIPES.find((r) => r.id === id);
}

export function getRecipesByCategory(category: string): RecipeItem[] {
  return ALL_RECIPES.filter((r) => r.category.toLowerCase() === category.toLowerCase());
}

export function searchRecipes(query: string): RecipeItem[] {
  const q = query.toLowerCase();
  return ALL_RECIPES.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      (r.cuisine && r.cuisine.toLowerCase().includes(q)) ||
      r.ingredientsList?.some((ing) => ing.name.toLowerCase().includes(q))
  );
}

import { RecipeItem } from '../types';

export function matchCategoryToRecipe(selectedCategory: string, r: RecipeItem): boolean {
  if (!selectedCategory || selectedCategory === 'All') return true;

  const sel = selectedCategory.toLowerCase().trim();
  const recCat = r.category.toLowerCase().trim();
  const recName = r.name.toLowerCase().trim();

  if (recCat === sel) return true;

  // 1. Choice of Rice
  if (sel.includes('choice of rice')) {
    return (recCat.includes('rice') || recName.includes('rice')) && !recCat.includes('flavored') && !recName.includes('flavored') && !recName.includes('herbed') && !recName.includes('quinoa');
  }

  // 2. Flavored Rice
  if (sel.includes('flavored rice')) {
    return recCat.includes('flavored') || recName.includes('herbed') || recName.includes('pulao') || recName.includes('biryani') || recName.includes('lemon herb') || recName.includes('garlic butter');
  }

  // 3. Choice of Chicken – Air Fried
  if (sel.includes('chicken')) {
    return recCat.includes('chicken') || recName.includes('chicken');
  }

  // 4. Lunch Accomplishments – Kerala / Kerala Accompaniments
  if (sel.includes('kerala') || sel.includes('accomplishments') || sel.includes('accompaniments')) {
    return recCat.includes('kerala') || recCat.includes('accompaniment') || recName.includes('thoran') || recName.includes('aviyal') || recName.includes('mezhukkupuratti') || recName.includes('matta') || recName.includes('curry');
  }

  // 5. Choice of Fish
  if (sel.includes('fish')) {
    return recCat.includes('fish') || recName.includes('fish') || recName.includes('sear') || recName.includes('salmon') || recName.includes('tuna');
  }

  // 6. Choice of Salads – Veg
  if (sel.includes('salads – veg') || sel.includes('veg salads') || (sel.includes('salad') && sel.includes('veg') && !sel.includes('non-veg'))) {
    return recCat.includes('salad') && (r.dietaryTag === 'veg' || r.dietaryTag === 'vegan') && !recName.includes('chicken') && !recName.includes('egg') && !recName.includes('tuna');
  }

  // 7. Choice of Salads – Non-Veg
  if (sel.includes('salads – non-veg') || sel.includes('non-veg salads') || (sel.includes('salad') && sel.includes('non-veg'))) {
    return recCat.includes('salad') && (r.dietaryTag === 'non-veg' || r.dietaryTag === 'egg' || recName.includes('chicken') || recName.includes('egg') || recName.includes('tuna'));
  }

  // 8. Choice of Quinoa
  if (sel.includes('quinoa')) {
    return recCat.includes('quinoa') || recName.includes('quinoa');
  }

  // 9. Choice of Egg
  if (sel.includes('egg')) {
    return recCat.includes('egg') || r.dietaryTag === 'egg' || recName.includes('egg') || recName.includes('omelette');
  }

  // 10. Choice of Oatmeal
  if (sel.includes('oatmeal') || sel.includes('oats')) {
    return recCat.includes('oatmeal') || recCat.includes('oats') || recName.includes('oat') || recName.includes('oatmeal');
  }

  // 11. Yogurt Bowls
  if (sel.includes('yogurt')) {
    return recCat.includes('yogurt') || recName.includes('yogurt') || recName.includes('parfait');
  }

  // 12. Desserts, Snacks & Bites
  if (sel.includes('dessert') || sel.includes('snack') || sel.includes('bites') || sel.includes('beverage')) {
    return recCat.includes('dessert') || recCat.includes('snack') || recCat.includes('bites') || recCat.includes('beverage') || recName.includes('brownie') || recName.includes('juice') || recName.includes('protein bar');
  }

  return recCat.includes(sel) || sel.includes(recCat);
}

import { PrismaClient } from '@prisma/client';
import { ALL_RECIPES } from '../../src/data/recipeDatabase';

const prisma = new PrismaClient();

export async function seedRecipes() {
  console.log(`Starting 120-recipe database import from source dataset...`);
  console.log(`Source dataset count: ${ALL_RECIPES.length}`);

  let importedCount = 0;
  let ingredientCountMap = new Set<string>();

  for (const sourceItem of ALL_RECIPES) {
    const code = sourceItem.id;
    const title = sourceItem.name;
    const category = sourceItem.category;
    const servingSize = sourceItem.servingSize || '1 Portion';
    const servingGrams = sourceItem.servingGrams || 200;
    const calories = Math.round(sourceItem.calories || 0);
    const proteinGrams = sourceItem.protein || 0;
    const carbsGrams = sourceItem.carbs || 0;
    const fatGrams = sourceItem.fat || 0;
    const fiberGrams = sourceItem.fiber || 0;
    const dietaryTag = sourceItem.dietaryTag || 'non-veg';
    const cuisine = sourceItem.cuisine || 'Kerala Traditional';
    const flourGrainPreference = sourceItem.flourGrainPreference || null;
    const spiceLevel = sourceItem.spiceLevel || null;
    const image = sourceItem.image || null;
    const rating = sourceItem.rating || 4.8;
    const prepSteps = sourceItem.prepSteps || [];

    // Upsert Recipe record by unique code
    const recipe = await prisma.recipe.upsert({
      where: { code },
      update: {
        title,
        category,
        servingSize,
        servingGrams,
        calories,
        proteinGrams,
        carbsGrams,
        fatGrams,
        fiberGrams,
        dietaryTag,
        cuisine,
        flourGrainPreference,
        spiceLevel,
        image,
        rating,
        prepSteps,
        isPublished: true,
      },
      create: {
        code,
        title,
        category,
        servingSize,
        servingGrams,
        calories,
        proteinGrams,
        carbsGrams,
        fatGrams,
        fiberGrams,
        dietaryTag,
        cuisine,
        flourGrainPreference,
        spiceLevel,
        image,
        rating,
        prepSteps,
        isPublished: true,
      },
    });

    importedCount++;

    // Clear existing recipe ingredients for clean idempotent re-linking
    await prisma.recipeIngredient.deleteMany({
      where: { recipeId: recipe.id },
    });

    // Process ingredients list with deduplication/upserting per recipe
    if (sourceItem.ingredientsList && Array.isArray(sourceItem.ingredientsList)) {
      const processedIngredients = new Map<string, { quantity: number; unit: string }>();

      for (const ing of sourceItem.ingredientsList) {
        const normalizedName = ing.name.trim();
        if (!normalizedName) continue;
        
        const existing = processedIngredients.get(normalizedName);
        if (existing) {
          processedIngredients.set(normalizedName, {
            quantity: existing.quantity + (ing.quantity || 0),
            unit: ing.unit || existing.unit,
          });
        } else {
          processedIngredients.set(normalizedName, {
            quantity: ing.quantity || 0,
            unit: ing.unit || 'grams',
          });
        }
      }

      for (const [normalizedName, ingData] of processedIngredients.entries()) {
        ingredientCountMap.add(normalizedName.toLowerCase());

        // Upsert Ingredient by unique normalized name
        const ingredient = await prisma.ingredient.upsert({
          where: { name: normalizedName },
          update: {},
          create: {
            name: normalizedName,
            unit: ingData.unit || 'grams',
          },
        });

        // Upsert RecipeIngredient relationship
        await prisma.recipeIngredient.upsert({
          where: {
            recipeId_ingredientId: {
              recipeId: recipe.id,
              ingredientId: ingredient.id,
            },
          },
          update: {
            quantity: ingData.quantity,
            unit: ingData.unit,
          },
          create: {
            recipeId: recipe.id,
            ingredientId: ingredient.id,
            quantity: ingData.quantity,
            unit: ingData.unit,
          },
        });
      }
    }
  }

  // Gather stats for recipes corresponding to source dataset
  const sourceCodes = ALL_RECIPES.map((r) => r.id);
  const dbRecipes = await prisma.recipe.findMany({
    where: { code: { in: sourceCodes } },
    include: {
      ingredients: true,
    },
  });

  const recipesWithIngredients = dbRecipes.filter((r) => r.ingredients.length > 0).length;
  const totalRecipeIngredientsInDb = await prisma.recipeIngredient.count({
    where: { recipe: { code: { in: sourceCodes } } },
  });
  const uniqueIngredientsInDb = await prisma.ingredient.count();
  const recipesWithImages = dbRecipes.filter((r) => Boolean(r.image)).length;
  const recipesWithDietaryTags = dbRecipes.filter((r) => Boolean(r.dietaryTag)).length;
  const recipesWithServingGrams = dbRecipes.filter((r) => r.servingGrams > 0).length;
  const recipesWithPrepSteps = dbRecipes.filter((r) => Array.isArray(r.prepSteps) && (r.prepSteps as any[]).length > 0).length;

  console.log('=== RECIPE IMPORT VERIFICATION STATISTICS ===');
  console.log(`Source recipes count                  : ${ALL_RECIPES.length}`);
  console.log(`Database recipes count                : ${dbRecipes.length}`);
  console.log(`Recipes with ingredients              : ${recipesWithIngredients}`);
  console.log(`Total RecipeIngredient records in DB  : ${totalRecipeIngredientsInDb}`);
  console.log(`Unique Ingredient records in DB       : ${uniqueIngredientsInDb}`);
  console.log(`Recipes with images                   : ${recipesWithImages}`);
  console.log(`Recipes with dietary tags             : ${recipesWithDietaryTags}`);
  console.log(`Recipes with serving grams            : ${recipesWithServingGrams}`);
  console.log(`Recipes with prep steps               : ${recipesWithPrepSteps}`);
  console.log('=============================================');

  return {
    sourceCount: ALL_RECIPES.length,
    dbCount: dbRecipes.length,
    recipesWithIngredients,
    totalRecipeIngredientsInDb,
    uniqueIngredientsInDb,
    recipesWithImages,
    recipesWithDietaryTags,
    recipesWithServingGrams,
    recipesWithPrepSteps,
  };
}

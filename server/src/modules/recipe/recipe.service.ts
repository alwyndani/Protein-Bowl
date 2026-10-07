import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';

export interface GetRecipesOptions {
  page?: number;
  limit?: number;
  category?: string;
  dietaryTag?: string;
  cuisine?: string;
  spiceLevel?: string;
  search?: string;
  minCalories?: number;
  maxCalories?: number;
  minProtein?: number;
  maxProtein?: number;
  isPublished?: boolean;
}

export class RecipeService {
  /**
   * Transforms relational ingredients back into clean array format for response
   */
  private static formatRecipeResponse(recipe: any, projection: 'PUBLIC' | 'STAFF_CHEF' | 'STAFF_ADMIN' | 'NUTRITIONIST') {
    const formattedIngredients = recipe.ingredients
      ? recipe.ingredients.map((ri: any) => ({
          id: ri.ingredient?.id || ri.ingredientId,
          name: ri.ingredient?.name || 'Unknown Ingredient',
          quantity: ri.quantity,
          unit: ri.unit,
        }))
      : [];

    const baseResponse = {
      id: recipe.id,
      code: recipe.code,
      name: recipe.title,
      title: recipe.title,
      description: recipe.description,
      category: recipe.category,
      servingSize: recipe.servingSize,
      servingGrams: recipe.servingGrams,
      prepTimeMins: recipe.prepTimeMins,
      cookTimeMins: recipe.cookTimeMins,
      calories: recipe.calories,
      protein: recipe.proteinGrams,
      proteinGrams: recipe.proteinGrams,
      carbs: recipe.carbsGrams,
      carbsGrams: recipe.carbsGrams,
      fat: recipe.fatGrams,
      fatGrams: recipe.fatGrams,
      fiber: recipe.fiberGrams,
      fiberGrams: recipe.fiberGrams,
      dietaryTag: recipe.dietaryTag,
      cuisine: recipe.cuisine,
      flourGrainPreference: recipe.flourGrainPreference,
      spiceLevel: recipe.spiceLevel,
      image: recipe.image,
      rating: recipe.rating,
      prepSteps: recipe.prepSteps || [],
      ingredientsList: formattedIngredients,
      ingredients: formattedIngredients,
      isPublished: recipe.isPublished,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
    };

    if (projection === 'PUBLIC' || projection === 'NUTRITIONIST') {
      // Exclude internal costing & internal chef SOP instructions
      return baseResponse;
    }

    if (projection === 'STAFF_CHEF') {
      return {
        ...baseResponse,
        chefInstructions: recipe.chefInstructions || null,
      };
    }

    if (projection === 'STAFF_ADMIN') {
      return {
        ...baseResponse,
        chefInstructions: recipe.chefInstructions || null,
        costPerPortion: recipe.costPerPortion ? Number(recipe.costPerPortion) : null,
      };
    }

    return baseResponse;
  }

  /**
   * Public Catalog Query - Strictly published recipes only
   */
  static async getPublicRecipes(options: GetRecipesOptions) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      isPublished: true, // MANDATORY: Public catalog only shows published recipes
    };

    if (options.category) {
      where.category = { equals: options.category, mode: 'insensitive' };
    }

    const dietary = options.dietaryTag || options.dietaryTag;
    if (dietary) {
      where.dietaryTag = { equals: dietary, mode: 'insensitive' };
    }

    if (options.cuisine) {
      where.cuisine = { contains: options.cuisine, mode: 'insensitive' };
    }

    if (options.spiceLevel) {
      where.spiceLevel = { contains: options.spiceLevel, mode: 'insensitive' };
    }

    const searchTerm = options.search;
    if (searchTerm && searchTerm.trim() !== '') {
      const q = searchTerm.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
        { cuisine: { contains: q, mode: 'insensitive' } },
        {
          ingredients: {
            some: {
              ingredient: {
                name: { contains: q, mode: 'insensitive' },
              },
            },
          },
        },
      ];
    }

    if (options.minCalories !== undefined || options.maxCalories !== undefined) {
      where.calories = {};
      if (options.minCalories !== undefined) where.calories.gte = options.minCalories;
      if (options.maxCalories !== undefined) where.calories.lte = options.maxCalories;
    }

    if (options.minProtein !== undefined || options.maxProtein !== undefined) {
      where.proteinGrams = {};
      if (options.minProtein !== undefined) where.proteinGrams.gte = options.minProtein;
      if (options.maxProtein !== undefined) where.proteinGrams.lte = options.maxProtein;
    }

    const [total, recipes] = await Promise.all([
      prisma.recipe.count({ where }),
      prisma.recipe.findMany({
        where,
        skip,
        take: limit,
        orderBy: { title: 'asc' },
        include: {
          ingredients: {
            include: {
              ingredient: true,
            },
          },
        },
      }),
    ]);

    const items = recipes.map((r) => this.formatRecipeResponse(r, 'PUBLIC'));

    return {
      items,
      recipes: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Staff Catalog Query (Chef, Super Admin, Nutritionist)
   */
  static async getStaffRecipes(options: GetRecipesOptions, userRoles: string[]) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (options.isPublished !== undefined) {
      where.isPublished = options.isPublished;
    }

    if (options.category) {
      where.category = { equals: options.category, mode: 'insensitive' };
    }

    const dietary = options.dietaryTag;
    if (dietary) {
      where.dietaryTag = { equals: dietary, mode: 'insensitive' };
    }

    const searchTerm = options.search;
    if (searchTerm && searchTerm.trim() !== '') {
      const q = searchTerm.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, recipes] = await Promise.all([
      prisma.recipe.count({ where }),
      prisma.recipe.findMany({
        where,
        skip,
        take: limit,
        orderBy: { title: 'asc' },
        include: {
          ingredients: {
            include: {
              ingredient: true,
            },
          },
        },
      }),
    ]);

    const projection = userRoles.includes('SUPER_ADMIN')
      ? 'STAFF_ADMIN'
      : userRoles.includes('CHEF')
      ? 'STAFF_CHEF'
      : 'NUTRITIONIST';

    const items = recipes.map((r) => this.formatRecipeResponse(r, projection));

    return {
      items,
      recipes: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get distinct recipe categories for published recipes
   */
  static async getCategories() {
    const result = await prisma.recipe.groupBy({
      by: ['category'],
      where: { isPublished: true },
      _count: { category: true },
      orderBy: { category: 'asc' },
    });

    return result.map((r) => ({
      category: r.category,
      count: r._count.category,
    }));
  }

  /**
   * Get single recipe by ID or Code (Public)
   */
  static async getPublicRecipeById(idOrCode: string) {
    const recipe = await prisma.recipe.findFirst({
      where: {
        OR: [{ id: idOrCode }, { code: idOrCode }],
        isPublished: true, // MANDATORY: Public cannot access draft/unpublished recipes
      },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    if (!recipe) {
      throw new AppError('Recipe not found or not published', 404, 'NOT_FOUND');
    }

    return this.formatRecipeResponse(recipe, 'PUBLIC');
  }

  /**
   * Get single recipe by ID or Code (Staff)
   */
  static async getStaffRecipeById(idOrCode: string, userRoles: string[]) {
    const recipe = await prisma.recipe.findFirst({
      where: {
        OR: [{ id: idOrCode }, { code: idOrCode }],
      },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    if (!recipe) {
      throw new AppError('Recipe not found', 404, 'NOT_FOUND');
    }

    const projection = userRoles.includes('SUPER_ADMIN')
      ? 'STAFF_ADMIN'
      : userRoles.includes('CHEF')
      ? 'STAFF_CHEF'
      : 'NUTRITIONIST';

    return this.formatRecipeResponse(recipe, projection);
  }

  /**
   * Create Recipe
   * - CHEF: Recipe created as DRAFT/UNPUBLISHED (isPublished = false)
   * - SUPER_ADMIN: Can create published or draft
   */
  static async createRecipe(data: any, userRoles: string[]) {
    const isSuperAdmin = userRoles.includes('SUPER_ADMIN');

    // Generate unique code if not provided
    const code = data.code || `REC-${Date.now().toString(36).toUpperCase()}`;

    // CHEF created recipes must remain draft/unpublished
    const isPublished = isSuperAdmin ? (data.isPublished ?? false) : false;

    const recipe = await prisma.recipe.create({
      data: {
        code,
        title: data.title,
        description: data.description || null,
        category: data.category,
        servingSize: data.servingSize || '1 Portion',
        servingGrams: data.servingGrams || 200,
        prepTimeMins: data.prepTimeMins || 15,
        cookTimeMins: data.cookTimeMins || 15,
        chefInstructions: data.chefInstructions || null,
        calories: data.calories,
        proteinGrams: data.proteinGrams,
        carbsGrams: data.carbsGrams,
        fatGrams: data.fatGrams,
        fiberGrams: data.fiberGrams || 5,
        dietaryTag: data.dietaryTag || 'non-veg',
        cuisine: data.cuisine || 'Kerala Traditional',
        flourGrainPreference: data.flourGrainPreference || null,
        spiceLevel: data.spiceLevel || null,
        image: data.image || null,
        rating: data.rating || 4.8,
        prepSteps: data.prepSteps || [],
        isPublished,
      },
    });

    // Save relational ingredients if provided
    if (data.ingredientsList && Array.isArray(data.ingredientsList)) {
      for (const ing of data.ingredientsList) {
        const normalizedName = ing.name.trim();
        if (!normalizedName) continue;

        const ingredient = await prisma.ingredient.upsert({
          where: { name: normalizedName },
          update: {},
          create: {
            name: normalizedName,
            unit: ing.unit || 'grams',
          },
        });

        await prisma.recipeIngredient.upsert({
          where: {
            recipeId_ingredientId: {
              recipeId: recipe.id,
              ingredientId: ingredient.id,
            },
          },
          update: {
            quantity: ing.quantity || 0,
            unit: ing.unit || 'grams',
          },
          create: {
            recipeId: recipe.id,
            ingredientId: ingredient.id,
            quantity: ing.quantity || 0,
            unit: ing.unit || 'grams',
          },
        });
      }
    }

    return this.getStaffRecipeById(recipe.id, userRoles);
  }

  /**
   * Update Recipe
   * - CHEF: Edit allowed, but CANNOT change isPublished to true
   * - SUPER_ADMIN: Can edit and change isPublished
   */
  static async updateRecipe(id: string, data: any, userRoles: string[]) {
    const existing = await prisma.recipe.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Recipe not found', 404, 'NOT_FOUND');
    }

    const isSuperAdmin = userRoles.includes('SUPER_ADMIN');

    // CHEF cannot publish recipes
    let isPublished = existing.isPublished;
    if (isSuperAdmin && data.isPublished !== undefined) {
      isPublished = data.isPublished;
    }

    await prisma.recipe.update({
      where: { id },
      data: {
        title: data.title !== undefined ? data.title : existing.title,
        description: data.description !== undefined ? data.description : existing.description,
        category: data.category !== undefined ? data.category : existing.category,
        servingSize: data.servingSize !== undefined ? data.servingSize : existing.servingSize,
        servingGrams: data.servingGrams !== undefined ? data.servingGrams : existing.servingGrams,
        prepTimeMins: data.prepTimeMins !== undefined ? data.prepTimeMins : existing.prepTimeMins,
        cookTimeMins: data.cookTimeMins !== undefined ? data.cookTimeMins : existing.cookTimeMins,
        chefInstructions: data.chefInstructions !== undefined ? data.chefInstructions : existing.chefInstructions,
        calories: data.calories !== undefined ? data.calories : existing.calories,
        proteinGrams: data.proteinGrams !== undefined ? data.proteinGrams : existing.proteinGrams,
        carbsGrams: data.carbsGrams !== undefined ? data.carbsGrams : existing.carbsGrams,
        fatGrams: data.fatGrams !== undefined ? data.fatGrams : existing.fatGrams,
        fiberGrams: data.fiberGrams !== undefined ? data.fiberGrams : existing.fiberGrams,
        dietaryTag: data.dietaryTag !== undefined ? data.dietaryTag : existing.dietaryTag,
        cuisine: data.cuisine !== undefined ? data.cuisine : existing.cuisine,
        flourGrainPreference: data.flourGrainPreference !== undefined ? data.flourGrainPreference : existing.flourGrainPreference,
        spiceLevel: data.spiceLevel !== undefined ? data.spiceLevel : existing.spiceLevel,
        image: data.image !== undefined ? data.image : existing.image,
        prepSteps: data.prepSteps !== undefined ? data.prepSteps : existing.prepSteps,
        isPublished,
      },
    });

    if (data.ingredientsList && Array.isArray(data.ingredientsList)) {
      await prisma.recipeIngredient.deleteMany({ where: { recipeId: id } });

      for (const ing of data.ingredientsList) {
        const normalizedName = ing.name.trim();
        if (!normalizedName) continue;

        const ingredient = await prisma.ingredient.upsert({
          where: { name: normalizedName },
          update: {},
          create: {
            name: normalizedName,
            unit: ing.unit || 'grams',
          },
        });

        await prisma.recipeIngredient.upsert({
          where: {
            recipeId_ingredientId: {
              recipeId: id,
              ingredientId: ingredient.id,
            },
          },
          update: {
            quantity: ing.quantity || 0,
            unit: ing.unit || 'grams',
          },
          create: {
            recipeId: id,
            ingredientId: ingredient.id,
            quantity: ing.quantity || 0,
            unit: ing.unit || 'grams',
          },
        });
      }
    }

    return this.getStaffRecipeById(id, userRoles);
  }

  /**
   * Set Published / Unpublished status
   * - SUPER_ADMIN only
   */
  static async setPublishStatus(id: string, isPublished: boolean, userRoles: string[]) {
    if (!userRoles.includes('SUPER_ADMIN')) {
      throw new AppError('Only Super Admin can publish or unpublish recipes', 403, 'FORBIDDEN');
    }

    const recipe = await prisma.recipe.findUnique({ where: { id } });
    if (!recipe) {
      throw new AppError('Recipe not found', 404, 'NOT_FOUND');
    }

    await prisma.recipe.update({
      where: { id },
      data: { isPublished },
    });

    return this.getStaffRecipeById(id, userRoles);
  }
}

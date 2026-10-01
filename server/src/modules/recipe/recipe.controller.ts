import { Request, Response, NextFunction } from 'express';
import { RecipeService } from './recipe.service.js';

export class RecipeController {
  /**
   * GET /api/v1/recipes
   * Public paginated recipe listing (Published recipes only)
   */
  static async getPublicRecipes(req: Request, res: Response, next: NextFunction) {
    try {
      const options = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
        category: req.query.category as string,
        dietaryTag: (req.query.dietaryTag || req.query.dietary) as string,
        cuisine: req.query.cuisine as string,
        spiceLevel: req.query.spiceLevel as string,
        search: (req.query.search || req.query.q) as string,
        minCalories: req.query.minCalories ? parseInt(req.query.minCalories as string, 10) : undefined,
        maxCalories: req.query.maxCalories ? parseInt(req.query.maxCalories as string, 10) : undefined,
        minProtein: req.query.minProtein ? parseFloat(req.query.minProtein as string) : undefined,
        maxProtein: req.query.maxProtein ? parseFloat(req.query.maxProtein as string) : undefined,
      };

      const result = await RecipeService.getPublicRecipes(options);
      res.json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/recipes/categories
   * Public list of published recipe categories
   */
  static async getCategories(_req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await RecipeService.getCategories();
      res.json({
        success: true,
        data: categories,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/recipes/:id
   * Public single recipe lookup (Published recipes only)
   */
  static async getPublicRecipeById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const recipe = await RecipeService.getPublicRecipeById(id);
      res.json({
        success: true,
        data: recipe,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/recipes/staff/all
   * Staff recipe listing (All status, role-based fields)
   */
  static async getStaffRecipes(req: Request, res: Response, next: NextFunction) {
    try {
      const userRoles = req.user?.roles || [];
      const options = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
        category: req.query.category as string,
        dietaryTag: req.query.dietaryTag as string,
        search: (req.query.search || req.query.q) as string,
        isPublished: req.query.isPublished !== undefined ? req.query.isPublished === 'true' : undefined,
      };

      const result = await RecipeService.getStaffRecipes(options, userRoles);
      res.json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/recipes/staff/:id
   * Staff single recipe lookup
   */
  static async getStaffRecipeById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userRoles = req.user?.roles || [];
      const recipe = await RecipeService.getStaffRecipeById(id, userRoles);
      res.json({
        success: true,
        data: recipe,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/recipes
   * Create recipe (CHEF -> Draft, SUPER_ADMIN -> Published or Draft)
   */
  static async createRecipe(req: Request, res: Response, next: NextFunction) {
    try {
      const userRoles = req.user?.roles || [];
      const recipe = await RecipeService.createRecipe(req.body, userRoles);
      res.status(201).json({
        success: true,
        message: 'Recipe created successfully',
        data: recipe,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/v1/recipes/:id
   * Edit recipe (CHEF -> permitted edit, cannot publish; SUPER_ADMIN -> full edit & publish)
   */
  static async updateRecipe(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userRoles = req.user?.roles || [];
      const recipe = await RecipeService.updateRecipe(id, req.body, userRoles);
      res.json({
        success: true,
        message: 'Recipe updated successfully',
        data: recipe,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/recipes/:id/publish
   * Publish / Unpublish recipe (SUPER_ADMIN only)
   */
  static async setPublishStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { isPublished } = req.body;
      const userRoles = req.user?.roles || [];
      const recipe = await RecipeService.setPublishStatus(id, isPublished, userRoles);
      res.json({
        success: true,
        message: `Recipe ${isPublished ? 'published' : 'unpublished'} successfully`,
        data: recipe,
      });
    } catch (err) {
      next(err);
    }
  }
}

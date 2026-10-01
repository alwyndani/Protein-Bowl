import { Router } from 'express';
import { RecipeController } from './recipe.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validate.middleware.js';
import { getRecipesQuerySchema, createRecipeSchema, updateRecipeSchema } from './recipe.validator.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

// --- PUBLIC / CUSTOMER ENDPOINTS ---
router.get(
  '/',
  validateQuery(getRecipesQuerySchema),
  RecipeController.getPublicRecipes
);

router.get(
  '/categories',
  RecipeController.getCategories
);

// Note: Staff sub-route must come before /:id parameter route to avoid route conflict
router.get(
  '/staff/all',
  authenticateToken,
  requireRole([RoleEnum.CHEF, RoleEnum.SUPER_ADMIN, RoleEnum.NUTRITIONIST]),
  validateQuery(getRecipesQuerySchema),
  RecipeController.getStaffRecipes
);

router.get(
  '/staff/:id',
  authenticateToken,
  requireRole([RoleEnum.CHEF, RoleEnum.SUPER_ADMIN, RoleEnum.NUTRITIONIST]),
  RecipeController.getStaffRecipeById
);

router.get(
  '/:id',
  RecipeController.getPublicRecipeById
);

// --- STAFF MUTATION ENDPOINTS ---
router.post(
  '/',
  authenticateToken,
  requireRole([RoleEnum.CHEF, RoleEnum.SUPER_ADMIN]),
  validateBody(createRecipeSchema),
  RecipeController.createRecipe
);

router.put(
  '/:id',
  authenticateToken,
  requireRole([RoleEnum.CHEF, RoleEnum.SUPER_ADMIN]),
  validateBody(updateRecipeSchema),
  RecipeController.updateRecipe
);

router.patch(
  '/:id/publish',
  authenticateToken,
  requireRole([RoleEnum.SUPER_ADMIN]),
  RecipeController.setPublishStatus
);

export default router;

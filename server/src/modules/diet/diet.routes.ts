import { Router } from 'express';
import { DietController } from './diet.controller.js';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import {
  createDietRequestSchema,
  createDietPlanSchema,
  approvePlanSchema,
  requestRevisionSchema
} from './diet.validator.js';
import { RoleEnum } from '@prisma/client';

const router = Router();

// --- CUSTOMER ROUTES ---
router.post(
  '/requests',
  authenticateToken,
  validateBody(createDietRequestSchema),
  DietController.createRequest
);

router.get(
  '/my-requests',
  authenticateToken,
  DietController.getMyRequests
);

router.get(
  '/my-plans',
  authenticateToken,
  DietController.getMyDietPlans
);

router.post(
  '/plans/:planId/approve',
  authenticateToken,
  validateBody(approvePlanSchema),
  DietController.approvePlan
);

router.post(
  '/plans/:planId/request-revision',
  authenticateToken,
  validateBody(requestRevisionSchema),
  DietController.requestRevision
);

// --- NUTRITIONIST WORKSTATION ROUTES ---
// Least privilege: Restricted to NUTRITIONIST and SUPER_ADMIN. Executive MD role excluded from routine clinical endpoints.

router.get(
  '/nutritionist/unassigned-queue',
  authenticateToken,
  requireRole([RoleEnum.NUTRITIONIST, RoleEnum.SUPER_ADMIN]),
  DietController.getUnassignedQueue
);

router.get(
  '/nutritionist/my-claimed-queue',
  authenticateToken,
  requireRole([RoleEnum.NUTRITIONIST, RoleEnum.SUPER_ADMIN]),
  DietController.getClaimedQueue
);

router.post(
  '/requests/:requestId/claim',
  authenticateToken,
  requireRole([RoleEnum.NUTRITIONIST, RoleEnum.SUPER_ADMIN]),
  DietController.claimRequest
);

router.get(
  '/requests/:requestId/health-profile',
  authenticateToken,
  requireRole([RoleEnum.NUTRITIONIST, RoleEnum.SUPER_ADMIN]),
  DietController.getAuthorizedHealthProfile
);

router.post(
  '/plans',
  authenticateToken,
  requireRole([RoleEnum.NUTRITIONIST, RoleEnum.SUPER_ADMIN]),
  validateBody(createDietPlanSchema),
  DietController.createDietPlan
);

export default router;

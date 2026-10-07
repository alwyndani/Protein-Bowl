import { Router } from 'express';
import { DietController } from './diet.controller.js';
import { authenticateToken, requireRole, requireCustomerRole } from '../../middleware/auth.middleware.js';
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
// Literal CUSTOMER role required (no staff/SUPER_ADMIN bypass); identity derives from the JWT.
router.post(
  '/requests',
  authenticateToken,
  requireCustomerRole,
  validateBody(createDietRequestSchema),
  DietController.createRequest
);

router.get(
  '/my-requests',
  authenticateToken,
  requireCustomerRole,
  DietController.getMyRequests
);

router.get(
  '/my-plans',
  authenticateToken,
  requireCustomerRole,
  DietController.getMyDietPlans
);

router.post(
  '/plans/:planId/approve',
  authenticateToken,
  requireCustomerRole,
  validateBody(approvePlanSchema),
  DietController.approvePlan
);

router.post(
  '/plans/:planId/request-revision',
  authenticateToken,
  requireCustomerRole,
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

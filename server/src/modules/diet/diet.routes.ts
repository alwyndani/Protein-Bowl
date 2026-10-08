import { Router } from 'express';
import { DietController } from './diet.controller.js';
import { authenticateToken, requireCustomerRole, requireExactRoles } from '../../middleware/auth.middleware.js';
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
// Least privilege (decision D4): clinical routes are NUTRITIONIST-only. SUPER_ADMIN and MD have no access to the
// nutritionist workstation or to customer health data (no bypass; claiming a request as admin is not possible either).

router.get(
  '/nutritionist/unassigned-queue',
  authenticateToken,
  requireExactRoles([RoleEnum.NUTRITIONIST]),
  DietController.getUnassignedQueue
);

router.get(
  '/nutritionist/my-claimed-queue',
  authenticateToken,
  requireExactRoles([RoleEnum.NUTRITIONIST]),
  DietController.getClaimedQueue
);

router.post(
  '/requests/:requestId/claim',
  authenticateToken,
  requireExactRoles([RoleEnum.NUTRITIONIST]),
  DietController.claimRequest
);

router.get(
  '/requests/:requestId/health-profile',
  authenticateToken,
  requireExactRoles([RoleEnum.NUTRITIONIST]),
  DietController.getAuthorizedHealthProfile
);

router.post(
  '/plans',
  authenticateToken,
  requireExactRoles([RoleEnum.NUTRITIONIST]),
  validateBody(createDietPlanSchema),
  DietController.createDietPlan
);

export default router;

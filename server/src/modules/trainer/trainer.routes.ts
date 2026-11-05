import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { RoleEnum } from '@prisma/client';
import { authenticateToken, requireCustomerRole, requireExactRoles, requirePermission } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { TrainerService } from './trainer.service.js';

const router = Router();

const uuid = z.string().uuid();
const clean = (max: number) => z.string().trim().min(1).max(max);

const exerciseSchema = z.object({
  name: clean(120),
  sets: z.number().int().min(1).max(20),
  reps: clean(40),
  restSeconds: z.number().int().min(0).max(1800).default(60),
  notes: z.string().trim().max(500).nullish(),
  videoUrl: z.string().trim().url().max(500).refine((u) => u.startsWith('https://'), 'https only').nullish()
}).strict();

const planSchema = z.object({
  title: clean(120),
  goal: clean(200),
  durationWeeks: z.number().int().min(1).max(52),
  notes: z.string().trim().max(1000).nullish(),
  days: z.array(z.object({
    dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    title: clean(120),
    focusArea: clean(120),
    exercises: z.array(exerciseSchema).min(1).max(30)
  }).strict()).min(1).max(7)
}).strict();

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']) }).strict();
const logSchema = z.object({
  workoutDayId: uuid.optional(),
  completed: z.boolean().default(true),
  perceivedEffort: z.number().int().min(1).max(10).optional(),
  bodyWeightKg: z.number().min(20).max(500).optional(),
  notes: z.string().trim().max(500).optional()
}).strict();
const assignSchema = z.object({ trainerUserId: uuid, customerEmail: z.string().trim().email().max(254) }).strict();
const idParam = z.object({ id: uuid });
const clientParam = z.object({ customerProfileId: uuid });

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next: NextFunction) => { fn(req, res).catch(next); };

const trainerOnly = [authenticateToken, requireExactRoles([RoleEnum.TRAINER]), requirePermission('trainer:write')];
const uid = (req: Request) => req.user!.userId;

// ---- Trainer ----
router.get('/clients', ...trainerOnly, h(async (req, res) => ApiResponse.success(res, await TrainerService.listClients(uid(req)), 'Clients retrieved')));
router.get('/clients/:customerProfileId/plans', ...trainerOnly, validateParams(clientParam),
  h(async (req, res) => ApiResponse.success(res, await TrainerService.listPlansForClient(uid(req), req.params.customerProfileId), 'Plans retrieved')));
router.post('/clients/:customerProfileId/plans', ...trainerOnly, validateParams(clientParam), validateBody(planSchema),
  h(async (req, res) => ApiResponse.success(res, await TrainerService.createPlan(uid(req), req.params.customerProfileId, req.body), 'Plan created', 201)));
router.put('/plans/:id', ...trainerOnly, validateParams(idParam), validateBody(planSchema),
  h(async (req, res) => ApiResponse.success(res, await TrainerService.updatePlan(uid(req), req.params.id, req.body), 'Plan updated')));
router.post('/plans/:id/status', ...trainerOnly, validateParams(idParam), validateBody(statusSchema),
  h(async (req, res) => ApiResponse.success(res, await TrainerService.setPlanStatus(uid(req), req.params.id, req.body.status), 'Plan status updated')));
router.get('/plans/:id/logs', ...trainerOnly, validateParams(idParam),
  h(async (req, res) => ApiResponse.success(res, await TrainerService.logsForTrainer(uid(req), req.params.id), 'Progress retrieved')));

// ---- SUPER_ADMIN: coaching assignments ----
const adminOnly = [authenticateToken, requirePermission('trainer:assign')];
router.get('/admin/assignments', ...adminOnly, h(async (_req, res) => ApiResponse.success(res, await TrainerService.listAssignments(), 'Assignments retrieved')));
router.post('/admin/assignments', ...adminOnly, validateBody(assignSchema),
  h(async (req, res) => ApiResponse.success(res, await TrainerService.assign(uid(req), req.body.trainerUserId, req.body.customerEmail), 'Trainer assigned', 201)));
router.post('/admin/assignments/:id/end', ...adminOnly, validateParams(idParam),
  h(async (req, res) => ApiResponse.success(res, await TrainerService.endAssignment(uid(req), req.params.id), 'Assignment ended')));

// ---- Customer: own plans and progress (literal CUSTOMER role) ----
const customerOnly = [authenticateToken, requireCustomerRole];
router.get('/my/plans', ...customerOnly, h(async (req, res) => ApiResponse.success(res, await TrainerService.myPlans(uid(req)), 'Plans retrieved')));
router.get('/my/plans/:id/logs', ...customerOnly, validateParams(idParam),
  h(async (req, res) => ApiResponse.success(res, await TrainerService.myLogs(uid(req), req.params.id), 'Progress retrieved')));
router.post('/my/plans/:id/logs', ...customerOnly, validateParams(idParam), validateBody(logSchema),
  h(async (req, res) => ApiResponse.success(res, await TrainerService.logProgress(uid(req), req.params.id, req.body), 'Progress logged', 201)));

export default router;

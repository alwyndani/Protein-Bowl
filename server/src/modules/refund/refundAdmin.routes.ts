import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';
import { financialAdminRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { AppError } from '../../middleware/error.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';
import { requireStepUp } from '../admin/stepUp.service.js';
import { PaymentReconciliationService } from '../payment/paymentReconciliation.service.js';
import { CancellationService } from './cancellation.service.js';
import { adminCancelBodySchema, refundApprovalBodySchema } from './cancellationPolicy.js';
import { RefundService } from './refund.service.js';
import { REFUND_STATUS, REFUND_TRIGGER } from './refundStatus.js';

/**
 * SUPER_ADMIN financial actions + read-only refund visibility (MD reads). There is NO mark-refunded, NO amount, NO reconcile
 * trigger and NO retry endpoint here: provider evidence is the only way a refund becomes PROCESSED, and recovery is CLI-only.
 * Every mutation needs 'refunds:write' AND a fresh password step-up proof.
 */
const router = Router();

const orderParams = z.object({ orderId: z.string().min(1).max(64) });
const idParams = z.object({ id: z.string().min(1).max(64) });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(Object.values(REFUND_STATUS) as [string, ...string[]]).optional(),
  trigger: z.enum(Object.values(REFUND_TRIGGER) as [string, ...string[]]).optional(),
  reviewOnly: z.enum(['true', 'false']).default('false')
});

const SELECT = {
  id: true,
  trigger: true,
  status: true,
  providerStatus: true,
  amount: true,
  currency: true,
  reasonCode: true,
  reasonNote: true,
  requestedByKind: true,
  requestedByUserId: true,
  failureCode: true,
  reviewFlag: true,
  attemptCount: true,
  submittedAt: true,
  processedAt: true,
  createdAt: true,
  updatedAt: true,
  providerRefundId: true,
  order: { select: { id: true, orderNumber: true, status: true, paymentStatus: true } },
  providerPayment: { select: { id: true, providerPaymentId: true, reconciliationStatus: true, providerStatus: true } }
} as const;

router.post('/orders/:orderId/cancel', authenticateToken, requirePermission('refunds:write'), financialAdminRateLimiter, requireStepUp('order.cancel'), validateParams(orderParams), validateBody(adminCancelBodySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await CancellationService.adminCancel({ userId: req.user!.userId, roles: req.user!.roles }, req.params.orderId, req.body, AuditService.contextFromRequest(req));
    return ApiResponse.success(res, data, data.alreadyCancelled ? 'Order was already cancelled' : 'Order cancelled', 200);
  } catch (err) {
    next(err);
  }
});

router.post('/provider-payments/:id/refund', authenticateToken, requirePermission('refunds:write'), financialAdminRateLimiter, requireStepUp('refund.approve'), validateParams(idParams), validateBody(refundApprovalBodySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refund, created } = await RefundService.approveForLedger(req.params.id, { userId: req.user!.userId, roles: req.user!.roles }, req.body.note, AuditService.contextFromRequest(req));
    const row = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id }, select: SELECT });
    return ApiResponse.success(res, row, created ? 'Refund approved' : 'A refund for this payment already exists', created ? 201 : 200);
  } catch (err) {
    next(err);
  }
});

router.get('/refunds', authenticateToken, requirePermission('refunds:read'), validateQuery(listQuery), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.trigger ? { trigger: q.trigger } : {}),
      ...(q.reviewOnly === 'true' ? { OR: [{ status: { in: [REFUND_STATUS.REVIEW, REFUND_STATUS.UNKNOWN] } }, { reviewFlag: { not: null } }] } : {})
    };
    const [total, rows, review] = await Promise.all([
      prisma.refund.count({ where }),
      prisma.refund.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: SELECT }),
      PaymentReconciliationService.reviewReport()
    ]);
    return ApiResponse.success(res, { items: rows, page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), review }, 'Refunds retrieved');
  } catch (err) {
    next(err);
  }
});

router.get('/refunds/:id', authenticateToken, requirePermission('refunds:read'), validateParams(idParams), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await prisma.refund.findUnique({ where: { id: req.params.id }, select: SELECT });
    if (!row) throw new AppError('Refund not found', 404, 'REFUND_NOT_FOUND');
    return ApiResponse.success(res, row, 'Refund retrieved');
  } catch (err) {
    next(err);
  }
});

export default router;

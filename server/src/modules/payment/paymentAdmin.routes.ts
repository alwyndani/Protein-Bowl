import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';
import { validateQuery } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { prisma } from '../../config/database.js';
import { FLAGGED_RECON } from './paymentStatus.js';
import { PaymentReconciliationService } from './paymentReconciliation.service.js';

/**
 * READ-ONLY operational payment view (GET /api/v1/admin/payments). 'payments:read' = SUPER_ADMIN + MD.
 * There is no mutation here: no mark-paid, no refund, no reconcile trigger. Responses contain ids, statuses and amounts only.
 */
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['CREATED', 'PENDING', 'UNKNOWN', 'SUCCESS', 'EXPIRED', 'FAILED', 'ABANDONED']).optional(),
  reviewOnly: z.enum(['true', 'false']).default('false')
});

const router = Router();

router.get('/payments', authenticateToken, requirePermission('payments:read'), validateQuery(querySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as unknown as z.infer<typeof querySchema>;
    const where = {
      provider: { not: null },
      ...(q.status ? { status: q.status } : {}),
      ...(q.reviewOnly === 'true' ? { OR: [{ reviewFlag: { not: null } }, { providerPayments: { some: { reconciliationStatus: { in: [...FLAGGED_RECON] } } } }] } : {})
    };
    const [total, rows, report] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          provider: true,
          providerOrderId: true,
          status: true,
          amount: true,
          currency: true,
          reviewFlag: true,
          lastError: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          order: { select: { id: true, orderNumber: true, status: true, paymentStatus: true } },
          providerPayments: { select: { providerPaymentId: true, providerStatus: true, reconciliationStatus: true, amount: true, currency: true, method: true, createdAt: true } }
        }
      }),
      PaymentReconciliationService.reviewReport()
    ]);
    return ApiResponse.success(res, { items: rows, page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), review: report }, 'Payments retrieved');
  } catch (err) {
    next(err);
  }
});

export default router;

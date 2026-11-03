import { NextFunction, Request, Response } from 'express';
import { RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../middleware/error.middleware.js';
import { DeliveryService } from './delivery.service.js';

export class DeliveryController {
  /** SUPER_ADMIN read-only monitor of ONE explicit branch. */
  public static async getMonitor(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = typeof req.query.branchId === 'string' && req.query.branchId ? req.query.branchId : undefined;
      if (!branchId) throw new AppError('A branchId is required to read the delivery monitor', 400, 'BRANCH_REQUIRED');
      const branch = await prisma.kitchenBranch.findUnique({ where: { id: branchId }, select: { id: true, code: true, name: true } });
      if (!branch) throw new AppError('Branch not found', 404, 'BRANCH_NOT_FOUND');
      const monitor = await DeliveryService.getMonitor(branchId);
      return ApiResponse.success(res, { ...monitor, branch, readOnly: !req.user!.roles.includes(RoleEnum.SUPER_ADMIN) }, 'Delivery monitor retrieved');
    } catch (err) {
      next(err);
    }
  }
}

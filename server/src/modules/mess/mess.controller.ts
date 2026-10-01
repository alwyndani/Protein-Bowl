import { Request, Response, NextFunction } from 'express';
import { MessService } from './mess.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class MessController {
  public static async getPlans(_req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await MessService.getMessPlans();
      return ApiResponse.success(res, plans, 'Mess subscription plans retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async getAccount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const customerProfile = await prisma.customerProfile.findUnique({
        where: { userId: req.user.userId }
      });
      if (!customerProfile) return ApiResponse.error(res, 'Customer profile not found', 4404);

      const messAccount = await MessService.getMessAccount(customerProfile.id);
      return ApiResponse.success(res, messAccount, 'Mess account details retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async registerAccount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const customerProfile = await prisma.customerProfile.findUnique({
        where: { userId: req.user.userId }
      });
      if (!customerProfile) return ApiResponse.error(res, 'Customer profile not found', 404);

      const account = await MessService.registerMessAccount({
        customerProfileId: customerProfile.id,
        studentIdCard: req.body.studentIdCard,
        collegeHostelName: req.body.collegeHostelName,
        roomNumber: req.body.roomNumber
      });

      return ApiResponse.success(res, account, 'Mess account registered successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  public static async pauseMeal(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const customerProfile = await prisma.customerProfile.findUnique({
        where: { userId: req.user.userId }
      });
      if (!customerProfile) return ApiResponse.error(res, 'Customer profile not found', 404);

      const result = await MessService.pauseMeal({
        customerProfileId: customerProfile.id,
        subscriptionId: req.body.subscriptionId,
        pauseDate: req.body.pauseDate,
        slot: req.body.slot
      });

      return ApiResponse.success(res, result, 'Meal paused successfully and wallet credited!');
    } catch (err) {
      next(err);
    }
  }

  public static async verifyGatePass(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.body;
      const result = await MessService.verifyGatePass(code);
      return ApiResponse.success(res, result, 'Gate Pass verified and meal marked consumed!');
    } catch (err) {
      next(err);
    }
  }
}

import { Request, Response, NextFunction } from 'express';
import { DietService } from './diet.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';

export class DietController {
  // --- CUSTOMER ENDPOINTS ---

  public static async createRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const request = await DietService.createRequest(userId, req.body);
      return ApiResponse.success(res, request, 'Diet plan request submitted successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  public static async getMyRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const requests = await DietService.getCustomerRequests(userId);
      return ApiResponse.success(res, requests, 'My diet requests retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async getMyDietPlans(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const plans = await DietService.getCustomerDietPlans(userId);
      return ApiResponse.success(res, plans, 'My diet plans retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async approvePlan(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const { planId } = req.params;
      const approvedPlan = await DietService.approvePlan(userId, planId, req.body.customerFeedback);
      return ApiResponse.success(res, approvedPlan, 'Diet plan approved successfully');
    } catch (err) {
      next(err);
    }
  }

  public static async requestRevision(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const { planId } = req.params;
      const { revisionNotes } = req.body;

      const revisedPlan = await DietService.requestRevision(userId, planId, revisionNotes);
      return ApiResponse.success(res, revisedPlan, 'Diet plan revision requested successfully');
    } catch (err) {
      next(err);
    }
  }

  // --- NUTRITIONIST ENDPOINTS ---

  public static async getUnassignedQueue(_req: Request, res: Response, next: NextFunction) {
    try {
      const queue = await DietService.getUnassignedQueue();
      return ApiResponse.success(res, queue, 'Unassigned diet requests queue retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async getClaimedQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const queue = await DietService.getClaimedQueue(userId);
      return ApiResponse.success(res, queue, 'My claimed diet requests queue retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async claimRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const { requestId } = req.params;
      const claimedReq = await DietService.claimRequest(requestId, userId);
      return ApiResponse.success(res, claimedReq, 'Diet plan request claimed successfully');
    } catch (err) {
      next(err);
    }
  }

  public static async getAuthorizedHealthProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      const roles = req.user?.roles || [];
      if (!userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const { requestId } = req.params;
      const healthProfile = await DietService.getAuthorizedHealthProfile(requestId, userId, roles as string[], AuditService.contextFromRequest(req));
      return ApiResponse.success(res, healthProfile, 'Patient health profile retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  public static async createDietPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) return ApiResponse.error(res, 'Unauthorized', 401);

      const plan = await DietService.createOrPublishDietPlan(userId, req.body);
      return ApiResponse.success(res, plan, 'Diet plan created and published successfully', 201);
    } catch (err) {
      next(err);
    }
  }
}

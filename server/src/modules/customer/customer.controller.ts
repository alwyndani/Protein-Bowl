import { Request, Response, NextFunction } from 'express';
import { CustomerService } from './customer.service.js';
import { updateCustomerProfileSchema } from './customer.validator.js';
import { ApiResponse } from '../../utils/apiResponse.js';

const customerService = new CustomerService();

export class CustomerController {
  /**
   * GET /api/v1/customers/me/profile
   * Returns authenticated customer's profile & health biometrics
   */
  async getMyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return ApiResponse.error(res, 'Authentication required', 401, 'UNAUTHORIZED');
      }

      const profile = await customerService.getCustomerProfile(userId);
      return ApiResponse.success(res, profile, 'Customer profile retrieved successfully', 200);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/customers/me/profile
   * Updates authenticated customer's profile & health biometrics
   */
  async updateMyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return ApiResponse.error(res, 'Authentication required', 401, 'UNAUTHORIZED');
      }

      const validatedData = updateCustomerProfileSchema.parse(req.body);
      const updatedProfile = await customerService.updateCustomerProfile(userId, validatedData);
      return ApiResponse.success(res, updatedProfile, 'Customer profile updated successfully', 200);
    } catch (error: any) {
      next(error);
    }
  }
}

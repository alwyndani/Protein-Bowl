import { Request, Response, NextFunction } from 'express';
import { CustomerService } from './customer.service.js';
import { updateCustomerProfileSchema, createAddressSchema, updateAddressSchema } from './customer.validator.js';
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

  /**
   * GET /api/v1/customers/me/addresses
   */
  async getAddresses(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return ApiResponse.error(res, 'Authentication required', 401, 'UNAUTHORIZED');
      }

      const addresses = await customerService.getCustomerAddresses(userId);
      return ApiResponse.success(res, addresses, 'Customer addresses retrieved successfully', 200);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * POST /api/v1/customers/me/addresses
   */
  async createAddress(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return ApiResponse.error(res, 'Authentication required', 401, 'UNAUTHORIZED');
      }

      const validatedData = createAddressSchema.parse(req.body);
      const address = await customerService.createCustomerAddress(userId, validatedData);
      return ApiResponse.success(res, address, 'Customer address created successfully', 201);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/customers/me/addresses/:addressId
   */
  async updateAddress(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return ApiResponse.error(res, 'Authentication required', 401, 'UNAUTHORIZED');
      }

      const { addressId } = req.params;
      const validatedData = updateAddressSchema.parse(req.body);
      const address = await customerService.updateCustomerAddress(userId, addressId, validatedData);
      return ApiResponse.success(res, address, 'Customer address updated successfully', 200);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/customers/me/addresses/:addressId
   */
  async deleteAddress(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return ApiResponse.error(res, 'Authentication required', 401, 'UNAUTHORIZED');
      }

      const { addressId } = req.params;
      const result = await customerService.deleteCustomerAddress(userId, addressId);
      return ApiResponse.success(res, result, 'Customer address deleted successfully', 200);
    } catch (error: any) {
      next(error);
    }
  }
}


import { Request, Response, NextFunction } from 'express';
import { OrderService } from './order.service.js';
import { checkoutPreviewSchema, createOrderSchema } from './order.validator.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class OrderController {
  /**
   * POST /api/v1/checkout/preview
   */
  public static async checkoutPreview(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return ApiResponse.error(res, 'Authentication required', 401, 'UNAUTHORIZED');
      }

      const validatedData = checkoutPreviewSchema.parse(req.body);
      const preview = await OrderService.checkoutPreview(userId, validatedData.addressId);
      return ApiResponse.success(res, preview, 'Checkout preview calculated successfully', 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/orders
   */
  public static async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return ApiResponse.error(res, 'Authentication required', 401, 'UNAUTHORIZED');
      }

      const validatedData = createOrderSchema.parse(req.body);
      const idempotencyKey = (req.headers['x-idempotency-key'] as string) || 
                             validatedData.idempotencyKey || 
                             `IK-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const order = await OrderService.createOrder(userId, idempotencyKey, validatedData);
      return ApiResponse.success(res, order, 'Order created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/orders/my-orders
   */
  public static async getCustomerOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return ApiResponse.error(res, 'Authentication required', 401, 'UNAUTHORIZED');
      }

      const orders = await OrderService.getCustomerOrders(userId);
      return ApiResponse.success(res, orders, 'Customer orders retrieved successfully', 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/orders/:orderId
   */
  public static async getOrderById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return ApiResponse.error(res, 'Authentication required', 401, 'UNAUTHORIZED');
      }

      const { orderId } = req.params;
      const order = await OrderService.getOrderById(userId, orderId);
      return ApiResponse.success(res, order, 'Order details retrieved successfully', 200);
    } catch (err) {
      next(err);
    }
  }
}

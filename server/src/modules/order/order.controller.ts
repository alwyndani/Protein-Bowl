import { Request, Response, NextFunction } from 'express';
import { OrderService } from './order.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class OrderController {
  public static async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      let customerProfileId: string | undefined;

      if (req.user?.userId) {
        const customerProfile = await prisma.customerProfile.findUnique({
          where: { userId: req.user.userId }
        });
        customerProfileId = customerProfile?.id;
      }

      const order = await OrderService.createOrder({
        customerProfileId,
        items: req.body.items,
        deliveryAddress: req.body.deliveryAddress,
        paymentMethod: req.body.paymentMethod || 'UPI',
        isGuest: req.body.isGuest,
        guestEmail: req.body.guestEmail,
        guestPhone: req.body.guestPhone,
        branchId: req.body.branchId
      });

      return ApiResponse.success(res, order, 'Order created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  public static async getCustomerOrders(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return ApiResponse.error(res, 'Authentication required', 401);
      }

      const customerProfile = await prisma.customerProfile.findUnique({
        where: { userId: req.user.userId }
      });

      if (!customerProfile) {
        return ApiResponse.success(res, [], 'No profile found');
      }

      const orders = await OrderService.getCustomerOrders(customerProfile.id);
      return ApiResponse.success(res, orders, 'Customer orders retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async getOrderByNumber(req: Request, res: Response, next: NextFunction) {
    try {
      const { orderNumber } = req.params;
      const order = await OrderService.getOrderByNumber(orderNumber);
      if (!order) {
        return ApiResponse.error(res, 'Order not found', 404);
      }
      return ApiResponse.success(res, order, 'Order details retrieved');
    } catch (err) {
      next(err);
    }
  }

  public static async updateOrderStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { orderId } = req.params;
      const { status } = req.body;
      const updatedOrder = await OrderService.updateOrderStatus(orderId, status);
      return ApiResponse.success(res, updatedOrder, 'Order status updated');
    } catch (err) {
      next(err);
    }
  }
}

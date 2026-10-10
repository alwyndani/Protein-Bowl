import { Request, Response, NextFunction } from 'express';
import { CartService } from './cart.service.js';
import { addCartItemSchema, updateCartItemSchema } from './cart.validator.js';

export class CartController {
  /**
   * GET /api/v1/cart
   */
  static async getCart(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const cart = await CartService.getCustomerCart(userId);
      res.json({
        success: true,
        data: cart,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/cart/items
   */
  static async addItem(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const validatedData = addCartItemSchema.parse(req.body);
      const cart = await CartService.addItemToCart(userId, validatedData as { productId: string; variantId?: string | null; quantity?: unknown });
      res.status(201).json({
        success: true,
        message: 'Item added to cart',
        data: cart,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/cart/items/:itemId
   */
  static async updateQuantity(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { itemId } = req.params;
      const { quantity } = updateCartItemSchema.parse(req.body);
      const cart = await CartService.updateCartItemQuantity(userId, itemId, quantity);
      res.json({
        success: true,
        message: 'Cart item quantity updated',
        data: cart,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/cart/items/:itemId
   */
  static async removeItem(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { itemId } = req.params;
      const cart = await CartService.removeCartItem(userId, itemId);
      res.json({
        success: true,
        message: 'Item removed from cart',
        data: cart,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/cart
   */
  static async clearCart(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const cart = await CartService.clearCart(userId);
      res.json({
        success: true,
        message: 'Cart cleared',
        data: cart,
      });
    } catch (err) {
      next(err);
    }
  }
}

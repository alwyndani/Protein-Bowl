import { Request, Response, NextFunction } from 'express';
import { ProductService } from './product.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class ProductController {
  public static async getCategories(_req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await ProductService.getCategories();
      return ApiResponse.success(res, categories, 'Categories retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  public static async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const { categoryId, isFMCG, isTepache } = req.query;
      const products = await ProductService.getProducts(
        categoryId as string,
        isFMCG === 'true' ? true : isFMCG === 'false' ? false : undefined,
        isTepache === 'true' ? true : isTepache === 'false' ? false : undefined
      );
      return ApiResponse.success(res, products, 'Products retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  public static async getProductBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params;
      const product = await ProductService.getProductBySlug(slug);
      if (!product) {
        return ApiResponse.error(res, 'Product not found', 404);
      }
      return ApiResponse.success(res, product, 'Product details retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
}

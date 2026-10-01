import { Request, Response, NextFunction } from 'express';
import { CMSService } from './cms.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export class CMSController {
  public static async getBanners(_req: Request, res: Response, next: NextFunction) {
    try {
      const banners = await CMSService.getBanners();
      return ApiResponse.success(res, banners, 'CMS Banners retrieved');
    } catch (err) { next(err); }
  }

  public static async getMedia(_req: Request, res: Response, next: NextFunction) {
    try {
      const media = await CMSService.getMedia();
      return ApiResponse.success(res, media, 'CMS Media retrieved');
    } catch (err) { next(err); }
  }

  public static async createBanner(req: Request, res: Response, next: NextFunction) {
    try {
      const banner = await CMSService.createBanner(req.body);
      return ApiResponse.success(res, banner, 'CMS Banner created', 201);
    } catch (err) { next(err); }
  }
}

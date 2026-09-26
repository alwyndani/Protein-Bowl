import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { env } from '../../config/env.js';

const REFRESH_COOKIE_NAME = 'pb_refresh_token';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

const clearCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const
};

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.register(req.body);
      res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, cookieOptions);

      return ApiResponse.success(
        res,
        { user: result.user, accessToken: result.accessToken },
        'Account registered successfully',
        201
      );
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.login(req.body);
      res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, cookieOptions);

      return ApiResponse.success(
        res,
        { user: result.user, accessToken: result.accessToken },
        'Login successful'
      );
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const rawRefreshToken = req.cookies[REFRESH_COOKIE_NAME] || req.body.refreshToken;
      const result = await AuthService.rotateRefreshToken(rawRefreshToken);
      res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, cookieOptions);

      return ApiResponse.success(
        res,
        { accessToken: result.accessToken },
        'Access token refreshed successfully'
      );
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions);
      next(error);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const rawRefreshToken = req.cookies[REFRESH_COOKIE_NAME];
      await AuthService.logout(rawRefreshToken);
      res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions);

      return ApiResponse.success(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const user = await AuthService.getMe(userId);

      return ApiResponse.success(res, { user }, 'User profile retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async testRbac(req: Request, res: Response) {
    return ApiResponse.success(
      res,
      {
        userId: req.user?.userId,
        roles: req.user?.roles,
        message: 'RBAC verification successful! You have privileged access.'
      },
      'Privilege check passed'
    );
  }
}

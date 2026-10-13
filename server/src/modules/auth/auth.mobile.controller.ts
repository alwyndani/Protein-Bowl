import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuditService } from '../audit/audit.service.js';
import type { MobileClientInfo } from '../../middleware/mobileClient.middleware.js';

/**
 * P11A customer-mobile auth transport. TRANSPORT ONLY: the same AuthService (identity, password policy, RefreshToken table, rotation,
 * reuse detection, revocation, account-disable behaviour) as the web; the only differences are that the refresh token travels in the
 * JSON body instead of an HttpOnly cookie and that only pure CUSTOMER accounts get a session. No cookie is set, read or cleared here.
 */
const clientOf = (req: Request) => (req as Request & { mobileClient?: MobileClientInfo }).mobileClient;

function sessionBody(result: { accessToken: string; rawRefreshToken: string; refreshTokenExpiresAt: Date }, user?: unknown) {
  return {
    ...(user ? { user } : {}),
    accessToken: result.accessToken,
    refreshToken: result.rawRefreshToken,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt.toISOString()
  };
}

function audit(req: Request, action: string, userId: string | null) {
  const c = clientOf(req);
  return AuditService.recordSafe({
    actor: userId ? { userId, roles: ['CUSTOMER'] } : null,
    action,
    entity: 'User',
    entityId: userId,
    payload: { clientVersion: c?.version, platform: c?.platform },
    context: AuditService.contextFromRequest(req)
  });
}

export class MobileAuthController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.register(req.body);
      await audit(req, 'MOBILE_AUTH_REGISTER', result.user.id);
      return ApiResponse.success(res, sessionBody(result, result.user), 'Account registered successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.login(req.body, { customerOnly: true, context: AuditService.contextFromRequest(req) });
      await audit(req, 'MOBILE_AUTH_LOGIN', result.user.id);
      return ApiResponse.success(res, sessionBody(result, result.user), 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.rotateRefreshToken(req.body.refreshToken, AuditService.contextFromRequest(req), { customerOnly: true });
      await audit(req, 'MOBILE_AUTH_REFRESH', null);
      return ApiResponse.success(res, sessionBody(result), 'Session refreshed successfully');
    } catch (error) {
      next(error);
    }
  }

  /** Idempotent: unknown, already-revoked and foreign tokens all answer the same success, so nothing about other sessions is revealed. */
  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      await AuthService.logout(req.body.refreshToken);
      await audit(req, 'MOBILE_AUTH_LOGOUT', null);
      return ApiResponse.success(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  }
}

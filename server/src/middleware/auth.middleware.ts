import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtAccessTokenPayload } from '../utils/jwt.js';
import { AppError } from './error.middleware.js';
import { RoleEnum } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: JwtAccessTokenPayload;
    }
  }
}

export function authenticateToken(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Missing Bearer token', 401, 'UNAUTHORIZED'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decodedPayload = verifyAccessToken(token);
    req.user = decodedPayload;
    next();
  } catch (_err) {
    return next(new AppError('Invalid or expired access token', 401, 'INVALID_TOKEN'));
  }
}

export function requireRole(allowedRoles: RoleEnum[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    const userRoles = req.user.roles || [];
    const hasPermission = allowedRoles.some(role => userRoles.includes(role) || userRoles.includes('SUPER_ADMIN'));

    if (!hasPermission) {
      return next(new AppError('Access denied. Insufficient permissions for this resource.', 403, 'FORBIDDEN'));
    }

    next();
  };
}

export function requireCustomerRole(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
  }

  const userRoles = req.user.roles || [];
  if (!userRoles.includes(RoleEnum.CUSTOMER)) {
    return next(new AppError('Access denied. CUSTOMER role required.', 403, 'FORBIDDEN'));
  }

  next();
}


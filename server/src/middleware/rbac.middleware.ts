import { Request, Response, NextFunction } from 'express';
import { RoleEnum } from '@prisma/client';
import { AppError } from './error.middleware.js';

export function requireRoles(allowedRoles: RoleEnum[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    const hasRole = req.user.roles.some(r => allowedRoles.includes(r) || r === RoleEnum.SUPER_ADMIN);
    if (!hasRole) {
      return next(new AppError('Access forbidden. Insufficient privileges', 403, 'FORBIDDEN'));
    }

    next();
  };
}

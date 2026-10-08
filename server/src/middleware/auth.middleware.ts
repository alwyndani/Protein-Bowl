import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtAccessTokenPayload } from '../utils/jwt.js';
import { AppError } from './error.middleware.js';
import { RoleEnum } from '@prisma/client';
import { prisma } from '../config/database.js';
import { Permission, rolesHavePermission } from '../authz/permissions.js';
import { isStaffRole } from '../authz/roleScopes.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtAccessTokenPayload;
    }
  }
}

/**
 * Authenticates the request and makes the DATABASE the source of truth.
 *
 * The JWT only proves who the caller is (signature + expiry). After verifying it we load the current user:
 *  - unknown / soft-deleted / non-ACTIVE (PENDING, SUSPENDED, DEACTIVATED) accounts are rejected immediately, even with a
 *    still-valid access token;
 *  - req.user.roles is rebuilt from the CURRENT role assignments, so role changes apply on the very next request and the
 *    (possibly stale) roles claim inside the token is never used for authorization.
 * Only the minimum fields are selected - never passwordHash.
 */
export async function authenticateToken(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Missing Bearer token', 401, 'UNAUTHORIZED'));
  }

  const token = authHeader.split(' ')[1];
  let decoded: JwtAccessTokenPayload;
  try {
    decoded = verifyAccessToken(token);
  } catch (_err) {
    return next(new AppError('Invalid or expired access token', 401, 'INVALID_TOKEN'));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        status: true,
        deletedAt: true,
        roles: { select: { role: true } }
      }
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      return next(new AppError('Your session is no longer valid. Please sign in again.', 401, 'ACCOUNT_INACTIVE'));
    }

    req.user = {
      userId: user.id,
      email: user.email,
      roles: user.roles.map((r) => r.role)
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Permission-based guard backed by the static catalogue in authz/permissions.ts.
 * Unlike requireRole there is NO implicit SUPER_ADMIN bypass: SUPER_ADMIN holds permissions explicitly.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }
    if (!rolesHavePermission(req.user.roles || [], permission)) {
      return next(new AppError('Access denied. Insufficient permissions for this resource.', 403, 'FORBIDDEN'));
    }
    return next();
  };
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


/**
 * Role guard WITHOUT the SUPER_ADMIN bypass. Use for customer-context endpoints,
 * where the caller must hold one of the listed roles themselves.
 */
export function requireExactRoles(allowedRoles: RoleEnum[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    const userRoles = req.user.roles || [];
    if (!allowedRoles.some(role => userRoles.includes(role))) {
      return next(new AppError('Access denied. Insufficient permissions for this resource.', 403, 'FORBIDDEN'));
    }

    next();
  };
}

/** Staff identities only (any non-customer role). Customers and anonymous callers are rejected. */
export function requireStaffIdentity(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
  }
  if (!(req.user.roles || []).some(isStaffRole)) {
    return next(new AppError('Access denied. Staff account required.', 403, 'FORBIDDEN'));
  }
  return next();
}

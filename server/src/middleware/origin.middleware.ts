import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { AppError } from './error.middleware.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isAllowedOrigin(origin: string | undefined): boolean {
  // Requests without an Origin header (native mobile, curl, server-to-server) are not browser cross-origin requests.
  if (!origin) return true;
  return env.allowedOrigins.includes(origin);
}

/**
 * CSRF defense in depth for cookie-authenticated flows: reject state-changing requests
 * that carry a disallowed browser Origin. Requests with no Origin remain supported.
 */
export function enforceAllowedOrigin(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (isAllowedOrigin(req.headers.origin)) return next();
  return next(new AppError('Request origin is not allowed', 403, 'ORIGIN_NOT_ALLOWED'));
}

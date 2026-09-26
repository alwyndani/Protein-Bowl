import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtAccessTokenPayload } from '../utils/jwt.js';
import { AppError } from './error.middleware.js';

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

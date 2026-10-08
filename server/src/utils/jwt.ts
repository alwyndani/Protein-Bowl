import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { RoleEnum } from '@prisma/client';

export interface JwtAccessTokenPayload {
  userId: string;
  email: string;
  roles: RoleEnum[];
}

export function generateAccessToken(payload: JwtAccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: '15m'
  });
}

export function verifyAccessToken(token: string): JwtAccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessTokenPayload & { aud?: unknown; purpose?: unknown };
  // Other signed artifacts (e.g. the admin step-up proof) share this secret: they must never work as access tokens.
  if (typeof decoded.userId !== 'string' || decoded.userId.length === 0 || decoded.aud !== undefined || decoded.purpose !== undefined) {
    throw new Error('Not an access token');
  }
  return decoded;
}

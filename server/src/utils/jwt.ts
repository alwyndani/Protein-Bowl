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
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessTokenPayload;
}

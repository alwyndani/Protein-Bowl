import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// Tests make many auth/API calls from one IP; unit limits are effectively off unless a test sets RL_* explicitly.
const isTest = env.NODE_ENV === 'test';
const TEST_MAX = 100000;

function createRateLimiter(name: string, max: number, windowMs: number, skip?: (path: string) => boolean) {
  return rateLimit({
    windowMs,
    max: isTest && !process.env[`RL_${name}_MAX`] ? TEST_MAX : max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => env.rateLimitDisabled || (skip ? skip(req.path) : false),
    message: {
      success: false,
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please try again later.'
    }
  });
}

export const loginRateLimiter = createRateLimiter('LOGIN', env.RL_LOGIN_MAX, env.RL_LOGIN_WINDOW_MS);
export const registerRateLimiter = createRateLimiter('REGISTER', env.RL_REGISTER_MAX, env.RL_REGISTER_WINDOW_MS);
export const refreshRateLimiter = createRateLimiter('REFRESH', env.RL_REFRESH_MAX, env.RL_REFRESH_WINDOW_MS);
export const acceptInviteRateLimiter = createRateLimiter('ACCEPT_INVITE', env.RL_ACCEPT_INVITE_MAX, env.RL_ACCEPT_INVITE_WINDOW_MS);
export const stepUpRateLimiter = createRateLimiter('STEPUP', env.RL_STEPUP_MAX, env.RL_STEPUP_WINDOW_MS);
export const generalRateLimiter = createRateLimiter(
  'GENERAL',
  env.RL_GENERAL_MAX,
  env.RL_GENERAL_WINDOW_MS,
  (path) => path === '/health'
);

/** @deprecated Kept as an alias for the login limiter. */
export const authRateLimiter = loginRateLimiter;

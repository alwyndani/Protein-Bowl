import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env.js';

// Tests make many auth/API calls from one IP; unit limits are effectively off unless a test sets RL_* explicitly.
const isTest = env.NODE_ENV === 'test';
const TEST_MAX = 100000;

function createRateLimiter(name: string, max: number, windowMs: number, skip?: (path: string) => boolean, keyGenerator?: (req: Request) => string) {
  return rateLimit({
    ...(keyGenerator ? { keyGenerator } : {}),
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
/** Identity-aware limiters for authenticated payment endpoints (placed AFTER authenticateToken): the key is the user, not just the IP. */
const byUser = (req: Request): string => `u:${req.user?.userId ?? req.ip ?? 'anon'}`;
export const paymentAttemptRateLimiter = createRateLimiter('PAYMENT_ATTEMPT', env.RL_PAYMENT_ATTEMPT_MAX, env.RL_PAYMENT_ATTEMPT_WINDOW_MS, undefined, byUser);
export const paymentVerifyRateLimiter = createRateLimiter('PAYMENT_VERIFY', env.RL_PAYMENT_VERIFY_MAX, env.RL_PAYMENT_VERIFY_WINDOW_MS, undefined, byUser);
/** P7C: cancellation (customer) and financial admin mutations (cancel / refund approval), keyed by the authenticated user. */
export const cancelRateLimiter = createRateLimiter('CANCEL', env.RL_CANCEL_MAX, env.RL_CANCEL_WINDOW_MS, undefined, byUser);
export const financialAdminRateLimiter = createRateLimiter('REFUND_ADMIN', env.RL_REFUND_ADMIN_MAX, env.RL_REFUND_ADMIN_WINDOW_MS, undefined, byUser);
/** P8 kitchen: chef actions and SUPER_ADMIN kitchen routing, keyed by the authenticated user. */
export const kitchenActionRateLimiter = createRateLimiter('KITCHEN_ACTION', env.RL_KITCHEN_ACTION_MAX, env.RL_KITCHEN_ACTION_WINDOW_MS, undefined, byUser);
export const kitchenRoutingRateLimiter = createRateLimiter('KITCHEN_ROUTING', env.RL_KITCHEN_ROUTING_MAX, env.RL_KITCHEN_ROUTING_WINDOW_MS, undefined, byUser);
/** P9A delivery: reads (polling), driver actions and SUPER_ADMIN assignment, keyed by the authenticated user. */
export const deliveryReadRateLimiter = createRateLimiter('DELIVERY_READ', env.RL_DELIVERY_READ_MAX, env.RL_DELIVERY_READ_WINDOW_MS, undefined, byUser);
export const deliveryActionRateLimiter = createRateLimiter('DELIVERY_ACTION', env.RL_DELIVERY_ACTION_MAX, env.RL_DELIVERY_ACTION_WINDOW_MS, undefined, byUser);
export const deliveryAssignRateLimiter = createRateLimiter('DELIVERY_ASSIGN', env.RL_DELIVERY_ASSIGN_MAX, env.RL_DELIVERY_ASSIGN_WINDOW_MS, undefined, byUser);
/** P9B Delivery Code. Secondary to the PERSISTED per-proof attempt state (DeliveryProof), which is what actually bounds guessing. */
const byUserAndOrder = (req: Request): string => `u:${req.user?.userId ?? req.ip ?? 'anon'}:o:${String(req.params.orderId ?? req.params.id ?? '')}`;
export const deliveryCodeReadRateLimiter = createRateLimiter('DELIVERY_CODE_READ', env.RL_DELIVERY_CODE_READ_MAX, env.RL_DELIVERY_CODE_READ_WINDOW_MS, undefined, byUser);
export const deliveryCodeIssueRateLimiter = createRateLimiter('DELIVERY_CODE_ISSUE', env.RL_DELIVERY_CODE_ISSUE_MAX, env.RL_DELIVERY_CODE_ISSUE_WINDOW_MS, undefined, byUserAndOrder);
export const deliveryCodeRegenerateRateLimiter = createRateLimiter('DELIVERY_CODE_REGEN', env.RL_DELIVERY_CODE_REGEN_MAX, env.RL_DELIVERY_CODE_REGEN_WINDOW_MS, undefined, byUserAndOrder);
export const deliveryVerifyRateLimiter = createRateLimiter('DELIVERY_VERIFY', env.RL_DELIVERY_VERIFY_MAX, env.RL_DELIVERY_VERIFY_WINDOW_MS, undefined, byUser);
export const deliveryOverrideRateLimiter = createRateLimiter('DELIVERY_OVERRIDE', env.RL_DELIVERY_OVERRIDE_MAX, env.RL_DELIVERY_OVERRIDE_WINDOW_MS, undefined, byUser);
export const messReadRateLimiter = createRateLimiter('MESS_READ', env.RL_MESS_READ_MAX, env.RL_MESS_READ_WINDOW_MS, undefined, byUser);
export const messWriteRateLimiter = createRateLimiter('MESS_WRITE', env.RL_MESS_WRITE_MAX, env.RL_MESS_WRITE_WINDOW_MS, undefined, byUser);
export const messPurchaseRateLimiter = createRateLimiter('MESS_PURCHASE', env.RL_MESS_PURCHASE_MAX, env.RL_MESS_PURCHASE_WINDOW_MS, undefined, byUser);
export const messAdminRateLimiter = createRateLimiter('MESS_ADMIN', env.RL_MESS_ADMIN_MAX, env.RL_MESS_ADMIN_WINDOW_MS, undefined, byUser);
export const deliveryResolveRateLimiter = createRateLimiter('DELIVERY_RESOLVE', env.RL_DELIVERY_RESOLVE_MAX, env.RL_DELIVERY_RESOLVE_WINDOW_MS, undefined, byUser);
/** Webhook: deliberately generous per-IP ceiling; the SIGNATURE is the real authentication, and provider retry storms must not be throttled. */
export const webhookRateLimiter = createRateLimiter('WEBHOOK', env.RL_WEBHOOK_MAX, env.RL_WEBHOOK_WINDOW_MS);
export const generalRateLimiter = createRateLimiter(
  'GENERAL',
  env.RL_GENERAL_MAX,
  env.RL_GENERAL_WINDOW_MS,
  (path) => path === '/health'
);

/** @deprecated Kept as an alias for the login limiter. */
export const authRateLimiter = loginRateLimiter;

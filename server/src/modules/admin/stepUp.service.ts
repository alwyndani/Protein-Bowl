import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error.middleware.js';
import { comparePassword } from '../../utils/hash.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * Password step-up for sensitive administrative actions (role changes, deactivation/activation, invitations).
 *
 * The authenticated SUPER_ADMIN re-enters their password once (POST /admin/step-up) and receives a short-lived,
 * server-signed proof. Sensitive routes require it in the `X-Step-Up-Token` header. The proof:
 *  - is bound to the authenticated user (`sub`) and a fingerprint of their CURRENT password hash, so changing the
 *    password invalidates it;
 *  - expires quickly (STEP_UP_TTL_SECONDS, default 5 minutes);
 *  - dies with the account: it is only honoured after authenticateToken re-checked the user is still ACTIVE;
 *  - is never persisted, and neither the password nor the proof is ever written to logs or the audit trail.
 * It is time-limited, not single-use (single use would need server-side storage - a deliberate, documented trade-off).
 */
const STEP_UP_PURPOSE = 'admin-step-up';
export const STEP_UP_HEADER = 'x-step-up-token';

/** HMAC fingerprint of the stored password hash (never the hash itself) - changes whenever the password changes. */
function passwordFingerprint(passwordHash: string): string {
  return crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`step-up:${passwordHash}`).digest('hex').slice(0, 32);
}

interface StepUpClaims {
  sub: string;
  purpose: string;
  pwf: string;
}

export class StepUpService {
  /** Verify the caller's current password and issue the proof. */
  public static async issue(req: Request, userId: string, password: string): Promise<{ stepUpToken: string; expiresInSeconds: number }> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true, status: true, deletedAt: true } });
    const valid = !!user && !user.deletedAt && user.status === 'ACTIVE' && (await comparePassword(password, user.passwordHash));

    if (!valid || !user) {
      await AuditService.recordSafe({
        actor: { userId, roles: req.user?.roles },
        action: 'STEP_UP_FAILED',
        entity: 'User',
        entityId: userId,
        context: AuditService.contextFromRequest(req)
      });
      throw new AppError('Password verification failed', 401, 'STEP_UP_FAILED');
    }

    const claims: StepUpClaims = { sub: user.id, purpose: STEP_UP_PURPOSE, pwf: passwordFingerprint(user.passwordHash) };
    const stepUpToken = jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: env.STEP_UP_TTL_SECONDS, audience: 'step-up' });
    return { stepUpToken, expiresInSeconds: env.STEP_UP_TTL_SECONDS };
  }

  /** Validate a proof for `userId`. Throws AppError(403) on any problem. */
  public static async verify(token: string | undefined, userId: string): Promise<void> {
    const fail = (reason: string): never => {
      throw new AppError(`Password re-verification required (${reason})`, 403, 'STEP_UP_REQUIRED');
    };
    if (!token) return fail('missing proof');

    let claims: StepUpClaims;
    try {
      claims = jwt.verify(token, env.JWT_ACCESS_SECRET, { audience: 'step-up' }) as unknown as StepUpClaims;
    } catch {
      return fail('invalid or expired proof');
    }
    if (claims.purpose !== STEP_UP_PURPOSE || claims.sub !== userId) return fail('proof does not belong to this session');

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || passwordFingerprint(user.passwordHash) !== claims.pwf) return fail('credentials changed');
  }
}

/** Express guard: requires a valid step-up proof for the authenticated user; denials are audited. */
export function requireStepUp(action: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const header = req.headers[STEP_UP_HEADER];
      try {
        await StepUpService.verify(typeof header === 'string' ? header : undefined, req.user.userId);
      } catch (err) {
        if (err instanceof AppError) {
          await AuditService.recordSafe({
            actor: { userId: req.user.userId, roles: req.user.roles },
            action: 'STEP_UP_DENIED',
            entity: 'AdminAction',
            entityId: action,
            payload: { action, path: req.originalUrl.split('?')[0] },
            context: AuditService.contextFromRequest(req)
          });
        }
        throw err;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

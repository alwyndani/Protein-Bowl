import { Prisma, RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error.middleware.js';
import { generateRandomToken, hashPassword, hashToken } from '../../utils/hash.js';
import { validateStaffPassword } from '../../utils/staffPassword.js';
import { hasMixedIdentity, isStaffRole } from '../../authz/roleScopes.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import crypto from 'crypto';

type Tx = Prisma.TransactionClient;

/** Uniform, non-enumerating error for every invalid / expired / used / revoked / ineligible invitation. */
const invalidInvitation = () => new AppError('This invitation link is invalid or has expired.', 400, 'INVALID_INVITATION');

export interface IssuedInvitation {
  invitationId: string;
  rawToken: string;
  expiresAt: Date;
}

export class InvitationService {
  /**
   * Unusable placeholder credential for PENDING staff (User.passwordHash is NOT NULL): bcrypt of 48 random bytes that are
   * immediately discarded. It is never returned, logged, derived from the token, or guessable.
   */
  public static async createUnusablePasswordHash(): Promise<string> {
    return hashPassword(crypto.randomBytes(48).toString('base64'));
  }

  /**
   * Revoke any still-active invitation of the user and create a fresh one. Run inside the caller's transaction so
   * "invalidate old + create new" is atomic. Only the SHA-256 hash of the token is persisted.
   */
  public static async issue(tx: Tx, userId: string, createdById: string | null): Promise<IssuedInvitation> {
    const now = new Date();
    await tx.staffInvitation.updateMany({
      where: { userId, usedAt: null, revokedAt: null },
      data: { revokedAt: now }
    });

    const rawToken = generateRandomToken(); // 32 random bytes, hex
    const expiresAt = new Date(now.getTime() + env.INVITE_TTL_HOURS * 60 * 60 * 1000);
    const invitation = await tx.staffInvitation.create({
      data: { userId, tokenHash: hashToken(rawToken), expiresAt, createdById }
    });
    return { invitationId: invitation.id, rawToken, expiresAt };
  }

  /** Revoke active invitations (e.g. when a pending account is deactivated). */
  public static async revokeActive(tx: Tx, userId: string): Promise<number> {
    const r = await tx.staffInvitation.updateMany({ where: { userId, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    return r.count;
  }

  /**
   * Accept an invitation: validates the token, enforces the staff password policy, then - atomically - consumes the
   * invitation, sets the password, activates the account, revokes any previous sessions and audits the event.
   * All failure modes of the token itself return the same safe error.
   */
  public static async accept(rawToken: string, password: string, context: AuditContext): Promise<void> {
    const now = new Date();
    const tokenHash = hashToken(rawToken);

    const invitation = await prisma.staffInvitation.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, status: true, deletedAt: true, roles: { select: { role: true } }, employeeProfile: { select: { fullName: true } } } } }
    });

    let rejection: string | null = null;
    if (!invitation) rejection = 'unknown_token';
    else if (invitation.usedAt) rejection = 'already_used';
    else if (invitation.revokedAt) rejection = 'revoked';
    else if (invitation.expiresAt <= now) rejection = 'expired';
    else if (invitation.user.deletedAt) rejection = 'account_deleted';
    else if (invitation.user.status !== 'PENDING') rejection = 'account_not_pending';
    else {
      const roles = invitation.user.roles.map((r) => r.role) as RoleEnum[];
      if (roles.length === 0 || !roles.some(isStaffRole) || hasMixedIdentity(roles)) rejection = 'not_a_staff_identity';
    }

    if (rejection || !invitation) {
      await AuditService.recordSafe({
        actor: invitation ? { userId: invitation.user.id } : null,
        action: 'STAFF_INVITATION_REJECTED',
        entity: 'StaffInvitation',
        entityId: invitation?.id ?? null,
        payload: { reason: rejection },
        context
      });
      throw invalidInvitation();
    }

    const policyProblem = validateStaffPassword(password, { email: invitation.user.email, fullName: invitation.user.employeeProfile?.fullName });
    if (policyProblem) throw new AppError(policyProblem, 422, 'PASSWORD_POLICY');

    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      // Single-use, race-safe: only one concurrent acceptance can flip usedAt from NULL.
      const consumed = await tx.staffInvitation.updateMany({
        where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() }
      });
      if (consumed.count !== 1) throw invalidInvitation();

      const activated = await tx.user.updateMany({
        where: { id: invitation.user.id, status: 'PENDING', deletedAt: null },
        data: { passwordHash, status: 'ACTIVE' }
      });
      if (activated.count !== 1) throw invalidInvitation();

      // Any session that existed before the credential was set is void.
      await tx.refreshToken.updateMany({ where: { userId: invitation.user.id, revokedAt: null }, data: { revokedAt: new Date() } });

      await AuditService.record(
        {
          actor: { userId: invitation.user.id, roles: invitation.user.roles.map((r) => r.role) },
          action: 'STAFF_INVITATION_ACCEPTED',
          entity: 'User',
          entityId: invitation.user.id,
          payload: { invitationId: invitation.id, activated: true },
          context
        },
        tx
      );
    });
  }
}

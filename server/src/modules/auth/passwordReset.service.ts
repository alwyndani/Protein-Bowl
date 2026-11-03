import { RoleEnum } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error.middleware.js';
import { generateRandomToken, hashPassword, hashToken } from '../../utils/hash.js';
import { validateStaffPassword } from '../../utils/staffPassword.js';
import { isStaffRole } from '../../authz/roleScopes.js';
import { isApprovedRole } from '../../authz/approvedRoles.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { EmailNotConfiguredError, getMailer, webBaseUrl } from '../email/mailer.js';

/** Uniform, non-enumerating error for every unknown / expired / used / ineligible token. */
const invalidToken = () => new AppError('This password reset link is invalid or has expired.', 400, 'INVALID_RESET_TOKEN');

export class PasswordResetService {
  /**
   * Starts a reset. The caller always receives the same generic answer whether or not the address belongs to an account
   * (no account enumeration). Only ACTIVE, non-deleted accounts holding an approved role get a token; PENDING staff must use
   * their invitation. The only visible failure is "email is not configured" (503), which does not depend on the address.
   */
  public static async request(email: string, context: AuditContext): Promise<void> {
    const mailer = getMailer();
    if (mailer.provider === 'none') throw new AppError('Password reset by email is not available right now.', 503, 'EMAIL_NOT_CONFIGURED');

    const user = await prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), deletedAt: null, status: 'ACTIVE' },
      select: { id: true, email: true, roles: { select: { role: true } } }
    });
    const eligible = !!user && user.roles.some((r) => isApprovedRole(r.role as RoleEnum));
    if (!user || !eligible) return;

    if (env.PASSWORD_RESET_COOLDOWN_SECONDS > 0) {
      const recent = await prisma.passwordResetToken.findFirst({
        where: { userId: user.id, createdAt: { gt: new Date(Date.now() - env.PASSWORD_RESET_COOLDOWN_SECONDS * 1000) } },
        select: { id: true }
      });
      if (recent) return; // same generic answer; no new token, no new email
    }

    const rawToken = generateRandomToken();
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000);
    await prisma.$transaction(async (tx) => {
      // Only the newest link works.
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt } });
      await AuditService.record({ actor: { userId: user.id }, action: 'PASSWORD_RESET_REQUESTED', entity: 'User', entityId: user.id, context }, tx);
    });

    // Sent off the response path: waiting for the provider would make "known address" measurably slower than "unknown address".
    void mailer
      .send({
        to: user.email,
        subject: 'Reset your Protein Bowl password',
        text: `We received a request to reset your Protein Bowl password.\n\nUse this one-time link within ${env.PASSWORD_RESET_TTL_MINUTES} minutes:\n\n${webBaseUrl()}/reset-password#token=${rawToken}\n\nIf you did not ask for this, you can ignore this email; your password has not changed.`
      })
      .catch(async (e: unknown) => {
        if (e instanceof EmailNotConfiguredError) return;
        // The failure is recorded (never the message or token).
        await AuditService.recordSafe({ actor: { userId: user.id }, action: 'PASSWORD_RESET_EMAIL_FAILED', entity: 'User', entityId: user.id, context });
      });
  }

  /** Completes a reset: consumes the token, sets the new password, signs the account out everywhere. */
  public static async complete(rawToken: string, password: string, context: AuditContext): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, status: true, deletedAt: true, roles: { select: { role: true } }, employeeProfile: { select: { fullName: true } } } } }
    });
    const roles = row?.user.roles.map((r) => r.role as RoleEnum) ?? [];
    if (!row || row.usedAt || row.expiresAt <= new Date() || row.user.deletedAt || row.user.status !== 'ACTIVE' || !roles.some(isApprovedRole)) {
      await AuditService.recordSafe({ actor: row ? { userId: row.user.id } : null, action: 'PASSWORD_RESET_REJECTED', entity: 'User', entityId: row?.user.id ?? null, context });
      throw invalidToken();
    }

    // Staff accounts keep the stricter staff policy; customers keep the customer policy (min 8).
    if (roles.some(isStaffRole)) {
      const problem = validateStaffPassword(password, { email: row.user.email, fullName: row.user.employeeProfile?.fullName });
      if (problem) throw new AppError(problem, 422, 'PASSWORD_POLICY');
    }
    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (consumed.count !== 1) throw invalidToken(); // lost a race with another use of the same link
      const updated = await tx.user.updateMany({ where: { id: row.user.id, status: 'ACTIVE', deletedAt: null }, data: { passwordHash } });
      if (updated.count !== 1) throw invalidToken();
      await tx.passwordResetToken.updateMany({ where: { userId: row.user.id, usedAt: null }, data: { usedAt: new Date() } });
      await tx.refreshToken.updateMany({ where: { userId: row.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await AuditService.record({ actor: { userId: row.user.id, roles }, action: 'PASSWORD_RESET_COMPLETED', entity: 'User', entityId: row.user.id, context }, tx);
    });
  }
}

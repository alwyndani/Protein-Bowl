import crypto from 'crypto';
import { Prisma, PrismaClient, RoleEnum } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '../../utils/hash.js';
import { validateStaffPassword } from '../../utils/staffPassword.js';
import { AuditService } from '../audit/audit.service.js';

export class BootstrapRefusedError extends Error {
  constructor(message: string, public readonly code: 'ADMIN_EXISTS' | 'EMAIL_EXISTS' | 'INVALID_INPUT') {
    super(message);
    this.name = 'BootstrapRefusedError';
  }
}

const inputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(2).max(100)
});

export interface BootstrapResult {
  userId: string;
  email: string;
  employeeCode: string;
}

/**
 * Create the INITIAL SUPER_ADMIN. This is the ONLY way to create a SUPER_ADMIN: there is no HTTP route, and the admin APIs
 * can never assign the role. It refuses when an active SUPER_ADMIN already exists, enforces the staff password policy, and
 * writes a SUPER_ADMIN_BOOTSTRAPPED audit event atomically with the account (the password is never audited or returned).
 * Intended to be run from the CLI (`npm run admin:bootstrap`) - it never runs on application startup.
 */
export async function bootstrapSuperAdmin(
  input: { email: string; fullName: string; password: string },
  db: PrismaClient
): Promise<BootstrapResult> {
  const parsed = inputSchema.safeParse({ email: input.email, fullName: input.fullName });
  if (!parsed.success) throw new BootstrapRefusedError('Valid email and full name are required', 'INVALID_INPUT');
  const { email, fullName } = parsed.data;

  const policyProblem = validateStaffPassword(input.password, { email, fullName });
  if (policyProblem) throw new BootstrapRefusedError(policyProblem, 'INVALID_INPUT');

  const passwordHash = await hashPassword(input.password);
  const employeeCode = `EMP-SA-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  // Serializable: two concurrent bootstraps cannot both see "no admin" and both create one.
  return db.$transaction(
    async (tx) => {
      const activeAdmins = await tx.user.count({
        where: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: RoleEnum.SUPER_ADMIN } } }
      });
      if (activeAdmins > 0) {
        throw new BootstrapRefusedError('An active SUPER_ADMIN already exists. Bootstrap is only for the first/emergency administrator.', 'ADMIN_EXISTS');
      }

      const existing = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
      if (existing) {
        throw new BootstrapRefusedError('An account with this email already exists; it will not be converted.', 'EMAIL_EXISTS');
      }

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          status: 'ACTIVE',
          roles: { create: { role: RoleEnum.SUPER_ADMIN } },
          employeeProfile: {
            create: { employeeCode, fullName, designation: 'Platform Super Administrator' }
          }
        },
        select: { id: true }
      });

      await AuditService.record(
        {
          actor: null,
          action: 'SUPER_ADMIN_BOOTSTRAPPED',
          entity: 'User',
          entityId: user.id,
          payload: { email, method: 'cli' }
        },
        tx
      );
      return { userId: user.id, email, employeeCode };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

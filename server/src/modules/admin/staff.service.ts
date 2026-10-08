import crypto from 'crypto';
import { Prisma, RoleEnum, UserStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { InvitationService } from './invitation.service.js';
import { getInvitationDelivery, InvitationHandoff } from './invitationDelivery.js';
import { StaffDto, staffUserSelect, toStaffDto } from './staff.dto.js';
import { NON_ASSIGNABLE_ROLES, STAFF_ROLES, hasMixedIdentity, isBranchScopedRole, isCustomerRole } from '../../authz/roleScopes.js';

type Db = Prisma.TransactionClient | typeof prisma;

export interface AdminContext {
  actor: { userId: string; roles: RoleEnum[] };
  audit: AuditContext;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

/** Run an administrative DB operation, translating well-known Prisma failures into safe API errors. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        throw new AppError('A record with the same unique value (email, phone or employee code) already exists', 409, 'DUPLICATE');
      }
      if (err.code === 'P2034') {
        throw new AppError('The change conflicted with another concurrent change. Please retry.', 409, 'CONCURRENT_MODIFICATION');
      }
    }
    throw err;
  }
}

async function auditDenied(ctx: AdminContext, reason: string, entityId: string | null, payload: Record<string, unknown> = {}) {
  await AuditService.recordSafe({
    actor: ctx.actor,
    action: 'ADMIN_ACTION_DENIED',
    entity: 'User',
    entityId,
    payload: { reason, ...payload },
    context: ctx.audit
  });
}

/** Load a STAFF account (never a pure customer identity). Customers are indistinguishable from "not found". */
async function loadStaff(db: Db, id: string) {
  const row = await db.user.findFirst({
    where: { id, roles: { some: { role: { in: [...STAFF_ROLES] } } } },
    select: staffUserSelect
  });
  if (!row) throw new AppError('Staff account not found', 404, 'NOT_FOUND');
  return row;
}

function assertNotSoftDeleted(row: { deletedAt: Date | null }) {
  if (row.deletedAt) throw new AppError('This account has been deleted', 409, 'ACCOUNT_DELETED');
}

async function assertAssignableRole(ctx: AdminContext, role: RoleEnum, targetId: string | null) {
  if ((NON_ASSIGNABLE_ROLES as readonly RoleEnum[]).includes(role)) {
    await auditDenied(ctx, 'role_not_assignable', targetId, { role });
    throw new AppError(`The role ${role} cannot be assigned through administration APIs`, 403, 'ROLE_NOT_ASSIGNABLE');
  }
}

export class StaffAdminService {
  // ------------------------------------------------------------------ read
  public static async list(query: { page: number; pageSize: number; q?: string; status?: UserStatus; role?: RoleEnum; branchId?: string }): Promise<Paginated<StaffDto>> {
    const and: Prisma.UserWhereInput[] = [{ roles: { some: { role: { in: [...STAFF_ROLES] } } } }];
    if (query.status) and.push({ status: query.status });
    if (query.role) and.push({ roles: { some: { role: query.role } } });
    if (query.branchId) {
      and.push({ employeeProfile: { OR: [{ assignedBranchId: query.branchId }, { branchAssignments: { some: { branchId: query.branchId } } }] } });
    }
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({
        OR: [{ email: contains }, { phone: contains }, { employeeProfile: { fullName: contains } }, { employeeProfile: { employeeCode: contains } }]
      });
    }
    const where: Prisma.UserWhereInput = { AND: and };

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: staffUserSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);

    return { items: rows.map(toStaffDto), page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }

  public static async get(id: string): Promise<StaffDto> {
    return toStaffDto(await loadStaff(prisma, id));
  }

  // ------------------------------------------------------------------ create / invite
  public static async create(
    ctx: AdminContext,
    body: {
      email: string;
      fullName: string;
      phone?: string;
      designation: string;
      employeeCode?: string;
      shiftTiming?: string;
      roles: RoleEnum[];
      branchIds: string[];
    }
  ): Promise<{ staff: StaffDto; invitation: InvitationHandoff }> {
    const roles = Array.from(new Set(body.roles));
    for (const role of roles) await assertAssignableRole(ctx, role, null);
    if (hasMixedIdentity(roles) || roles.some(isCustomerRole)) {
      throw new AppError('Staff accounts must not hold customer roles', 403, 'ROLE_NOT_ASSIGNABLE');
    }

    const branchIds = Array.from(new Set(body.branchIds));
    if (roles.some(isBranchScopedRole) && branchIds.length === 0) {
      throw new AppError('At least one branch is required for branch-scoped roles', 422, 'BRANCH_REQUIRED');
    }
    if (branchIds.length > 0) {
      const branches = await prisma.kitchenBranch.findMany({ where: { id: { in: branchIds } }, select: { id: true, isActive: true } });
      if (branches.length !== branchIds.length) throw new AppError('One or more branches do not exist', 422, 'INVALID_BRANCH');
      if (branches.some((b) => !b.isActive)) throw new AppError('Inactive branches cannot be assigned', 409, 'BRANCH_INACTIVE');
    }

    const existing = await prisma.user.findFirst({ where: { email: { equals: body.email, mode: 'insensitive' } }, select: { id: true } });
    if (existing) throw new AppError('An account with this email already exists', 409, 'DUPLICATE');

    const placeholderHash = await InvitationService.createUnusablePasswordHash();
    const employeeCode = body.employeeCode ?? `EMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const { userId, invitation } = await guarded(() =>
      prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: body.email,
            passwordHash: placeholderHash,
            phone: body.phone ?? null,
            status: 'PENDING',
            roles: { create: roles.map((role) => ({ role })) },
            employeeProfile: {
              create: {
                employeeCode,
                fullName: body.fullName,
                designation: body.designation,
                shiftTiming: body.shiftTiming ?? null,
                assignedBranchId: branchIds[0] ?? null,
                branchAssignments: { create: branchIds.map((branchId) => ({ branchId, assignedById: ctx.actor.userId })) }
              }
            }
          },
          select: { id: true }
        });

        const issued = await InvitationService.issue(tx, user.id, ctx.actor.userId);

        await AuditService.record(
          {
            actor: ctx.actor,
            action: 'STAFF_CREATED',
            entity: 'User',
            entityId: user.id,
            payload: { email: body.email, employeeCode, roles, branchIds, status: 'PENDING' },
            context: ctx.audit
          },
          tx
        );
        await AuditService.record(
          {
            actor: ctx.actor,
            action: 'STAFF_INVITED',
            entity: 'User',
            entityId: user.id,
            payload: { invitationId: issued.invitationId, expiresAt: issued.expiresAt, deliveryMode: getInvitationDelivery().mode },
            context: ctx.audit
          },
          tx
        );
        return { userId: user.id, invitation: issued };
      })
    );

    const handoff = await getInvitationDelivery().deliver({
      rawToken: invitation.rawToken,
      expiresAt: invitation.expiresAt,
      staff: { id: userId, email: body.email, fullName: body.fullName }
    });
    return { staff: toStaffDto(await loadStaff(prisma, userId)), invitation: handoff };
  }

  // ------------------------------------------------------------------ profile update
  public static async update(
    ctx: AdminContext,
    id: string,
    body: { fullName?: string; phone?: string | null; designation?: string; shiftTiming?: string | null }
  ): Promise<StaffDto> {
    return guarded(() =>
      prisma.$transaction(async (tx) => {
        const row = await loadStaff(tx, id);
        assertNotSoftDeleted(row);

        const profileFields = {
          ...(body.fullName !== undefined && { fullName: body.fullName }),
          ...(body.designation !== undefined && { designation: body.designation }),
          ...(body.shiftTiming !== undefined && { shiftTiming: body.shiftTiming })
        };
        if (Object.keys(profileFields).length > 0 && !row.employeeProfile) {
          throw new AppError('This account has no employee profile to update', 409, 'NO_EMPLOYEE_PROFILE');
        }

        const before = {
          fullName: row.employeeProfile?.fullName,
          phone: row.phone,
          designation: row.employeeProfile?.designation,
          shiftTiming: row.employeeProfile?.shiftTiming
        };

        if (body.phone !== undefined) await tx.user.update({ where: { id }, data: { phone: body.phone } });
        if (Object.keys(profileFields).length > 0) await tx.employeeProfile.update({ where: { userId: id }, data: profileFields });

        const after = { ...before, ...(body.phone !== undefined && { phone: body.phone }), ...profileFields };
        await AuditService.record(
          { actor: ctx.actor, action: 'STAFF_UPDATED', entity: 'User', entityId: id, payload: { before, after }, context: ctx.audit },
          tx
        );
        return toStaffDto(await loadStaff(tx, id));
      })
    );
  }

  // ------------------------------------------------------------------ roles
  public static async assignRole(ctx: AdminContext, id: string, role: RoleEnum): Promise<{ changed: boolean; staff: StaffDto }> {
    await assertAssignableRole(ctx, role, id);
    if (id === ctx.actor.userId) {
      await auditDenied(ctx, 'self_modification', id, { action: 'assign_role', role });
      throw new AppError('You cannot change your own roles', 403, 'SELF_MODIFICATION_FORBIDDEN');
    }

    return guarded(() =>
      prisma.$transaction(async (tx) => {
        const row = await loadStaff(tx, id);
        assertNotSoftDeleted(row);
        const current = row.roles.map((r) => r.role);

        if (hasMixedIdentity([...current, role]) || current.some(isCustomerRole)) {
          await auditDenied(ctx, 'mixed_identity', id, { role });
          throw new AppError('Staff and customer identities must stay separate', 409, 'MIXED_IDENTITY');
        }
        if (current.includes(role)) return { changed: false, staff: toStaffDto(row) };

        await tx.userRoleAssignment.create({ data: { userId: id, role } });
        await AuditService.record(
          {
            actor: ctx.actor,
            action: 'ROLE_ASSIGNED',
            entity: 'User',
            entityId: id,
            payload: { role, rolesBefore: current, rolesAfter: [...current, role] },
            context: ctx.audit
          },
          tx
        );
        return { changed: true, staff: toStaffDto(await loadStaff(tx, id)) };
      })
    );
  }

  public static async revokeRole(ctx: AdminContext, id: string, role: RoleEnum): Promise<{ changed: boolean; staff: StaffDto }> {
    await assertAssignableRole(ctx, role, id);
    if (id === ctx.actor.userId) {
      await auditDenied(ctx, 'self_modification', id, { action: 'revoke_role', role });
      throw new AppError('You cannot change your own roles', 403, 'SELF_MODIFICATION_FORBIDDEN');
    }

    return guarded(() =>
      prisma.$transaction(async (tx) => {
        const row = await loadStaff(tx, id);
        assertNotSoftDeleted(row);
        const current = row.roles.map((r) => r.role);

        // Deterministic: revoking a role the account does not hold is a no-op (200, changed:false).
        if (!current.includes(role)) return { changed: false, staff: toStaffDto(row) };
        if (current.length === 1) {
          throw new AppError('An account must keep at least one role; deactivate the account instead', 409, 'LAST_ROLE');
        }

        await tx.userRoleAssignment.delete({ where: { userId_role: { userId: id, role } } });
        await AuditService.record(
          {
            actor: ctx.actor,
            action: 'ROLE_REVOKED',
            entity: 'User',
            entityId: id,
            payload: { role, rolesBefore: current, rolesAfter: current.filter((r) => r !== role) },
            context: ctx.audit
          },
          tx
        );
        return { changed: true, staff: toStaffDto(await loadStaff(tx, id)) };
      })
    );
  }

  // ------------------------------------------------------------------ branches
  public static async listBranches(id: string) {
    return (await StaffAdminService.get(id)).branches;
  }

  /**
   * Branch policy:
   *  - a branch must exist and be ACTIVE to be newly assigned;
   *  - EmployeeBranchAssignment is the source of truth; EmployeeProfile.assignedBranchId is the primary/home branch;
   *  - the first assigned branch becomes the primary branch when none is set;
   *  - revoking the primary branch re-points primary to the earliest remaining assignment, or clears it - it can never
   *    point at a branch the employee no longer has (otherwise the scope union would silently keep access).
   */
  public static async assignBranch(ctx: AdminContext, id: string, branchId: string): Promise<{ changed: boolean; branches: StaffDto['branches'] }> {
    if (id === ctx.actor.userId) {
      await auditDenied(ctx, 'self_modification', id, { action: 'assign_branch', branchId });
      throw new AppError('You cannot change your own branch assignments', 403, 'SELF_MODIFICATION_FORBIDDEN');
    }

    return guarded(() =>
      prisma.$transaction(async (tx) => {
        const row = await loadStaff(tx, id);
        assertNotSoftDeleted(row);
        const profile = row.employeeProfile;
        if (!profile) throw new AppError('This account has no employee profile', 409, 'NO_EMPLOYEE_PROFILE');

        const branch = await tx.kitchenBranch.findUnique({ where: { id: branchId }, select: { id: true, isActive: true } });
        if (!branch) throw new AppError('Branch not found', 404, 'NOT_FOUND');
        if (!branch.isActive) throw new AppError('Inactive branches cannot be assigned', 409, 'BRANCH_INACTIVE');

        const hasRow = profile.branchAssignments.some((a) => a.branch.id === branchId);
        const hasPrimary = profile.assignedBranchId === branchId;

        if (!hasRow) {
          await tx.employeeBranchAssignment.create({ data: { employeeProfileId: profile.id, branchId, assignedById: ctx.actor.userId } });
        }
        const primaryBefore = profile.assignedBranchId;
        if (!profile.assignedBranchId) {
          await tx.employeeProfile.update({ where: { id: profile.id }, data: { assignedBranchId: branchId } });
        }

        const changed = !hasRow && !hasPrimary;
        if (changed) {
          await AuditService.record(
            {
              actor: ctx.actor,
              action: 'BRANCH_ASSIGNED',
              entity: 'User',
              entityId: id,
              payload: { branchId, primaryBefore, primaryAfter: primaryBefore ?? branchId },
              context: ctx.audit
            },
            tx
          );
        }
        return { changed, branches: toStaffDto(await loadStaff(tx, id)).branches };
      })
    );
  }

  public static async revokeBranch(ctx: AdminContext, id: string, branchId: string): Promise<{ changed: boolean; branches: StaffDto['branches'] }> {
    if (id === ctx.actor.userId) {
      await auditDenied(ctx, 'self_modification', id, { action: 'revoke_branch', branchId });
      throw new AppError('You cannot change your own branch assignments', 403, 'SELF_MODIFICATION_FORBIDDEN');
    }

    return guarded(() =>
      prisma.$transaction(async (tx) => {
        const row = await loadStaff(tx, id);
        assertNotSoftDeleted(row);
        const profile = row.employeeProfile;
        if (!profile) throw new AppError('This account has no employee profile', 409, 'NO_EMPLOYEE_PROFILE');

        const removed = await tx.employeeBranchAssignment.deleteMany({ where: { employeeProfileId: profile.id, branchId } });
        const wasPrimary = profile.assignedBranchId === branchId;

        if (removed.count === 0 && !wasPrimary) return { changed: false, branches: toStaffDto(row).branches };

        let primaryAfter = profile.assignedBranchId;
        if (wasPrimary) {
          const next = await tx.employeeBranchAssignment.findFirst({
            where: { employeeProfileId: profile.id },
            orderBy: { assignedAt: 'asc' },
            select: { branchId: true }
          });
          primaryAfter = next?.branchId ?? null;
          await tx.employeeProfile.update({ where: { id: profile.id }, data: { assignedBranchId: primaryAfter } });
        }

        await AuditService.record(
          {
            actor: ctx.actor,
            action: 'BRANCH_REVOKED',
            entity: 'User',
            entityId: id,
            payload: { branchId, primaryBefore: profile.assignedBranchId, primaryAfter },
            context: ctx.audit
          },
          tx
        );
        return { changed: true, branches: toStaffDto(await loadStaff(tx, id)).branches };
      })
    );
  }

  // ------------------------------------------------------------------ activation
  public static async deactivate(
    ctx: AdminContext,
    id: string,
    body: { reason: string; status: 'DEACTIVATED' | 'SUSPENDED' }
  ): Promise<{ changed: boolean; staff: StaffDto }> {
    if (id === ctx.actor.userId) {
      await auditDenied(ctx, 'self_deactivation', id);
      throw new AppError('You cannot deactivate your own account', 403, 'SELF_MODIFICATION_FORBIDDEN');
    }

    try {
      // Serializable: two concurrent deactivations of the last two SUPER_ADMINs cannot both succeed.
      return await guarded(() =>
        prisma.$transaction(async (tx) => {
          const row = await loadStaff(tx, id);
          assertNotSoftDeleted(row);

          if (row.status === 'DEACTIVATED' || row.status === 'SUSPENDED') {
            return { changed: false, staff: toStaffDto(row) };
          }

          const isSuperAdmin = row.roles.some((r) => r.role === RoleEnum.SUPER_ADMIN);
          if (isSuperAdmin && row.status === 'ACTIVE') {
            const otherActiveAdmins = await tx.user.count({
              where: { id: { not: id }, status: 'ACTIVE', deletedAt: null, roles: { some: { role: RoleEnum.SUPER_ADMIN } } }
            });
            if (otherActiveAdmins === 0) {
              throw new AppError('The last active SUPER_ADMIN cannot be deactivated', 409, 'LAST_SUPER_ADMIN');
            }
          }

          await tx.user.update({ where: { id }, data: { status: body.status } });
          const revoked = await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
          await InvitationService.revokeActive(tx, id);

          await AuditService.record(
            {
              actor: ctx.actor,
              action: 'STAFF_DEACTIVATED',
              entity: 'User',
              entityId: id,
              payload: { reason: body.reason, statusBefore: row.status, statusAfter: body.status, sessionsRevoked: revoked.count },
              context: ctx.audit
            },
            tx
          );
          return { changed: true, staff: toStaffDto(await loadStaff(tx, id)) };
        }, SERIALIZABLE)
      );
    } catch (err) {
      if (err instanceof AppError && err.errorCode === 'LAST_SUPER_ADMIN') {
        await auditDenied(ctx, 'last_super_admin', id);
      }
      throw err;
    }
  }

  public static async activate(ctx: AdminContext, id: string, body: { reason: string }): Promise<{ changed: boolean; staff: StaffDto }> {
    return guarded(() =>
      prisma.$transaction(async (tx) => {
        const row = await loadStaff(tx, id);
        assertNotSoftDeleted(row);

        if (row.status === 'ACTIVE') return { changed: false, staff: toStaffDto(row) };
        if (row.status === 'PENDING') {
          throw new AppError('This account is waiting for invitation acceptance; it cannot be activated manually', 409, 'INVITATION_PENDING');
        }

        // Activation must not bypass password setup: an account that was invited but never accepted has only the
        // unusable placeholder credential. (Accounts with no invitation history - seed/bootstrap - set a real password.)
        const invitations = await tx.staffInvitation.findMany({ where: { userId: id }, select: { usedAt: true } });
        if (invitations.length > 0 && !invitations.some((i) => i.usedAt)) {
          throw new AppError('This account never completed password setup; issue a new invitation instead', 409, 'PASSWORD_SETUP_INCOMPLETE');
        }

        await tx.user.update({ where: { id }, data: { status: 'ACTIVE' } });
        await AuditService.record(
          {
            actor: ctx.actor,
            action: 'STAFF_ACTIVATED',
            entity: 'User',
            entityId: id,
            payload: { reason: body.reason, statusBefore: row.status },
            context: ctx.audit
          },
          tx
        );
        return { changed: true, staff: toStaffDto(await loadStaff(tx, id)) };
      })
    );
  }

  // ------------------------------------------------------------------ invitation reissue
  public static async reissueInvitation(ctx: AdminContext, id: string): Promise<{ staff: StaffDto; invitation: InvitationHandoff }> {
    const issued = await guarded(() =>
      prisma.$transaction(async (tx) => {
        const row = await loadStaff(tx, id);
        assertNotSoftDeleted(row);

        // Only for accounts still waiting for first-time setup. An ACTIVE account must never be re-credentialed through
        // this route (that would be an unreviewed password-reset / takeover path).
        if (row.status !== 'PENDING') {
          await auditDenied(ctx, 'reissue_not_pending', id, { status: row.status });
          throw new AppError('An invitation can only be reissued for accounts that have not completed setup', 409, 'NOT_PENDING');
        }

        const invitation = await InvitationService.issue(tx, id, ctx.actor.userId);
        await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await AuditService.record(
          {
            actor: ctx.actor,
            action: 'STAFF_INVITATION_REISSUED',
            entity: 'User',
            entityId: id,
            payload: { invitationId: invitation.invitationId, expiresAt: invitation.expiresAt, deliveryMode: getInvitationDelivery().mode },
            context: ctx.audit
          },
          tx
        );
        return { invitation, email: row.email, fullName: row.employeeProfile?.fullName ?? row.email };
      })
    );

    const handoff = await getInvitationDelivery().deliver({
      rawToken: issued.invitation.rawToken,
      expiresAt: issued.invitation.expiresAt,
      staff: { id, email: issued.email, fullName: issued.fullName }
    });
    return { staff: toStaffDto(await loadStaff(prisma, id)), invitation: handoff };
  }
}

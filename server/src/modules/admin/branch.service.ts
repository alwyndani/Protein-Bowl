import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditService } from '../audit/audit.service.js';
import type { AdminContext, Paginated } from './staff.service.js';

const branchSelect = {
  id: true,
  code: true,
  name: true,
  address: true,
  city: true,
  latitude: true,
  longitude: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.KitchenBranchSelect;

type BranchRow = Prisma.KitchenBranchGetPayload<{ select: typeof branchSelect }>;
export type BranchDto = BranchRow & { staffCount: number };

/** Staff (ACTIVE or PENDING, not deleted) who currently have access to a branch via assignment OR legacy primary branch. */
function staffWithBranchWhere(branchId: string): Prisma.UserWhereInput {
  return {
    deletedAt: null,
    status: { in: ['ACTIVE', 'PENDING'] },
    employeeProfile: { OR: [{ assignedBranchId: branchId }, { branchAssignments: { some: { branchId } } }] }
  };
}

async function withStaffCount(row: BranchRow): Promise<BranchDto> {
  return { ...row, staffCount: await prisma.user.count({ where: staffWithBranchWhere(row.id) }) };
}

export class BranchAdminService {
  public static async list(query: { page: number; pageSize: number; isActive?: boolean; q?: string }): Promise<Paginated<BranchDto>> {
    const where: Prisma.KitchenBranchWhereInput = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.q && {
        OR: [
          { code: { contains: query.q, mode: 'insensitive' } },
          { name: { contains: query.q, mode: 'insensitive' } },
          { city: { contains: query.q, mode: 'insensitive' } }
        ]
      })
    };
    const [total, rows] = await Promise.all([
      prisma.kitchenBranch.count({ where }),
      prisma.kitchenBranch.findMany({
        where,
        select: branchSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);
    const items = await Promise.all(rows.map(withStaffCount));
    return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }

  public static async get(id: string): Promise<BranchDto> {
    const row = await prisma.kitchenBranch.findUnique({ where: { id }, select: branchSelect });
    if (!row) throw new AppError('Branch not found', 404, 'NOT_FOUND');
    return withStaffCount(row);
  }

  public static async create(
    ctx: AdminContext,
    body: { code: string; name: string; address: string; city: string; latitude?: number; longitude?: number }
  ): Promise<BranchDto> {
    const existing = await prisma.kitchenBranch.findUnique({ where: { code: body.code }, select: { id: true } });
    if (existing) throw new AppError('A branch with this code already exists', 409, 'DUPLICATE');

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.kitchenBranch.create({ data: body, select: branchSelect });
      await AuditService.record(
        { actor: ctx.actor, action: 'BRANCH_CREATED', entity: 'KitchenBranch', entityId: row.id, payload: { code: row.code, name: row.name, city: row.city }, context: ctx.audit },
        tx
      );
      return row;
    });
    return withStaffCount(created);
  }

  /**
   * Deactivation policy (deterministic): a branch that still has ACTIVE or PENDING staff assigned (assignment rows or legacy
   * primary branch) CANNOT be deactivated - reassign or revoke those staff first (409 BRANCH_HAS_ACTIVE_STAFF). This
   * prevents silently leaving staff pointing at an inactive branch. Reactivation is always allowed.
   */
  public static async update(
    ctx: AdminContext,
    id: string,
    body: { name?: string; address?: string; city?: string; latitude?: number | null; longitude?: number | null; isActive?: boolean }
  ): Promise<BranchDto> {
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const before = await tx.kitchenBranch.findUnique({ where: { id }, select: branchSelect });
        if (!before) throw new AppError('Branch not found', 404, 'NOT_FOUND');

        const deactivating = body.isActive === false && before.isActive;
        if (deactivating) {
          const staffCount = await tx.user.count({ where: staffWithBranchWhere(id) });
          if (staffCount > 0) {
            throw Object.assign(new AppError(`Branch still has ${staffCount} assigned staff member(s); reassign them first`, 409, 'BRANCH_HAS_ACTIVE_STAFF'), { staffCount });
          }
        }

        const row = await tx.kitchenBranch.update({ where: { id }, data: body, select: branchSelect });
        const changedKeys = Object.keys(body).filter((k) => (body as Record<string, unknown>)[k] !== (before as Record<string, unknown>)[k]);

        await AuditService.record(
          {
            actor: ctx.actor,
            action: deactivating ? 'BRANCH_DEACTIVATED' : 'BRANCH_UPDATED',
            entity: 'KitchenBranch',
            entityId: id,
            payload: {
              changed: changedKeys,
              before: Object.fromEntries(changedKeys.map((k) => [k, (before as Record<string, unknown>)[k]])),
              after: Object.fromEntries(changedKeys.map((k) => [k, (row as Record<string, unknown>)[k]]))
            },
            context: ctx.audit
          },
          tx
        );
        return row;
      });
      return withStaffCount(updated);
    } catch (err) {
      if (err instanceof AppError && err.errorCode === 'BRANCH_HAS_ACTIVE_STAFF') {
        await AuditService.recordSafe({
          actor: ctx.actor,
          action: 'ADMIN_ACTION_DENIED',
          entity: 'KitchenBranch',
          entityId: id,
          payload: { reason: 'branch_has_active_staff', staffCount: (err as unknown as { staffCount: number }).staffCount },
          context: ctx.audit
        });
      }
      throw err;
    }
  }
}

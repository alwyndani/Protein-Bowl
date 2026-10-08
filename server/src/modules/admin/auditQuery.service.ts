import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AuditService } from '../audit/audit.service.js';
import type { Paginated } from './staff.service.js';

export interface AuditEntryDto {
  id: string;
  createdAt: Date;
  action: string;
  entity: string;
  entityId: string | null;
  actor: { userId: string | null; email: string | null; role: string | null };
  ipAddress: string | null;
  userAgent: string | null;
  payload: unknown;
}

export class AuditQueryService {
  /**
   * Read-only audit history. The payload is re-sanitized on the way OUT as a second line of defence, so a secret that was
   * somehow stored earlier (old/bad data) can still never be exposed through this API.
   */
  public static async list(query: {
    page: number;
    pageSize: number;
    actorUserId?: string;
    action?: string;
    entity?: string;
    entityId?: string;
    from?: Date;
    to?: Date;
  }): Promise<Paginated<AuditEntryDto>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorUserId && { userId: query.actorUserId }),
      ...(query.action && { action: query.action }),
      ...(query.entity && { entity: query.entity }),
      ...(query.entityId && { entityId: query.entityId }),
      ...((query.from || query.to) && { createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) } })
    };

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { user: { select: { email: true } } }
      })
    ]);

    const items: AuditEntryDto[] = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      actor: { userId: r.userId, email: r.user?.email ?? null, role: r.role },
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      payload: AuditService.sanitize(r.payload)
    }));

    return { items, page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) };
  }
}

import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { lockCustomerCheckout } from '../commerce/checkoutLock.js';
import { toAdminAccountDto, toCustomerAccountDto, toCustomerServicePointDto } from './messDto.js';
import {
  MESS_APPROVAL_STATUS,
  OPEN_SUBSCRIPTION_STATUSES,
  SERVICE_POINT_STATUS,
  accountApproveSchema,
  accountRejectSchema,
  accountWriteSchema,
  lockRow
} from './messPolicy.js';
import { sanitizeNote } from '../refund/cancellationPolicy.js';

type Actor = { userId: string; roles: readonly string[] };
const ACCOUNT_INCLUDE = { servicePoint: { select: { id: true, code: true, name: true, gateLabel: true, city: true, status: true } } } as const;

async function customerProfileOf(userId: string): Promise<{ id: string }> {
  const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw new AppError('Customer profile not found', 404, 'NOT_FOUND');
  return profile;
}

/**
 * Kerala Mess entitlement = the customer's MessAccount (P10A). One CUSTOMER identity, one optional MessAccount.
 * A SUPER_ADMIN approves (never the customer); MD is read-only. Writes and purchase share the customer's row lock, so an edit and a
 * purchase can never interleave.
 */
export class MessAccountService {
  // ================================================================================================ customer
  public static async listServicePoints() {
    const rows = await prisma.messServicePoint.findMany({ where: { status: SERVICE_POINT_STATUS.ACTIVE, branch: { isActive: true } }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, gateLabel: true, city: true } });
    return rows.map(toCustomerServicePointDto);
  }

  public static async getForCustomer(userId: string) {
    const profile = await customerProfileOf(userId);
    const account = await prisma.messAccount.findUnique({ where: { customerProfileId: profile.id }, include: ACCOUNT_INCLUDE });
    return account ? toCustomerAccountDto(account) : null;
  }

  /** Create or update the caller's own Mess account (A4: only a room change keeps an approval). */
  public static async upsertForCustomer(userId: string, body: z.infer<typeof accountWriteSchema>, context?: AuditContext) {
    const profile = await customerProfileOf(userId);
    return await prisma.$transaction(async (tx) => {
      await lockCustomerCheckout(tx, profile.id);
      await lockRow.servicePointShared(tx, body.servicePointId);
      const sp = await tx.messServicePoint.findUnique({ where: { id: body.servicePointId }, include: { branch: { select: { isActive: true } } } });
      if (!sp || sp.status !== SERVICE_POINT_STATUS.ACTIVE || !sp.branch.isActive) throw new AppError('The selected service point is not available', 422, 'SERVICE_POINT_UNAVAILABLE');

      const existing = await tx.messAccount.findUnique({ where: { customerProfileId: profile.id } });
      const studentIdCard = body.studentIdCard ?? null;

      if (!existing) {
        const created = await tx.messAccount.create({
          data: { customerProfileId: profile.id, servicePointId: sp.id, collegeHostelName: sp.name, roomNumber: body.roomNumber, studentIdCard, approvalStatus: MESS_APPROVAL_STATUS.PENDING, isApproved: false },
          include: ACCOUNT_INCLUDE
        });
        await AuditService.record({ actor: { userId, roles: ['CUSTOMER'] }, action: 'MESS_ACCOUNT_SUBMITTED', entity: 'MessAccount', entityId: created.id, payload: { servicePointId: sp.id }, context }, tx);
        return { changed: true, account: toCustomerAccountDto(created) };
      }

      const sensitiveChange = existing.servicePointId !== sp.id || (existing.studentIdCard ?? null) !== studentIdCard;
      const roomChange = existing.roomNumber !== body.roomNumber;
      if (!sensitiveChange && !roomChange && existing.approvalStatus !== MESS_APPROVAL_STATUS.REJECTED) {
        const same = await tx.messAccount.findUniqueOrThrow({ where: { id: existing.id }, include: ACCOUNT_INCLUDE });
        return { changed: false, account: toCustomerAccountDto(same) };
      }

      if (sensitiveChange) {
        // No identity / service-point change while money or service depends on the current one.
        const open = await tx.messSubscription.count({ where: { messAccountId: existing.id, status: { in: [...OPEN_SUBSCRIPTION_STATUSES] } } });
        if (open > 0) throw new AppError('You have an open Kerala Mess subscription. Your hostel details cannot be changed until it ends or is cancelled.', 409, 'ACCOUNT_CHANGE_BLOCKED');
      }

      const needsReapproval = sensitiveChange || existing.approvalStatus === MESS_APPROVAL_STATUS.REJECTED;
      const updated = await tx.messAccount.update({
        where: { id: existing.id },
        data: {
          servicePointId: sp.id,
          collegeHostelName: sp.name,
          roomNumber: body.roomNumber,
          studentIdCard,
          ...(needsReapproval ? { approvalStatus: MESS_APPROVAL_STATUS.PENDING, isApproved: false, reviewedAt: null, reviewedByUserId: null, rejectionReasonCode: null } : {})
        },
        include: ACCOUNT_INCLUDE
      });
      await AuditService.record(
        { actor: { userId, roles: ['CUSTOMER'] }, action: needsReapproval ? 'MESS_ACCOUNT_RESUBMITTED' : 'MESS_ACCOUNT_ROOM_UPDATED', entity: 'MessAccount', entityId: existing.id, payload: { servicePointId: sp.id, previousStatus: existing.approvalStatus, reapproval: needsReapproval }, context },
        tx
      );
      return { changed: true, account: toCustomerAccountDto(updated) };
    });
  }

  // ================================================================================================ staff
  public static async listForStaff(viewer: 'ADMIN' | 'MD', query: { status?: string; servicePointId?: string; limit: number }) {
    const where = { ...(query.status ? { approvalStatus: query.status } : {}), ...(query.servicePointId ? { servicePointId: query.servicePointId } : {}) };
    const [rows, total] = await Promise.all([
      prisma.messAccount.findMany({
        where,
        include: { ...ACCOUNT_INCLUDE, customerProfile: { select: { fullName: true, user: { select: { phone: true, email: true } } } } },
        orderBy: [{ approvalStatus: 'asc' }, { updatedAt: 'desc' }],
        take: query.limit
      }),
      prisma.messAccount.count({ where })
    ]);
    return { accounts: rows.map((r) => toAdminAccountDto(r, viewer)), total };
  }

  public static async approve(actor: Actor, accountId: string, body: z.infer<typeof accountApproveSchema>, context?: AuditContext) {
    return await prisma.$transaction(async (tx) => {
      await lockRow.account(tx, accountId);
      const account = await tx.messAccount.findUnique({ where: { id: accountId } });
      if (!account) throw new AppError('Mess account not found', 404, 'NOT_FOUND');
      // The reviewer approved a SPECIFIC service point: if the customer changed it meanwhile, the approval is refused.
      if (account.servicePointId !== body.expectedServicePointId) throw new AppError('The customer changed their details. Review the account again.', 409, 'ACCOUNT_CHANGED');
      if (account.approvalStatus === MESS_APPROVAL_STATUS.APPROVED) {
        const same = await tx.messAccount.findUniqueOrThrow({ where: { id: accountId }, include: { ...ACCOUNT_INCLUDE, customerProfile: { select: { fullName: true, user: { select: { phone: true, email: true } } } } } });
        return { changed: false, account: toAdminAccountDto(same, 'ADMIN') };
      }
      if (account.approvalStatus !== MESS_APPROVAL_STATUS.PENDING) throw new AppError('Only a pending account can be approved', 409, 'ACCOUNT_STATE_INVALID');
      await lockRow.servicePointShared(tx, body.expectedServicePointId);
      const sp = await tx.messServicePoint.findUnique({ where: { id: body.expectedServicePointId }, include: { branch: { select: { isActive: true } } } });
      if (!sp || sp.status !== SERVICE_POINT_STATUS.ACTIVE || !sp.branch.isActive) throw new AppError('The service point is not active', 409, 'SERVICE_POINT_UNAVAILABLE');

      const now = new Date();
      const cas = await tx.messAccount.updateMany({
        where: { id: accountId, approvalStatus: MESS_APPROVAL_STATUS.PENDING, servicePointId: body.expectedServicePointId },
        data: { approvalStatus: MESS_APPROVAL_STATUS.APPROVED, isApproved: true, reviewedAt: now, reviewedByUserId: actor.userId, rejectionReasonCode: null }
      });
      if (cas.count !== 1) throw new AppError('The account was changed by another request. Review it again.', 409, 'ACCOUNT_CHANGED');
      await AuditService.record({ actor: { userId: actor.userId, roles: actor.roles }, action: 'MESS_ACCOUNT_APPROVED', entity: 'MessAccount', entityId: accountId, payload: { servicePointId: sp.id }, context }, tx);
      const next = await tx.messAccount.findUniqueOrThrow({ where: { id: accountId }, include: { ...ACCOUNT_INCLUDE, customerProfile: { select: { fullName: true, user: { select: { phone: true, email: true } } } } } });
      return { changed: true, account: toAdminAccountDto(next, 'ADMIN') };
    });
  }

  public static async reject(actor: Actor, accountId: string, body: z.infer<typeof accountRejectSchema>, context?: AuditContext) {
    return await prisma.$transaction(async (tx) => {
      await lockRow.account(tx, accountId);
      const account = await tx.messAccount.findUnique({ where: { id: accountId } });
      if (!account) throw new AppError('Mess account not found', 404, 'NOT_FOUND');
      if (account.approvalStatus === MESS_APPROVAL_STATUS.REJECTED) {
        const same = await tx.messAccount.findUniqueOrThrow({ where: { id: accountId }, include: { ...ACCOUNT_INCLUDE, customerProfile: { select: { fullName: true, user: { select: { phone: true, email: true } } } } } });
        return { changed: false, account: toAdminAccountDto(same, 'ADMIN') };
      }
      if (account.approvalStatus !== MESS_APPROVAL_STATUS.PENDING) throw new AppError('Only a pending account can be rejected', 409, 'ACCOUNT_STATE_INVALID');
      const note = sanitizeNote(body.note ?? null);
      const cas = await tx.messAccount.updateMany({
        where: { id: accountId, approvalStatus: MESS_APPROVAL_STATUS.PENDING },
        data: { approvalStatus: MESS_APPROVAL_STATUS.REJECTED, isApproved: false, reviewedAt: new Date(), reviewedByUserId: actor.userId, rejectionReasonCode: body.reasonCode }
      });
      if (cas.count !== 1) throw new AppError('The account was changed by another request. Review it again.', 409, 'ACCOUNT_CHANGED');
      await AuditService.record({ actor: { userId: actor.userId, roles: actor.roles }, action: 'MESS_ACCOUNT_REJECTED', entity: 'MessAccount', entityId: accountId, payload: { reasonCode: body.reasonCode, note: note ?? undefined }, context }, tx);
      const next = await tx.messAccount.findUniqueOrThrow({ where: { id: accountId }, include: { ...ACCOUNT_INCLUDE, customerProfile: { select: { fullName: true, user: { select: { phone: true, email: true } } } } } });
      return { changed: true, account: toAdminAccountDto(next, 'ADMIN') };
    });
  }
}

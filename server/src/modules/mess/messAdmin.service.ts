import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import {
  MessTx,
  OPEN_SUBSCRIPTION_STATUSES,
  PLAN_STATUS,
  SERVICE_POINT_STATUS,
  assertPlanActivatable,
  dateFromString,
  isUniqueViolation,
  listQuerySchema,
  lockRow,
  planActionSchema,
  planCreateSchema,
  planUpdateSchema,
  servicePointCreateSchema,
  servicePointUpdateSchema
} from './messPolicy.js';
import { toAdminPlanDto, toAdminServicePointDto } from './messDto.js';

type Actor = { userId: string; roles: readonly string[] };
const audit = (actor: Actor, action: string, entity: string, entityId: string, payload: unknown, context: AuditContext | undefined, tx: MessTx) =>
  AuditService.record({ actor: { userId: actor.userId, roles: actor.roles }, action, entity, entityId, payload, context }, tx);

const stale = (what: string) => new AppError(`This ${what} was changed by someone else. Reload and try again.`, 409, 'VERSION_CONFLICT');

/** SUPER_ADMIN management of Kerala Mess service points and plans (every write is audited in the SAME transaction; edits use an expected-version CAS). */
export class MessAdminService {
  // ================================================================================================ service points
  public static async listServicePoints(query: { status?: string; limit: number }) {
    const rows = await prisma.messServicePoint.findMany({
      where: query.status ? { status: query.status } : {},
      include: { branch: { select: { id: true, code: true, name: true } } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      take: query.limit
    });
    return rows.map(toAdminServicePointDto);
  }

  public static async createServicePoint(actor: Actor, body: z.infer<typeof servicePointCreateSchema>, context?: AuditContext) {
    try {
      return await prisma.$transaction(async (tx) => {
        const branch = await tx.kitchenBranch.findUnique({ where: { id: body.branchId }, select: { id: true, isActive: true } });
        if (!branch || !branch.isActive) throw new AppError('The selected branch does not exist or is not active', 422, 'BRANCH_INVALID');
        const created = await tx.messServicePoint.create({
          data: { code: body.code, name: body.name, gateLabel: body.gateLabel ?? null, addressLine: body.addressLine, city: body.city, postalCode: body.postalCode, branchId: body.branchId },
          include: { branch: { select: { id: true, code: true, name: true } } }
        });
        await audit(actor, 'MESS_SERVICE_POINT_CREATED', 'MessServicePoint', created.id, { code: created.code, branchId: created.branchId }, context, tx);
        return toAdminServicePointDto(created);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('A service point with this code already exists', 409, 'SERVICE_POINT_CODE_TAKEN');
      throw err;
    }
  }

  public static async updateServicePoint(actor: Actor, id: string, body: z.infer<typeof servicePointUpdateSchema>, context?: AuditContext) {
    return await prisma.$transaction(async (tx) => {
      await lockRow.servicePoint(tx, id);
      const current = await tx.messServicePoint.findUnique({ where: { id } });
      if (!current) throw new AppError('Service point not found', 404, 'NOT_FOUND');
      if (current.version !== body.expectedVersion) throw stale('service point');

      const { expectedVersion: _v, status, ...fields } = body;
      void _v;
      if (status === SERVICE_POINT_STATUS.INACTIVE && current.status !== SERVICE_POINT_STATUS.INACTIVE) {
        // A service point in use by an open purchase / paid subscription cannot be switched off underneath it.
        const open = await tx.messSubscription.count({ where: { servicePointId: id, status: { in: [...OPEN_SUBSCRIPTION_STATUSES] } } });
        if (open > 0) throw new AppError('This service point has open subscriptions and cannot be deactivated', 409, 'SERVICE_POINT_IN_USE');
      }
      const data: Prisma.MessServicePointUpdateManyMutationInput = { version: { increment: 1 } };
      for (const [k, v] of Object.entries(fields)) if (v !== undefined) (data as Record<string, unknown>)[k] = v;
      if (status) data.status = status;

      const changed = await tx.messServicePoint.updateMany({ where: { id, version: body.expectedVersion }, data });
      if (changed.count !== 1) throw stale('service point');
      const next = await tx.messServicePoint.findUniqueOrThrow({ where: { id }, include: { branch: { select: { id: true, code: true, name: true } } } });
      // The account's cached hostel name follows the service point name (server-derived, never client supplied).
      if (fields.name && fields.name !== current.name) await tx.messAccount.updateMany({ where: { servicePointId: id }, data: { collegeHostelName: fields.name } });
      await audit(actor, 'MESS_SERVICE_POINT_UPDATED', 'MessServicePoint', id, { fields: Object.keys(body).filter((k) => k !== 'expectedVersion'), status: next.status, version: next.version }, context, tx);
      return toAdminServicePointDto(next);
    });
  }

  // ================================================================================================ plans
  public static async listPlans(query: { status?: string; limit: number }) {
    const rows = await prisma.messSubscriptionPlan.findMany({
      where: query.status ? { status: query.status } : {},
      include: { branch: { select: { id: true, code: true, name: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: query.limit
    });
    return rows.map(toAdminPlanDto);
  }

  public static async createPlan(actor: Actor, body: z.infer<typeof planCreateSchema>, context?: AuditContext) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (body.branchId) await this.assertBranch(tx, body.branchId);
        this.assertWindowOrder(body.validFrom ? dateFromString(body.validFrom) : null, body.validUntil ? dateFromString(body.validUntil) : null);
        const slots = body.mealSlots ?? [];
        this.assertSlotTimesKeys(body.slotTimes, slots);
        const created = await tx.messSubscriptionPlan.create({
          data: {
            code: body.code,
            name: body.name,
            description: body.description ?? null,
            durationDays: body.durationDays,
            basePrice: body.basePrice,
            taxRate: body.taxRate ?? null,
            mealSlots: slots,
            mealsPerDay: slots.length,
            pauseCutoffHours: body.pauseCutoffHours ?? null,
            maxPauses: body.maxPauses ?? null,
            minStartLeadDays: body.minStartLeadDays ?? null,
            validFrom: body.validFrom ? dateFromString(body.validFrom) : null,
            validUntil: body.validUntil ? dateFromString(body.validUntil) : null,
            branchId: body.branchId ?? null,
            slotTimes: body.slotTimes ?? Prisma.DbNull,
            status: PLAN_STATUS.DRAFT,
            active: false
          },
          include: { branch: { select: { id: true, code: true, name: true } } }
        });
        this.assertWindowOrder(created.validFrom, created.validUntil);
        await audit(actor, 'MESS_PLAN_CREATED', 'MessSubscriptionPlan', created.id, { code: created.code, status: created.status }, context, tx);
        return toAdminPlanDto(created);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('A plan with this code already exists', 409, 'PLAN_CODE_TAKEN');
      throw err;
    }
  }

  public static async updatePlan(actor: Actor, id: string, body: z.infer<typeof planUpdateSchema>, context?: AuditContext) {
    return await prisma.$transaction(async (tx) => {
      await lockRow.plan(tx, id);
      const current = await tx.messSubscriptionPlan.findUnique({ where: { id } });
      if (!current) throw new AppError('Plan not found', 404, 'NOT_FOUND');
      if (current.version !== body.expectedVersion) throw stale('plan');
      if (current.status === PLAN_STATUS.ARCHIVED) throw new AppError('An archived plan cannot be edited', 409, 'PLAN_ARCHIVED');
      if (body.branchId) await this.assertBranch(tx, body.branchId);

      const data: Prisma.MessSubscriptionPlanUpdateManyMutationInput & { branchId?: string | null } = { version: { increment: 1 } };
      if (body.name !== undefined) data.name = body.name;
      if (body.description !== undefined) data.description = body.description;
      if (body.durationDays !== undefined) data.durationDays = body.durationDays;
      if (body.basePrice !== undefined) data.basePrice = body.basePrice;
      if (body.taxRate !== undefined) data.taxRate = body.taxRate;
      if (body.mealSlots !== undefined) {
        data.mealSlots = body.mealSlots;
        data.mealsPerDay = body.mealSlots.length;
      }
      if (body.pauseCutoffHours !== undefined) data.pauseCutoffHours = body.pauseCutoffHours;
      if (body.maxPauses !== undefined) data.maxPauses = body.maxPauses;
      if (body.minStartLeadDays !== undefined) data.minStartLeadDays = body.minStartLeadDays;
      if (body.validFrom !== undefined) data.validFrom = body.validFrom ? dateFromString(body.validFrom) : null;
      if (body.validUntil !== undefined) data.validUntil = body.validUntil ? dateFromString(body.validUntil) : null;
      if (body.branchId !== undefined) data.branchId = body.branchId;
      if (body.slotTimes !== undefined) (data as Record<string, unknown>).slotTimes = body.slotTimes ?? Prisma.DbNull;

      // The merged result must be coherent; an ACTIVE plan must stay complete after the edit.
      const merged = {
        basePrice: (data.basePrice as string | undefined) ?? current.basePrice,
        taxRate: data.taxRate !== undefined ? (data.taxRate as string | null) : current.taxRate,
        durationDays: (data.durationDays as number | undefined) ?? current.durationDays,
        mealSlots: (data.mealSlots as string[] | undefined) ?? current.mealSlots,
        pauseCutoffHours: data.pauseCutoffHours !== undefined ? (data.pauseCutoffHours as number | null) : current.pauseCutoffHours,
        maxPauses: data.maxPauses !== undefined ? (data.maxPauses as number | null) : current.maxPauses,
        minStartLeadDays: data.minStartLeadDays !== undefined ? (data.minStartLeadDays as number | null) : current.minStartLeadDays,
        validFrom: data.validFrom !== undefined ? (data.validFrom as Date | null) : current.validFrom,
        validUntil: data.validUntil !== undefined ? (data.validUntil as Date | null) : current.validUntil,
        slotTimes: body.slotTimes !== undefined ? body.slotTimes : current.slotTimes
      };
      this.assertWindowOrder(merged.validFrom, merged.validUntil);
      this.assertSlotTimesKeys(merged.slotTimes, merged.mealSlots);
      if (current.status === PLAN_STATUS.ACTIVE) assertPlanActivatable(merged);

      const result = await tx.messSubscriptionPlan.updateMany({ where: { id, version: body.expectedVersion }, data: data as Prisma.MessSubscriptionPlanUpdateManyMutationInput });
      if (result.count !== 1) throw stale('plan');
      const next = await tx.messSubscriptionPlan.findUniqueOrThrow({ where: { id }, include: { branch: { select: { id: true, code: true, name: true } } } });
      await audit(
        actor,
        'MESS_PLAN_UPDATED',
        'MessSubscriptionPlan',
        id,
        { fields: Object.keys(body).filter((k) => k !== 'expectedVersion'), status: next.status, version: next.version, priceChanged: body.basePrice !== undefined, taxRateChanged: body.taxRate !== undefined },
        context,
        tx
      );
      return toAdminPlanDto(next);
    });
  }

  public static async activatePlan(actor: Actor, id: string, body: z.infer<typeof planActionSchema>, context?: AuditContext) {
    return await prisma.$transaction(async (tx) => {
      await lockRow.plan(tx, id);
      const current = await tx.messSubscriptionPlan.findUnique({ where: { id } });
      if (!current) throw new AppError('Plan not found', 404, 'NOT_FOUND');
      if (current.status === PLAN_STATUS.ACTIVE) {
        const same = await tx.messSubscriptionPlan.findUniqueOrThrow({ where: { id }, include: { branch: { select: { id: true, code: true, name: true } } } });
        return { changed: false, plan: toAdminPlanDto(same) };
      }
      if (current.version !== body.expectedVersion) throw stale('plan');
      if (current.status !== PLAN_STATUS.DRAFT) throw new AppError('Only a draft plan can be activated', 409, 'PLAN_STATE_INVALID');
      this.assertWindowOrder(current.validFrom, current.validUntil);
      assertPlanActivatable(current);
      if (current.branchId) await this.assertBranch(tx, current.branchId);

      const result = await tx.messSubscriptionPlan.updateMany({ where: { id, version: body.expectedVersion, status: PLAN_STATUS.DRAFT }, data: { status: PLAN_STATUS.ACTIVE, active: true, version: { increment: 1 } } });
      if (result.count !== 1) throw stale('plan');
      const next = await tx.messSubscriptionPlan.findUniqueOrThrow({ where: { id }, include: { branch: { select: { id: true, code: true, name: true } } } });
      await audit(actor, 'MESS_PLAN_ACTIVATED', 'MessSubscriptionPlan', id, { code: next.code, version: next.version }, context, tx);
      return { changed: true, plan: toAdminPlanDto(next) };
    });
  }

  /** ACTIVE/DRAFT -> ARCHIVED. Existing subscriptions keep their snapshot and are untouched; the plan simply stops being sold. */
  public static async archivePlan(actor: Actor, id: string, body: z.infer<typeof planActionSchema>, context?: AuditContext) {
    return await prisma.$transaction(async (tx) => {
      await lockRow.plan(tx, id);
      const current = await tx.messSubscriptionPlan.findUnique({ where: { id } });
      if (!current) throw new AppError('Plan not found', 404, 'NOT_FOUND');
      if (current.status === PLAN_STATUS.ARCHIVED) {
        const same = await tx.messSubscriptionPlan.findUniqueOrThrow({ where: { id }, include: { branch: { select: { id: true, code: true, name: true } } } });
        return { changed: false, plan: toAdminPlanDto(same) };
      }
      if (current.version !== body.expectedVersion) throw stale('plan');
      const result = await tx.messSubscriptionPlan.updateMany({ where: { id, version: body.expectedVersion }, data: { status: PLAN_STATUS.ARCHIVED, active: false, version: { increment: 1 } } });
      if (result.count !== 1) throw stale('plan');
      const next = await tx.messSubscriptionPlan.findUniqueOrThrow({ where: { id }, include: { branch: { select: { id: true, code: true, name: true } } } });
      await audit(actor, 'MESS_PLAN_ARCHIVED', 'MessSubscriptionPlan', id, { code: next.code, version: next.version }, context, tx);
      return { changed: true, plan: toAdminPlanDto(next) };
    });
  }

  // ================================================================================================ helpers
  private static async assertBranch(tx: MessTx, branchId: string): Promise<void> {
    const branch = await tx.kitchenBranch.findUnique({ where: { id: branchId }, select: { id: true, isActive: true } });
    if (!branch || !branch.isActive) throw new AppError('The selected branch does not exist or is not active', 422, 'BRANCH_INVALID');
  }

  /** A time for a slot that is not enabled is always an error (a draft may still be MISSING times, but never carry a stray one). */
  private static assertSlotTimesKeys(slotTimes: unknown, slots: readonly string[]): void {
    if (slotTimes && typeof slotTimes === 'object' && Object.keys(slotTimes).some((k) => !slots.includes(k))) {
      throw new AppError('slotTimes contains a time for a slot that is not enabled', 422, 'PLAN_SLOT_TIMES_INVALID');
    }
  }

  private static assertWindowOrder(validFrom: Date | null, validUntil: Date | null): void {
    if (validFrom && validUntil && !(validFrom.getTime() < validUntil.getTime())) {
      throw new AppError('validUntil must be after validFrom', 422, 'PLAN_WINDOW_INVALID');
    }
  }
}

export { listQuerySchema };

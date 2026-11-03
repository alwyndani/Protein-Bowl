import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditService } from '../audit/audit.service.js';

export interface PlanInput {
  title: string;
  goal: string;
  durationWeeks: number;
  notes?: string | null;
  days: Array<{
    dayOfWeek: string;
    title: string;
    focusArea: string;
    exercises: Array<{ name: string; sets: number; reps: string; restSeconds: number; notes?: string | null; videoUrl?: string | null }>;
  }>;
}

const planInclude = {
  workoutDays: { include: { exercises: true } }
} as const;

/** Trainer coaching: assignment-gated workout plans and customer progress. A trainer never sees health/diet data. */
export class TrainerService {
  private static async assertAssigned(trainerUserId: string, customerProfileId: string) {
    const a = await prisma.trainerAssignment.findUnique({
      where: { trainerUserId_customerProfileId: { trainerUserId, customerProfileId } }
    });
    // Unassigned and unknown customers are indistinguishable.
    if (!a || a.status !== 'ACTIVE') throw new AppError('Client not found', 404, 'NOT_FOUND');
  }

  private static async ownPlan(trainerUserId: string, planId: string) {
    const plan = await prisma.workoutPlan.findUnique({ where: { id: planId } });
    if (!plan || plan.trainerId !== trainerUserId) throw new AppError('Plan not found', 404, 'NOT_FOUND');
    await this.assertAssigned(trainerUserId, plan.customerProfileId);
    return plan;
  }

  public static async listClients(trainerUserId: string) {
    const rows = await prisma.trainerAssignment.findMany({
      where: { trainerUserId, status: 'ACTIVE' },
      include: {
        customerProfile: {
          select: {
            id: true,
            fullName: true,
            workoutPlans: { where: { trainerId: trainerUserId }, select: { id: true, title: true, status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } }
          }
        }
      },
      orderBy: { assignedAt: 'desc' }
    });
    return rows.map((r) => ({
      assignmentId: r.id,
      assignedAt: r.assignedAt,
      customerProfileId: r.customerProfile.id,
      fullName: r.customerProfile.fullName,
      plans: r.customerProfile.workoutPlans
    }));
  }

  public static async listPlansForClient(trainerUserId: string, customerProfileId: string) {
    await this.assertAssigned(trainerUserId, customerProfileId);
    return prisma.workoutPlan.findMany({
      where: { customerProfileId, trainerId: trainerUserId },
      include: planInclude,
      orderBy: { updatedAt: 'desc' }
    });
  }

  public static async createPlan(trainerUserId: string, customerProfileId: string, input: PlanInput) {
    await this.assertAssigned(trainerUserId, customerProfileId);
    return prisma.$transaction(async (tx) => {
      const plan = await tx.workoutPlan.create({
        data: {
          customerProfileId,
          trainerId: trainerUserId,
          title: input.title,
          goal: input.goal,
          durationWeeks: input.durationWeeks,
          notes: input.notes ?? null,
          workoutDays: {
            create: input.days.map((d) => ({
              dayOfWeek: d.dayOfWeek,
              title: d.title,
              focusArea: d.focusArea,
              exercises: { create: d.exercises.map((e) => ({ ...e, notes: e.notes ?? null, videoUrl: e.videoUrl ?? null })) }
            }))
          }
        },
        include: planInclude
      });
      await AuditService.record(
        { actor: { userId: trainerUserId, roles: ['TRAINER'] }, action: 'WORKOUT_PLAN_CREATED', entity: 'WorkoutPlan', entityId: plan.id, payload: { customerProfileId } },
        tx
      );
      return plan;
    });
  }

  /** Replaces the plan's days/exercises (past progress logs keep their own rows). */
  public static async updatePlan(trainerUserId: string, planId: string, input: PlanInput) {
    await this.ownPlan(trainerUserId, planId);
    return prisma.$transaction(async (tx) => {
      await tx.workoutDay.deleteMany({ where: { workoutPlanId: planId } });
      const plan = await tx.workoutPlan.update({
        where: { id: planId },
        data: {
          title: input.title,
          goal: input.goal,
          durationWeeks: input.durationWeeks,
          notes: input.notes ?? null,
          workoutDays: {
            create: input.days.map((d) => ({
              dayOfWeek: d.dayOfWeek,
              title: d.title,
              focusArea: d.focusArea,
              exercises: { create: d.exercises.map((e) => ({ ...e, notes: e.notes ?? null, videoUrl: e.videoUrl ?? null })) }
            }))
          }
        },
        include: planInclude
      });
      await AuditService.record(
        { actor: { userId: trainerUserId, roles: ['TRAINER'] }, action: 'WORKOUT_PLAN_UPDATED', entity: 'WorkoutPlan', entityId: planId },
        tx
      );
      return plan;
    });
  }

  public static async setPlanStatus(trainerUserId: string, planId: string, status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED') {
    await this.ownPlan(trainerUserId, planId);
    return prisma.workoutPlan.update({ where: { id: planId }, data: { status }, include: planInclude });
  }

  public static async logsForTrainer(trainerUserId: string, planId: string) {
    await this.ownPlan(trainerUserId, planId);
    return prisma.workoutLog.findMany({ where: { workoutPlanId: planId }, orderBy: { loggedOn: 'desc' }, take: 200 });
  }

  // ---- SUPER_ADMIN assignment management ----

  public static async assign(actorUserId: string, trainerUserId: string, customerEmail: string) {
    const trainer = await prisma.user.findFirst({
      where: { id: trainerUserId, status: 'ACTIVE', deletedAt: null, roles: { some: { role: 'TRAINER' } } },
      select: { id: true }
    });
    if (!trainer) throw new AppError('Trainer not found', 404, 'TRAINER_NOT_FOUND');
    const customer = await prisma.customerProfile.findFirst({
      where: { user: { email: customerEmail.toLowerCase(), deletedAt: null } },
      select: { id: true }
    });
    if (!customer) throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');

    return prisma.$transaction(async (tx) => {
      const row = await tx.trainerAssignment.upsert({
        where: { trainerUserId_customerProfileId: { trainerUserId, customerProfileId: customer.id } },
        create: { trainerUserId, customerProfileId: customer.id, assignedByUserId: actorUserId },
        update: { status: 'ACTIVE', endedAt: null, assignedByUserId: actorUserId }
      });
      await AuditService.record(
        { actor: { userId: actorUserId, roles: ['SUPER_ADMIN'] }, action: 'TRAINER_ASSIGNED', entity: 'TrainerAssignment', entityId: row.id, payload: { trainerUserId, customerProfileId: customer.id } },
        tx
      );
      return row;
    });
  }

  public static async endAssignment(actorUserId: string, assignmentId: string) {
    const row = await prisma.trainerAssignment.findUnique({ where: { id: assignmentId } });
    if (!row) throw new AppError('Assignment not found', 404, 'NOT_FOUND');
    if (row.status === 'ENDED') return row;
    return prisma.$transaction(async (tx) => {
      const updated = await tx.trainerAssignment.update({ where: { id: assignmentId }, data: { status: 'ENDED', endedAt: new Date() } });
      await AuditService.record(
        { actor: { userId: actorUserId, roles: ['SUPER_ADMIN'] }, action: 'TRAINER_ASSIGNMENT_ENDED', entity: 'TrainerAssignment', entityId: assignmentId },
        tx
      );
      return updated;
    });
  }

  public static async listAssignments() {
    return prisma.trainerAssignment.findMany({
      include: {
        trainer: { select: { id: true, email: true } },
        customerProfile: { select: { id: true, fullName: true } }
      },
      orderBy: { assignedAt: 'desc' },
      take: 500
    });
  }

  // ---- Customer side ----

  private static async customerProfileId(userId: string): Promise<string> {
    const p = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!p) throw new AppError('Customer profile not found', 404, 'PROFILE_NOT_FOUND');
    return p.id;
  }

  public static async myPlans(userId: string) {
    const customerProfileId = await this.customerProfileId(userId);
    return prisma.workoutPlan.findMany({
      where: { customerProfileId, status: { not: 'ARCHIVED' } },
      include: planInclude,
      orderBy: { updatedAt: 'desc' }
    });
  }

  private static async myPlan(userId: string, planId: string) {
    const customerProfileId = await this.customerProfileId(userId);
    const plan = await prisma.workoutPlan.findFirst({ where: { id: planId, customerProfileId } });
    if (!plan) throw new AppError('Plan not found', 404, 'NOT_FOUND');
    return { plan, customerProfileId };
  }

  public static async logProgress(
    userId: string,
    planId: string,
    input: { workoutDayId?: string; completed: boolean; perceivedEffort?: number; bodyWeightKg?: number; notes?: string }
  ) {
    const { plan, customerProfileId } = await this.myPlan(userId, planId);
    if (plan.status !== 'ACTIVE') throw new AppError('This plan is not active', 409, 'PLAN_NOT_ACTIVE');
    if (input.workoutDayId) {
      const day = await prisma.workoutDay.findFirst({ where: { id: input.workoutDayId, workoutPlanId: planId }, select: { id: true } });
      if (!day) throw new AppError('Workout day not found', 404, 'NOT_FOUND');
    }
    return prisma.workoutLog.create({
      data: {
        workoutPlanId: planId,
        customerProfileId,
        workoutDayId: input.workoutDayId ?? null,
        completed: input.completed,
        perceivedEffort: input.perceivedEffort ?? null,
        bodyWeightKg: input.bodyWeightKg ?? null,
        notes: input.notes ?? null
      }
    });
  }

  public static async myLogs(userId: string, planId: string) {
    await this.myPlan(userId, planId);
    return prisma.workoutLog.findMany({ where: { workoutPlanId: planId }, orderBy: { loggedOn: 'desc' }, take: 200 });
  }
}

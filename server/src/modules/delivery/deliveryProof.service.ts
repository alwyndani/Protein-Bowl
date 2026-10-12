import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Prisma, RoleEnum } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { deliveryProofConfig } from '../../config/deliveryProofConfig.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { OrderTransitionService } from '../order/orderTransition.service.js';
import { lockOrder } from '../payment/paymentOps.js';
import { sanitizeNote } from '../refund/cancellationPolicy.js';
import { DeliveryOrderNotVisible, DeliveryService, DriverCaller } from './delivery.service.js';
import { archiveFailedAttempt } from './deliveryAttemptArchive.js';

/**
 * P9B Delivery Code (proof of handover).
 *
 *  - A cryptographically random 6-digit code is generated ONLY when the owning customer asks for it while the order is DISPATCHED.
 *  - Only HMAC-SHA256(DELIVERY_PROOF_SECRET, "pb-delivery-code|v1|<orderId>|<codeVersion>|<code>") is stored. The plaintext exists only in
 *    the issue/regenerate response (no-store) and in the customer's component memory. It is never logged, audited or persisted.
 *  - Verification state (attempts, lock cycles, lock, block) is PERSISTED on DeliveryProof; middleware limiters are only secondary.
 *  - The ONLY writers of DISPATCHED -> DELIVERED are verifyDelivery (valid code) and overrideDelivery (exceptional SUPER_ADMIN), both
 *    through OrderTransitionService with a PROOF actor backed by a verified DeliveryProof row, in one transaction.
 *  - Lock order everywhere: Order row -> DeliveryProof row (the assignment is covered by the order lock, as in P9A).
 *  - A valid code proves HANDOVER only. Payment must already be PAID (re-read under the lock). There is no cash/COD concept here.
 */

// ------------------------------------------------------------------------------------------------ policy constants
export const CODE_LENGTH = 6;
/** Wrong attempts per window before a temporary lock. */
export const MAX_ATTEMPTS_PER_WINDOW = 5;
/** Every temporary lock lasts the same time (no progressive durations). */
export const LOCK_MS = 15 * 60 * 1000;
/** After this many lock cycles the CURRENT code is permanently blocked; the customer must generate a new one. */
export const MAX_LOCK_CYCLES = 3;
/** Cumulative over the order's life (the first issue is not a regeneration). The persisted authority; never reset. */
export const MAX_REGENERATIONS = 10;
/** Regenerations allowed per window, per order. Persisted on DeliveryProof (database-authoritative, identical across instances). */
export const MAX_REGENERATIONS_PER_WINDOW = 3;
export const REGENERATE_WINDOW_MS = 60 * 60 * 1000;

export const OVERRIDE_REASON_CODES = [
  'CUSTOMER_CANNOT_ACCESS_CODE',
  'CUSTOMER_DEVICE_UNAVAILABLE',
  'CODE_VERIFICATION_FAILURE',
  'ACCESSIBILITY_ASSISTANCE',
  'OPERATIONAL_EXCEPTION',
  'OTHER'
] as const;
export type OverrideReasonCode = (typeof OVERRIDE_REASON_CODES)[number];

// ------------------------------------------------------------------------------------------------ request schemas
// The code is a plain bounded string: a Zod error never echoes the value (enums and literals would).
export const verifyBodySchema = z.object({ code: z.string().min(1).max(32) }).strict();
export type VerifyBody = z.infer<typeof verifyBodySchema>;

export const overrideBodySchema = z
  .object({
    reasonCode: z.enum(OVERRIDE_REASON_CODES),
    note: z
      .string()
      .max(1000)
      .transform((v) => sanitizeNote(v))
      .refine((v): v is string => typeof v === 'string' && v.length >= 10, { message: 'A note of at least 10 characters is required' }),
    confirm: z.literal(true)
  })
  .strict();
export type OverrideBody = z.infer<typeof overrideBodySchema>;

export const emptyProofBodySchema = z.object({}).strict();

// ------------------------------------------------------------------------------------------------ crypto
/** Uniformly random 6-digit code from the OS CSPRNG, left-padded. Never derived from anything. */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

export function hashCode(orderId: string, codeVersion: number, code: string): string {
  return createHmac('sha256', deliveryProofConfig.secret).update(`pb-delivery-code|v1|${orderId}|${codeVersion}|${code}`).digest('hex');
}

function hashesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** "123456", "123 456" and "123-456" all become "123456"; anything else is not a delivery code. null never echoes the input. */
export function normalizeCode(input: string): string | null {
  const compact = input.trim().replace(/[\s-]/g, '');
  return /^\d{6}$/.test(compact) ? compact : null;
}

// ------------------------------------------------------------------------------------------------ states
export * from './deliveryProofState.js';
import { CustomerProofDto, CustomerProofState, IssuedCodeDto, PROOF_STATE_SELECT, ProofStateRow, isLocked } from './deliveryProofState.js';

function customerState(order: { status: string; delivery?: { status: string } | null }, p: ProofStateRow | null, now: Date): CustomerProofDto {
  const out = (state: CustomerProofState, lockedUntil: Date | null = null): CustomerProofDto => ({ state, issuedAt: p?.issuedAt ? p.issuedAt.toISOString() : null, lockedUntil: lockedUntil ? lockedUntil.toISOString() : null });
  if (p?.verifiedAt) return out('VERIFIED');
  if (order.status !== 'DISPATCHED') return { state: 'NOT_AVAILABLE', issuedAt: null, lockedUntil: null };
  // P9C: while the attempt is FAILED or a retry is ASSIGNED (not resumed yet) the customer has no usable code
  if (order.delivery?.status !== 'IN_TRANSIT') return { state: 'NOT_AVAILABLE', issuedAt: null, lockedUntil: null };
  if (!p || !p.issuedAt) return out('NOT_ISSUED');
  if (p.blockedAt) return out('CODE_BLOCKED');
  if (isLocked(p, now)) return out('LOCKED', p.lockedUntil);
  return out('ISSUED');
}

// ------------------------------------------------------------------------------------------------ internals
type Tx = Prisma.TransactionClient;

/** Creates the proof row if absent (ON CONFLICT DO NOTHING, unique orderId) and locks it. Caller already holds the ORDER lock. */
export async function lockProof(tx: Tx, orderId: string) {
  await tx.deliveryProof.createMany({ data: [{ orderId }], skipDuplicates: true });
  await tx.$queryRaw`SELECT "id" FROM "delivery_proofs" WHERE "orderId" = ${orderId} FOR UPDATE`;
  return await tx.deliveryProof.findUniqueOrThrow({ where: { orderId } });
}

/** Locks an EXISTING proof row (no creation): normal verification never creates rows. */
async function lockExistingProof(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "delivery_proofs" WHERE "orderId" = ${orderId} FOR UPDATE`;
  return await tx.deliveryProof.findUnique({ where: { orderId } });
}

const ELIGIBLE = (o: { orderType: string; paymentMethod: string | null; paymentStatus: string; status: string }) =>
  o.orderType === 'DIRECT' && o.paymentMethod === 'ONLINE' && o.paymentStatus === 'PAID' && o.status === 'DISPATCHED';

type VerifyOutcome =
  | { kind: 'OK'; changed: boolean; orderNumber: string; deliveredAt: Date }
  | { kind: 'ERROR'; error: AppError };

export class DeliveryProofService {
  // ------------------------------------------------------------------------------------------------ customer
  /** Safe proof state for the owning customer (404 for anyone else, and for unknown orders). */
  public static async getCustomerState(orderId: string, customerProfileId: string): Promise<CustomerProofDto> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, customerProfileId },
      select: { status: true, delivery: { select: { status: true } }, deliveryProof: { select: PROOF_STATE_SELECT } }
    });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    return customerState(order, order.deliveryProof, new Date());
  }

  private static async customerOrder(tx: Tx, orderId: string, customerProfileId: string) {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, status: true, orderType: true, paymentMethod: true, paymentStatus: true, customerProfileId: true, delivery: { select: { status: true } } }
    });
    // ownership is decided under the lock; a foreign or unknown order is the same 404
    if (!order || order.customerProfileId !== customerProfileId) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    // P9C: issue / regenerate need the CURRENT attempt to be IN_TRANSIT (never FAILED, never an ASSIGNED retry that was not resumed)
    if (!ELIGIBLE(order) || order.delivery?.status !== 'IN_TRANSIT') throw new AppError('A delivery code is not available for this order right now', 409, 'DELIVERY_CODE_NOT_AVAILABLE');
    return order;
  }

  /** First issue only. A repeat / double click never silently creates a different code (409). */
  public static async issue(orderId: string, customer: { userId: string; customerProfileId: string }, context?: AuditContext): Promise<IssuedCodeDto> {
    return await prisma.$transaction(async (tx) => {
      const order = await this.customerOrder(tx, orderId, customer.customerProfileId);
      const proof = await lockProof(tx, orderId);
      if (proof.verifiedAt) throw new AppError('This order has already been delivered', 409, 'ALREADY_DELIVERED');
      if (proof.codeHash) throw new AppError('A delivery code was already generated. Generate a new one if you no longer have it.', 409, 'DELIVERY_CODE_ALREADY_ISSUED');

      const code = generateCode();
      const now = new Date();
      await tx.deliveryProof.update({
        where: { orderId },
        data: { codeHash: hashCode(orderId, proof.codeVersion, code), issuedAt: now, failedAttempts: 0, lockCycles: 0, lockedUntil: null, blockedAt: null }
      });
      await AuditService.record(
        { actor: { userId: customer.userId, roles: [RoleEnum.CUSTOMER] }, action: 'DELIVERY_CODE_ISSUED', entity: 'Order', entityId: orderId, payload: { orderNumber: order.orderNumber }, context },
        tx
      );
      return { state: 'ISSUED' as const, issuedAt: now.toISOString(), lockedUntil: null, code };
    });
  }

  /** Replaces the code: the old one dies immediately (codeVersion changes), the CURRENT code's counters reset, regenerationCount is cumulative. */
  public static async regenerate(orderId: string, customer: { userId: string; customerProfileId: string }, context?: AuditContext): Promise<IssuedCodeDto> {
    return await prisma.$transaction(async (tx) => {
      const order = await this.customerOrder(tx, orderId, customer.customerProfileId);
      const proof = await lockProof(tx, orderId);
      if (proof.verifiedAt) throw new AppError('This order has already been delivered', 409, 'ALREADY_DELIVERED');
      if (!proof.codeHash || !proof.issuedAt) throw new AppError('No delivery code has been generated yet', 409, 'DELIVERY_CODE_NOT_ISSUED');
      if (proof.regenerationCount >= MAX_REGENERATIONS) {
        throw new AppError('The limit for new delivery codes on this order has been reached. Please contact Protein Bowl support.', 409, 'DELIVERY_CODE_REGENERATION_LIMIT');
      }
      const now = new Date();
      // Fixed window opened by the first regeneration; evaluated under the order + proof row locks. A rejected request writes nothing.
      const windowActive = proof.regenerationWindowStartedAt !== null && now.getTime() < proof.regenerationWindowStartedAt.getTime() + REGENERATE_WINDOW_MS;
      if (windowActive && proof.regenerationsInWindow >= MAX_REGENERATIONS_PER_WINDOW) {
        throw new AppError('You have generated several new codes recently. Please wait before generating another.', 429, 'DELIVERY_CODE_REGENERATE_LIMIT');
      }

      const code = generateCode();
      const nextVersion = proof.codeVersion + 1;
      await tx.deliveryProof.update({
        where: { orderId },
        data: {
          codeVersion: nextVersion,
          codeHash: hashCode(orderId, nextVersion, code),
          issuedAt: now,
          regenerationCount: { increment: 1 },
          regenerationWindowStartedAt: windowActive ? proof.regenerationWindowStartedAt : now,
          regenerationsInWindow: windowActive ? proof.regenerationsInWindow + 1 : 1,
          failedAttempts: 0,
          lockCycles: 0,
          lockedUntil: null,
          blockedAt: null
        }
      });
      await AuditService.record(
        {
          actor: { userId: customer.userId, roles: [RoleEnum.CUSTOMER] },
          action: 'DELIVERY_CODE_REGENERATED',
          entity: 'Order',
          entityId: orderId,
          payload: { orderNumber: order.orderNumber, regenerationCount: proof.regenerationCount + 1 },
          context
        },
        tx
      );
      return { state: 'ISSUED' as const, issuedAt: now.toISOString(), lockedUntil: null, code };
    });
  }

  // ------------------------------------------------------------------------------------------------ driver
  /**
   * Normal completion. `receivedAt` is when the request ARRIVED (before any lock wait): a code submitted before a concurrent regeneration
   * committed is a stale code, not a guess against the new one, so it is answered DELIVERY_CODE_CHANGED and NOT counted.
   * Wrong attempts are committed (counter / lock / block) and the safe error is thrown only AFTER the transaction commits.
   */
  public static async verifyDelivery(orderId: string, rawCode: string, caller: DriverCaller, receivedAt: Date, context?: AuditContext) {
    const code = normalizeCode(rawCode);
    if (!code) throw new AppError('Enter the 6-digit delivery code', 422, 'INVALID_DELIVERY_CODE_FORMAT');
    const roles = [RoleEnum.DELIVERY];

    let outcome: VerifyOutcome;
    try {
      outcome = await prisma.$transaction(async (tx): Promise<VerifyOutcome> => {
        const order = await DeliveryService.lockAndLoad(tx, orderId);
        const visible =
          !!order &&
          order.orderType === 'DIRECT' &&
          order.paymentMethod === 'ONLINE' &&
          !!order.kitchenBranchId &&
          caller.branchIds.includes(order.kitchenBranchId) &&
          order.delivery?.driverId === caller.employeeProfileId;
        if (!visible || !order) throw new DeliveryOrderNotVisible(!!order, 'write');

        const proofRow = await lockExistingProof(tx, orderId);
        const err = (message: string, status: number, codeName: string): VerifyOutcome => ({ kind: 'ERROR', error: new AppError(message, status, codeName) });

        if (order.status === 'DELIVERED') {
          if (!proofRow) return err('This order has already been delivered', 409, 'ALREADY_DELIVERED');
          const replay = proofRow.method === 'PIN' && proofRow.verifiedByEmployeeId === caller.employeeProfileId && !!proofRow.codeHash && hashesMatch(proofRow.codeHash, hashCode(orderId, proofRow.codeVersion, code));
          return replay ? { kind: 'OK', changed: false, orderNumber: order.orderNumber, deliveredAt: proofRow.verifiedAt! } : err('This order has already been delivered', 409, 'ALREADY_DELIVERED');
        }
        if (order.status !== 'DISPATCHED') return err('Only an order that is out for delivery can be completed', 409, 'ORDER_NOT_DISPATCHED');
        const assignment = order.delivery!;
        if (assignment.status === 'FAILED') return err('A problem was reported for this delivery. Please wait for instructions from the team.', 409, 'DELIVERY_IN_EXCEPTION');
        if (assignment.status !== 'IN_TRANSIT') return err('This delivery is not in a state that can be completed', 409, 'INVALID_DELIVERY_STATE');
        if (order.paymentStatus !== 'PAID') return err('This order is no longer eligible for delivery', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
        if (!proofRow || !proofRow.codeHash || !proofRow.issuedAt) return err('The customer has not generated a delivery code yet', 409, 'DELIVERY_CODE_NOT_ISSUED');
        if (proofRow.blockedAt) return err('This delivery code is blocked. The customer must generate a new one.', 409, 'DELIVERY_CODE_BLOCKED');
        const now = new Date();
        if (isLocked(proofRow, now)) return err('Delivery code entry is temporarily locked', 409, 'DELIVERY_CODE_LOCKED');

        const match = hashesMatch(proofRow.codeHash, hashCode(orderId, proofRow.codeVersion, code));

        if (!match) {
          // A regeneration that committed AFTER this request arrived is not a wrong guess against the new code.
          if (proofRow.issuedAt.getTime() > receivedAt.getTime()) return err('The customer generated a new delivery code. Ask for the latest one.', 409, 'DELIVERY_CODE_CHANGED');

          let failed = proofRow.failedAttempts + 1;
          let cycles = proofRow.lockCycles;
          let lockedUntil: Date | null = proofRow.lockedUntil;
          let blockedAt: Date | null = null;
          let result = 'WRONG';
          if (failed >= MAX_ATTEMPTS_PER_WINDOW) {
            failed = 0;
            cycles += 1;
            lockedUntil = new Date(now.getTime() + LOCK_MS);
            result = 'LOCKED';
            if (cycles >= MAX_LOCK_CYCLES) {
              blockedAt = now;
              result = 'BLOCKED';
            }
          }
          await tx.deliveryProof.update({ where: { orderId }, data: { failedAttempts: failed, lockCycles: cycles, lockedUntil, ...(blockedAt ? { blockedAt } : {}) } });
          const actor = { userId: caller.userId, roles };
          await AuditService.record({ actor, action: 'DELIVERY_VERIFY_FAILED', entity: 'Order', entityId: orderId, payload: { orderNumber: order.orderNumber, driverEmployeeId: caller.employeeProfileId }, context }, tx);
          if (result === 'LOCKED' || result === 'BLOCKED') {
            await AuditService.record({ actor, action: 'DELIVERY_VERIFY_LOCKED', entity: 'Order', entityId: orderId, payload: { orderNumber: order.orderNumber, lockCycle: cycles }, context }, tx);
          }
          if (result === 'BLOCKED') {
            await AuditService.record({ actor, action: 'DELIVERY_CODE_BLOCKED', entity: 'Order', entityId: orderId, payload: { orderNumber: order.orderNumber }, context }, tx);
          }
          return result === 'BLOCKED'
            ? err('This delivery code is now blocked. The customer must generate a new one.', 409, 'DELIVERY_CODE_BLOCKED')
            : result === 'LOCKED'
              ? err('Too many incorrect codes. Delivery code entry is locked for 15 minutes.', 409, 'DELIVERY_CODE_LOCKED')
              : err('The delivery code is not correct', 422, 'INVALID_DELIVERY_CODE');
        }

        // ---- correct code: complete atomically (proof evidence, assignment, order transition, audit)
        await tx.deliveryProof.update({
          where: { orderId },
          data: { verifiedAt: now, method: 'PIN', verifiedByEmployeeId: caller.employeeProfileId, previousAssignmentStatus: assignment.status, failedAttempts: 0 }
        });
        const completed = await tx.deliveryAssignment.updateMany({
          where: { id: assignment.id, driverId: caller.employeeProfileId, status: 'IN_TRANSIT' },
          data: { status: 'DELIVERED', deliveryTime: now }
        });
        if (completed.count !== 1) throw new AppError('The delivery assignment changed. Please refresh.', 409, 'ORDER_STATE_CONFLICT');
        await OrderTransitionService.transition(
          { orderId, to: 'DELIVERED', actor: { kind: 'PROOF', method: 'PIN', proofId: proofRow.id, userId: caller.userId, roles }, context },
          tx
        );
        await AuditService.record(
          { actor: { userId: caller.userId, roles }, action: 'DELIVERY_VERIFIED', entity: 'Order', entityId: orderId, payload: { orderNumber: order.orderNumber, method: 'PIN', driverEmployeeId: caller.employeeProfileId }, context },
          tx
        );
        return { kind: 'OK', changed: true, orderNumber: order.orderNumber, deliveredAt: now };
      });
    } catch (err) {
      return DeliveryService.denyAudit(err, caller, 'verify-delivery', orderId, context);
    }

    if (outcome.kind === 'ERROR') throw outcome.error; // thrown only AFTER the transaction (and any counter change) committed
    return { changed: outcome.changed, order: { id: orderId, orderNumber: outcome.orderNumber, status: 'DELIVERED' as const, deliveredAt: outcome.deliveredAt.toISOString() } };
  }

  // ------------------------------------------------------------------------------------------------ SUPER_ADMIN exceptional override
  /**
   * Exceptional handover confirmation by a SUPER_ADMIN (step-up, reason, note, confirm). It uses the SAME proof-backed transition as the
   * normal path and may complete a FAILED assignment (the failure notes and history are preserved; the previous status is recorded).
   */
  public static async overrideDelivery(orderId: string, body: OverrideBody, actor: { userId: string; roles: readonly string[] }, context?: AuditContext) {
    return await prisma.$transaction(async (tx) => {
      const order = await DeliveryService.lockAndLoad(tx, orderId);
      if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      if (order.orderType !== 'DIRECT' || order.paymentMethod !== 'ONLINE') throw new AppError('This order is not eligible for delivery completion', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');

      const proofRow = await lockProof(tx, orderId);
      if (order.status === 'DELIVERED') {
        if (proofRow.method === 'ADMIN_OVERRIDE') return { changed: false, orderId, orderNumber: order.orderNumber, status: 'DELIVERED' as const, previousAssignmentStatus: proofRow.previousAssignmentStatus };
        throw new AppError('This order has already been delivered', 409, 'ALREADY_DELIVERED');
      }
      if (order.status !== 'DISPATCHED') throw new AppError('Only an order that is out for delivery can be completed', 409, 'ORDER_NOT_DISPATCHED');
      if (order.paymentStatus !== 'PAID') throw new AppError('This order is no longer eligible for delivery', 409, 'ORDER_NOT_OPERATIONALLY_ELIGIBLE');
      const assignment = order.delivery;
      if (!assignment || !['IN_TRANSIT', 'FAILED'].includes(assignment.status)) throw new AppError('This delivery is not in a state that can be completed', 409, 'INVALID_DELIVERY_STATE');

      const now = new Date();
      if (assignment.status === 'FAILED') {
        // P9C: the failed attempt is archived BEFORE it is completed (failure evidence + override reason/note are kept in DeliveryAttempt)
        await archiveFailedAttempt(tx, {
          orderId,
          kitchenBranchId: order.kitchenBranchId,
          assignment,
          proofCodeVersion: proofRow.codeVersion,
          outcome: 'ADMIN_OVERRIDE_DELIVERED',
          resolvedByUserId: actor.userId,
          resolutionReasonCode: body.reasonCode,
          resolutionNote: body.note
        });
      }
      await tx.deliveryProof.update({
        where: { orderId },
        data: {
          verifiedAt: now,
          method: 'ADMIN_OVERRIDE',
          overrideByUserId: actor.userId,
          overrideReasonCode: body.reasonCode,
          overrideNote: body.note,
          previousAssignmentStatus: assignment.status
        }
      });
      // deliveryNotes (a previously reported failure) is deliberately left untouched
      const completed = await tx.deliveryAssignment.updateMany({
        where: { id: assignment.id, status: { in: ['IN_TRANSIT', 'FAILED'] } },
        data: { status: 'DELIVERED', deliveryTime: now }
      });
      if (completed.count !== 1) throw new AppError('The delivery assignment changed. Please refresh.', 409, 'ORDER_STATE_CONFLICT');
      await OrderTransitionService.transition(
        {
          orderId,
          to: 'DELIVERED',
          actor: { kind: 'PROOF', method: 'ADMIN_OVERRIDE', proofId: proofRow.id, userId: actor.userId, roles: [RoleEnum.SUPER_ADMIN] },
          reason: `Delivery override: ${body.reasonCode}`,
          context
        },
        tx
      );
      await AuditService.record(
        {
          actor,
          action: 'DELIVERY_OVERRIDE_APPLIED',
          entity: 'Order',
          entityId: orderId,
          payload: { orderNumber: order.orderNumber, method: 'ADMIN_OVERRIDE', reasonCode: body.reasonCode, previousAssignmentStatus: assignment.status, attemptNumber: assignment.attemptNumber },
          context
        },
        tx
      );
      return { changed: true, orderId, orderNumber: order.orderNumber, status: 'DELIVERED' as const, previousAssignmentStatus: assignment.status };
    });
  }
}

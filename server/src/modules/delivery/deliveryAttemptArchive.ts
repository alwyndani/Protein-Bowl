import { Prisma } from '@prisma/client';
import { AppError } from '../../middleware/error.middleware.js';
import { AttemptOutcome } from './deliveryAttemptPolicy.js';
import { parseFailureNote } from './delivery.dto.js';

/**
 * P9C: the ONLY writer of DeliveryAttempt rows (a static test fails if any other production source creates, updates or deletes them).
 * DeliveryAttempt is append-only history of FAILED attempts; it is written inside the caller's transaction BEFORE the live
 * DeliveryAssignment is changed, so an insertion failure rolls the whole resolution back and the FAILED assignment stays untouched.
 */
type Tx = Prisma.TransactionClient;

export interface ArchiveAssignment {
  attemptNumber: number;
  driverId: string | null;
  branchId: string | null;
  pickupTime: Date | null;
  failedAt: Date | null;
  deliveryNotes: string | null;
}

export async function archiveFailedAttempt(
  tx: Tx,
  p: {
    orderId: string;
    kitchenBranchId: string | null;
    assignment: ArchiveAssignment;
    proofCodeVersion: number;
    outcome: AttemptOutcome;
    resolvedByUserId: string;
    resolutionReasonCode: string;
    resolutionNote: string | null;
  }
): Promise<void> {
  // The original failure evidence is copied exactly as the driver reported it; an unreadable legacy note becomes reason OTHER (never invented text).
  const failure = parseFailureNote(p.assignment.deliveryNotes) ?? { reasonCode: 'OTHER' as const, note: null };
  try {
    await tx.deliveryAttempt.create({
      data: {
        orderId: p.orderId,
        attemptNumber: p.assignment.attemptNumber,
        driverId: p.assignment.driverId,
        branchId: p.assignment.branchId ?? p.kitchenBranchId,
        startedAt: p.assignment.pickupTime,
        failedAt: p.assignment.failedAt, // null for legacy FAILED rows: never fabricated
        failureReasonCode: failure.reasonCode,
        failureNote: failure.note,
        proofCodeVersion: p.proofCodeVersion,
        outcome: p.outcome,
        resolvedByUserId: p.resolvedByUserId,
        resolutionReasonCode: p.resolutionReasonCode,
        resolutionNote: p.resolutionNote
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('This delivery attempt was already resolved. Please refresh.', 409, 'DELIVERY_ATTEMPT_CHANGED');
    }
    throw err;
  }
}

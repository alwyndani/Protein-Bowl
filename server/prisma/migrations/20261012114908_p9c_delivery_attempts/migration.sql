-- AlterTable
ALTER TABLE "delivery_assignments" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "failedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "driverId" TEXT,
    "branchId" TEXT,
    "startedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReasonCode" TEXT NOT NULL,
    "failureNote" TEXT,
    "proofCodeVersion" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "resolvedByUserId" TEXT NOT NULL,
    "resolutionReasonCode" TEXT NOT NULL,
    "resolutionNote" TEXT,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempts_orderId_attemptNumber_key" ON "delivery_attempts"("orderId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "kitchen_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written integrity checks (Prisma cannot express CHECK constraints). Defence in depth: the service enforces the same rules.
-- The literal 3 mirrors MAX_DELIVERY_ATTEMPTS (modules/delivery/deliveryAttemptPolicy.ts); a test keeps them equal.
ALTER TABLE "delivery_assignments"
  ADD CONSTRAINT "delivery_assignments_attempt_ck" CHECK ("attemptNumber" BETWEEN 1 AND 3);

ALTER TABLE "delivery_attempts"
  ADD CONSTRAINT "delivery_attempts_attempt_ck"    CHECK ("attemptNumber" BETWEEN 1 AND 3),
  ADD CONSTRAINT "delivery_attempts_outcome_ck"    CHECK ("outcome" IN ('RETRY_SAME_DRIVER', 'REASSIGNED', 'UNDELIVERABLE_CANCELLED', 'ADMIN_OVERRIDE_DELIVERED')),
  ADD CONSTRAINT "delivery_attempts_retry_cap_ck"  CHECK ("outcome" NOT IN ('RETRY_SAME_DRIVER', 'REASSIGNED') OR "attemptNumber" < 3),
  ADD CONSTRAINT "delivery_attempts_version_ck"    CHECK ("proofCodeVersion" >= 1),
  ADD CONSTRAINT "delivery_attempts_failure_ck"    CHECK (char_length("failureReasonCode") > 0 AND ("failureNote" IS NULL OR char_length("failureNote") <= 200)),
  ADD CONSTRAINT "delivery_attempts_resolution_ck" CHECK (char_length("resolutionReasonCode") > 0 AND ("resolutionNote" IS NULL OR char_length("resolutionNote") <= 200));

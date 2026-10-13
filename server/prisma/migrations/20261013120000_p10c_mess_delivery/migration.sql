-- P10C: Kerala Mess bulk delivery (runs + service-point stops), secure per-stop handover proof, meal fulfilment, NOT_DELIVERED status.
-- Purely additive except that the two meal CHECK constraints created by migration #17 are REPLACED (same names, wider vocabulary: NOT_DELIVERED).
-- No data is read, rewritten or deleted. Existing meals keep deliveryStopId / fulfilledAt = NULL.

-- AlterTable
ALTER TABLE "mess_daily_orders" ADD COLUMN     "deliveryStopId" TEXT,
ADD COLUMN     "fulfilledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "mess_service_points" ADD COLUMN     "deliveryInstructions" TEXT;

-- CreateTable
CREATE TABLE "mess_delivery_runs" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "mealDate" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "stopCount" INTEGER NOT NULL,
    "mealCount" INTEGER NOT NULL,
    "releasedByUserId" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedByEmployeeId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mess_delivery_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mess_delivery_stops" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "servicePointId" TEXT NOT NULL,
    "servicePointName" TEXT NOT NULL,
    "gateLabel" TEXT,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "deliveryInstructions" TEXT,
    "expectedQuantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastFailureCode" TEXT,
    "lastFailureNote" TEXT,
    "failedAt" TIMESTAMP(3),
    "codeHash" TEXT,
    "codeVersion" INTEGER NOT NULL DEFAULT 0,
    "codeIssuedAt" TIMESTAMP(3),
    "codeExpiresAt" TIMESTAMP(3),
    "recipientCustomerProfileId" TEXT,
    "regenerationCount" INTEGER NOT NULL DEFAULT 0,
    "failedCodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockCycles" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "handedOverAt" TIMESTAMP(3),
    "handoverMethod" TEXT,
    "handedOverByEmployeeId" TEXT,
    "overrideByUserId" TEXT,
    "overrideReasonCode" TEXT,
    "overrideNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mess_delivery_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mess_delivery_runs_batchId_key" ON "mess_delivery_runs"("batchId");

-- CreateIndex
CREATE INDEX "mess_delivery_runs_branchId_status_idx" ON "mess_delivery_runs"("branchId", "status");

-- CreateIndex
CREATE INDEX "mess_delivery_runs_claimedByEmployeeId_status_idx" ON "mess_delivery_runs"("claimedByEmployeeId", "status");

-- CreateIndex
CREATE INDEX "mess_delivery_stops_status_idx" ON "mess_delivery_stops"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mess_delivery_stops_runId_servicePointId_key" ON "mess_delivery_stops"("runId", "servicePointId");

-- CreateIndex
CREATE INDEX "mess_daily_orders_deliveryStopId_idx" ON "mess_daily_orders"("deliveryStopId");

-- AddForeignKey
ALTER TABLE "mess_daily_orders" ADD CONSTRAINT "mess_daily_orders_deliveryStopId_fkey" FOREIGN KEY ("deliveryStopId") REFERENCES "mess_delivery_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_delivery_runs" ADD CONSTRAINT "mess_delivery_runs_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "mess_meal_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_delivery_runs" ADD CONSTRAINT "mess_delivery_runs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "kitchen_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_delivery_runs" ADD CONSTRAINT "mess_delivery_runs_releasedByUserId_fkey" FOREIGN KEY ("releasedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_delivery_runs" ADD CONSTRAINT "mess_delivery_runs_claimedByEmployeeId_fkey" FOREIGN KEY ("claimedByEmployeeId") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_delivery_stops" ADD CONSTRAINT "mess_delivery_stops_runId_fkey" FOREIGN KEY ("runId") REFERENCES "mess_delivery_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_delivery_stops" ADD CONSTRAINT "mess_delivery_stops_servicePointId_fkey" FOREIGN KEY ("servicePointId") REFERENCES "mess_service_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_delivery_stops" ADD CONSTRAINT "mess_delivery_stops_recipientCustomerProfileId_fkey" FOREIGN KEY ("recipientCustomerProfileId") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_delivery_stops" ADD CONSTRAINT "mess_delivery_stops_handedOverByEmployeeId_fkey" FOREIGN KEY ("handedOverByEmployeeId") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_delivery_stops" ADD CONSTRAINT "mess_delivery_stops_overrideByUserId_fkey" FOREIGN KEY ("overrideByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------- hand-written CHECK constraints
-- (Prisma cannot express them and `migrate diff` ignores them; p10c.migration.test.ts replays them from this file.)

-- meals: widen the vocabulary (NOT_DELIVERED) and tie fulfilment / delivery membership to their evidence
ALTER TABLE "mess_daily_orders" DROP CONSTRAINT "mess_meals_status_ck";
ALTER TABLE "mess_daily_orders" DROP CONSTRAINT "mess_meals_batch_ck";
ALTER TABLE "mess_daily_orders"
  ADD CONSTRAINT "mess_meals_status_ck"    CHECK ("status" IN ('SCHEDULED', 'PAUSED', 'CANCELLED', 'FULFILLED', 'NOT_DELIVERED', 'CONSUMED', 'SKIPPED')),
  ADD CONSTRAINT "mess_meals_batch_ck"     CHECK ("batchId" IS NULL OR "status" IN ('SCHEDULED', 'FULFILLED', 'NOT_DELIVERED', 'CONSUMED')),
  ADD CONSTRAINT "mess_meals_fulfilled_ck" CHECK ("status" <> 'FULFILLED' OR "fulfilledAt" IS NOT NULL),
  ADD CONSTRAINT "mess_meals_stop_ck"      CHECK ("deliveryStopId" IS NULL OR "batchId" IS NOT NULL);

-- service points
ALTER TABLE "mess_service_points"
  ADD CONSTRAINT "mess_sp_instructions_ck" CHECK ("deliveryInstructions" IS NULL OR char_length("deliveryInstructions") BETWEEN 1 AND 300);

-- runs
ALTER TABLE "mess_delivery_runs"
  ADD CONSTRAINT "mess_runs_status_ck"   CHECK ("status" IN ('AVAILABLE', 'CLAIMED', 'IN_TRANSIT', 'COMPLETED', 'CLOSED')),
  ADD CONSTRAINT "mess_runs_slot_ck"     CHECK ("slot" IN ('BREAKFAST', 'LUNCH', 'DINNER')),
  ADD CONSTRAINT "mess_runs_counts_ck"   CHECK ("stopCount" > 0 AND "mealCount" >= "stopCount"),
  ADD CONSTRAINT "mess_runs_claim_ck"    CHECK (
    ("status" <> 'AVAILABLE' OR ("claimedByEmployeeId" IS NULL AND "claimedAt" IS NULL))
    AND ("status" NOT IN ('CLAIMED', 'IN_TRANSIT', 'COMPLETED') OR ("claimedByEmployeeId" IS NOT NULL AND "claimedAt" IS NOT NULL))),
  ADD CONSTRAINT "mess_runs_dispatch_ck" CHECK ("status" NOT IN ('IN_TRANSIT', 'COMPLETED') OR "dispatchedAt" IS NOT NULL),
  ADD CONSTRAINT "mess_runs_terminal_ck" CHECK (("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL) AND ("status" <> 'CLOSED' OR "closedAt" IS NOT NULL));

-- stops
ALTER TABLE "mess_delivery_stops"
  ADD CONSTRAINT "mess_stops_status_ck"   CHECK ("status" IN ('PENDING', 'FAILED', 'HANDED_OVER', 'CLOSED_UNDELIVERED')),
  ADD CONSTRAINT "mess_stops_method_ck"   CHECK ("handoverMethod" IS NULL OR "handoverMethod" IN ('CODE', 'ADMIN_OVERRIDE')),
  ADD CONSTRAINT "mess_stops_counters_ck" CHECK ("expectedQuantity" > 0 AND "attemptCount" BETWEEN 1 AND 3 AND "regenerationCount" BETWEEN 0 AND 3 AND "failedCodeAttempts" BETWEEN 0 AND 5 AND "lockCycles" BETWEEN 0 AND 3 AND "codeVersion" >= 0),
  ADD CONSTRAINT "mess_stops_handed_ck"   CHECK (
    ("status" <> 'HANDED_OVER' OR ("handedOverAt" IS NOT NULL AND "handoverMethod" IS NOT NULL))
    AND ("handoverMethod" IS NULL OR "status" = 'HANDED_OVER')
    AND ("handoverMethod" IS DISTINCT FROM 'CODE' OR "handedOverByEmployeeId" IS NOT NULL)
    AND ("handoverMethod" IS DISTINCT FROM 'ADMIN_OVERRIDE' OR ("overrideByUserId" IS NOT NULL AND "overrideReasonCode" IS NOT NULL AND "overrideNote" IS NOT NULL))),
  ADD CONSTRAINT "mess_stops_closed_ck"   CHECK ("status" <> 'CLOSED_UNDELIVERED' OR "closedAt" IS NOT NULL),
  ADD CONSTRAINT "mess_stops_failed_ck"   CHECK ("status" <> 'FAILED' OR ("failedAt" IS NOT NULL AND "lastFailureCode" IS NOT NULL)),
  ADD CONSTRAINT "mess_stops_code_ck"     CHECK ("codeHash" IS NULL OR ("codeIssuedAt" IS NOT NULL AND "codeExpiresAt" IS NOT NULL AND "recipientCustomerProfileId" IS NOT NULL AND "codeVersion" >= 1));

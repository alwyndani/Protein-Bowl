-- P10B safety guard: the new snapshot columns on mess_daily_orders (branch, service point, service instant) are NOT NULL and cannot be invented for
-- legacy rows. Fail loudly instead of deleting or fabricating legacy meal data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "mess_daily_orders") THEN
    RAISE EXCEPTION 'P10B migration refused: mess_daily_orders already contains rows (inspect and convert them explicitly first)';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "mess_daily_orders" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "branchId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "serviceAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "servicePointId" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "mess_subscription_plans" ADD COLUMN     "slotTimes" JSONB;

-- AlterTable
ALTER TABLE "mess_subscriptions" ADD COLUMN     "mealsGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "slotTimes" JSONB;

-- CreateTable
CREATE TABLE "mess_meal_batches" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "mealDate" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARING',
    "mealCount" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedByUserId" TEXT NOT NULL,
    "readyAt" TIMESTAMP(3),
    "readyByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mess_meal_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mess_meal_events" (
    "id" TEXT NOT NULL,
    "messSubscriptionId" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "pausesUsedAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mess_meal_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mess_meal_batches_branchId_mealDate_slot_key" ON "mess_meal_batches"("branchId", "mealDate", "slot");

-- CreateIndex
CREATE INDEX "mess_meal_events_mealId_idx" ON "mess_meal_events"("mealId");

-- CreateIndex
CREATE INDEX "mess_meal_events_messSubscriptionId_idx" ON "mess_meal_events"("messSubscriptionId");

-- CreateIndex
CREATE INDEX "mess_daily_orders_branchId_date_slot_status_idx" ON "mess_daily_orders"("branchId", "date", "slot", "status");

-- CreateIndex
CREATE INDEX "mess_daily_orders_batchId_idx" ON "mess_daily_orders"("batchId");

-- AddForeignKey
ALTER TABLE "mess_daily_orders" ADD CONSTRAINT "mess_daily_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "kitchen_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_daily_orders" ADD CONSTRAINT "mess_daily_orders_servicePointId_fkey" FOREIGN KEY ("servicePointId") REFERENCES "mess_service_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_daily_orders" ADD CONSTRAINT "mess_daily_orders_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "mess_meal_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_meal_batches" ADD CONSTRAINT "mess_meal_batches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "kitchen_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_meal_batches" ADD CONSTRAINT "mess_meal_batches_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_meal_batches" ADD CONSTRAINT "mess_meal_batches_readyByUserId_fkey" FOREIGN KEY ("readyByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_meal_events" ADD CONSTRAINT "mess_meal_events_messSubscriptionId_fkey" FOREIGN KEY ("messSubscriptionId") REFERENCES "mess_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_meal_events" ADD CONSTRAINT "mess_meal_events_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "mess_daily_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_meal_events" ADD CONSTRAINT "mess_meal_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written integrity checks (Prisma cannot express CHECK constraints). The services enforce the same rules.
ALTER TABLE "mess_daily_orders"
  ADD CONSTRAINT "mess_meals_status_ck"  CHECK ("status" IN ('SCHEDULED', 'PAUSED', 'CANCELLED', 'FULFILLED', 'CONSUMED', 'SKIPPED')),
  ADD CONSTRAINT "mess_meals_slot_ck"    CHECK ("slot" IN ('BREAKFAST', 'LUNCH', 'DINNER')),
  -- a meal attached to a kitchen batch can only be scheduled or already fulfilled: never paused or cancelled
  ADD CONSTRAINT "mess_meals_batch_ck"   CHECK ("batchId" IS NULL OR "status" IN ('SCHEDULED', 'FULFILLED', 'CONSUMED'));

ALTER TABLE "mess_meal_batches"
  ADD CONSTRAINT "mess_batches_status_ck" CHECK ("status" IN ('PREPARING', 'READY')),
  ADD CONSTRAINT "mess_batches_slot_ck"   CHECK ("slot" IN ('BREAKFAST', 'LUNCH', 'DINNER')),
  ADD CONSTRAINT "mess_batches_count_ck"  CHECK ("mealCount" >= 1),
  ADD CONSTRAINT "mess_batches_ready_ck"  CHECK (("status" = 'READY') = ("readyAt" IS NOT NULL AND "readyByUserId" IS NOT NULL));

ALTER TABLE "mess_meal_events"
  ADD CONSTRAINT "mess_events_action_ck" CHECK ("action" IN ('PAUSE', 'RESUME')),
  ADD CONSTRAINT "mess_events_count_ck"  CHECK ("pausesUsedAfter" >= 0);

ALTER TABLE "mess_subscription_plans"
  ADD CONSTRAINT "mess_plans_slottimes_ck" CHECK ("slotTimes" IS NULL OR jsonb_typeof("slotTimes") = 'object');
ALTER TABLE "mess_subscriptions"
  ADD CONSTRAINT "mess_subs_slottimes_ck" CHECK ("slotTimes" IS NULL OR jsonb_typeof("slotTimes") = 'object'),
  -- the cumulative pause counter can never exceed the snapshotted lifetime allowance
  ADD CONSTRAINT "mess_subs_pauses_ck"    CHECK ("maxPauses" IS NULL OR "totalPausesUsed" <= "maxPauses");

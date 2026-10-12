-- P10A safety guard: the vocabulary / column-type changes below are only safe while no Mess subscription exists. Fail loudly instead of converting data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "mess_subscriptions") THEN
    RAISE EXCEPTION 'P10A migration refused: mess_subscriptions already contains rows (inspect and convert them explicitly first)';
  END IF;
END $$;


-- AlterTable
ALTER TABLE "mess_accounts" ADD COLUMN     "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "rejectionReasonCode" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT,
ADD COLUMN     "servicePointId" TEXT;

-- AlterTable
ALTER TABLE "mess_subscription_plans" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "maxPauses" INTEGER,
ADD COLUMN     "mealSlots" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "minStartLeadDays" INTEGER,
ADD COLUMN     "pauseCutoffHours" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "taxRate" DECIMAL(5,4),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validUntil" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "mess_subscriptions" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "cancellationReasonCode" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "maxPauses" INTEGER,
ADD COLUMN     "mealSlots" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pauseCutoffHours" INTEGER,
ADD COLUMN     "planSnapshot" JSONB,
ADD COLUMN     "purchaseOrderId" TEXT,
ADD COLUMN     "servicePointId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT',
ALTER COLUMN "startDate" DROP DEFAULT,
ALTER COLUMN "startDate" SET DATA TYPE DATE,
ALTER COLUMN "endDate" SET DATA TYPE DATE;

-- CreateTable
CREATE TABLE "mess_service_points" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gateLabel" TEXT,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mess_service_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mess_service_points_code_key" ON "mess_service_points"("code");

-- CreateIndex
CREATE INDEX "mess_service_points_branchId_status_idx" ON "mess_service_points"("branchId", "status");

-- CreateIndex
CREATE INDEX "mess_accounts_approvalStatus_idx" ON "mess_accounts"("approvalStatus");

-- CreateIndex
CREATE INDEX "mess_accounts_servicePointId_idx" ON "mess_accounts"("servicePointId");

-- CreateIndex
CREATE INDEX "mess_subscription_plans_status_idx" ON "mess_subscription_plans"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mess_subscriptions_purchaseOrderId_key" ON "mess_subscriptions"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "mess_subscriptions_messAccountId_status_idx" ON "mess_subscriptions"("messAccountId", "status");

-- CreateIndex
CREATE INDEX "mess_subscriptions_branchId_status_idx" ON "mess_subscriptions"("branchId", "status");

-- AddForeignKey
ALTER TABLE "mess_accounts" ADD CONSTRAINT "mess_accounts_servicePointId_fkey" FOREIGN KEY ("servicePointId") REFERENCES "mess_service_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_accounts" ADD CONSTRAINT "mess_accounts_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_service_points" ADD CONSTRAINT "mess_service_points_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "kitchen_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_subscription_plans" ADD CONSTRAINT "mess_subscription_plans_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "kitchen_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_subscriptions" ADD CONSTRAINT "mess_subscriptions_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_subscriptions" ADD CONSTRAINT "mess_subscriptions_servicePointId_fkey" FOREIGN KEY ("servicePointId") REFERENCES "mess_service_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_subscriptions" ADD CONSTRAINT "mess_subscriptions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "kitchen_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written integrity checks (Prisma cannot express CHECK constraints / partial indexes). Defence in depth: the services enforce the same rules.
ALTER TABLE "mess_service_points"
  ADD CONSTRAINT "mess_service_points_status_ck"  CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
  ADD CONSTRAINT "mess_service_points_version_ck" CHECK ("version" >= 1);

ALTER TABLE "mess_accounts"
  ADD CONSTRAINT "mess_accounts_approval_ck"  CHECK ("approvalStatus" IN ('PENDING', 'APPROVED', 'REJECTED')),
  ADD CONSTRAINT "mess_accounts_approved_sp_ck" CHECK ("approvalStatus" <> 'APPROVED' OR "servicePointId" IS NOT NULL),
  ADD CONSTRAINT "mess_accounts_review_ck"    CHECK (("approvalStatus" IN ('APPROVED', 'REJECTED')) = ("reviewedAt" IS NOT NULL AND "reviewedByUserId" IS NOT NULL)),
  ADD CONSTRAINT "mess_accounts_reject_ck"    CHECK (("approvalStatus" = 'REJECTED') = ("rejectionReasonCode" IS NOT NULL));

ALTER TABLE "mess_subscription_plans"
  ADD CONSTRAINT "mess_plans_status_ck"   CHECK ("status" IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT "mess_plans_version_ck"  CHECK ("version" >= 1),
  ADD CONSTRAINT "mess_plans_slots_ck"    CHECK ("mealSlots" IS NULL OR ("mealSlots" <@ ARRAY['BREAKFAST', 'LUNCH', 'DINNER']::text[] AND cardinality(array_positions("mealSlots", 'BREAKFAST')) <= 1 AND cardinality(array_positions("mealSlots", 'LUNCH')) <= 1 AND cardinality(array_positions("mealSlots", 'DINNER')) <= 1)),
  ADD CONSTRAINT "mess_plans_tax_ck"      CHECK ("taxRate" IS NULL OR ("taxRate" >= 0 AND "taxRate" <= 1)),
  ADD CONSTRAINT "mess_plans_numbers_ck"  CHECK ("durationDays" > 0 AND "basePrice" >= 0 AND ("pauseCutoffHours" IS NULL OR "pauseCutoffHours" >= 0) AND ("maxPauses" IS NULL OR "maxPauses" >= 0) AND ("minStartLeadDays" IS NULL OR "minStartLeadDays" >= 0)),
  ADD CONSTRAINT "mess_plans_window_ck"   CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validFrom" < "validUntil"),
  ADD CONSTRAINT "mess_plans_active_ck"   CHECK ("status" <> 'ACTIVE' OR ("basePrice" > 0 AND "taxRate" IS NOT NULL AND "mealSlots" IS NOT NULL AND cardinality("mealSlots") >= 1 AND "mealsPerDay" = cardinality("mealSlots") AND "pauseCutoffHours" IS NOT NULL AND "maxPauses" IS NOT NULL AND "minStartLeadDays" IS NOT NULL));

ALTER TABLE "mess_subscriptions"
  ADD CONSTRAINT "mess_subs_status_ck"    CHECK ("status" IN ('PENDING_PAYMENT', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  ADD CONSTRAINT "mess_subs_dates_ck"     CHECK ("endDate" >= "startDate"),
  ADD CONSTRAINT "mess_subs_counts_ck"    CHECK ("totalMealsAllowed" >= 0 AND "mealsRemaining" >= 0 AND "mealsRemaining" <= "totalMealsAllowed" AND "totalPausesUsed" >= 0),
  ADD CONSTRAINT "mess_subs_active_ck"    CHECK ("status" <> 'ACTIVE' OR "activatedAt" IS NOT NULL),
  ADD CONSTRAINT "mess_subs_cancel_ck"    CHECK ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL);

-- At most ONE unpaid purchase per Mess account.
CREATE UNIQUE INDEX "mess_subscriptions_one_pending_per_account" ON "mess_subscriptions" ("messAccountId") WHERE "status" = 'PENDING_PAYMENT';

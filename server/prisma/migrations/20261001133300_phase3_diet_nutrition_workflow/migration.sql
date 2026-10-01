-- DropIndex
DROP INDEX IF EXISTS "diet_plans_requestId_key";

-- AlterTable
ALTER TABLE "diet_plan_meals" ADD COLUMN     "customizationNote" TEXT,
ADD COLUMN     "portionGrams" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "portionSize" TEXT,
ADD COLUMN     "slotRemarks" TEXT,
ADD COLUMN     "timingLabel" TEXT;

-- AlterTable
ALTER TABLE "diet_plan_requests" ADD COLUMN     "addonSlots" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "allergiesExclusions" TEXT,
ADD COLUMN     "calculatedPrice" DOUBLE PRECISION,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "cuisinePreference" TEXT,
ADD COLUMN     "customQuery" TEXT,
ADD COLUMN     "dietaryPreference" TEXT,
ADD COLUMN     "durationDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "grainPreference" TEXT,
ADD COLUMN     "planType" TEXT,
ADD COLUMN     "preferredCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "revisionNotes" TEXT,
ADD COLUMN     "spiceLevel" TEXT,
ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

-- AlterTable
ALTER TABLE "diet_plans" ADD COLUMN     "customerFeedback" TEXT,
ADD COLUMN     "customerVisibleNotes" TEXT,
ADD COLUMN     "internalClinicalNotes" TEXT,
ADD COLUMN     "isLatestVersion" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parentPlanId" TEXT,
ADD COLUMN     "versionNumber" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- CreateIndex
CREATE INDEX "diet_plan_requests_nutritionistId_idx" ON "diet_plan_requests"("nutritionistId");

-- CreateIndex
CREATE INDEX "diet_plan_requests_status_idx" ON "diet_plan_requests"("status");

-- CreateIndex
CREATE INDEX "diet_plans_requestId_idx" ON "diet_plans"("requestId");

-- CreateIndex
CREATE INDEX "diet_plans_isLatestVersion_idx" ON "diet_plans"("isLatestVersion");

-- AddForeignKey
ALTER TABLE "diet_plan_requests" ADD CONSTRAINT "diet_plan_requests_nutritionistId_fkey" FOREIGN KEY ("nutritionistId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_parentPlanId_fkey" FOREIGN KEY ("parentPlanId") REFERENCES "diet_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

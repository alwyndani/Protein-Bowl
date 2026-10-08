-- CreateTable
CREATE TABLE "employee_branch_assignments" (
    "id" TEXT NOT NULL,
    "employeeProfileId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_branch_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_branch_assignments_branchId_idx" ON "employee_branch_assignments"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_branch_assignments_employeeProfileId_branchId_key" ON "employee_branch_assignments"("employeeProfileId", "branchId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "employee_branch_assignments" ADD CONSTRAINT "employee_branch_assignments_employeeProfileId_fkey" FOREIGN KEY ("employeeProfileId") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_branch_assignments" ADD CONSTRAINT "employee_branch_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "kitchen_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_branch_assignments" ADD CONSTRAINT "employee_branch_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (non-destructive, idempotent): seed the multi-branch table from each employee's legacy primary branch.
-- EmployeeProfile.assignedBranchId is kept unchanged as the primary/home branch.
INSERT INTO "employee_branch_assignments" ("id", "employeeProfileId", "branchId", "assignedAt")
SELECT gen_random_uuid()::text, "id", "assignedBranchId", CURRENT_TIMESTAMP
FROM "employee_profiles"
WHERE "assignedBranchId" IS NOT NULL
ON CONFLICT ("employeeProfileId", "branchId") DO NOTHING;

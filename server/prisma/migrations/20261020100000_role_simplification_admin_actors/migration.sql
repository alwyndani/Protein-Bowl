-- Role simplification, migration A: SUPER_ADMIN actor columns for administrator-operated delivery. Reviewed package: server/prisma/proposed/role-simplification.
-- Purely additive and data-preserving:
--   * 7 new NULLABLE columns (no default, no backfill), 7 RESTRICT foreign keys to "users" / "employee_profiles", 1 index;
--   * 4 NEW CHECK constraints: delivery_assignments_one_owner_ck, delivery_assignments_takeover_ck, delivery_attempts_one_owner_ck, mess_runs_takeover_ck;
--   * 3 RE-CREATED CHECK constraints (dropped and added again with a wider condition that also accepts an administrator as the actor; never narrower):
--     delivery_proofs_pin_ck, mess_runs_claim_ck, mess_stops_handed_ck.
-- Nothing is updated, backfilled, moved or deleted. Every existing row already satisfies every new / re-created constraint
-- (check: precheck_migration_a.sql, query 5). The package also contains postcheck_migration_a.sql, rollback.sql and BACKUP_AND_RECOVERY.md.

-- direct delivery: the current operator of the live assignment is a SUPER_ADMIN user, never a synthetic employee
ALTER TABLE "delivery_assignments" ADD COLUMN "operatedByUserId" TEXT, ADD COLUMN "takenOverFromDriverId" TEXT;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_operatedByUserId_fkey" FOREIGN KEY ("operatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_takenOverFromDriverId_fkey" FOREIGN KEY ("takenOverFromDriverId") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_one_owner_ck" CHECK ("driverId" IS NULL OR "operatedByUserId" IS NULL);
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_takeover_ck" CHECK ("takenOverFromDriverId" IS NULL OR "operatedByUserId" IS NOT NULL);
CREATE INDEX "delivery_assignments_operatedByUserId_idx" ON "delivery_assignments"("operatedByUserId");

-- proof: who verified the code (exactly one of employee / admin user for a PIN verification)
ALTER TABLE "delivery_proofs" ADD COLUMN "verifiedByUserId" TEXT;
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_proofs" DROP CONSTRAINT "delivery_proofs_pin_ck";
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_pin_ck" CHECK ("method" IS DISTINCT FROM 'PIN' OR ("codeHash" IS NOT NULL AND (("verifiedByEmployeeId" IS NOT NULL)::int + ("verifiedByUserId" IS NOT NULL)::int) = 1));

-- attempt archive: operator of an admin-run attempt
ALTER TABLE "delivery_attempts" ADD COLUMN "operatedByUserId" TEXT;
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_operatedByUserId_fkey" FOREIGN KEY ("operatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_one_owner_ck" CHECK ("driverId" IS NULL OR "operatedByUserId" IS NULL);

-- Kerala Mess runs
ALTER TABLE "mess_delivery_runs" ADD COLUMN "claimedByUserId" TEXT, ADD COLUMN "takenOverFromEmployeeId" TEXT;
ALTER TABLE "mess_delivery_runs" ADD CONSTRAINT "mess_delivery_runs_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mess_delivery_runs" ADD CONSTRAINT "mess_delivery_runs_takenOverFromEmployeeId_fkey" FOREIGN KEY ("takenOverFromEmployeeId") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mess_delivery_runs" DROP CONSTRAINT "mess_runs_claim_ck";
ALTER TABLE "mess_delivery_runs" ADD CONSTRAINT "mess_runs_claim_ck" CHECK (
  ("claimedByEmployeeId" IS NULL OR "claimedByUserId" IS NULL)
  AND ("status" <> 'AVAILABLE' OR ("claimedByEmployeeId" IS NULL AND "claimedByUserId" IS NULL AND "claimedAt" IS NULL))
  AND ("status" NOT IN ('CLAIMED', 'IN_TRANSIT', 'COMPLETED') OR ((("claimedByEmployeeId" IS NOT NULL)::int + ("claimedByUserId" IS NOT NULL)::int) = 1 AND "claimedAt" IS NOT NULL)));
ALTER TABLE "mess_delivery_runs" ADD CONSTRAINT "mess_runs_takeover_ck" CHECK ("takenOverFromEmployeeId" IS NULL OR "claimedByUserId" IS NOT NULL);

-- Kerala Mess stops
ALTER TABLE "mess_delivery_stops" ADD COLUMN "handedOverByUserId" TEXT;
ALTER TABLE "mess_delivery_stops" ADD CONSTRAINT "mess_delivery_stops_handedOverByUserId_fkey" FOREIGN KEY ("handedOverByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mess_delivery_stops" DROP CONSTRAINT "mess_stops_handed_ck";
ALTER TABLE "mess_delivery_stops" ADD CONSTRAINT "mess_stops_handed_ck" CHECK (
  ("status" <> 'HANDED_OVER' OR ("handedOverAt" IS NOT NULL AND "handoverMethod" IS NOT NULL))
  AND ("handoverMethod" IS NULL OR "status" = 'HANDED_OVER')
  AND ("handoverMethod" IS DISTINCT FROM 'CODE' OR ((("handedOverByEmployeeId" IS NOT NULL)::int + ("handedOverByUserId" IS NOT NULL)::int) = 1))
  AND ("handoverMethod" IS DISTINCT FROM 'ADMIN_OVERRIDE' OR ("overrideByUserId" IS NOT NULL AND "overrideReasonCode" IS NOT NULL AND "overrideNote" IS NOT NULL)));

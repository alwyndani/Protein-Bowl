-- ROLLBACK for 20261020100000_role_simplification_admin_actors. NOT a Prisma migration: it is run by hand (prisma db execute --file), only if migration A must be undone.
-- It restores the exact pre-A constraints and removes the seven new columns. It REFUSES (nothing is changed) once any new column holds data, because dropping
-- the columns would silently lose who operated a delivery: in that case the data must be reviewed by a human first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "delivery_assignments" WHERE "operatedByUserId" IS NOT NULL OR "takenOverFromDriverId" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "delivery_proofs" WHERE "verifiedByUserId" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "delivery_attempts" WHERE "operatedByUserId" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "mess_delivery_runs" WHERE "claimedByUserId" IS NOT NULL OR "takenOverFromEmployeeId" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "mess_delivery_stops" WHERE "handedOverByUserId" IS NOT NULL) THEN
    RAISE EXCEPTION 'administrator-operated delivery data exists; rollback refused (nothing was changed)';
  END IF;
END
$$;

ALTER TABLE "mess_delivery_stops" DROP CONSTRAINT "mess_stops_handed_ck";
ALTER TABLE "mess_delivery_stops" ADD CONSTRAINT "mess_stops_handed_ck" CHECK (
    ("status" <> 'HANDED_OVER' OR ("handedOverAt" IS NOT NULL AND "handoverMethod" IS NOT NULL))
    AND ("handoverMethod" IS NULL OR "status" = 'HANDED_OVER')
    AND ("handoverMethod" IS DISTINCT FROM 'CODE' OR "handedOverByEmployeeId" IS NOT NULL)
    AND ("handoverMethod" IS DISTINCT FROM 'ADMIN_OVERRIDE' OR ("overrideByUserId" IS NOT NULL AND "overrideReasonCode" IS NOT NULL AND "overrideNote" IS NOT NULL)));
ALTER TABLE "mess_delivery_stops" DROP COLUMN "handedOverByUserId";

ALTER TABLE "mess_delivery_runs" DROP CONSTRAINT "mess_runs_takeover_ck", DROP CONSTRAINT "mess_runs_claim_ck";
ALTER TABLE "mess_delivery_runs" ADD CONSTRAINT "mess_runs_claim_ck" CHECK (
    ("status" <> 'AVAILABLE' OR ("claimedByEmployeeId" IS NULL AND "claimedAt" IS NULL))
    AND ("status" NOT IN ('CLAIMED', 'IN_TRANSIT', 'COMPLETED') OR ("claimedByEmployeeId" IS NOT NULL AND "claimedAt" IS NOT NULL)));
ALTER TABLE "mess_delivery_runs" DROP COLUMN "claimedByUserId", DROP COLUMN "takenOverFromEmployeeId";

ALTER TABLE "delivery_attempts" DROP CONSTRAINT "delivery_attempts_one_owner_ck";
ALTER TABLE "delivery_attempts" DROP COLUMN "operatedByUserId";

ALTER TABLE "delivery_proofs" DROP CONSTRAINT "delivery_proofs_pin_ck";
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_pin_ck" CHECK ("method" IS DISTINCT FROM 'PIN' OR ("codeHash" IS NOT NULL AND "verifiedByEmployeeId" IS NOT NULL));
ALTER TABLE "delivery_proofs" DROP COLUMN "verifiedByUserId";

DROP INDEX "delivery_assignments_operatedByUserId_idx";
ALTER TABLE "delivery_assignments" DROP CONSTRAINT "delivery_assignments_takeover_ck", DROP CONSTRAINT "delivery_assignments_one_owner_ck";
ALTER TABLE "delivery_assignments" DROP COLUMN "operatedByUserId", DROP COLUMN "takenOverFromDriverId";

-- after a rollback also run:  prisma migrate resolve --rolled-back 20261020100000_role_simplification_admin_actors  (only if the migration had been recorded as applied)

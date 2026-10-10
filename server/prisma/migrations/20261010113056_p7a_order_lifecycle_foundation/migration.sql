-- P7A: order lifecycle foundation (pricing snapshot, request fingerprint, lifecycle timestamps, OrderEvent, customer-scoped idempotency).
-- Non-destructive: only nullable columns are added; the global idempotency unique index is replaced by a customer-scoped one
-- (the new constraint is strictly weaker, so it cannot fail on existing data).

-- DropIndex
DROP INDEX "orders_idempotencyKey_key";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "pricingSnapshot" JSONB,
ADD COLUMN     "requestFingerprint" TEXT;

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_events_orderId_createdAt_idx" ON "order_events"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_customerProfileId_createdAt_idx" ON "orders"("customerProfileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_customerProfileId_idempotencyKey_key" ON "orders"("customerProfileId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: give every pre-P7A order a creation event so its timeline is not empty.
-- Pre-P7A there was no status workflow, so existing orders are still in the status they were created with.
INSERT INTO "order_events" ("id", "orderId", "fromStatus", "toStatus", "reason", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || o."id")::uuid::text, o."id", NULL, o."status", 'BACKFILLED_P7A', o."createdAt"
FROM "orders" o
WHERE NOT EXISTS (SELECT 1 FROM "order_events" e WHERE e."orderId" = o."id");

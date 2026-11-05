-- Trainer + Procurement foundation (PREPARED, NOT APPLIED). Purely additive: new tables and two indexes on workout_plans.
-- Hand-written to match schema.prisma; verify with `migrate diff` on a disposable database before any apply.

-- CreateTable
CREATE TABLE "trainer_assignments" (
    "id" TEXT NOT NULL,
    "trainerUserId" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "trainer_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trainer_assignments_status_ck" CHECK ("status" IN ('ACTIVE', 'ENDED'))
);

-- CreateTable
CREATE TABLE "workout_logs" (
    "id" TEXT NOT NULL,
    "workoutPlanId" TEXT NOT NULL,
    "workoutDayId" TEXT,
    "customerProfileId" TEXT NOT NULL,
    "loggedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "perceivedEffort" INTEGER,
    "bodyWeightKg" DECIMAL(5,2),
    "notes" TEXT,

    CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workout_logs_effort_ck" CHECK ("perceivedEffort" IS NULL OR ("perceivedEffort" BETWEEN 1 AND 10))
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expectedOn" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT,
    "orderedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_orders_status_ck" CHECK ("status" IN ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'))
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "orderedQuantity" DOUBLE PRECISION NOT NULL,
    "receivedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_lines_qty_ck" CHECK ("orderedQuantity" > 0 AND "receivedQuantity" >= 0),
    CONSTRAINT "purchase_order_lines_cost_ck" CHECK ("unitCost" >= 0)
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "receivedByUserId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goods_receipt_lines_qty_ck" CHECK ("quantity" > 0)
);

-- CreateTable: staff-reviewed cancellation requests for paid orders the kitchen has started
CREATE TABLE "cancellation_requests" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "reasonCode" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancellation_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cancellation_requests_status_ck" CHECK ("status" IN ('PENDING', 'APPROVED', 'DECLINED')),
    CONSTRAINT "cancellation_requests_decision_ck" CHECK (("status" = 'PENDING' AND "decidedAt" IS NULL) OR ("status" <> 'PENDING' AND "decidedAt" IS NOT NULL))
);
CREATE INDEX "cancellation_requests_orderId_idx" ON "cancellation_requests"("orderId");
CREATE INDEX "cancellation_requests_status_createdAt_idx" ON "cancellation_requests"("status", "createdAt");
-- At most ONE open request per order (Prisma cannot express a partial unique index; `migrate diff` ignores it).
CREATE UNIQUE INDEX "cancellation_requests_one_pending_per_order" ON "cancellation_requests"("orderId") WHERE "status" = 'PENDING';
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "trainer_assignments_trainerUserId_customerProfileId_key" ON "trainer_assignments"("trainerUserId", "customerProfileId");
CREATE INDEX "trainer_assignments_customerProfileId_idx" ON "trainer_assignments"("customerProfileId");
CREATE INDEX "workout_logs_workoutPlanId_loggedOn_idx" ON "workout_logs"("workoutPlanId", "loggedOn");
CREATE INDEX "workout_logs_customerProfileId_idx" ON "workout_logs"("customerProfileId");
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");
CREATE INDEX "purchase_orders_branchId_status_idx" ON "purchase_orders"("branchId", "status");
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");
CREATE UNIQUE INDEX "purchase_order_lines_purchaseOrderId_inventoryItemId_key" ON "purchase_order_lines"("purchaseOrderId", "inventoryItemId");
CREATE UNIQUE INDEX "goods_receipts_receiptNumber_key" ON "goods_receipts"("receiptNumber");
CREATE INDEX "goods_receipts_purchaseOrderId_idx" ON "goods_receipts"("purchaseOrderId");
CREATE INDEX "goods_receipt_lines_purchaseOrderLineId_idx" ON "goods_receipt_lines"("purchaseOrderLineId");
CREATE INDEX "workout_plans_customerProfileId_idx" ON "workout_plans"("customerProfileId");
CREATE INDEX "workout_plans_trainerId_idx" ON "workout_plans"("trainerId");

-- AddForeignKey
ALTER TABLE "trainer_assignments" ADD CONSTRAINT "trainer_assignments_trainerUserId_fkey" FOREIGN KEY ("trainerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trainer_assignments" ADD CONSTRAINT "trainer_assignments_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trainer_assignments" ADD CONSTRAINT "trainer_assignments_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_workoutPlanId_fkey" FOREIGN KEY ("workoutPlanId") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "kitchen_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

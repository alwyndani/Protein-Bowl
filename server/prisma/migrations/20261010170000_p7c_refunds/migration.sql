-- P7C: Refund model (FULL refunds only; Refund.id is the provider receipt). Purely additive: one new table, no existing
-- table or row is touched. Two guarantees Prisma cannot express are added by hand at the end (reviewed):
--   * CHECK (amount > 0)
--   * ONE live non-EXTERNAL refund per ProviderPayment (partial unique index): PROCESSED counts as live, so a captured payment
--     can never be refunded twice; only an explicitly ABANDONED intent frees the slot. EXTERNAL rows (refunds made outside
--     Protein Bowl and discovered from trusted provider evidence) record money that already moved and are excluded.

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonNote" TEXT,
    "requestedByUserId" TEXT,
    "requestedByKind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "providerStatus" TEXT,
    "speedRequested" TEXT,
    "speedProcessed" TEXT,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "reviewFlag" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_providerPaymentId_idx" ON "refunds"("providerPaymentId");

-- CreateIndex
CREATE INDEX "refunds_status_nextAttemptAt_idx" ON "refunds"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_providerRefundId_key" ON "refunds"("provider", "providerRefundId");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_providerPaymentId_fkey" FOREIGN KEY ("providerPaymentId") REFERENCES "provider_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reviewed manual additions
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive_check" CHECK ("amount" > 0);

CREATE UNIQUE INDEX "refunds_one_live_per_payment_key" ON "refunds"("providerPaymentId") WHERE "status" <> 'ABANDONED' AND "trigger" <> 'EXTERNAL';

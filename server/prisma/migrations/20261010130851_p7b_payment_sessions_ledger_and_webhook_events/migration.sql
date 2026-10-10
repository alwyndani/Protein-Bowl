-- P7B: payment sessions, provider-payment ledger, durable webhook events, one-effective-payment reference.
-- Additive only: nullable/defaulted columns, two new tables, no data rewritten, no enum conversion, no Refund/P7C schema.
-- Legacy payments rows are preserved unchanged (provider/providerOrderId stay NULL; method becomes nullable).

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paidByProviderPaymentId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lockedBy" TEXT,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerOrderId" TEXT,
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "reviewFlag" TEXT,
ADD COLUMN     "supersededById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "method" DROP NOT NULL;

-- CreateTable
CREATE TABLE "provider_payments" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "method" TEXT,
    "errorCode" TEXT,
    "errorReason" TEXT,
    "firstCapturedSeenAt" TIMESTAMP(3),
    "firstSeenVia" TEXT NOT NULL,
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventCreatedAt" TIMESTAMP(3),
    "payloadHash" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "normalized" JSONB,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "ignoredReason" TEXT,
    "lastError" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_payments_orderId_idx" ON "provider_payments"("orderId");

-- CreateIndex
CREATE INDEX "provider_payments_paymentId_idx" ON "provider_payments"("paymentId");

-- CreateIndex
CREATE INDEX "provider_payments_reconciliationStatus_idx" ON "provider_payments"("reconciliationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "provider_payments_provider_providerPaymentId_key" ON "provider_payments"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "payment_webhook_events_status_nextAttemptAt_idx" ON "payment_webhook_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "payment_webhook_events_providerOrderId_idx" ON "payment_webhook_events"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_eventId_key" ON "payment_webhook_events"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_paidByProviderPaymentId_key" ON "orders"("paidByProviderPaymentId");

-- CreateIndex
CREATE INDEX "payments_orderId_createdAt_idx" ON "payments"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_status_nextAttemptAt_idx" ON "payments"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_providerOrderId_key" ON "payments"("provider", "providerOrderId");

-- AddForeignKey
ALTER TABLE "provider_payments" ADD CONSTRAINT "provider_payments_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_payments" ADD CONSTRAINT "provider_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


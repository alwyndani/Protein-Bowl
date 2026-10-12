-- CreateTable
CREATE TABLE "delivery_proofs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "codeHash" TEXT,
    "codeVersion" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" TIMESTAMP(3),
    "regenerationCount" INTEGER NOT NULL DEFAULT 0,
    "regenerationWindowStartedAt" TIMESTAMP(3),
    "regenerationsInWindow" INTEGER NOT NULL DEFAULT 0,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockCycles" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "method" TEXT,
    "verifiedByEmployeeId" TEXT,
    "overrideByUserId" TEXT,
    "overrideReasonCode" TEXT,
    "overrideNote" TEXT,
    "previousAssignmentStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_proofs_orderId_key" ON "delivery_proofs"("orderId");

-- AddForeignKey
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_verifiedByEmployeeId_fkey" FOREIGN KEY ("verifiedByEmployeeId") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_overrideByUserId_fkey" FOREIGN KEY ("overrideByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written integrity checks (Prisma cannot express CHECK constraints). Defence in depth: the service enforces the same rules.
ALTER TABLE "delivery_proofs"
  ADD CONSTRAINT "delivery_proofs_version_ck"  CHECK ("codeVersion" >= 1),
  ADD CONSTRAINT "delivery_proofs_regen_ck"    CHECK ("regenerationCount" BETWEEN 0 AND 10),
  ADD CONSTRAINT "delivery_proofs_regen_window_ck" CHECK ("regenerationsInWindow" BETWEEN 0 AND 3 AND "regenerationsInWindow" <= "regenerationCount" AND ("regenerationsInWindow" = 0) = ("regenerationWindowStartedAt" IS NULL)),
  ADD CONSTRAINT "delivery_proofs_attempts_ck" CHECK ("failedAttempts" BETWEEN 0 AND 5),
  ADD CONSTRAINT "delivery_proofs_cycles_ck"   CHECK ("lockCycles" BETWEEN 0 AND 3),
  ADD CONSTRAINT "delivery_proofs_blocked_ck"  CHECK ("blockedAt" IS NULL OR "lockCycles" = 3),
  ADD CONSTRAINT "delivery_proofs_method_ck"   CHECK ("method" IS NULL OR "method" IN ('PIN', 'ADMIN_OVERRIDE')),
  ADD CONSTRAINT "delivery_proofs_verified_ck" CHECK (("verifiedAt" IS NULL) = ("method" IS NULL)),
  ADD CONSTRAINT "delivery_proofs_pin_ck"      CHECK ("method" IS DISTINCT FROM 'PIN' OR ("codeHash" IS NOT NULL AND "verifiedByEmployeeId" IS NOT NULL)),
  ADD CONSTRAINT "delivery_proofs_override_ck" CHECK ("method" IS DISTINCT FROM 'ADMIN_OVERRIDE' OR ("overrideByUserId" IS NOT NULL AND "overrideReasonCode" IS NOT NULL AND char_length("overrideNote") BETWEEN 10 AND 200));

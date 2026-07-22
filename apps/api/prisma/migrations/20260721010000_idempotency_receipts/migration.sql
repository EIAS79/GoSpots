-- Expand-only: client Idempotency-Key receipts for finance hot writes.
CREATE TABLE "IdempotencyReceipt" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responseJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "IdempotencyReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyReceipt_shopId_scope_key_key" ON "IdempotencyReceipt"("shopId", "scope", "key");

CREATE INDEX "IdempotencyReceipt_shopId_createdAt_idx" ON "IdempotencyReceipt"("shopId", "createdAt");

CREATE INDEX "IdempotencyReceipt_expiresAt_idx" ON "IdempotencyReceipt"("expiresAt");

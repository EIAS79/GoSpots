-- Expand-only: durable transactional email outbox (retry worker).
CREATE TABLE "MailOutbox" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailOutbox_idempotencyKey_key" ON "MailOutbox"("idempotencyKey");

CREATE INDEX "MailOutbox_status_nextAttemptAt_idx" ON "MailOutbox"("status", "nextAttemptAt");

CREATE INDEX "MailOutbox_shopId_createdAt_idx" ON "MailOutbox"("shopId", "createdAt");

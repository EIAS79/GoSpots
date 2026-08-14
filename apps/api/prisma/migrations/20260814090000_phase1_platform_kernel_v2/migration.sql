-- Phase 1 v2 platform-kernel expand migration.

ALTER TYPE "ShopRole" ADD VALUE IF NOT EXISTS 'SUPERVISOR';
ALTER TYPE "ShopRole" ADD VALUE IF NOT EXISTS 'CASHIER';
ALTER TYPE "ShopRole" ADD VALUE IF NOT EXISTS 'SERVER';
ALTER TYPE "ShopRole" ADD VALUE IF NOT EXISTS 'KITCHEN';
ALTER TYPE "ShopRole" ADD VALUE IF NOT EXISTS 'INVENTORY';
ALTER TYPE "ShopRole" ADD VALUE IF NOT EXISTS 'VIEWER';

ALTER TABLE "Shop"
  ADD COLUMN "businessDayStartMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Shop"
  ADD CONSTRAINT "Shop_businessDayStartMinutes_check"
  CHECK ("businessDayStartMinutes" >= 0 AND "businessDayStartMinutes" < 1440);

ALTER TABLE "Shop"
  ADD CONSTRAINT "Shop_version_check" CHECK ("version" > 0);

ALTER TABLE "IdempotencyReceipt"
  ADD COLUMN "correlationId" TEXT;

ALTER TABLE "IdempotencyReceipt"
  ADD CONSTRAINT "IdempotencyReceipt_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "DomainEventOutbox"
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "DomainEventOutbox_shopId_status_occurredAt_idx";
CREATE INDEX "DomainEventOutbox_shopId_status_nextAttemptAt_occurredAt_idx"
  ON "DomainEventOutbox"("shopId", "status", "nextAttemptAt", "occurredAt");
CREATE UNIQUE INDEX "DomainEventOutbox_shopId_id_key"
  ON "DomainEventOutbox"("shopId", "id");

CREATE TABLE "DomainEventConsumerReceipt" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "consumerName" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DomainEventConsumerReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DomainEventConsumerReceipt_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DomainEventConsumerReceipt_shopId_eventId_fkey"
    FOREIGN KEY ("shopId", "eventId") REFERENCES "DomainEventOutbox"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DomainEventConsumerReceipt_eventId_consumerName_key"
  ON "DomainEventConsumerReceipt"("eventId", "consumerName");
CREATE INDEX "DomainEventConsumerReceipt_shopId_consumerName_completedAt_idx"
  ON "DomainEventConsumerReceipt"("shopId", "consumerName", "completedAt");

ALTER TABLE "AuditLog"
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "sourceDevice" TEXT,
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "previousState" JSONB,
  ADD COLUMN "newState" JSONB;

CREATE INDEX "AuditLog_shopId_correlationId_idx"
  ON "AuditLog"("shopId", "correlationId");

CREATE OR REPLACE FUNCTION gospots_reject_audit_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_reject_delete"
BEFORE DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION gospots_reject_audit_delete();

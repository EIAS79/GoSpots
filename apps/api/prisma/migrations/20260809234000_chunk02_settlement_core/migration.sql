-- Chunk 02 — GuestCheck + Settlement Core (expand-only).
-- Builds the immutable financial snapshot spine without charging money or changing legacy finance posting.

CREATE TYPE "CheckSettlementState" AS ENUM (
  'OPEN',
  'CALCULATED',
  'PARTIALLY_PAID',
  'PAID',
  'CLOSED',
  'VOID'
);

ALTER TABLE "GuestCheck"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "currentSettlementId" TEXT;

CREATE TABLE "CheckSettlement" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "guestCheckId" TEXT NOT NULL,
  "state" "CheckSettlementState" NOT NULL DEFAULT 'CALCULATED',
  "checkVersion" INTEGER NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "subtotal" DECIMAL(19,4) NOT NULL,
  "adjustments" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "depositAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "total" DECIMAL(19,4) NOT NULL,
  "amountDue" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CheckSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChargeSnapshot" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "lineReference" TEXT,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitAmount" DECIMAL(19,4) NOT NULL,
  "grossAmount" DECIMAL(19,4) NOT NULL,
  "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "finalAmount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "pricingMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChargeSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestCheck_currentSettlementId_key"
  ON "GuestCheck"("currentSettlementId");
CREATE INDEX "GuestCheck_shopId_version_idx"
  ON "GuestCheck"("shopId", "version");

CREATE INDEX "CheckSettlement_guestCheckId_sourceHash_idx"
  ON "CheckSettlement"("guestCheckId", "sourceHash");
CREATE UNIQUE INDEX "CheckSettlement_guestCheckId_checkVersion_key"
  ON "CheckSettlement"("guestCheckId", "checkVersion");
CREATE INDEX "CheckSettlement_shopId_state_createdAt_idx"
  ON "CheckSettlement"("shopId", "state", "createdAt");
CREATE INDEX "CheckSettlement_shopId_guestCheckId_createdAt_idx"
  ON "CheckSettlement"("shopId", "guestCheckId", "createdAt");

CREATE INDEX "ChargeSnapshot_settlementId_position_idx"
  ON "ChargeSnapshot"("settlementId", "position");
CREATE INDEX "ChargeSnapshot_shopId_sourceType_sourceId_idx"
  ON "ChargeSnapshot"("shopId", "sourceType", "sourceId");

ALTER TABLE "CheckSettlement"
  ADD CONSTRAINT "CheckSettlement_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckSettlement"
  ADD CONSTRAINT "CheckSettlement_guestCheckId_fkey"
  FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestCheck"
  ADD CONSTRAINT "GuestCheck_currentSettlementId_fkey"
  FOREIGN KEY ("currentSettlementId") REFERENCES "CheckSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChargeSnapshot"
  ADD CONSTRAINT "ChargeSnapshot_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChargeSnapshot"
  ADD CONSTRAINT "ChargeSnapshot_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "CheckSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tier-A tenant isolation: settlements and their immutable snapshots are always Shop-scoped.
ALTER TABLE "CheckSettlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CheckSettlement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CheckSettlement_tenant_isolation" ON "CheckSettlement"
  FOR ALL
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

ALTER TABLE "ChargeSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChargeSnapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ChargeSnapshot_tenant_isolation" ON "ChargeSnapshot"
  FOR ALL
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

-- Chunk 04 — Split / Merge / Partial Settlement (expand-only).
-- Adds venue checkout payments/allocations and GuestCheck merge lineage.
-- No provider terminal charge, Transaction revenue row, or LedgerEntry is created by this migration.

CREATE TYPE "CheckoutPaymentMethod" AS ENUM (
  'CASH',
  'MANUAL_CARD',
  'OTHER'
);

CREATE TYPE "CheckoutPaymentStatus" AS ENUM (
  'PENDING',
  'SUCCESS',
  'FAILED',
  'VOID'
);

CREATE TYPE "PaymentAllocationKind" AS ENUM (
  'LINE',
  'SOURCE',
  'EQUAL',
  'PERCENTAGE',
  'CUSTOM',
  'REMAINING'
);

ALTER TABLE "GuestCheck"
  ADD COLUMN "mergedIntoCheckId" TEXT;

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "method" "CheckoutPaymentMethod" NOT NULL,
  "status" "CheckoutPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "note" TEXT,
  "createdById" TEXT,
  "correlationId" TEXT,
  "succeededAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0)
);

CREATE TABLE "PaymentAllocation" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "allocationKind" "PaymentAllocationKind" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "PaymentAllocation_quantity_nonnegative" CHECK ("quantity" >= 0)
);

CREATE TABLE "GuestCheckMergeEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "sourceCheckId" TEXT NOT NULL,
  "destinationCheckId" TEXT NOT NULL,
  "actorId" TEXT,
  "movedShopOrderIds" JSONB NOT NULL,
  "movedPlaySessionIds" JSONB NOT NULL,
  "movedReservationIds" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestCheckMergeEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestCheckMergeEvent_distinct_checks" CHECK ("sourceCheckId" <> "destinationCheckId")
);

CREATE INDEX "GuestCheck_mergedIntoCheckId_idx"
  ON "GuestCheck"("mergedIntoCheckId");

CREATE INDEX "Payment_shopId_status_createdAt_idx"
  ON "Payment"("shopId", "status", "createdAt");
CREATE INDEX "Payment_settlementId_status_createdAt_idx"
  ON "Payment"("settlementId", "status", "createdAt");

CREATE UNIQUE INDEX "PaymentAllocation_paymentId_snapshotId_key"
  ON "PaymentAllocation"("paymentId", "snapshotId");
CREATE INDEX "PaymentAllocation_settlementId_snapshotId_idx"
  ON "PaymentAllocation"("settlementId", "snapshotId");
CREATE INDEX "PaymentAllocation_shopId_settlementId_idx"
  ON "PaymentAllocation"("shopId", "settlementId");

CREATE INDEX "GuestCheckMergeEvent_shopId_createdAt_idx"
  ON "GuestCheckMergeEvent"("shopId", "createdAt");
CREATE INDEX "GuestCheckMergeEvent_sourceCheckId_createdAt_idx"
  ON "GuestCheckMergeEvent"("sourceCheckId", "createdAt");
CREATE INDEX "GuestCheckMergeEvent_destinationCheckId_createdAt_idx"
  ON "GuestCheckMergeEvent"("destinationCheckId", "createdAt");

ALTER TABLE "GuestCheck"
  ADD CONSTRAINT "GuestCheck_mergedIntoCheckId_fkey"
  FOREIGN KEY ("mergedIntoCheckId") REFERENCES "GuestCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "CheckSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "CheckSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "ChargeSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestCheckMergeEvent"
  ADD CONSTRAINT "GuestCheckMergeEvent_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestCheckMergeEvent"
  ADD CONSTRAINT "GuestCheckMergeEvent_sourceCheckId_fkey"
  FOREIGN KEY ("sourceCheckId") REFERENCES "GuestCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestCheckMergeEvent"
  ADD CONSTRAINT "GuestCheckMergeEvent_destinationCheckId_fkey"
  FOREIGN KEY ("destinationCheckId") REFERENCES "GuestCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tier-A tenant isolation for every new Shop-scoped financial/lineage record.
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Payment_tenant_isolation" ON "Payment"
  FOR ALL
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

ALTER TABLE "PaymentAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentAllocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PaymentAllocation_tenant_isolation" ON "PaymentAllocation"
  FOR ALL
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

ALTER TABLE "GuestCheckMergeEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestCheckMergeEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "GuestCheckMergeEvent_tenant_isolation" ON "GuestCheckMergeEvent"
  FOR ALL
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

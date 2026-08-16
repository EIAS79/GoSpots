-- Phase 5 — money-operations controls and reconciliation evidence.
-- Additive only: no Phase 4 financial fact is rewritten or re-owned.

CREATE TYPE "OfflinePaymentMinimumRole" AS ENUM ('CASHIER', 'SUPERVISOR', 'MANAGER', 'OWNER');
CREATE TYPE "FinancialReconciliationStatus" AS ENUM ('RUNNING', 'CLEAR', 'MISMATCH', 'FAILED');
CREATE TYPE "FinancialReconciliationIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'ACKNOWLEDGED');
CREATE TYPE "FinancialReconciliationIssueType" AS ENUM (
  'SETTLEMENT_PAYMENT_MISMATCH',
  'PAYMENT_LEDGER_MISMATCH',
  'CASH_SHIFT_MISMATCH',
  'PAYMENT_REQUIRES_RECONCILIATION',
  'FISCAL_REQUIRES_RECONCILIATION',
  'KSEF_REQUIRES_RECONCILIATION'
);

CREATE TABLE "OfflinePaymentPolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "maxSingleAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "maxCumulativePendingAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "minimumRole" "OfflinePaymentMinimumRole" NOT NULL DEFAULT 'MANAGER',
  "customerWarningText" TEXT,
  "forceReconnectAfterMinutes" INTEGER NOT NULL DEFAULT 30,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflinePaymentPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfflinePaymentPolicy_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OfflinePaymentPolicy_amounts_nonnegative" CHECK ("maxSingleAmount" >= 0 AND "maxCumulativePendingAmount" >= 0),
  CONSTRAINT "OfflinePaymentPolicy_reconnect_positive" CHECK ("forceReconnectAfterMinutes" > 0)
);
CREATE UNIQUE INDEX "OfflinePaymentPolicy_shopId_key" ON "OfflinePaymentPolicy"("shopId");
CREATE INDEX "OfflinePaymentPolicy_shopId_enabled_idx" ON "OfflinePaymentPolicy"("shopId", "enabled");

CREATE TABLE "FinancialReconciliationRun" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "FinancialReconciliationStatus" NOT NULL DEFAULT 'RUNNING',
  "totals" JSONB NOT NULL,
  "mismatchCount" INTEGER NOT NULL DEFAULT 0,
  "correlationId" TEXT NOT NULL,
  "startedById" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "FinancialReconciliationRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialReconciliationRun_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinancialReconciliationRun_mismatch_nonnegative" CHECK ("mismatchCount" >= 0)
);
CREATE UNIQUE INDEX "FinancialReconciliationRun_shopId_businessDate_currency_correlationId_key"
  ON "FinancialReconciliationRun"("shopId", "businessDate", "currency", "correlationId");
CREATE INDEX "FinancialReconciliationRun_shopId_businessDate_status_idx"
  ON "FinancialReconciliationRun"("shopId", "businessDate", "status");

CREATE TABLE "FinancialReconciliationIssue" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "type" "FinancialReconciliationIssueType" NOT NULL,
  "status" "FinancialReconciliationIssueStatus" NOT NULL DEFAULT 'OPEN',
  "severity" TEXT NOT NULL DEFAULT 'ERROR',
  "entityType" TEXT,
  "entityId" TEXT,
  "amount" DECIMAL(19,4),
  "currency" TEXT NOT NULL,
  "expected" JSONB,
  "actual" JSONB,
  "message" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "resolutionNote" TEXT,
  CONSTRAINT "FinancialReconciliationIssue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialReconciliationIssue_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FinancialReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinancialReconciliationIssue_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FinancialReconciliationIssue_shopId_status_type_idx"
  ON "FinancialReconciliationIssue"("shopId", "status", "type");
CREATE INDEX "FinancialReconciliationIssue_runId_type_idx"
  ON "FinancialReconciliationIssue"("runId", "type");
CREATE INDEX "FinancialReconciliationIssue_shopId_entityType_entityId_idx"
  ON "FinancialReconciliationIssue"("shopId", "entityType", "entityId");

-- Tenant isolation is enforced in the database as well as in application services.
ALTER TABLE "OfflinePaymentPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OfflinePaymentPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "OfflinePaymentPolicy_tenant_policy" ON "OfflinePaymentPolicy"
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

ALTER TABLE "FinancialReconciliationRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinancialReconciliationRun" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FinancialReconciliationRun_tenant_policy" ON "FinancialReconciliationRun"
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

ALTER TABLE "FinancialReconciliationIssue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinancialReconciliationIssue" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FinancialReconciliationIssue_tenant_policy" ON "FinancialReconciliationIssue"
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

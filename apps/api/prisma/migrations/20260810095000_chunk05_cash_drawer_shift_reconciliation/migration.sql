-- Chunk 05 — Cash Drawer and Shift Reconciliation (expand-only).
-- Adds physical cash-session controls without changing settlement or revenue tables.

CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "CashMovementType" AS ENUM (
  'CASH_SALE',
  'PAY_IN',
  'PAY_OUT',
  'CASH_REFUND',
  'SAFE_DROP'
);
CREATE TYPE "ShiftCloseApprovalStatus" AS ENUM ('PENDING', 'APPROVED');

ALTER TABLE "Shop"
  ADD COLUMN "cashSessionRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "cashBlindCountEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "cashVarianceApprovalThreshold" DECIMAL(19,4) NOT NULL DEFAULT 0;

CREATE TABLE "CashDrawer" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashDrawer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashSession" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "drawerId" TEXT NOT NULL,
  "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
  "openedById" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openingFloat" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "closedExpectedCash" DECIMAL(19,4),
  "countedCash" DECIMAL(19,4),
  "variance" DECIMAL(19,4),
  "closedAt" TIMESTAMP(3),
  "closedById" TEXT,
  "closeNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashSession_openingFloat_nonnegative" CHECK ("openingFloat" >= 0)
);

CREATE TABLE "CashMovement" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "cashSessionId" TEXT NOT NULL,
  "type" "CashMovementType" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "reasonCategory" TEXT NOT NULL,
  "note" TEXT,
  "actorId" TEXT NOT NULL,
  "paymentId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashMovement_amount_positive" CHECK ("amount" > 0)
);

CREATE TABLE "CashCount" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "cashSessionId" TEXT NOT NULL,
  "countedAmount" DECIMAL(19,4) NOT NULL,
  "expectedCashAtSubmission" DECIMAL(19,4) NOT NULL,
  "variance" DECIMAL(19,4) NOT NULL,
  "blindCount" BOOLEAN NOT NULL,
  "actorId" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashCount_counted_nonnegative" CHECK ("countedAmount" >= 0)
);

CREATE TABLE "ShiftCloseApproval" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "cashSessionId" TEXT NOT NULL,
  "cashCountId" TEXT NOT NULL,
  "status" "ShiftCloseApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "variance" DECIMAL(19,4) NOT NULL,
  "threshold" DECIMAL(19,4) NOT NULL,
  "note" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftCloseApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashDrawer_shopId_name_key"
  ON "CashDrawer"("shopId", "name");
CREATE INDEX "CashDrawer_shopId_isActive_idx"
  ON "CashDrawer"("shopId", "isActive");

CREATE INDEX "CashSession_shopId_status_openedAt_idx"
  ON "CashSession"("shopId", "status", "openedAt");
CREATE INDEX "CashSession_drawerId_status_idx"
  ON "CashSession"("drawerId", "status");
-- Physical drawer and cashier cannot have two concurrent OPEN sessions.
CREATE UNIQUE INDEX "CashSession_one_open_per_drawer"
  ON "CashSession"("drawerId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "CashSession_one_open_per_actor"
  ON "CashSession"("shopId", "openedById") WHERE "status" = 'OPEN';

CREATE UNIQUE INDEX "CashMovement_paymentId_key"
  ON "CashMovement"("paymentId") WHERE "paymentId" IS NOT NULL;
CREATE INDEX "CashMovement_cashSessionId_occurredAt_idx"
  ON "CashMovement"("cashSessionId", "occurredAt");
CREATE INDEX "CashMovement_shopId_type_occurredAt_idx"
  ON "CashMovement"("shopId", "type", "occurredAt");

CREATE INDEX "CashCount_cashSessionId_submittedAt_idx"
  ON "CashCount"("cashSessionId", "submittedAt");
CREATE INDEX "CashCount_shopId_submittedAt_idx"
  ON "CashCount"("shopId", "submittedAt");

CREATE UNIQUE INDEX "ShiftCloseApproval_cashCountId_key"
  ON "ShiftCloseApproval"("cashCountId");
CREATE INDEX "ShiftCloseApproval_shopId_status_requestedAt_idx"
  ON "ShiftCloseApproval"("shopId", "status", "requestedAt");
CREATE INDEX "ShiftCloseApproval_cashSessionId_requestedAt_idx"
  ON "ShiftCloseApproval"("cashSessionId", "requestedAt");

ALTER TABLE "CashDrawer"
  ADD CONSTRAINT "CashDrawer_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashSession"
  ADD CONSTRAINT "CashSession_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashSession"
  ADD CONSTRAINT "CashSession_drawerId_fkey"
  FOREIGN KEY ("drawerId") REFERENCES "CashDrawer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement"
  ADD CONSTRAINT "CashMovement_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashMovement"
  ADD CONSTRAINT "CashMovement_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement"
  ADD CONSTRAINT "CashMovement_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashCount"
  ADD CONSTRAINT "CashCount_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashCount"
  ADD CONSTRAINT "CashCount_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftCloseApproval"
  ADD CONSTRAINT "ShiftCloseApproval_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftCloseApproval"
  ADD CONSTRAINT "ShiftCloseApproval_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftCloseApproval"
  ADD CONSTRAINT "ShiftCloseApproval_cashCountId_fkey"
  FOREIGN KEY ("cashCountId") REFERENCES "CashCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashDrawer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashDrawer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CashDrawer_tenant_policy" ON "CashDrawer"
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

ALTER TABLE "CashSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CashSession_tenant_policy" ON "CashSession"
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

ALTER TABLE "CashMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CashMovement_tenant_policy" ON "CashMovement"
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

ALTER TABLE "CashCount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashCount" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CashCount_tenant_policy" ON "CashCount"
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

ALTER TABLE "ShiftCloseApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShiftCloseApproval" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ShiftCloseApproval_tenant_policy" ON "ShiftCloseApproval"
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

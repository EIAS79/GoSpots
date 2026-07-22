-- Bible #6 / GO_SPOTS_LEDGER.md Phase 1 — LedgerEntry expand (on disk; Neon = operator).
-- App dual-write gated by LEDGER_DUAL_WRITE (default off). Analytics remain interim channel-sum.
-- Forbidden: prisma migrate reset.

CREATE TYPE "LedgerKind" AS ENUM ('SALE', 'REFUND', 'EXPENSE', 'ADJUSTMENT', 'LOSS');
CREATE TYPE "LedgerChannel" AS ENUM ('MENU_ORDERS', 'QUICK_SALES', 'PLAY_SESSIONS', 'RESERVATIONS');
CREATE TYPE "LedgerSourceType" AS ENUM ('SHOP_ORDER', 'TRANSACTION', 'PLAY_SESSION', 'RESERVATION', 'SHOP_LOSS');

CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "channel" "LedgerChannel",
    "sourceType" "LedgerSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "guestCheckId" TEXT,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LedgerEntry_shopId_sourceType_sourceId_kind_key"
  ON "LedgerEntry"("shopId", "sourceType", "sourceId", "kind");
CREATE INDEX "LedgerEntry_shopId_occurredAt_idx" ON "LedgerEntry"("shopId", "occurredAt");
CREATE INDEX "LedgerEntry_shopId_channel_occurredAt_idx" ON "LedgerEntry"("shopId", "channel", "occurredAt");
CREATE INDEX "LedgerEntry_shopId_sourceType_sourceId_idx" ON "LedgerEntry"("shopId", "sourceType", "sourceId");

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Opt-in RLS (same fail-open helper as core Tier A). Safe when TENANT_RLS=off.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_tenant_rls_ok'
  ) THEN
    ALTER TABLE "LedgerEntry" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "LedgerEntry" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "LedgerEntry_tenant_isolation" ON "LedgerEntry";
    CREATE POLICY "LedgerEntry_tenant_isolation" ON "LedgerEntry"
      FOR ALL
      USING (app_tenant_rls_ok("shopId"))
      WITH CHECK (app_tenant_rls_ok("shopId"));
  END IF;
END $$;

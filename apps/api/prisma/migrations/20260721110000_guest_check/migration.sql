-- Bible #10 / GO_SPOTS_UNIFIED_TICKET.md Phase 1 — GuestCheck ops container (on disk; Neon = operator).
-- Option A: children still complete/bill as today; guestCheckId is soft link only.
-- Forbidden: prisma migrate reset / workstation Neon deploy.

CREATE TYPE "GuestCheckStatus" AS ENUM ('OPEN', 'SETTLED', 'VOID');

CREATE TABLE "GuestCheck" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "GuestCheckStatus" NOT NULL DEFAULT 'OPEN',
    "guestName" TEXT,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT,
    "note" TEXT,
    "currency" TEXT,
    "paymentMethod" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GuestCheck_shopId_status_openedAt_idx"
  ON "GuestCheck"("shopId", "status", "openedAt");

ALTER TABLE "GuestCheck"
  ADD CONSTRAINT "GuestCheck_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reservation" ADD COLUMN "guestCheckId" TEXT;
CREATE INDEX "Reservation_guestCheckId_idx" ON "Reservation"("guestCheckId");
ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_guestCheckId_fkey"
  FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlaySession" ADD COLUMN "guestCheckId" TEXT;
CREATE INDEX "PlaySession_guestCheckId_idx" ON "PlaySession"("guestCheckId");
ALTER TABLE "PlaySession"
  ADD CONSTRAINT "PlaySession_guestCheckId_fkey"
  FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShopOrder" ADD COLUMN "guestCheckId" TEXT;
CREATE INDEX "ShopOrder_guestCheckId_idx" ON "ShopOrder"("guestCheckId");
ALTER TABLE "ShopOrder"
  ADD CONSTRAINT "ShopOrder_guestCheckId_fkey"
  FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LedgerEntry.guestCheckId already existed as a free string; add FK + index when table present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'LedgerEntry'
  ) THEN
    CREATE INDEX IF NOT EXISTS "LedgerEntry_guestCheckId_idx" ON "LedgerEntry"("guestCheckId");
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'LedgerEntry_guestCheckId_fkey'
        AND table_name = 'LedgerEntry'
    ) THEN
      ALTER TABLE "LedgerEntry"
        ADD CONSTRAINT "LedgerEntry_guestCheckId_fkey"
        FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

-- Opt-in RLS (same fail-open helper as core Tier A). Safe when TENANT_RLS=off.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_tenant_rls_ok'
  ) THEN
    ALTER TABLE "GuestCheck" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "GuestCheck" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "GuestCheck_tenant_isolation" ON "GuestCheck";
    CREATE POLICY "GuestCheck_tenant_isolation" ON "GuestCheck"
      FOR ALL
      USING (app_tenant_rls_ok("shopId"))
      WITH CHECK (app_tenant_rls_ok("shopId"));
  END IF;
END $$;

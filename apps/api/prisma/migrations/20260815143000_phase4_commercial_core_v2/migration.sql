-- Phase 4 — Commercial Core: GuestCheck, Orders, Checkout, Settlement and Ledger
-- Expand-only migration. Existing commercial rows are preserved and backfilled into LedgerEntry.

-- Canonical ledger vocabulary. Prisma's existing enum remains backward-compatible; new values
-- are written by database triggers/raw ledger inspection until a later schema consolidation.
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'PAYMENT';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'CASH_MOVEMENT';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'STORED_VALUE';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'DEPOSIT_APPLICATION';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'REVERSAL';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'CORRECTION';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'TIP';

ALTER TYPE "LedgerSourceType" ADD VALUE IF NOT EXISTS 'VENUE_ORDER';
ALTER TYPE "LedgerSourceType" ADD VALUE IF NOT EXISTS 'CHECK_SETTLEMENT';
ALTER TYPE "LedgerSourceType" ADD VALUE IF NOT EXISTS 'CHECKOUT_PAYMENT';
ALTER TYPE "LedgerSourceType" ADD VALUE IF NOT EXISTS 'CASH_MOVEMENT';
ALTER TYPE "LedgerSourceType" ADD VALUE IF NOT EXISTS 'COMMERCIAL_ADJUSTMENT';
ALTER TYPE "LedgerSourceType" ADD VALUE IF NOT EXISTS 'SERVICE_CHARGE';
ALTER TYPE "LedgerSourceType" ADD VALUE IF NOT EXISTS 'TIP';
ALTER TYPE "LedgerSourceType" ADD VALUE IF NOT EXISTS 'DEPOSIT_APPLICATION';
ALTER TYPE "LedgerSourceType" ADD VALUE IF NOT EXISTS 'STORED_VALUE';
ALTER TYPE "LedgerSourceType" ADD VALUE IF NOT EXISTS 'REVERSAL';

-- VenueOrder gains optimistic concurrency for commercial-core mutations.
ALTER TABLE "VenueOrder" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  CREATE TYPE "CommercialCheckType" AS ENUM ('SESSION','RESTAURANT_TABLE','BAR_TAB','COUNTER_SALE','TAKEAWAY','RESERVATION_EVENT','RETAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CommercialAdjustmentType" AS ENUM ('PERCENTAGE_DISCOUNT','FIXED_DISCOUNT','MANAGER_COMP','PRICE_OVERRIDE','PROMOTION','DEPOSIT_APPLICATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CommercialAdjustmentScope" AS ENUM ('CHECK','LINE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CommercialAdjustmentSource" AS ENUM ('MANUAL','PROMOTION','MEMBERSHIP','DEPOSIT','SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CommercialChargeMode" AS ENUM ('FIXED','PERCENTAGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CommercialTipMethod" AS ENUM ('CASH','CARD','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CommercialReopenDisposition" AS ENUM ('REOPENED_UNPAID','REFUND_RESALE_REQUIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CommercialPolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "maxManualDiscountBps" INTEGER NOT NULL DEFAULT 10000,
  "maxCompAmountMinor" INTEGER NOT NULL DEFAULT 1000000000,
  "maxPriceOverrideBps" INTEGER NOT NULL DEFAULT 10000,
  "allowCashShiftCloseWithOpenTabs" BOOLEAN NOT NULL DEFAULT false,
  "allowResourceTransfer" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommercialPolicy_shopId_key" ON "CommercialPolicy"("shopId");
CREATE INDEX IF NOT EXISTS "CommercialPolicy_shopId_idx" ON "CommercialPolicy"("shopId");

CREATE TABLE IF NOT EXISTS "GuestCheckCommercialProfile" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "guestCheckId" TEXT NOT NULL,
  "checkType" "CommercialCheckType" NOT NULL DEFAULT 'COUNTER_SALE',
  "assignedOperatorId" TEXT,
  "resourceId" TEXT,
  "operationsSessionId" TEXT,
  "tableReference" TEXT,
  "customerId" TEXT,
  "serviceArea" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestCheckCommercialProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GuestCheckCommercialProfile_guestCheckId_key" ON "GuestCheckCommercialProfile"("guestCheckId");
CREATE INDEX IF NOT EXISTS "GuestCheckCommercialProfile_shopId_checkType_idx" ON "GuestCheckCommercialProfile"("shopId","checkType");
CREATE INDEX IF NOT EXISTS "GuestCheckCommercialProfile_shopId_assignedOperatorId_idx" ON "GuestCheckCommercialProfile"("shopId","assignedOperatorId");
CREATE INDEX IF NOT EXISTS "GuestCheckCommercialProfile_shopId_resourceId_idx" ON "GuestCheckCommercialProfile"("shopId","resourceId");
CREATE INDEX IF NOT EXISTS "GuestCheckCommercialProfile_shopId_operationsSessionId_idx" ON "GuestCheckCommercialProfile"("shopId","operationsSessionId");
CREATE INDEX IF NOT EXISTS "GuestCheckCommercialProfile_shopId_customerId_idx" ON "GuestCheckCommercialProfile"("shopId","customerId");

CREATE TABLE IF NOT EXISTS "CommercialAdjustment" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "guestCheckId" TEXT NOT NULL,
  "type" "CommercialAdjustmentType" NOT NULL,
  "scope" "CommercialAdjustmentScope" NOT NULL DEFAULT 'CHECK',
  "targetSourceType" TEXT,
  "targetSourceId" TEXT,
  "targetLineReference" TEXT,
  "amountMinor" INTEGER,
  "percentageBps" INTEGER,
  "beforeTotalMinor" INTEGER NOT NULL,
  "afterTotalMinor" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "source" "CommercialAdjustmentSource" NOT NULL DEFAULT 'MANUAL',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  "voidedById" TEXT,
  "voidReason" TEXT,
  CONSTRAINT "CommercialAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommercialAdjustment_shopId_guestCheckId_createdAt_idx" ON "CommercialAdjustment"("shopId","guestCheckId","createdAt");
CREATE INDEX IF NOT EXISTS "CommercialAdjustment_shopId_guestCheckId_voidedAt_idx" ON "CommercialAdjustment"("shopId","guestCheckId","voidedAt");
CREATE INDEX IF NOT EXISTS "CommercialAdjustment_shopId_type_createdAt_idx" ON "CommercialAdjustment"("shopId","type","createdAt");

CREATE TABLE IF NOT EXISTS "GuestCheckServiceCharge" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "guestCheckId" TEXT NOT NULL,
  "mode" "CommercialChargeMode" NOT NULL,
  "amountMinor" INTEGER,
  "percentageBps" INTEGER,
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  "voidedById" TEXT,
  "voidReason" TEXT,
  CONSTRAINT "GuestCheckServiceCharge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GuestCheckServiceCharge_shopId_guestCheckId_createdAt_idx" ON "GuestCheckServiceCharge"("shopId","guestCheckId","createdAt");
CREATE INDEX IF NOT EXISTS "GuestCheckServiceCharge_shopId_guestCheckId_voidedAt_idx" ON "GuestCheckServiceCharge"("shopId","guestCheckId","voidedAt");

CREATE TABLE IF NOT EXISTS "GuestCheckTip" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "guestCheckId" TEXT NOT NULL,
  "method" "CommercialTipMethod" NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  "voidedById" TEXT,
  "voidReason" TEXT,
  CONSTRAINT "GuestCheckTip_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GuestCheckTip_shopId_guestCheckId_createdAt_idx" ON "GuestCheckTip"("shopId","guestCheckId","createdAt");
CREATE INDEX IF NOT EXISTS "GuestCheckTip_shopId_guestCheckId_voidedAt_idx" ON "GuestCheckTip"("shopId","guestCheckId","voidedAt");

CREATE TABLE IF NOT EXISTS "GuestCheckTransferEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "guestCheckId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "fromOperatorId" TEXT,
  "toOperatorId" TEXT,
  "fromResourceId" TEXT,
  "toResourceId" TEXT,
  "fromOperationsSessionId" TEXT,
  "toOperationsSessionId" TEXT,
  "fromServiceArea" TEXT,
  "toServiceArea" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestCheckTransferEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GuestCheckTransferEvent_shopId_guestCheckId_createdAt_idx" ON "GuestCheckTransferEvent"("shopId","guestCheckId","createdAt");

CREATE TABLE IF NOT EXISTS "GuestCheckReopenEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "guestCheckId" TEXT NOT NULL,
  "settlementId" TEXT,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "disposition" "CommercialReopenDisposition" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestCheckReopenEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GuestCheckReopenEvent_shopId_guestCheckId_createdAt_idx" ON "GuestCheckReopenEvent"("shopId","guestCheckId","createdAt");
CREATE INDEX IF NOT EXISTS "GuestCheckReopenEvent_shopId_settlementId_idx" ON "GuestCheckReopenEvent"("shopId","settlementId");

CREATE TABLE IF NOT EXISTS "CommercialReceipt" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "guestCheckId" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommercialReceipt_settlementId_key" ON "CommercialReceipt"("settlementId");
CREATE UNIQUE INDEX IF NOT EXISTS "CommercialReceipt_shopId_receiptNumber_key" ON "CommercialReceipt"("shopId","receiptNumber");
CREATE INDEX IF NOT EXISTS "CommercialReceipt_shopId_guestCheckId_issuedAt_idx" ON "CommercialReceipt"("shopId","guestCheckId","issuedAt");

-- Tenant and canonical aggregate foreign keys. Optional transfer targets remain scalar and are
-- validated server-side so legacy rows are not made un-migratable.
DO $$ BEGIN ALTER TABLE "CommercialPolicy" ADD CONSTRAINT "CommercialPolicy_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "GuestCheckCommercialProfile" ADD CONSTRAINT "GuestCheckCommercialProfile_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "GuestCheckCommercialProfile" ADD CONSTRAINT "GuestCheckCommercialProfile_guestCheckId_fkey" FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CommercialAdjustment" ADD CONSTRAINT "CommercialAdjustment_guestCheckId_fkey" FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "GuestCheckServiceCharge" ADD CONSTRAINT "GuestCheckServiceCharge_guestCheckId_fkey" FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "GuestCheckTip" ADD CONSTRAINT "GuestCheckTip_guestCheckId_fkey" FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "GuestCheckTransferEvent" ADD CONSTRAINT "GuestCheckTransferEvent_guestCheckId_fkey" FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "GuestCheckReopenEvent" ADD CONSTRAINT "GuestCheckReopenEvent_guestCheckId_fkey" FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "GuestCheckReopenEvent" ADD CONSTRAINT "GuestCheckReopenEvent_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CheckSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CommercialReceipt" ADD CONSTRAINT "CommercialReceipt_guestCheckId_fkey" FOREIGN KEY ("guestCheckId") REFERENCES "GuestCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CommercialReceipt" ADD CONSTRAINT "CommercialReceipt_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CheckSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One idempotent posting function powers all canonical commercial ledger triggers.
CREATE OR REPLACE FUNCTION gospots_phase4_post_ledger(
  p_shop_id TEXT,
  p_currency TEXT,
  p_amount NUMERIC,
  p_kind "LedgerKind",
  p_channel "LedgerChannel",
  p_source_type "LedgerSourceType",
  p_source_id TEXT,
  p_occurred_at TIMESTAMP,
  p_created_by TEXT,
  p_guest_check_id TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "LedgerEntry" ("id","shopId","currency","amount","kind","channel","sourceType","sourceId","occurredAt","createdAt","createdById","guestCheckId")
  VALUES ('p4_' || md5(p_shop_id || ':' || p_source_type::text || ':' || p_source_id || ':' || p_kind::text), p_shop_id, upper(p_currency), p_amount, p_kind, p_channel, p_source_type, p_source_id, p_occurred_at, CURRENT_TIMESTAMP, p_created_by, p_guest_check_id)
  ON CONFLICT ("shopId","sourceType","sourceId","kind") DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION gospots_phase4_ledger_shop_order() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_currency TEXT;
BEGIN
  IF NEW."status" = 'COMPLETED' AND (TG_OP = 'INSERT' OR OLD."status" IS DISTINCT FROM NEW."status") THEN
    SELECT COALESCE(NEW."currency", s."currency") INTO v_currency FROM "Shop" s WHERE s."id"=NEW."shopId";
    PERFORM gospots_phase4_post_ledger(NEW."shopId", v_currency, NEW."total", 'SALE', 'MENU_ORDERS', 'SHOP_ORDER', NEW."id", COALESCE(NEW."completedAt", CURRENT_TIMESTAMP), NEW."createdById", NEW."guestCheckId");
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_ledger_shop_order ON "ShopOrder";
CREATE TRIGGER phase4_ledger_shop_order AFTER INSERT OR UPDATE OF "status" ON "ShopOrder" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_ledger_shop_order();

CREATE OR REPLACE FUNCTION gospots_phase4_ledger_venue_order() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'COMPLETED' AND (TG_OP = 'INSERT' OR OLD."status" IS DISTINCT FROM NEW."status") THEN
    PERFORM gospots_phase4_post_ledger(NEW."shopId", NEW."currency", NEW."totalMinor"::numeric / 100, 'SALE', 'MENU_ORDERS', 'VENUE_ORDER', NEW."id", COALESCE(NEW."completedAt", CURRENT_TIMESTAMP), NEW."createdById", NEW."guestCheckId");
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_ledger_venue_order ON "VenueOrder";
CREATE TRIGGER phase4_ledger_venue_order AFTER INSERT OR UPDATE OF "status" ON "VenueOrder" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_ledger_venue_order();

CREATE OR REPLACE FUNCTION gospots_phase4_ledger_reservation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_currency TEXT;
BEGIN
  IF NEW."billedAmount" IS NOT NULL AND (TG_OP='INSERT' OR OLD."billedAmount" IS NULL) THEN
    SELECT COALESCE(NEW."currency", s."currency") INTO v_currency FROM "Shop" s WHERE s."id"=NEW."shopId";
    PERFORM gospots_phase4_post_ledger(NEW."shopId", v_currency, NEW."billedAmount", 'SALE', CASE WHEN NEW."resourceId" IS NULL THEN 'RESERVATIONS'::"LedgerChannel" ELSE 'PLAY_SESSIONS'::"LedgerChannel" END, 'RESERVATION', NEW."id", COALESCE(NEW."billedAt", CURRENT_TIMESTAMP), NULL, NEW."guestCheckId");
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_ledger_reservation ON "Reservation";
CREATE TRIGGER phase4_ledger_reservation AFTER INSERT OR UPDATE OF "billedAmount" ON "Reservation" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_ledger_reservation();

CREATE OR REPLACE FUNCTION gospots_phase4_ledger_play_session() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_currency TEXT;
BEGIN
  IF NEW."reservationId" IS NULL AND NEW."status"='COMPLETED' AND (TG_OP='INSERT' OR OLD."status" IS DISTINCT FROM NEW."status") THEN
    SELECT COALESCE(NEW."currency", s."currency") INTO v_currency FROM "Shop" s WHERE s."id"=NEW."shopId";
    PERFORM gospots_phase4_post_ledger(NEW."shopId", v_currency, NEW."amount", 'SALE', 'PLAY_SESSIONS', 'PLAY_SESSION', NEW."id", COALESCE(NEW."completedAt", CURRENT_TIMESTAMP), NEW."createdById", NEW."guestCheckId");
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_ledger_play_session ON "PlaySession";
CREATE TRIGGER phase4_ledger_play_session AFTER INSERT OR UPDATE OF "status" ON "PlaySession" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_ledger_play_session();

CREATE OR REPLACE FUNCTION gospots_phase4_ledger_payment() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_check TEXT;
BEGIN
  IF NEW."status"='SUCCESS' AND (TG_OP='INSERT' OR OLD."status" IS DISTINCT FROM NEW."status") THEN
    SELECT cs."guestCheckId" INTO v_check FROM "CheckSettlement" cs WHERE cs."id"=NEW."settlementId";
    PERFORM gospots_phase4_post_ledger(NEW."shopId", NEW."currency", NEW."amount", 'PAYMENT', NULL, 'CHECKOUT_PAYMENT', NEW."id", COALESCE(NEW."succeededAt", CURRENT_TIMESTAMP), NEW."createdById", v_check);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_ledger_payment ON "Payment";
CREATE TRIGGER phase4_ledger_payment AFTER INSERT OR UPDATE OF "status" ON "Payment" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_ledger_payment();

CREATE OR REPLACE FUNCTION gospots_phase4_ledger_cash_movement() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_signed NUMERIC;
DECLARE v_check TEXT;
BEGIN
  v_signed := CASE WHEN NEW."type" IN ('CASH_SALE','PAY_IN') THEN NEW."amount" ELSE -NEW."amount" END;
  IF NEW."paymentId" IS NOT NULL THEN
    SELECT cs."guestCheckId" INTO v_check FROM "Payment" p JOIN "CheckSettlement" cs ON cs."id"=p."settlementId" WHERE p."id"=NEW."paymentId";
  END IF;
  PERFORM gospots_phase4_post_ledger(NEW."shopId", NEW."currency", v_signed, 'CASH_MOVEMENT', NULL, 'CASH_MOVEMENT', NEW."id", NEW."occurredAt", NEW."actorId", v_check);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_ledger_cash_movement ON "CashMovement";
CREATE TRIGGER phase4_ledger_cash_movement AFTER INSERT ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_ledger_cash_movement();

CREATE OR REPLACE FUNCTION gospots_phase4_ledger_transaction() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_currency TEXT;
DECLARE v_kind "LedgerKind";
BEGIN
  SELECT COALESCE(NEW."currency", s."currency") INTO v_currency FROM "Shop" s WHERE s."id"=NEW."shopId";
  v_kind := CASE NEW."kind" WHEN 'SALE' THEN 'SALE'::"LedgerKind" WHEN 'REFUND' THEN 'REFUND'::"LedgerKind" WHEN 'EXPENSE' THEN 'EXPENSE'::"LedgerKind" ELSE 'ADJUSTMENT'::"LedgerKind" END;
  PERFORM gospots_phase4_post_ledger(NEW."shopId", v_currency, NEW."amount", v_kind, CASE WHEN NEW."kind" IN ('SALE','REFUND') THEN 'QUICK_SALES'::"LedgerChannel" ELSE NULL END, 'TRANSACTION', NEW."id", NEW."createdAt", NEW."createdById", NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_ledger_transaction ON "Transaction";
CREATE TRIGGER phase4_ledger_transaction AFTER INSERT ON "Transaction" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_ledger_transaction();

CREATE OR REPLACE FUNCTION gospots_phase4_ledger_loss() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_currency TEXT;
BEGIN
  SELECT COALESCE(NEW."currency", s."currency") INTO v_currency FROM "Shop" s WHERE s."id"=NEW."shopId";
  PERFORM gospots_phase4_post_ledger(NEW."shopId", v_currency, NEW."amount", 'LOSS', NULL, 'SHOP_LOSS', NEW."id", NEW."occurredAt", NEW."createdById", NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_ledger_loss ON "ShopLoss";
CREATE TRIGGER phase4_ledger_loss AFTER INSERT ON "ShopLoss" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_ledger_loss();

-- Commercial adjustments/charges become immutable ledger facts only when their settlement closes.
CREATE OR REPLACE FUNCTION gospots_phase4_ledger_settlement_close() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r RECORD;
DECLARE v_amount NUMERIC;
BEGIN
  IF NEW."state"='CLOSED' AND OLD."state" IS DISTINCT FROM NEW."state" THEN
    FOR r IN SELECT * FROM "CommercialAdjustment" WHERE "shopId"=NEW."shopId" AND "guestCheckId"=NEW."guestCheckId" AND "voidedAt" IS NULL LOOP
      IF r."type"='DEPOSIT_APPLICATION' THEN
        v_amount := GREATEST(0, r."beforeTotalMinor" - r."afterTotalMinor")::numeric / 100;
        PERFORM gospots_phase4_post_ledger(NEW."shopId", NEW."currency", v_amount, 'DEPOSIT_APPLICATION', NULL, 'DEPOSIT_APPLICATION', r."id", CURRENT_TIMESTAMP, r."createdById", NEW."guestCheckId");
      ELSE
        v_amount := (r."afterTotalMinor" - r."beforeTotalMinor")::numeric / 100;
        PERFORM gospots_phase4_post_ledger(NEW."shopId", NEW."currency", v_amount, 'CORRECTION', NULL, 'COMMERCIAL_ADJUSTMENT', r."id", CURRENT_TIMESTAMP, r."createdById", NEW."guestCheckId");
      END IF;
    END LOOP;
    FOR r IN SELECT * FROM "GuestCheckServiceCharge" WHERE "shopId"=NEW."shopId" AND "guestCheckId"=NEW."guestCheckId" AND "voidedAt" IS NULL LOOP
      v_amount := CASE WHEN r."mode"='FIXED' THEN COALESCE(r."amountMinor",0)::numeric / 100 ELSE round(NEW."subtotal" * COALESCE(r."percentageBps",0) / 10000, 2) END;
      PERFORM gospots_phase4_post_ledger(NEW."shopId", NEW."currency", v_amount, 'SALE', NULL, 'SERVICE_CHARGE', r."id", CURRENT_TIMESTAMP, r."createdById", NEW."guestCheckId");
    END LOOP;
    FOR r IN SELECT * FROM "GuestCheckTip" WHERE "shopId"=NEW."shopId" AND "guestCheckId"=NEW."guestCheckId" AND "voidedAt" IS NULL LOOP
      PERFORM gospots_phase4_post_ledger(NEW."shopId", NEW."currency", r."amountMinor"::numeric / 100, 'TIP', NULL, 'TIP', r."id", CURRENT_TIMESTAMP, r."createdById", NEW."guestCheckId");
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_ledger_settlement_close ON "CheckSettlement";
CREATE TRIGGER phase4_ledger_settlement_close AFTER UPDATE OF "state" ON "CheckSettlement" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_ledger_settlement_close();

-- Historical backfill: existing uniqueness makes this repeat-safe and prevents double counting.
INSERT INTO "LedgerEntry" ("id","shopId","currency","amount","kind","channel","sourceType","sourceId","occurredAt","createdAt","createdById","guestCheckId")
SELECT 'p4_'||md5(o."shopId"||':SHOP_ORDER:'||o."id"||':SALE'), o."shopId", upper(COALESCE(o."currency",s."currency")), o."total", 'SALE','MENU_ORDERS','SHOP_ORDER',o."id",COALESCE(o."completedAt",o."updatedAt"),CURRENT_TIMESTAMP,o."createdById",o."guestCheckId"
FROM "ShopOrder" o JOIN "Shop" s ON s."id"=o."shopId" WHERE o."status"='COMPLETED'
ON CONFLICT ("shopId","sourceType","sourceId","kind") DO NOTHING;

INSERT INTO "LedgerEntry" ("id","shopId","currency","amount","kind","channel","sourceType","sourceId","occurredAt","createdAt","createdById","guestCheckId")
SELECT 'p4_'||md5(o."shopId"||':VENUE_ORDER:'||o."id"||':SALE'), o."shopId", upper(o."currency"), o."totalMinor"::numeric/100, 'SALE','MENU_ORDERS','VENUE_ORDER',o."id",COALESCE(o."completedAt",o."updatedAt"),CURRENT_TIMESTAMP,o."createdById",o."guestCheckId"
FROM "VenueOrder" o WHERE o."status"='COMPLETED'
ON CONFLICT ("shopId","sourceType","sourceId","kind") DO NOTHING;

INSERT INTO "LedgerEntry" ("id","shopId","currency","amount","kind","channel","sourceType","sourceId","occurredAt","createdAt","createdById","guestCheckId")
SELECT 'p4_'||md5(r."shopId"||':RESERVATION:'||r."id"||':SALE'), r."shopId", upper(COALESCE(r."currency",s."currency")), r."billedAmount", 'SALE', CASE WHEN r."resourceId" IS NULL THEN 'RESERVATIONS'::"LedgerChannel" ELSE 'PLAY_SESSIONS'::"LedgerChannel" END, 'RESERVATION',r."id",COALESCE(r."billedAt",r."updatedAt"),CURRENT_TIMESTAMP,NULL,r."guestCheckId"
FROM "Reservation" r JOIN "Shop" s ON s."id"=r."shopId" WHERE r."billedAmount" IS NOT NULL
ON CONFLICT ("shopId","sourceType","sourceId","kind") DO NOTHING;

INSERT INTO "LedgerEntry" ("id","shopId","currency","amount","kind","channel","sourceType","sourceId","occurredAt","createdAt","createdById","guestCheckId")
SELECT 'p4_'||md5(p."shopId"||':PLAY_SESSION:'||p."id"||':SALE'), p."shopId", upper(COALESCE(p."currency",s."currency")), p."amount", 'SALE','PLAY_SESSIONS','PLAY_SESSION',p."id",COALESCE(p."completedAt",p."updatedAt"),CURRENT_TIMESTAMP,p."createdById",p."guestCheckId"
FROM "PlaySession" p JOIN "Shop" s ON s."id"=p."shopId" WHERE p."status"='COMPLETED' AND p."reservationId" IS NULL
ON CONFLICT ("shopId","sourceType","sourceId","kind") DO NOTHING;

INSERT INTO "LedgerEntry" ("id","shopId","currency","amount","kind","channel","sourceType","sourceId","occurredAt","createdAt","createdById","guestCheckId")
SELECT 'p4_'||md5(p."shopId"||':CHECKOUT_PAYMENT:'||p."id"||':PAYMENT'), p."shopId", upper(p."currency"), p."amount", 'PAYMENT',NULL,'CHECKOUT_PAYMENT',p."id",COALESCE(p."succeededAt",p."createdAt"),CURRENT_TIMESTAMP,p."createdById",cs."guestCheckId"
FROM "Payment" p JOIN "CheckSettlement" cs ON cs."id"=p."settlementId" WHERE p."status"='SUCCESS'
ON CONFLICT ("shopId","sourceType","sourceId","kind") DO NOTHING;

INSERT INTO "LedgerEntry" ("id","shopId","currency","amount","kind","channel","sourceType","sourceId","occurredAt","createdAt","createdById","guestCheckId")
SELECT 'p4_'||md5(c."shopId"||':CASH_MOVEMENT:'||c."id"||':CASH_MOVEMENT'), c."shopId", upper(c."currency"), CASE WHEN c."type" IN ('CASH_SALE','PAY_IN') THEN c."amount" ELSE -c."amount" END, 'CASH_MOVEMENT',NULL,'CASH_MOVEMENT',c."id",c."occurredAt",CURRENT_TIMESTAMP,c."actorId",cs."guestCheckId"
FROM "CashMovement" c LEFT JOIN "Payment" p ON p."id"=c."paymentId" LEFT JOIN "CheckSettlement" cs ON cs."id"=p."settlementId"
ON CONFLICT ("shopId","sourceType","sourceId","kind") DO NOTHING;

INSERT INTO "LedgerEntry" ("id","shopId","currency","amount","kind","channel","sourceType","sourceId","occurredAt","createdAt","createdById","guestCheckId")
SELECT 'p4_'||md5(t."shopId"||':TRANSACTION:'||t."id"||':'||t."kind"::text), t."shopId", upper(COALESCE(t."currency",s."currency")), t."amount", CASE t."kind" WHEN 'SALE' THEN 'SALE'::"LedgerKind" WHEN 'REFUND' THEN 'REFUND'::"LedgerKind" WHEN 'EXPENSE' THEN 'EXPENSE'::"LedgerKind" ELSE 'ADJUSTMENT'::"LedgerKind" END, CASE WHEN t."kind" IN ('SALE','REFUND') THEN 'QUICK_SALES'::"LedgerChannel" ELSE NULL END, 'TRANSACTION',t."id",t."createdAt",CURRENT_TIMESTAMP,t."createdById",NULL
FROM "Transaction" t JOIN "Shop" s ON s."id"=t."shopId"
ON CONFLICT ("shopId","sourceType","sourceId","kind") DO NOTHING;

INSERT INTO "LedgerEntry" ("id","shopId","currency","amount","kind","channel","sourceType","sourceId","occurredAt","createdAt","createdById","guestCheckId")
SELECT 'p4_'||md5(l."shopId"||':SHOP_LOSS:'||l."id"||':LOSS'), l."shopId", upper(COALESCE(l."currency",s."currency")), l."amount", 'LOSS',NULL,'SHOP_LOSS',l."id",l."occurredAt",CURRENT_TIMESTAMP,l."createdById",NULL
FROM "ShopLoss" l JOIN "Shop" s ON s."id"=l."shopId"
ON CONFLICT ("shopId","sourceType","sourceId","kind") DO NOTHING;

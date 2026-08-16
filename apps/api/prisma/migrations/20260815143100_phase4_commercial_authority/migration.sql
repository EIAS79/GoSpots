-- Phase 4 — Commercial Core authority and durable ledger posting.
-- Expand-only: no canonical financial rows are deleted or rewritten.

ALTER TABLE "VenueOrder" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN CREATE TYPE "CommercialCheckType" AS ENUM ('SESSION','RESTAURANT_TABLE','BAR_TAB','COUNTER_SALE','TAKEAWAY','RESERVATION_EVENT','RETAIL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommercialAdjustmentType" AS ENUM ('PERCENTAGE_DISCOUNT','FIXED_DISCOUNT','MANAGER_COMP','PRICE_OVERRIDE','PROMOTION','DEPOSIT_APPLICATION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommercialAdjustmentScope" AS ENUM ('CHECK','LINE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommercialAdjustmentSource" AS ENUM ('MANUAL','PROMOTION','MEMBERSHIP','DEPOSIT','SYSTEM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommercialChargeMode" AS ENUM ('FIXED','PERCENTAGE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommercialTipMethod" AS ENUM ('CASH','CARD','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommercialReopenDisposition" AS ENUM ('REOPENED_UNPAID','REFUND_RESALE_REQUIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE TABLE IF NOT EXISTS "LedgerFactMetadata" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "ledgerEntryId" TEXT NOT NULL,
  "factType" TEXT NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "guestCheckId" TEXT,
  "settlementId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerFactMetadata_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerFactMetadata_ledgerEntryId_key" ON "LedgerFactMetadata"("ledgerEntryId");
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerFactMetadata_shopId_factType_referenceType_referenceId_key" ON "LedgerFactMetadata"("shopId","factType","referenceType","referenceId");
CREATE INDEX IF NOT EXISTS "LedgerFactMetadata_shopId_factType_createdAt_idx" ON "LedgerFactMetadata"("shopId","factType","createdAt");
CREATE INDEX IF NOT EXISTS "LedgerFactMetadata_shopId_guestCheckId_createdAt_idx" ON "LedgerFactMetadata"("shopId","guestCheckId","createdAt");
CREATE INDEX IF NOT EXISTS "LedgerFactMetadata_shopId_settlementId_createdAt_idx" ON "LedgerFactMetadata"("shopId","settlementId","createdAt");

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
DO $$ BEGIN ALTER TABLE "LedgerFactMetadata" ADD CONSTRAINT "LedgerFactMetadata_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Single monetary ledger writer. New Phase 4 semantic fact types live in LedgerFactMetadata,
-- never in a second balance table.
CREATE OR REPLACE FUNCTION gospots_phase4_post_fact(
  p_shop_id TEXT,
  p_currency TEXT,
  p_amount NUMERIC,
  p_kind "LedgerKind",
  p_channel "LedgerChannel",
  p_source_type "LedgerSourceType",
  p_source_id TEXT,
  p_occurred_at TIMESTAMP,
  p_created_by TEXT,
  p_guest_check_id TEXT,
  p_fact_type TEXT,
  p_reference_type TEXT,
  p_reference_id TEXT,
  p_settlement_id TEXT,
  p_metadata JSONB DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_ledger_id TEXT;
BEGIN
  v_ledger_id := 'p4_' || md5(p_shop_id || ':' || p_source_type::text || ':' || p_source_id || ':' || p_kind::text);
  INSERT INTO "LedgerEntry" ("id","shopId","currency","amount","kind","channel","sourceType","sourceId","occurredAt","createdAt","createdById","guestCheckId")
  VALUES (v_ledger_id,p_shop_id,upper(p_currency),p_amount,p_kind,p_channel,p_source_type,p_source_id,p_occurred_at,CURRENT_TIMESTAMP,p_created_by,p_guest_check_id)
  ON CONFLICT ("shopId","sourceType","sourceId","kind") DO UPDATE SET "guestCheckId"=COALESCE("LedgerEntry"."guestCheckId",EXCLUDED."guestCheckId");
  SELECT "id" INTO v_ledger_id FROM "LedgerEntry" WHERE "shopId"=p_shop_id AND "sourceType"=p_source_type AND "sourceId"=p_source_id AND "kind"=p_kind;
  INSERT INTO "LedgerFactMetadata" ("id","shopId","ledgerEntryId","factType","referenceType","referenceId","guestCheckId","settlementId","metadata","createdAt")
  VALUES ('p4m_'||md5(p_shop_id||':'||p_fact_type||':'||p_reference_type||':'||p_reference_id),p_shop_id,v_ledger_id,p_fact_type,p_reference_type,p_reference_id,p_guest_check_id,p_settlement_id,p_metadata,CURRENT_TIMESTAMP)
  ON CONFLICT ("ledgerEntryId") DO UPDATE SET "guestCheckId"=COALESCE("LedgerFactMetadata"."guestCheckId",EXCLUDED."guestCheckId"),"settlementId"=COALESCE("LedgerFactMetadata"."settlementId",EXCLUDED."settlementId"),"metadata"=COALESCE(EXCLUDED."metadata","LedgerFactMetadata"."metadata");
END $$;

CREATE OR REPLACE FUNCTION gospots_phase4_shop_order_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_currency TEXT;
BEGIN
 IF NEW."status"='COMPLETED' AND (TG_OP='INSERT' OR OLD."status" IS DISTINCT FROM NEW."status") THEN
  SELECT COALESCE(NEW."currency",s."currency") INTO v_currency FROM "Shop" s WHERE s."id"=NEW."shopId";
  PERFORM gospots_phase4_post_fact(NEW."shopId",v_currency,NEW."total",'SALE','MENU_ORDERS','SHOP_ORDER',NEW."id",COALESCE(NEW."completedAt",CURRENT_TIMESTAMP),NEW."createdById",NEW."guestCheckId",'SALE','SHOP_ORDER',NEW."id",NULL,NULL);
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_shop_order_fact ON "ShopOrder";
CREATE TRIGGER phase4_shop_order_fact AFTER INSERT OR UPDATE OF "status" ON "ShopOrder" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_shop_order_fact();

CREATE OR REPLACE FUNCTION gospots_phase4_venue_order_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."status"='COMPLETED' AND (TG_OP='INSERT' OR OLD."status" IS DISTINCT FROM NEW."status") THEN
  PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",NEW."totalMinor"::numeric/100,'SALE','MENU_ORDERS','SHOP_ORDER','venue:'||NEW."id",COALESCE(NEW."completedAt",CURRENT_TIMESTAMP),NEW."createdById",NEW."guestCheckId",'SALE','VENUE_ORDER',NEW."id",NULL,jsonb_build_object('subtotalMinor',NEW."subtotalMinor",'taxMinor',NEW."taxMinor"));
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_venue_order_fact ON "VenueOrder";
CREATE TRIGGER phase4_venue_order_fact AFTER INSERT OR UPDATE OF "status" ON "VenueOrder" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_venue_order_fact();

CREATE OR REPLACE FUNCTION gospots_phase4_operations_session_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."status"='FINISHED' AND (TG_OP='INSERT' OR OLD."status" IS DISTINCT FROM NEW."status") THEN
  PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",NEW."accruedMinor"::numeric/100,'SALE','PLAY_SESSIONS','PLAY_SESSION','ops:'||NEW."id",COALESCE(NEW."finishedAt",CURRENT_TIMESTAMP),NEW."createdById",NEW."guestCheckId",'SALE','OPERATIONS_SESSION',NEW."id",NULL,jsonb_build_object('resourceId',NEW."resourceId",'ratePlanId',NEW."ratePlanId"));
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_operations_session_fact ON "OperationsSession";
CREATE TRIGGER phase4_operations_session_fact AFTER INSERT OR UPDATE OF "status" ON "OperationsSession" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_operations_session_fact();

CREATE OR REPLACE FUNCTION gospots_phase4_reservation_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_currency TEXT;
BEGIN
 IF NEW."billedAmount" IS NOT NULL AND (TG_OP='INSERT' OR OLD."billedAmount" IS NULL) THEN
  SELECT COALESCE(NEW."currency",s."currency") INTO v_currency FROM "Shop" s WHERE s."id"=NEW."shopId";
  PERFORM gospots_phase4_post_fact(NEW."shopId",v_currency,NEW."billedAmount",'SALE',CASE WHEN NEW."resourceId" IS NULL THEN 'RESERVATIONS'::"LedgerChannel" ELSE 'PLAY_SESSIONS'::"LedgerChannel" END,'RESERVATION',NEW."id",COALESCE(NEW."billedAt",CURRENT_TIMESTAMP),NULL,NEW."guestCheckId",'SALE','RESERVATION',NEW."id",NULL,NULL);
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_reservation_fact ON "Reservation";
CREATE TRIGGER phase4_reservation_fact AFTER INSERT OR UPDATE OF "billedAmount" ON "Reservation" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_reservation_fact();

CREATE OR REPLACE FUNCTION gospots_phase4_play_session_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_currency TEXT;
BEGIN
 IF NEW."reservationId" IS NULL AND NEW."status"='COMPLETED' AND (TG_OP='INSERT' OR OLD."status" IS DISTINCT FROM NEW."status") THEN
  SELECT COALESCE(NEW."currency",s."currency") INTO v_currency FROM "Shop" s WHERE s."id"=NEW."shopId";
  PERFORM gospots_phase4_post_fact(NEW."shopId",v_currency,NEW."amount",'SALE','PLAY_SESSIONS','PLAY_SESSION',NEW."id",COALESCE(NEW."completedAt",CURRENT_TIMESTAMP),NEW."createdById",NEW."guestCheckId",'SALE','PLAY_SESSION',NEW."id",NULL,NULL);
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_play_session_fact ON "PlaySession";
CREATE TRIGGER phase4_play_session_fact AFTER INSERT OR UPDATE OF "status" ON "PlaySession" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_play_session_fact();

CREATE OR REPLACE FUNCTION gospots_phase4_payment_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_check TEXT;
BEGIN
 IF NEW."status"='SUCCESS' AND (TG_OP='INSERT' OR OLD."status" IS DISTINCT FROM NEW."status") THEN
  SELECT cs."guestCheckId" INTO v_check FROM "CheckSettlement" cs WHERE cs."id"=NEW."settlementId";
  PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",NEW."amount",'ADJUSTMENT',NULL,'TRANSACTION','payment:'||NEW."id",COALESCE(NEW."succeededAt",CURRENT_TIMESTAMP),NEW."createdById",v_check,'PAYMENT','PAYMENT',NEW."id",NEW."settlementId",jsonb_build_object('method',NEW."method"));
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_payment_fact ON "Payment";
CREATE TRIGGER phase4_payment_fact AFTER INSERT OR UPDATE OF "status" ON "Payment" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_payment_fact();

CREATE OR REPLACE FUNCTION gospots_phase4_cash_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_signed NUMERIC; DECLARE v_check TEXT; DECLARE v_settlement TEXT;
BEGIN
 v_signed := CASE WHEN NEW."type" IN ('CASH_SALE','PAY_IN') THEN NEW."amount" ELSE -NEW."amount" END;
 IF NEW."paymentId" IS NOT NULL THEN SELECT cs."guestCheckId",cs."id" INTO v_check,v_settlement FROM "Payment" p JOIN "CheckSettlement" cs ON cs."id"=p."settlementId" WHERE p."id"=NEW."paymentId"; END IF;
 PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",v_signed,'ADJUSTMENT',NULL,'TRANSACTION','cash:'||NEW."id",NEW."occurredAt",NEW."actorId",v_check,'CASH_MOVEMENT','CASH_MOVEMENT',NEW."id",v_settlement,jsonb_build_object('movementType',NEW."type",'paymentId',NEW."paymentId"));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_cash_fact ON "CashMovement";
CREATE TRIGGER phase4_cash_fact AFTER INSERT ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_cash_fact();

-- Settlement-close facts for separate commercial adjustments, service charge and gratuity.
CREATE OR REPLACE FUNCTION gospots_phase4_settlement_close_facts() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r RECORD; DECLARE v_amount NUMERIC;
BEGIN
 IF NEW."state"='CLOSED' AND OLD."state" IS DISTINCT FROM NEW."state" THEN
  FOR r IN SELECT * FROM "CommercialAdjustment" WHERE "shopId"=NEW."shopId" AND "guestCheckId"=NEW."guestCheckId" AND "voidedAt" IS NULL LOOP
   v_amount := (r."afterTotalMinor"-r."beforeTotalMinor")::numeric/100;
   IF r."type"='DEPOSIT_APPLICATION' THEN
    PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",abs(v_amount),'ADJUSTMENT',NULL,'TRANSACTION','deposit:'||r."id",CURRENT_TIMESTAMP,r."createdById",NEW."guestCheckId",'DEPOSIT_APPLICATION','COMMERCIAL_ADJUSTMENT',r."id",NEW."id",jsonb_build_object('reason',r."reason"));
   ELSE
    PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",v_amount,'ADJUSTMENT',NULL,'TRANSACTION','adjustment:'||r."id",CURRENT_TIMESTAMP,r."createdById",NEW."guestCheckId",'CORRECTION','COMMERCIAL_ADJUSTMENT',r."id",NEW."id",jsonb_build_object('adjustmentType',r."type",'reason',r."reason"));
   END IF;
  END LOOP;
  FOR r IN SELECT * FROM "GuestCheckServiceCharge" WHERE "shopId"=NEW."shopId" AND "guestCheckId"=NEW."guestCheckId" AND "voidedAt" IS NULL LOOP
   v_amount := CASE WHEN r."mode"='FIXED' THEN COALESCE(r."amountMinor",0)::numeric/100 ELSE round(NEW."subtotal"*COALESCE(r."percentageBps",0)/10000,2) END;
   PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",v_amount,'SALE',NULL,'TRANSACTION','service:'||r."id",CURRENT_TIMESTAMP,r."createdById",NEW."guestCheckId",'SALE','SERVICE_CHARGE',r."id",NEW."id",jsonb_build_object('reason',r."reason"));
  END LOOP;
  FOR r IN SELECT * FROM "GuestCheckTip" WHERE "shopId"=NEW."shopId" AND "guestCheckId"=NEW."guestCheckId" AND "voidedAt" IS NULL LOOP
   PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",r."amountMinor"::numeric/100,'ADJUSTMENT',NULL,'TRANSACTION','tip:'||r."id",CURRENT_TIMESTAMP,r."createdById",NEW."guestCheckId",'TIP','TIP',r."id",NEW."id",jsonb_build_object('method',r."method"));
  END LOOP;

  INSERT INTO "CommercialReceipt" ("id","shopId","guestCheckId","settlementId","receiptNumber","currency","totalMinor","snapshot","issuedAt","createdById","createdAt")
  VALUES ('p4r_'||md5(NEW."id"),NEW."shopId",NEW."guestCheckId",NEW."id",'COMM-'||upper(substr(md5(NEW."id"),1,12)),NEW."currency",round(NEW."total"*100)::integer,
    jsonb_build_object(
      'documentType','NON_FISCAL_COMMERCIAL_RECEIPT','settlement',jsonb_build_object('id',NEW."id",'guestCheckId',NEW."guestCheckId",'subtotal',NEW."subtotal",'adjustments',NEW."adjustments",'taxAmount',NEW."taxAmount",'depositAmount',NEW."depositAmount",'total',NEW."total",'currency',NEW."currency",'closedAt',CURRENT_TIMESTAMP),
      'lines',COALESCE((SELECT jsonb_agg(to_jsonb(cs) ORDER BY cs."position") FROM "ChargeSnapshot" cs WHERE cs."settlementId"=NEW."id"),'[]'::jsonb),
      'payments',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p."createdAt") FROM "Payment" p WHERE p."settlementId"=NEW."id" AND p."status"='SUCCESS'),'[]'::jsonb)
    ),CURRENT_TIMESTAMP,NEW."createdById",CURRENT_TIMESTAMP)
  ON CONFLICT ("settlementId") DO NOTHING;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_settlement_close_facts ON "CheckSettlement";
CREATE TRIGGER phase4_settlement_close_facts AFTER UPDATE OF "state" ON "CheckSettlement" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_settlement_close_facts();

-- Existing transaction/loss facts remain canonical and are classified without altering their enum values.
INSERT INTO "LedgerFactMetadata" ("id","shopId","ledgerEntryId","factType","referenceType","referenceId","guestCheckId","createdAt")
SELECT 'p4m_'||md5(le."shopId"||':SALE:'||le."sourceType"::text||':'||le."sourceId"),le."shopId",le."id",CASE le."kind" WHEN 'REFUND' THEN 'REFUND' ELSE 'SALE' END,le."sourceType"::text,le."sourceId",le."guestCheckId",CURRENT_TIMESTAMP
FROM "LedgerEntry" le WHERE le."kind" IN ('SALE','REFUND')
ON CONFLICT ("ledgerEntryId") DO NOTHING;

-- Backfill missing canonical sales from all existing revenue sources. Existing unique keys prevent duplicates.
SELECT gospots_phase4_post_fact(o."shopId",COALESCE(o."currency",s."currency"),o."total",'SALE','MENU_ORDERS','SHOP_ORDER',o."id",COALESCE(o."completedAt",o."updatedAt"),o."createdById",o."guestCheckId",'SALE','SHOP_ORDER',o."id",NULL,NULL)
FROM "ShopOrder" o JOIN "Shop" s ON s."id"=o."shopId" WHERE o."status"='COMPLETED';
SELECT gospots_phase4_post_fact(o."shopId",o."currency",o."totalMinor"::numeric/100,'SALE','MENU_ORDERS','SHOP_ORDER','venue:'||o."id",COALESCE(o."completedAt",o."updatedAt"),o."createdById",o."guestCheckId",'SALE','VENUE_ORDER',o."id",NULL,jsonb_build_object('subtotalMinor',o."subtotalMinor",'taxMinor',o."taxMinor")) FROM "VenueOrder" o WHERE o."status"='COMPLETED';
SELECT gospots_phase4_post_fact(os."shopId",os."currency",os."accruedMinor"::numeric/100,'SALE','PLAY_SESSIONS','PLAY_SESSION','ops:'||os."id",COALESCE(os."finishedAt",os."updatedAt"),os."createdById",os."guestCheckId",'SALE','OPERATIONS_SESSION',os."id",NULL,jsonb_build_object('resourceId',os."resourceId")) FROM "OperationsSession" os WHERE os."status"='FINISHED';
SELECT gospots_phase4_post_fact(r."shopId",COALESCE(r."currency",s."currency"),r."billedAmount",'SALE',CASE WHEN r."resourceId" IS NULL THEN 'RESERVATIONS'::"LedgerChannel" ELSE 'PLAY_SESSIONS'::"LedgerChannel" END,'RESERVATION',r."id",COALESCE(r."billedAt",r."updatedAt"),NULL,r."guestCheckId",'SALE','RESERVATION',r."id",NULL,NULL) FROM "Reservation" r JOIN "Shop" s ON s."id"=r."shopId" WHERE r."billedAmount" IS NOT NULL;
SELECT gospots_phase4_post_fact(p."shopId",COALESCE(p."currency",s."currency"),p."amount",'SALE','PLAY_SESSIONS','PLAY_SESSION',p."id",COALESCE(p."completedAt",p."updatedAt"),p."createdById",p."guestCheckId",'SALE','PLAY_SESSION',p."id",NULL,NULL) FROM "PlaySession" p JOIN "Shop" s ON s."id"=p."shopId" WHERE p."status"='COMPLETED' AND p."reservationId" IS NULL;
SELECT gospots_phase4_post_fact(p."shopId",p."currency",p."amount",'ADJUSTMENT',NULL,'TRANSACTION','payment:'||p."id",COALESCE(p."succeededAt",p."createdAt"),p."createdById",cs."guestCheckId",'PAYMENT','PAYMENT',p."id",p."settlementId",jsonb_build_object('method',p."method")) FROM "Payment" p JOIN "CheckSettlement" cs ON cs."id"=p."settlementId" WHERE p."status"='SUCCESS';
SELECT gospots_phase4_post_fact(c."shopId",c."currency",CASE WHEN c."type" IN ('CASH_SALE','PAY_IN') THEN c."amount" ELSE -c."amount" END,'ADJUSTMENT',NULL,'TRANSACTION','cash:'||c."id",c."occurredAt",c."actorId",cs."guestCheckId",'CASH_MOVEMENT','CASH_MOVEMENT',c."id",cs."id",jsonb_build_object('movementType',c."type")) FROM "CashMovement" c LEFT JOIN "Payment" p ON p."id"=c."paymentId" LEFT JOIN "CheckSettlement" cs ON cs."id"=p."settlementId";

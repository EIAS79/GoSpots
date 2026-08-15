-- Phase 4 — remove environment-flag dependence from canonical LedgerEntry durability.
-- Existing source ledgers remain historical source records; monetary reporting authority is LedgerEntry.

CREATE OR REPLACE FUNCTION gospots_phase4_transaction_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_currency TEXT; DECLARE v_kind "LedgerKind"; DECLARE v_channel "LedgerChannel";
BEGIN
  SELECT COALESCE(NEW."currency", s."currency") INTO v_currency FROM "Shop" s WHERE s."id"=NEW."shopId";
  v_kind := CASE NEW."kind"
    WHEN 'SALE' THEN 'SALE'::"LedgerKind"
    WHEN 'REFUND' THEN 'REFUND'::"LedgerKind"
    WHEN 'EXPENSE' THEN 'EXPENSE'::"LedgerKind"
    ELSE 'ADJUSTMENT'::"LedgerKind" END;
  v_channel := CASE WHEN NEW."kind" IN ('SALE','REFUND') THEN 'QUICK_SALES'::"LedgerChannel" ELSE NULL END;
  PERFORM gospots_phase4_post_fact(NEW."shopId",v_currency,NEW."amount",v_kind,v_channel,'TRANSACTION',NEW."id",NEW."createdAt",NEW."createdById",NULL,NEW."kind"::text,'TRANSACTION',NEW."id",NULL,jsonb_build_object('method',NEW."method"));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_transaction_fact ON "Transaction";
CREATE TRIGGER phase4_transaction_fact AFTER INSERT ON "Transaction" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_transaction_fact();

CREATE OR REPLACE FUNCTION gospots_phase4_loss_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_currency TEXT;
BEGIN
  SELECT COALESCE(NEW."currency", s."currency") INTO v_currency FROM "Shop" s WHERE s."id"=NEW."shopId";
  PERFORM gospots_phase4_post_fact(NEW."shopId",v_currency,NEW."amount",'LOSS',NULL,'SHOP_LOSS',NEW."id",NEW."occurredAt",NEW."createdById",NULL,'LOSS','SHOP_LOSS',NEW."id",NULL,jsonb_build_object('reason',NEW."reason",'category',NEW."category"));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_loss_fact ON "ShopLoss";
CREATE TRIGGER phase4_loss_fact AFTER INSERT ON "ShopLoss" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_loss_fact();

CREATE OR REPLACE FUNCTION gospots_phase4_stored_value_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",NEW."amountMinor"::numeric/100,'ADJUSTMENT',NULL,'TRANSACTION','stored:'||NEW."id",NEW."createdAt",NEW."actorUserId",NULL,'STORED_VALUE','STORED_VALUE_LEDGER',NEW."id",NULL,jsonb_build_object('accountId',NEW."accountId",'entryType',NEW."type",'sourceType',NEW."sourceType",'sourceId',NEW."sourceId",'paymentId',NEW."paymentId",'correlationId',NEW."correlationId"));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_stored_value_fact ON "StoredValueLedgerEntry";
CREATE TRIGGER phase4_stored_value_fact AFTER INSERT ON "StoredValueLedgerEntry" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_stored_value_fact();

CREATE OR REPLACE FUNCTION gospots_phase4_reservation_deposit_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",NEW."amountMinor"::numeric/100,'ADJUSTMENT',NULL,'TRANSACTION','reservation-deposit:'||NEW."id",NEW."createdAt",NEW."actorUserId",NULL,'RESERVATION_DEPOSIT','RESERVATION_DEPOSIT_LEDGER',NEW."id",NULL,jsonb_build_object('reservationId',NEW."reservationId",'entryType',NEW."type",'paymentId',NEW."paymentId",'refundId',NEW."refundId",'correlationId',NEW."correlationId"));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_reservation_deposit_fact ON "ReservationDepositLedgerEntry";
CREATE TRIGGER phase4_reservation_deposit_fact AFTER INSERT ON "ReservationDepositLedgerEntry" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_reservation_deposit_fact();

CREATE OR REPLACE FUNCTION gospots_phase4_legacy_tip_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",NEW."amountMinor"::numeric/100,'ADJUSTMENT',NULL,'TRANSACTION','legacy-tip:'||NEW."id",NEW."createdAt",NEW."actorUserId",NEW."guestCheckId",'TIP','TIP_LEDGER',NEW."id",NULL,jsonb_build_object('entryType',NEW."type",'paymentId',NEW."paymentId",'correlationId',NEW."correlationId"));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS phase4_legacy_tip_fact ON "TipLedgerEntry";
CREATE TRIGGER phase4_legacy_tip_fact AFTER INSERT ON "TipLedgerEntry" FOR EACH ROW EXECUTE FUNCTION gospots_phase4_legacy_tip_fact();

-- Backfill pre-Phase-4 source facts. gospots_phase4_post_fact is idempotent on LedgerEntry and metadata keys.
SELECT gospots_phase4_post_fact(t."shopId",COALESCE(t."currency",s."currency"),t."amount",CASE t."kind" WHEN 'SALE' THEN 'SALE'::"LedgerKind" WHEN 'REFUND' THEN 'REFUND'::"LedgerKind" WHEN 'EXPENSE' THEN 'EXPENSE'::"LedgerKind" ELSE 'ADJUSTMENT'::"LedgerKind" END,CASE WHEN t."kind" IN ('SALE','REFUND') THEN 'QUICK_SALES'::"LedgerChannel" ELSE NULL END,'TRANSACTION',t."id",t."createdAt",t."createdById",NULL,t."kind"::text,'TRANSACTION',t."id",NULL,jsonb_build_object('method',t."method")) FROM "Transaction" t JOIN "Shop" s ON s."id"=t."shopId";
SELECT gospots_phase4_post_fact(l."shopId",COALESCE(l."currency",s."currency"),l."amount",'LOSS',NULL,'SHOP_LOSS',l."id",l."occurredAt",l."createdById",NULL,'LOSS','SHOP_LOSS',l."id",NULL,jsonb_build_object('reason',l."reason",'category',l."category")) FROM "ShopLoss" l JOIN "Shop" s ON s."id"=l."shopId";
SELECT gospots_phase4_post_fact(v."shopId",v."currency",v."amountMinor"::numeric/100,'ADJUSTMENT',NULL,'TRANSACTION','stored:'||v."id",v."createdAt",v."actorUserId",NULL,'STORED_VALUE','STORED_VALUE_LEDGER',v."id",NULL,jsonb_build_object('accountId',v."accountId",'entryType',v."type",'sourceType',v."sourceType",'sourceId',v."sourceId",'paymentId',v."paymentId",'correlationId',v."correlationId")) FROM "StoredValueLedgerEntry" v;
SELECT gospots_phase4_post_fact(d."shopId",d."currency",d."amountMinor"::numeric/100,'ADJUSTMENT',NULL,'TRANSACTION','reservation-deposit:'||d."id",d."createdAt",d."actorUserId",NULL,'RESERVATION_DEPOSIT','RESERVATION_DEPOSIT_LEDGER',d."id",NULL,jsonb_build_object('reservationId',d."reservationId",'entryType',d."type",'paymentId',d."paymentId",'refundId',d."refundId",'correlationId',d."correlationId")) FROM "ReservationDepositLedgerEntry" d;
SELECT gospots_phase4_post_fact(t."shopId",t."currency",t."amountMinor"::numeric/100,'ADJUSTMENT',NULL,'TRANSACTION','legacy-tip:'||t."id",t."createdAt",t."actorUserId",t."guestCheckId",'TIP','TIP_LEDGER',t."id",NULL,jsonb_build_object('entryType',t."type",'paymentId',t."paymentId",'correlationId',t."correlationId")) FROM "TipLedgerEntry" t;

-- Reclassify existing canonical rows where the legacy environment-gated writer already created them.
INSERT INTO "LedgerFactMetadata" ("id","shopId","ledgerEntryId","factType","referenceType","referenceId","guestCheckId","createdAt")
SELECT 'p4m_'||md5(le."shopId"||':'||le."kind"::text||':'||le."sourceType"::text||':'||le."sourceId"),le."shopId",le."id",le."kind"::text,le."sourceType"::text,le."sourceId",le."guestCheckId",CURRENT_TIMESTAMP
FROM "LedgerEntry" le
ON CONFLICT ("ledgerEntryId") DO NOTHING;

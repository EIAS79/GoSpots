-- Phase 4 reconciliation hardening: settlement-close ledger postings read the immutable
-- ChargeSnapshot amounts that were actually paid, never recompute commercial values.
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
   SELECT COALESCE(SUM(cs."finalAmount"),0) INTO v_amount FROM "ChargeSnapshot" cs WHERE cs."settlementId"=NEW."id" AND cs."sourceType"='SERVICE_CHARGE' AND cs."sourceId"=r."id";
   IF v_amount <> 0 THEN
    PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",v_amount,'SALE',NULL,'TRANSACTION','service:'||r."id",CURRENT_TIMESTAMP,r."createdById",NEW."guestCheckId",'SALE','SERVICE_CHARGE',r."id",NEW."id",jsonb_build_object('reason',r."reason"));
   END IF;
  END LOOP;

  FOR r IN SELECT * FROM "GuestCheckTip" WHERE "shopId"=NEW."shopId" AND "guestCheckId"=NEW."guestCheckId" AND "voidedAt" IS NULL LOOP
   SELECT COALESCE(SUM(cs."finalAmount"),0) INTO v_amount FROM "ChargeSnapshot" cs WHERE cs."settlementId"=NEW."id" AND cs."sourceType"='TIP' AND cs."sourceId"=r."id";
   IF v_amount <> 0 THEN
    PERFORM gospots_phase4_post_fact(NEW."shopId",NEW."currency",v_amount,'ADJUSTMENT',NULL,'TRANSACTION','tip:'||r."id",CURRENT_TIMESTAMP,r."createdById",NEW."guestCheckId",'TIP','TIP',r."id",NEW."id",jsonb_build_object('method',r."method"));
   END IF;
  END LOOP;

  INSERT INTO "CommercialReceipt" ("id","shopId","guestCheckId","settlementId","receiptNumber","currency","totalMinor","snapshot","issuedAt","createdById","createdAt")
  VALUES ('p4r_'||md5(NEW."id"),NEW."shopId",NEW."guestCheckId",NEW."id",'COMM-'||upper(substr(md5(NEW."id"),1,12)),NEW."currency",round(NEW."total"*100)::integer,
    jsonb_build_object(
      'documentType','NON_FISCAL_COMMERCIAL_RECEIPT',
      'settlement',jsonb_build_object('id',NEW."id",'guestCheckId',NEW."guestCheckId",'subtotal',NEW."subtotal",'adjustments',NEW."adjustments",'taxAmount',NEW."taxAmount",'depositAmount',NEW."depositAmount",'total',NEW."total",'currency',NEW."currency",'closedAt',CURRENT_TIMESTAMP),
      'lines',COALESCE((SELECT jsonb_agg(to_jsonb(cs) ORDER BY cs."position") FROM "ChargeSnapshot" cs WHERE cs."settlementId"=NEW."id"),'[]'::jsonb),
      'payments',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p."createdAt") FROM "Payment" p WHERE p."settlementId"=NEW."id" AND p."status"='SUCCESS'),'[]'::jsonb)
    ),CURRENT_TIMESTAMP,COALESCE(NEW."createdById",'system'),CURRENT_TIMESTAMP)
  ON CONFLICT ("settlementId") DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

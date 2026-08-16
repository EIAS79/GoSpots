-- Phase 4 acceptance hardening: preserve GuestCheck lineage when a completed
-- legacy ShopOrder is attached after its SALE fact already exists.
--
-- gospots_phase4_post_fact is idempotent on the canonical LedgerEntry source
-- key and updates only missing guestCheckId lineage on conflict, so re-posting
-- the same completed order cannot create a duplicate monetary fact.

CREATE OR REPLACE FUNCTION gospots_phase4_shop_order_fact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_currency TEXT;
BEGIN
  IF NEW."status"='COMPLETED' AND (
    TG_OP='INSERT'
    OR OLD."status" IS DISTINCT FROM NEW."status"
    OR OLD."guestCheckId" IS DISTINCT FROM NEW."guestCheckId"
  ) THEN
    SELECT COALESCE(NEW."currency",s."currency") INTO v_currency
    FROM "Shop" s WHERE s."id"=NEW."shopId";

    PERFORM gospots_phase4_post_fact(
      NEW."shopId",
      v_currency,
      NEW."total",
      'SALE',
      'MENU_ORDERS',
      'SHOP_ORDER',
      NEW."id",
      COALESCE(NEW."completedAt",CURRENT_TIMESTAMP),
      NEW."createdById",
      NEW."guestCheckId",
      'SALE',
      'SHOP_ORDER',
      NEW."id",
      NULL,
      NULL
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS phase4_shop_order_fact ON "ShopOrder";
CREATE TRIGGER phase4_shop_order_fact
AFTER INSERT OR UPDATE OF "status", "guestCheckId" ON "ShopOrder"
FOR EACH ROW EXECUTE FUNCTION gospots_phase4_shop_order_fact();

-- Repair lineage for completed orders that were attached after their original
-- SALE posting. This invokes the same idempotent authority and therefore does
-- not create duplicate monetary facts.
DO $$
DECLARE r RECORD; DECLARE v_currency TEXT;
BEGIN
  FOR r IN
    SELECT o.* FROM "ShopOrder" o
    WHERE o."status"='COMPLETED' AND o."guestCheckId" IS NOT NULL
  LOOP
    SELECT COALESCE(r."currency",s."currency") INTO v_currency
    FROM "Shop" s WHERE s."id"=r."shopId";

    PERFORM gospots_phase4_post_fact(
      r."shopId",
      v_currency,
      r."total",
      'SALE',
      'MENU_ORDERS',
      'SHOP_ORDER',
      r."id",
      COALESCE(r."completedAt",CURRENT_TIMESTAMP),
      r."createdById",
      r."guestCheckId",
      'SALE',
      'SHOP_ORDER',
      r."id",
      NULL,
      NULL
    );
  END LOOP;
END $$;

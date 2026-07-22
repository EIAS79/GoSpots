-- M6 currency stamps (bible #20): per-row ISO 4217 on monetary facts.
-- Expand-only nullable columns + backfill from Shop.currency.
-- Historical amounts are never rewritten on shop currency change.
-- Operator: `migrate deploy` (not from workstation Neon .env). Never reset.

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "PlaySession" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "ShopLoss" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "currency" TEXT;

CREATE INDEX IF NOT EXISTS "Transaction_shopId_currency_createdAt_idx"
  ON "Transaction" ("shopId", "currency", "createdAt");
CREATE INDEX IF NOT EXISTS "ShopOrder_shopId_currency_createdAt_idx"
  ON "ShopOrder" ("shopId", "currency", "createdAt");
CREATE INDEX IF NOT EXISTS "PlaySession_shopId_currency_createdAt_idx"
  ON "PlaySession" ("shopId", "currency", "createdAt");
CREATE INDEX IF NOT EXISTS "ShopLoss_shopId_currency_occurredAt_idx"
  ON "ShopLoss" ("shopId", "currency", "occurredAt");
CREATE INDEX IF NOT EXISTS "Reservation_shopId_currency_billedAt_idx"
  ON "Reservation" ("shopId", "currency", "billedAt");

-- Backfill: current Shop.currency (honest limit — pre-stamp eras that already
-- flipped currency may be mis-labeled; accept for v1).
UPDATE "Transaction" t
SET "currency" = s."currency"
FROM "Shop" s
WHERE t."shopId" = s."id"
  AND t."currency" IS NULL
  AND s."currency" IS NOT NULL;

UPDATE "ShopOrder" o
SET "currency" = s."currency"
FROM "Shop" s
WHERE o."shopId" = s."id"
  AND o."currency" IS NULL
  AND s."currency" IS NOT NULL;

UPDATE "PlaySession" p
SET "currency" = s."currency"
FROM "Shop" s
WHERE p."shopId" = s."id"
  AND p."currency" IS NULL
  AND s."currency" IS NOT NULL;

UPDATE "ShopLoss" l
SET "currency" = s."currency"
FROM "Shop" s
WHERE l."shopId" = s."id"
  AND l."currency" IS NULL
  AND s."currency" IS NOT NULL;

UPDATE "Reservation" r
SET "currency" = s."currency"
FROM "Shop" s
WHERE r."shopId" = s."id"
  AND r."currency" IS NULL
  AND s."currency" IS NOT NULL
  AND (r."billedAmount" IS NOT NULL OR r."billingBaseAmount" IS NOT NULL);

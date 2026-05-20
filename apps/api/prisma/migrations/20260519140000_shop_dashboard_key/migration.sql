-- AlterTable: add secret dashboard key for private venue URLs
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "dashboardKey" TEXT;

UPDATE "Shop"
SET "dashboardKey" = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
WHERE "dashboardKey" IS NULL;

ALTER TABLE "Shop" ALTER COLUMN "dashboardKey" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Shop_dashboardKey_key" ON "Shop"("dashboardKey");

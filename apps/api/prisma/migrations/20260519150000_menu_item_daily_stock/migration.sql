ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "stockDaily" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "stockResetOn" TEXT;
UPDATE "MenuItem" SET "stockDaily" = "stock" WHERE "stock" > 0 AND "stockDaily" = 0;

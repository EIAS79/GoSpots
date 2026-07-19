-- Dining section metadata: zone, description, photo, default table size
ALTER TABLE "GamingSection" ADD COLUMN IF NOT EXISTS "zone" TEXT;
ALTER TABLE "GamingSection" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "GamingSection" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "GamingSection" ADD COLUMN IF NOT EXISTS "defaultTableCapacity" INTEGER;

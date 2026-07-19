-- Digital restaurant table layout (per-table resources with capacity)
ALTER TYPE "ResourceType" ADD VALUE IF NOT EXISTS 'DINING';

ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;

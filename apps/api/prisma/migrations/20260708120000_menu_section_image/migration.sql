-- Optional cover image per menu section (category)
ALTER TABLE "MenuSection" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

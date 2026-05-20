-- Seating zone: indoor vs outdoor sections

DO $$ BEGIN
  CREATE TYPE "SeatingZone" AS ENUM ('INDOOR', 'OUTDOOR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "SeatingTableGroup" ADD COLUMN IF NOT EXISTS "zone" "SeatingZone" NOT NULL DEFAULT 'INDOOR';

CREATE INDEX IF NOT EXISTS "SeatingTableGroup_shopId_zone_sortOrder_idx"
  ON "SeatingTableGroup"("shopId", "zone", "sortOrder");

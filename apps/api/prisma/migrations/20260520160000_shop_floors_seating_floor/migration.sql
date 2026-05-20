-- Venue floor count + per-group floor for dining seating

ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "floorCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "SeatingTableGroup" ADD COLUMN IF NOT EXISTS "floor" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "SeatingTableGroup_shopId_zone_floor_sortOrder_idx"
  ON "SeatingTableGroup"("shopId", "zone", "floor", "sortOrder");

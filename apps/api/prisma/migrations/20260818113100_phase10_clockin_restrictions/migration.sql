-- Phase 10 — optional device/location restrictions for workforce clock-in.
-- Expand-only: all restrictions default OFF so existing venue behavior is preserved.

ALTER TABLE "WorkforcePolicy"
  ADD COLUMN "clockInDeviceRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "clockInAllowedDeviceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "clockInLocationRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "clockInLatitude" DOUBLE PRECISION,
  ADD COLUMN "clockInLongitude" DOUBLE PRECISION,
  ADD COLUMN "clockInRadiusMeters" INTEGER NOT NULL DEFAULT 100;

ALTER TABLE "WorkforcePolicy"
  ADD CONSTRAINT "WorkforcePolicy_clockin_location_check" CHECK (
    ("clockInLatitude" IS NULL OR "clockInLatitude" BETWEEN -90 AND 90) AND
    ("clockInLongitude" IS NULL OR "clockInLongitude" BETWEEN -180 AND 180) AND
    "clockInRadiusMeters" BETWEEN 10 AND 100000 AND
    (
      "clockInLocationRequired" = false OR
      ("clockInLatitude" IS NOT NULL AND "clockInLongitude" IS NOT NULL)
    )
  );
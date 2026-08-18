-- Phase 10 — advanced shift scheduling completion.
-- Adds explicit publish/absence state and a database-level overlap invariant.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "ScheduleEntry"
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "absenceStatus" TEXT,
  ADD COLUMN "absenceReason" TEXT;

ALTER TABLE "ScheduleEntry"
  ADD CONSTRAINT "ScheduleEntry_absence_status_check" CHECK (
    "absenceStatus" IS NULL OR "absenceStatus" IN ('ABSENT', 'EXCUSED', 'NO_SHOW')
  );

ALTER TABLE "ScheduleEntry"
  ADD CONSTRAINT "ScheduleEntry_no_member_overlap"
  EXCLUDE USING gist (
    "shopId" WITH =,
    "membershipId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("status" <> 'CANCELED');

CREATE INDEX "ScheduleEntry_shopId_publishedAt_startsAt_idx"
  ON "ScheduleEntry"("shopId", "publishedAt", "startsAt");
CREATE INDEX "ScheduleEntry_shopId_absenceStatus_startsAt_idx"
  ON "ScheduleEntry"("shopId", "absenceStatus", "startsAt");
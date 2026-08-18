-- Phase 10 — advanced shift scheduling completion.
-- Expand-only: publish/absence state defaults to NULL and historical schedules are preserved.
-- Future overlapping writes are serialized and rejected by a trigger so legacy overlap
-- does not make deployment fail while new concurrent conflicts remain impossible.

ALTER TABLE "ScheduleEntry"
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "absenceStatus" TEXT,
  ADD COLUMN "absenceReason" TEXT;

ALTER TABLE "ScheduleEntry"
  ADD CONSTRAINT "ScheduleEntry_absence_status_check" CHECK (
    "absenceStatus" IS NULL OR "absenceStatus" IN ('ABSENT', 'EXCUSED', 'NO_SHOW')
  );

CREATE OR REPLACE FUNCTION phase10_schedule_prevent_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" <> 'CANCELED' THEN
    -- Serialize schedule mutations for one employee inside one venue. This closes
    -- the read/check/write race without requiring validation of historical rows.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW."shopId" || ':' || NEW."membershipId", 0)
    );

    IF EXISTS (
      SELECT 1
      FROM "ScheduleEntry" existing
      WHERE existing."shopId" = NEW."shopId"
        AND existing."membershipId" = NEW."membershipId"
        AND existing."id" IS DISTINCT FROM NEW."id"
        AND existing."status" <> 'CANCELED'
        AND existing."startsAt" < NEW."endsAt"
        AND existing."endsAt" > NEW."startsAt"
    ) THEN
      RAISE EXCEPTION 'Employee already has an overlapping planned shift.'
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ScheduleEntry_prevent_overlap"
BEFORE INSERT OR UPDATE OF "shopId", "membershipId", "startsAt", "endsAt", "status"
ON "ScheduleEntry"
FOR EACH ROW
EXECUTE FUNCTION phase10_schedule_prevent_overlap();

CREATE INDEX "ScheduleEntry_shopId_publishedAt_startsAt_idx"
  ON "ScheduleEntry"("shopId", "publishedAt", "startsAt");
CREATE INDEX "ScheduleEntry_shopId_absenceStatus_startsAt_idx"
  ON "ScheduleEntry"("shopId", "absenceStatus", "startsAt");
-- Bible #14 / GO_SPOTS_RESOURCE_MODEL_MERGE.md Phase 2 — Option C expand.
-- Link advisory SeatingTableGroup → bookable DiningTableGroup (nullable FK).
-- On disk only; Neon migrate deploy = operator. Never reset.

ALTER TABLE "SeatingTableGroup"
  ADD COLUMN IF NOT EXISTS "sourceDiningTableGroupId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SeatingTableGroup_sourceDiningTableGroupId_key"
  ON "SeatingTableGroup"("sourceDiningTableGroupId");

CREATE INDEX IF NOT EXISTS "SeatingTableGroup_shopId_sourceDiningTableGroupId_idx"
  ON "SeatingTableGroup"("shopId", "sourceDiningTableGroupId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SeatingTableGroup_sourceDiningTableGroupId_fkey'
      AND table_name = 'SeatingTableGroup'
  ) THEN
    ALTER TABLE "SeatingTableGroup"
      ADD CONSTRAINT "SeatingTableGroup_sourceDiningTableGroupId_fkey"
      FOREIGN KEY ("sourceDiningTableGroupId") REFERENCES "DiningTableGroup"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

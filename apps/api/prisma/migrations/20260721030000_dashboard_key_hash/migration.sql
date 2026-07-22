-- Bible #19 Phase 3: Shop.dashboardKey hash-at-rest (expand + backfill).
-- Bind is membership + slug only; key no longer used for venue lookup.
-- Dual-write keeps plaintext until optional DROP after soak.
-- Never reset. Operator must `migrate deploy` (not from workstation Neon .env).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "dashboardKeyHash" TEXT;

-- Backfill hashes from existing plaintext (SHA-256 hex matches Node crypto createHash('sha256').digest('hex'))
UPDATE "Shop"
SET "dashboardKeyHash" = encode(digest("dashboardKey", 'sha256'), 'hex')
WHERE "dashboardKey" IS NOT NULL
  AND "dashboardKeyHash" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Shop_dashboardKeyHash_key" ON "Shop"("dashboardKeyHash");

-- Align AuditLog with the current Prisma schema.
-- These columns are required by runtime audit writes/reads but were absent
-- from fresh databases created from the historical migration chain.
ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "section" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS "summary" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "actorRole" TEXT,
  ADD COLUMN IF NOT EXISTS "actorName" TEXT,
  ADD COLUMN IF NOT EXISTS "actorEmail" TEXT;

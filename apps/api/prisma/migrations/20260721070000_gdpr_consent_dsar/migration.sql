-- Bible #25 — ConsentRecord + GuestDsarRequest (expand-only).
-- RLS policies mirror Tier A posture via existing app_tenant_rls_ok (do not edit 20260721050000).

CREATE TYPE "ConsentPurpose" AS ENUM ('BOOKING', 'EVENT_REQUEST', 'CONTACT', 'REVIEW', 'GUEST_CHAT');

CREATE TYPE "GuestDsarType" AS ENUM ('ACCESS', 'ERASURE');

CREATE TYPE "GuestDsarStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "subjectEmailHash" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestDsarRequest" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "GuestDsarType" NOT NULL,
    "status" "GuestDsarStatus" NOT NULL DEFAULT 'OPEN',
    "guestEmail" TEXT NOT NULL,
    "guestName" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "GuestDsarRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsentRecord_shopId_createdAt_idx" ON "ConsentRecord"("shopId", "createdAt");
CREATE INDEX "ConsentRecord_shopId_subjectEmailHash_idx" ON "ConsentRecord"("shopId", "subjectEmailHash");
CREATE INDEX "ConsentRecord_shopId_purpose_createdAt_idx" ON "ConsentRecord"("shopId", "purpose", "createdAt");

CREATE INDEX "GuestDsarRequest_shopId_status_createdAt_idx" ON "GuestDsarRequest"("shopId", "status", "createdAt");
CREATE INDEX "GuestDsarRequest_shopId_guestEmail_idx" ON "GuestDsarRequest"("shopId", "guestEmail");

ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestDsarRequest" ADD CONSTRAINT "GuestDsarRequest_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Opt-in RLS (same fail-open helper as core Tier A). Safe when TENANT_RLS=off.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['ConsentRecord', 'GuestDsarRequest'];
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_tenant_rls_ok'
  ) THEN
    FOREACH t IN ARRAY tables
    LOOP
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
      EXECUTE format(
        'CREATE POLICY %I ON %I
           FOR ALL
           USING (app_tenant_rls_ok("shopId"))
           WITH CHECK (app_tenant_rls_ok("shopId"))',
        t || '_tenant_isolation',
        t
      );
    END LOOP;
  END IF;
END $$;

-- Phase 3 v2 — Live Operations: Sessions, Timers, Moves, Waitlist and Floor Control
-- Expand/backfill/contract: all existing operations rows remain valid.

CREATE TYPE "OperationsPauseBillingMode" AS ENUM ('STOP_CHARGING', 'CONTINUE_CHARGING');
CREATE TYPE "OperationsMoveRatePolicy" AS ENUM ('KEEP_SESSION_RATE', 'REPRICE_TARGET');

CREATE TABLE "OperationsVenuePolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "pauseBillingMode" "OperationsPauseBillingMode" NOT NULL DEFAULT 'STOP_CHARGING',
  "managerOnlyPause" BOOLEAN NOT NULL DEFAULT false,
  "maxPauseMinutes" INTEGER,
  "moveRatePolicy" "OperationsMoveRatePolicy" NOT NULL DEFAULT 'KEEP_SESSION_RATE',
  "fixedSessionAutoExtend" BOOLEAN NOT NULL DEFAULT false,
  "fixedSessionWarningMinutes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "defaultExtensionMinutes" INTEGER NOT NULL DEFAULT 15,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationsVenuePolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationsVenuePolicy_maxPauseMinutes_check" CHECK ("maxPauseMinutes" IS NULL OR "maxPauseMinutes" > 0),
  CONSTRAINT "OperationsVenuePolicy_defaultExtensionMinutes_check" CHECK ("defaultExtensionMinutes" > 0)
);
CREATE UNIQUE INDEX "OperationsVenuePolicy_shopId_key" ON "OperationsVenuePolicy"("shopId");
CREATE INDEX "OperationsVenuePolicy_shopId_version_idx" ON "OperationsVenuePolicy"("shopId", "version");

ALTER TABLE "OperationsSession"
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "membershipId" TEXT,
  ADD COLUMN "packageId" TEXT,
  ADD COLUMN "packageSnapshot" JSONB,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "currentRatePlanId" TEXT,
  ADD COLUMN "currentRateSnapshot" JSONB,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "billingSegmentStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "billingSegmentPausedSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "accruedBeforeCurrentSegmentMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pauseBillingMode" "OperationsPauseBillingMode" NOT NULL DEFAULT 'STOP_CHARGING',
  ADD COLUMN "managerOnlyPause" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maxPauseMinutes" INTEGER,
  ADD COLUMN "moveRatePolicy" "OperationsMoveRatePolicy" NOT NULL DEFAULT 'KEEP_SESSION_RATE',
  ADD COLUMN "scheduledEndAt" TIMESTAMP(3),
  ADD COLUMN "autoExtend" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "warningMinutes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "extensionMinutes" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "extensionCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "OperationsSession"
SET
  "billingSegmentStartedAt" = "startedAt",
  "currentRatePlanId" = "ratePlanId",
  "currentRateSnapshot" = "rateSnapshot"
WHERE TRUE;

ALTER TABLE "OperationsSession"
  ADD CONSTRAINT "OperationsSession_pause_bounds_check" CHECK (
    "totalPausedSeconds" >= 0 AND
    "billingSegmentPausedSeconds" >= 0 AND
    "accruedBeforeCurrentSegmentMinor" >= 0 AND
    ("maxPauseMinutes" IS NULL OR "maxPauseMinutes" > 0) AND
    "extensionMinutes" > 0 AND
    "extensionCount" >= 0
  );

CREATE INDEX "OperationsSession_shopId_customerId_idx" ON "OperationsSession"("shopId", "customerId");
CREATE INDEX "OperationsSession_shopId_membershipId_idx" ON "OperationsSession"("shopId", "membershipId");

UPDATE "OperationsSessionPause"
SET "reason" = 'LEGACY_PAUSE'
WHERE "reason" IS NULL OR btrim("reason") = '';

ALTER TABLE "OperationsSessionPause"
  ALTER COLUMN "reason" SET NOT NULL,
  ADD COLUMN "chargingContinues" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "policyMaxMinutes" INTEGER;

ALTER TABLE "OperationsSessionPause"
  ADD CONSTRAINT "OperationsSessionPause_policyMaxMinutes_check" CHECK (
    "policyMaxMinutes" IS NULL OR "policyMaxMinutes" > 0
  );

CREATE TABLE "OperationsSessionRateSegment" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "ratePlanId" TEXT,
  "rateSnapshot" JSONB NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "accruedMinor" INTEGER,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationsSessionRateSegment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationsSessionRateSegment_accruedMinor_check" CHECK ("accruedMinor" IS NULL OR "accruedMinor" >= 0)
);
CREATE INDEX "OperationsSessionRateSegment_shopId_sessionId_startedAt_idx" ON "OperationsSessionRateSegment"("shopId", "sessionId", "startedAt");
CREATE INDEX "OperationsSessionRateSegment_shopId_resourceId_startedAt_idx" ON "OperationsSessionRateSegment"("shopId", "resourceId", "startedAt");

-- Backfill one immutable pricing segment for every historical session.
INSERT INTO "OperationsSessionRateSegment" (
  "id", "shopId", "sessionId", "resourceId", "ratePlanId", "rateSnapshot",
  "startedAt", "endedAt", "accruedMinor", "actorUserId", "createdAt"
)
SELECT
  'p3seg_' || md5("id"),
  "shopId",
  "id",
  "resourceId",
  "ratePlanId",
  "rateSnapshot",
  "startedAt",
  "finishedAt",
  CASE WHEN "finishedAt" IS NULL THEN NULL ELSE "accruedMinor" END,
  "createdById",
  "createdAt"
FROM "OperationsSession"
WHERE NOT EXISTS (
  SELECT 1 FROM "OperationsSessionRateSegment" s WHERE s."sessionId" = "OperationsSession"."id"
);

ALTER TABLE "ResourceMaintenancePeriod"
  ADD COLUMN "expectedReturnAt" TIMESTAMP(3),
  ADD COLUMN "notes" TEXT;
CREATE INDEX "ResourceMaintenancePeriod_shopId_expectedReturnAt_idx" ON "ResourceMaintenancePeriod"("shopId", "expectedReturnAt");

CREATE TABLE "OperationsWaitlistExtension" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "waitlistEntryId" TEXT NOT NULL,
  "requestedResourceType" TEXT,
  "estimatedWaitMinutes" INTEGER,
  "operationsSessionId" TEXT,
  "notifiedAt" TIMESTAMP(3),
  "seatedAt" TIMESTAMP(3),
  "skippedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationsWaitlistExtension_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationsWaitlistExtension_estimatedWaitMinutes_check" CHECK (
    "estimatedWaitMinutes" IS NULL OR "estimatedWaitMinutes" >= 0
  )
);
CREATE UNIQUE INDEX "OperationsWaitlistExtension_waitlistEntryId_key" ON "OperationsWaitlistExtension"("waitlistEntryId");
CREATE INDEX "OperationsWaitlistExtension_shopId_version_idx" ON "OperationsWaitlistExtension"("shopId", "version");
CREATE INDEX "OperationsWaitlistExtension_shopId_operationsSessionId_idx" ON "OperationsWaitlistExtension"("shopId", "operationsSessionId");

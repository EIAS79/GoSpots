-- Organization-scoped free-trial identity ledger.
-- This table is intentionally independent from tenant data: one business gets one trial,
-- while any number of venues under that business share the same trial end date.
CREATE TABLE "OrganizationTrial" (
  "id" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "businessIdNormalized" TEXT NOT NULL,
  "businessIdDisplay" TEXT NOT NULL,
  "trialStartedAt" TIMESTAMP(3) NOT NULL,
  "trialEndsAt" TIMESTAMP(3) NOT NULL,
  "trialConsumedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationTrial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationTrial_countryCode_businessIdNormalized_key"
  ON "OrganizationTrial"("countryCode", "businessIdNormalized");
CREATE INDEX "OrganizationTrial_trialEndsAt_idx"
  ON "OrganizationTrial"("trialEndsAt");

CREATE TABLE "OrganizationTrialOwner" (
  "userId" TEXT NOT NULL,
  "organizationTrialId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationTrialOwner_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "OrganizationTrialOwner_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganizationTrialOwner_organizationTrialId_fkey"
    FOREIGN KEY ("organizationTrialId") REFERENCES "OrganizationTrial"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrganizationTrialOwner_organizationTrialId_idx"
  ON "OrganizationTrialOwner"("organizationTrialId");

CREATE TABLE "OrganizationTrialShop" (
  "shopId" TEXT NOT NULL,
  "organizationTrialId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationTrialShop_pkey" PRIMARY KEY ("shopId"),
  CONSTRAINT "OrganizationTrialShop_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganizationTrialShop_organizationTrialId_fkey"
    FOREIGN KEY ("organizationTrialId") REFERENCES "OrganizationTrial"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrganizationTrialShop_organizationTrialId_idx"
  ON "OrganizationTrialShop"("organizationTrialId");

-- Backfill legacy owners. We deliberately use the EARLIEST existing venue trial end
-- for an owner, so a later-created venue cannot extend an already-consumed trial.
INSERT INTO "OrganizationTrial" (
  "id",
  "legalName",
  "countryCode",
  "businessIdNormalized",
  "businessIdDisplay",
  "trialStartedAt",
  "trialEndsAt",
  "trialConsumedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy_' || md5(s."ownerId") AS "id",
  COALESCE(MIN(NULLIF(BTRIM(s."name"), '')), 'Legacy GoSpots business') AS "legalName",
  'ZZ' AS "countryCode",
  'LEGACY' || UPPER(md5(s."ownerId")) AS "businessIdNormalized",
  'legacy:' || s."ownerId" AS "businessIdDisplay",
  MIN(COALESCE(sub."createdAt", s."createdAt")) AS "trialStartedAt",
  MIN(COALESCE(sub."trialEndsAt", COALESCE(sub."createdAt", s."createdAt") + INTERVAL '90 days')) AS "trialEndsAt",
  MIN(COALESCE(sub."createdAt", s."createdAt")) AS "trialConsumedAt",
  NOW(),
  NOW()
FROM "Shop" s
LEFT JOIN "Subscription" sub ON sub."shopId" = s."id"
GROUP BY s."ownerId"
ON CONFLICT ("countryCode", "businessIdNormalized") DO NOTHING;

INSERT INTO "OrganizationTrialOwner" ("userId", "organizationTrialId", "createdAt")
SELECT DISTINCT
  s."ownerId",
  'legacy_' || md5(s."ownerId"),
  NOW()
FROM "Shop" s
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "OrganizationTrialShop" ("shopId", "organizationTrialId", "createdAt")
SELECT
  s."id",
  'legacy_' || md5(s."ownerId"),
  NOW()
FROM "Shop" s
ON CONFLICT ("shopId") DO NOTHING;

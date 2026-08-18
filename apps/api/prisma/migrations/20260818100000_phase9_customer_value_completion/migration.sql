-- Phase 9: Customers, memberships, loyalty, prepaid packages, promotions and stored value.
-- Expand-only migration. Existing Growth v2 customer/value ledgers remain canonical.

CREATE TABLE "CustomerConsentEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'MARKETING',
  "state" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerConsentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerConsentEvent_state_check" CHECK ("state" IN ('GRANTED','REVOKED'))
);

CREATE TABLE "CustomerPreference" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerPreference_version_check" CHECK ("version" > 0)
);

CREATE TABLE "MembershipLifecycleEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "previousStatus" TEXT,
  "newStatus" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "correlationId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "reason" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MembershipUsageLedgerEntry" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "benefitKey" TEXT NOT NULL,
  "unitKind" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "units" INTEGER NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "correlationId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "note" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipUsageLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MembershipUsageLedgerEntry_units_check" CHECK ("units" <> 0),
  CONSTRAINT "MembershipUsageLedgerEntry_type_check" CHECK ("type" IN ('GRANT','CONSUME','REFUND','REVERSAL','ADJUST'))
);

CREATE TABLE "CustomerPackageAccount" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "packageDefinitionId" TEXT NOT NULL,
  "unitKind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerPackageAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerPackageAccount_status_check" CHECK ("status" IN ('ACTIVE','EXPIRED','CANCELLED','DEPLETED')),
  CONSTRAINT "CustomerPackageAccount_expiry_check" CHECK ("expiresAt" IS NULL OR "expiresAt" > "startsAt")
);

CREATE TABLE "CustomerPackageLedgerEntry" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "units" INTEGER NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "paymentId" TEXT,
  "correlationId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "note" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerPackageLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerPackageLedgerEntry_units_check" CHECK ("units" <> 0),
  CONSTRAINT "CustomerPackageLedgerEntry_type_check" CHECK ("type" IN ('LOAD','CONSUME','REFUND','REVERSAL','ADJUST'))
);

CREATE TABLE "LoyaltyProgramPolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "programVersion" INTEGER NOT NULL DEFAULT 1,
  "pointsExpireDays" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoyaltyProgramPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoyaltyProgramPolicy_version_check" CHECK ("programVersion" > 0),
  CONSTRAINT "LoyaltyProgramPolicy_expiry_days_check" CHECK ("pointsExpireDays" IS NULL OR "pointsExpireDays" > 0),
  CONSTRAINT "LoyaltyProgramPolicy_window_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE TABLE "LoyaltyEntryPolicyEvidence" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "ledgerEntryId" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "programVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoyaltyEntryPolicyEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoyaltyEntryPolicyEvidence_version_check" CHECK ("programVersion" > 0)
);

CREATE TABLE "StoredValueAccountPolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "transferAllowed" BOOLEAN NOT NULL DEFAULT false,
  "refundAllowed" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "legalPolicyRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoredValueAccountPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionUsagePolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "domain" TEXT NOT NULL DEFAULT 'GENERAL',
  "firstVisitOnly" BOOLEAN NOT NULL DEFAULT false,
  "minQuantity" INTEGER,
  "maxQuantity" INTEGER,
  "totalLimit" INTEGER,
  "perCustomerLimit" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromotionUsagePolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromotionUsagePolicy_domain_check" CHECK ("domain" IN ('GENERAL','PRODUCT','RESOURCE')),
  CONSTRAINT "PromotionUsagePolicy_quantity_check" CHECK (("minQuantity" IS NULL OR "minQuantity" >= 0) AND ("maxQuantity" IS NULL OR "maxQuantity" >= 0) AND ("minQuantity" IS NULL OR "maxQuantity" IS NULL OR "maxQuantity" >= "minQuantity")),
  CONSTRAINT "PromotionUsagePolicy_limits_check" CHECK (("totalLimit" IS NULL OR "totalLimit" > 0) AND ("perCustomerLimit" IS NULL OR "perCustomerLimit" > 0))
);

CREATE TABLE "PromotionRedemption" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "customerId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "discountMinor" INTEGER NOT NULL,
  "correlationId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromotionRedemption_discount_check" CHECK ("discountMinor" >= 0)
);

CREATE TABLE "CustomerPortalAccessToken" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerPortalAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerConsentEvent_shopId_customerId_purpose_occurredAt_idx" ON "CustomerConsentEvent"("shopId","customerId","purpose","occurredAt");
CREATE UNIQUE INDEX "CustomerPreference_shopId_customerId_key_key" ON "CustomerPreference"("shopId","customerId","key");
CREATE INDEX "CustomerPreference_shopId_customerId_idx" ON "CustomerPreference"("shopId","customerId");
CREATE UNIQUE INDEX "MembershipLifecycleEvent_shopId_correlationId_key" ON "MembershipLifecycleEvent"("shopId","correlationId");
CREATE INDEX "MembershipLifecycleEvent_shopId_customerId_createdAt_idx" ON "MembershipLifecycleEvent"("shopId","customerId","createdAt");
CREATE INDEX "MembershipLifecycleEvent_shopId_membershipId_effectiveAt_idx" ON "MembershipLifecycleEvent"("shopId","membershipId","effectiveAt");
CREATE UNIQUE INDEX "MembershipUsageLedgerEntry_shopId_correlationId_key" ON "MembershipUsageLedgerEntry"("shopId","correlationId");
CREATE INDEX "MembershipUsageLedgerEntry_shopId_membershipId_benefitKey_createdAt_idx" ON "MembershipUsageLedgerEntry"("shopId","membershipId","benefitKey","createdAt");
CREATE INDEX "MembershipUsageLedgerEntry_shopId_customerId_createdAt_idx" ON "MembershipUsageLedgerEntry"("shopId","customerId","createdAt");
CREATE INDEX "MembershipUsageLedgerEntry_shopId_sourceType_sourceId_idx" ON "MembershipUsageLedgerEntry"("shopId","sourceType","sourceId");
CREATE INDEX "CustomerPackageAccount_shopId_customerId_status_idx" ON "CustomerPackageAccount"("shopId","customerId","status");
CREATE INDEX "CustomerPackageAccount_shopId_packageDefinitionId_status_idx" ON "CustomerPackageAccount"("shopId","packageDefinitionId","status");
CREATE UNIQUE INDEX "CustomerPackageLedgerEntry_shopId_correlationId_key" ON "CustomerPackageLedgerEntry"("shopId","correlationId");
CREATE INDEX "CustomerPackageLedgerEntry_shopId_accountId_createdAt_idx" ON "CustomerPackageLedgerEntry"("shopId","accountId","createdAt");
CREATE INDEX "CustomerPackageLedgerEntry_shopId_customerId_createdAt_idx" ON "CustomerPackageLedgerEntry"("shopId","customerId","createdAt");
CREATE INDEX "CustomerPackageLedgerEntry_shopId_sourceType_sourceId_idx" ON "CustomerPackageLedgerEntry"("shopId","sourceType","sourceId");
CREATE UNIQUE INDEX "LoyaltyProgramPolicy_shopId_programVersion_key" ON "LoyaltyProgramPolicy"("shopId","programVersion");
CREATE INDEX "LoyaltyProgramPolicy_shopId_active_startsAt_idx" ON "LoyaltyProgramPolicy"("shopId","active","startsAt");
CREATE UNIQUE INDEX "LoyaltyEntryPolicyEvidence_ledgerEntryId_key" ON "LoyaltyEntryPolicyEvidence"("ledgerEntryId");
CREATE UNIQUE INDEX "LoyaltyEntryPolicyEvidence_shopId_correlationId_key" ON "LoyaltyEntryPolicyEvidence"("shopId","correlationId");
CREATE INDEX "LoyaltyEntryPolicyEvidence_shopId_expiresAt_idx" ON "LoyaltyEntryPolicyEvidence"("shopId","expiresAt");
CREATE UNIQUE INDEX "StoredValueAccountPolicy_accountId_key" ON "StoredValueAccountPolicy"("accountId");
CREATE INDEX "StoredValueAccountPolicy_shopId_expiresAt_idx" ON "StoredValueAccountPolicy"("shopId","expiresAt");
CREATE UNIQUE INDEX "PromotionUsagePolicy_promotionId_key" ON "PromotionUsagePolicy"("promotionId");
CREATE INDEX "PromotionUsagePolicy_shopId_domain_idx" ON "PromotionUsagePolicy"("shopId","domain");
CREATE UNIQUE INDEX "PromotionRedemption_shopId_correlationId_key" ON "PromotionRedemption"("shopId","correlationId");
CREATE UNIQUE INDEX "PromotionRedemption_shopId_promotionId_sourceType_sourceId_key" ON "PromotionRedemption"("shopId","promotionId","sourceType","sourceId");
CREATE INDEX "PromotionRedemption_shopId_promotionId_createdAt_idx" ON "PromotionRedemption"("shopId","promotionId","createdAt");
CREATE INDEX "PromotionRedemption_shopId_promotionId_customerId_createdAt_idx" ON "PromotionRedemption"("shopId","promotionId","customerId","createdAt");
CREATE UNIQUE INDEX "CustomerPortalAccessToken_tokenHash_key" ON "CustomerPortalAccessToken"("tokenHash");
CREATE INDEX "CustomerPortalAccessToken_shopId_customerId_expiresAt_idx" ON "CustomerPortalAccessToken"("shopId","customerId","expiresAt");

-- Tenant RLS parity with existing direct shop-scoped operational tables.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'CustomerConsentEvent','CustomerPreference','MembershipLifecycleEvent',
    'MembershipUsageLedgerEntry','CustomerPackageAccount','CustomerPackageLedgerEntry',
    'LoyaltyProgramPolicy','LoyaltyEntryPolicyEvidence','StoredValueAccountPolicy',
    'PromotionUsagePolicy','PromotionRedemption','CustomerPortalAccessToken'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"))', t || '_tenant_isolation', t);
  END LOOP;
END $$;

-- Chunks 16–20 completion evidence and semantic fact storage.
CREATE TABLE "ReservationCapacityPolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "resourceCategoryId" TEXT,
  "resourceType" TEXT,
  "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  "minPartySize" INTEGER NOT NULL DEFAULT 1,
  "maxPartySize" INTEGER,
  "flexibleAssignment" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReservationCapacityPolicy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReservationCapacityPolicy_shopId_active_resourceCategoryId_idx" ON "ReservationCapacityPolicy"("shopId","active","resourceCategoryId");
CREATE INDEX "ReservationCapacityPolicy_shopId_active_resourceType_idx" ON "ReservationCapacityPolicy"("shopId","active","resourceType");

CREATE TABLE "ReservationBookingEvidence" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "sourceChannel" TEXT NOT NULL,
  "requestedCategoryId" TEXT,
  "requestedResourceType" TEXT,
  "assignedResourceId" TEXT,
  "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  "recurrenceSeriesId" TEXT,
  "recurrenceRule" JSONB,
  "checkedInAt" TIMESTAMP(3),
  "checkedInById" TEXT,
  "canceledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReservationBookingEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReservationBookingEvidence_reservationId_key" ON "ReservationBookingEvidence"("reservationId");
CREATE INDEX "ReservationBookingEvidence_shopId_sourceChannel_createdAt_idx" ON "ReservationBookingEvidence"("shopId","sourceChannel","createdAt");
CREATE INDEX "ReservationBookingEvidence_shopId_recurrenceSeriesId_idx" ON "ReservationBookingEvidence"("shopId","recurrenceSeriesId");
CREATE INDEX "ReservationBookingEvidence_shopId_requestedCategoryId_idx" ON "ReservationBookingEvidence"("shopId","requestedCategoryId");

CREATE TABLE "ReservationDepositApplication" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "guestCheckId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReservationDepositApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReservationDepositApplication_shopId_correlationId_key" ON "ReservationDepositApplication"("shopId","correlationId");
CREATE INDEX "ReservationDepositApplication_shopId_reservationId_createdAt_idx" ON "ReservationDepositApplication"("shopId","reservationId","createdAt");
CREATE INDEX "ReservationDepositApplication_shopId_guestCheckId_createdAt_idx" ON "ReservationDepositApplication"("shopId","guestCheckId","createdAt");

CREATE TABLE "RuleCondition" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "operator" TEXT NOT NULL DEFAULT 'EQ',
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuleCondition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RuleCondition_shopId_promotionId_kind_idx" ON "RuleCondition"("shopId","promotionId","kind");

CREATE TABLE "RuleBenefit" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuleBenefit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RuleBenefit_shopId_promotionId_kind_idx" ON "RuleBenefit"("shopId","promotionId","kind");

CREATE TABLE "RuleApplication" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "pricingSnapshotId" TEXT,
  "benefitKind" TEXT NOT NULL,
  "discountMinor" INTEGER NOT NULL DEFAULT 0,
  "explanation" TEXT NOT NULL,
  "conditionSnapshot" JSONB NOT NULL,
  "benefitSnapshot" JSONB NOT NULL,
  "correlationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuleApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RuleApplication_shopId_correlationId_key" ON "RuleApplication"("shopId","correlationId");
CREATE INDEX "RuleApplication_shopId_sourceType_sourceId_createdAt_idx" ON "RuleApplication"("shopId","sourceType","sourceId","createdAt");
CREATE INDEX "RuleApplication_shopId_promotionId_createdAt_idx" ON "RuleApplication"("shopId","promotionId","createdAt");

CREATE TABLE "CustomerIdentity" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "normalizedValue" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerIdentity_shopId_kind_normalizedValue_key" ON "CustomerIdentity"("shopId","kind","normalizedValue");
CREATE INDEX "CustomerIdentity_shopId_customerId_idx" ON "CustomerIdentity"("shopId","customerId");

CREATE TABLE "CustomerVisit" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "reservationId" TEXT,
  "guestCheckId" TEXT,
  "operationsSessionId" TEXT,
  "eventRequestId" TEXT,
  "settledAmountMinor" INTEGER,
  "currency" TEXT,
  "proofHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerVisit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerVisit_shopId_sourceType_sourceId_key" ON "CustomerVisit"("shopId","sourceType","sourceId");
CREATE INDEX "CustomerVisit_shopId_customerId_completedAt_idx" ON "CustomerVisit"("shopId","customerId","completedAt");
CREATE INDEX "CustomerVisit_shopId_completedAt_idx" ON "CustomerVisit"("shopId","completedAt");

CREATE TABLE "CustomerMergeAudit" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "canonicalCustomerId" TEXT NOT NULL,
  "mergedCustomerId" TEXT NOT NULL,
  "reason" TEXT,
  "referenceCounts" JSONB NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerMergeAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerMergeAudit_shopId_canonicalCustomerId_createdAt_idx" ON "CustomerMergeAudit"("shopId","canonicalCustomerId","createdAt");
CREATE INDEX "CustomerMergeAudit_shopId_mergedCustomerId_idx" ON "CustomerMergeAudit"("shopId","mergedCustomerId");

CREATE TABLE "ReviewVisitProof" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "publicTokenHash" TEXT NOT NULL,
  "validUntil" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewVisitProof_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReviewVisitProof_shopId_publicTokenHash_key" ON "ReviewVisitProof"("shopId","publicTokenHash");
CREATE INDEX "ReviewVisitProof_shopId_customerId_createdAt_idx" ON "ReviewVisitProof"("shopId","customerId","createdAt");

CREATE TABLE "EventLifecycleEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "eventRequestId" TEXT NOT NULL,
  "fromState" TEXT,
  "toState" TEXT NOT NULL,
  "reason" TEXT,
  "actorUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventLifecycleEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventLifecycleEvent_shopId_eventRequestId_createdAt_idx" ON "EventLifecycleEvent"("shopId","eventRequestId","createdAt");
CREATE INDEX "EventLifecycleEvent_shopId_toState_createdAt_idx" ON "EventLifecycleEvent"("shopId","toState","createdAt");

CREATE TABLE "EventChecklistItem" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "eventRequestId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "dueAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "completedAt" TIMESTAMP(3),
  "completedById" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventChecklistItem_shopId_eventRequestId_status_sortOrder_idx" ON "EventChecklistItem"("shopId","eventRequestId","status","sortOrder");
CREATE INDEX "EventChecklistItem_shopId_ownerUserId_status_idx" ON "EventChecklistItem"("shopId","ownerUserId","status");

CREATE TABLE "AnalyticsFact" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "factKind" TEXT NOT NULL,
  "bucketStart" TIMESTAMP(3) NOT NULL,
  "bucketEnd" TIMESTAMP(3) NOT NULL,
  "dimensionKey" TEXT NOT NULL,
  "currency" TEXT,
  "measures" JSONB NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "rebuiltAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsFact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnalyticsFact_shopId_factKind_bucketStart_dimensionKey_currency_key" ON "AnalyticsFact"("shopId","factKind","bucketStart","dimensionKey","currency");
CREATE INDEX "AnalyticsFact_shopId_factKind_bucketStart_bucketEnd_idx" ON "AnalyticsFact"("shopId","factKind","bucketStart","bucketEnd");

-- Immutable evidence: historical applications, visits, merge decisions and lifecycle facts
-- are corrected by compensating rows or canonical-source correction, never in-place edits.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ReservationDepositApplication','RuleApplication','CustomerVisit','CustomerMergeAudit','EventLifecycleEvent'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION gospots_reject_growth_mutation()', t || '_append_only', t);
  END LOOP;
END $$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ReservationCapacityPolicy','ReservationBookingEvidence','ReservationDepositApplication',
    'RuleCondition','RuleBenefit','RuleApplication',
    'CustomerIdentity','CustomerVisit','CustomerMergeAudit','ReviewVisitProof',
    'EventLifecycleEvent','EventChecklistItem','AnalyticsFact'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"))',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;

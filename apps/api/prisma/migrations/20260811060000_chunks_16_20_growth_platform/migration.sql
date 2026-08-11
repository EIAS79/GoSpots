-- Chunks 16–20 — Reservations 2.0, Growth Pricing, CRM/Loyalty/Stored Value,
-- Events 2.0 and Analytics source models.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "ReservationPolicy" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "depositKind" TEXT NOT NULL DEFAULT 'NONE',
  "depositFixedMinor" INTEGER,
  "depositPercentBps" INTEGER,
  "cancellationWindowMinutes" INTEGER NOT NULL DEFAULT 0,
  "lateCancelForfeitPercent" INTEGER NOT NULL DEFAULT 0,
  "noShowForfeitPercent" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReservationPolicy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReservationPolicy_shopId_active_name_idx" ON "ReservationPolicy"("shopId","active","name");

CREATE TABLE "ReservationExtension" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "policyId" TEXT,
  "policySnapshot" JSONB,
  "convertedSessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReservationExtension_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReservationExtension_reservationId_key" ON "ReservationExtension"("reservationId");
CREATE INDEX "ReservationExtension_shopId_policyId_idx" ON "ReservationExtension"("shopId","policyId");
CREATE INDEX "ReservationExtension_shopId_convertedSessionId_idx" ON "ReservationExtension"("shopId","convertedSessionId");

CREATE TABLE "ReservationDepositLedgerEntry" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "paymentId" TEXT,
  "refundId" TEXT,
  "correlationId" TEXT NOT NULL,
  "note" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReservationDepositLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReservationDepositLedgerEntry_shopId_correlationId_key" ON "ReservationDepositLedgerEntry"("shopId","correlationId");
CREATE INDEX "ReservationDepositLedgerEntry_shopId_reservationId_createdAt_idx" ON "ReservationDepositLedgerEntry"("shopId","reservationId","createdAt");
CREATE INDEX "ReservationDepositLedgerEntry_shopId_paymentId_idx" ON "ReservationDepositLedgerEntry"("shopId","paymentId");
CREATE INDEX "ReservationDepositLedgerEntry_shopId_refundId_idx" ON "ReservationDepositLedgerEntry"("shopId","refundId");

CREATE TABLE "ReservationWaitlistEntry" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "resourceId" TEXT,
  "guestName" TEXT NOT NULL,
  "guestEmail" TEXT,
  "guestPhone" TEXT,
  "partySize" INTEGER NOT NULL DEFAULT 1,
  "desiredStartsAt" TIMESTAMP(3) NOT NULL,
  "desiredEndsAt" TIMESTAMP(3) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "offeredAt" TIMESTAMP(3),
  "offerExpiresAt" TIMESTAMP(3),
  "reservationId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReservationWaitlistEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReservationWaitlistEntry_shopId_status_priority_createdAt_idx" ON "ReservationWaitlistEntry"("shopId","status","priority","createdAt");
CREATE INDEX "ReservationWaitlistEntry_shopId_resourceId_desiredStartsAt_desiredEndsAt_idx" ON "ReservationWaitlistEntry"("shopId","resourceId","desiredStartsAt","desiredEndsAt");

CREATE TABLE "PromotionRule" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "valueBps" INTEGER,
  "amountMinor" INTEGER,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "stackable" BOOLEAN NOT NULL DEFAULT true,
  "exclusiveGroup" TEXT,
  "minSubtotalMinor" INTEGER NOT NULL DEFAULT 0,
  "requiresCode" BOOLEAN NOT NULL DEFAULT false,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "conditions" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromotionRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PromotionRule_shopId_code_key" ON "PromotionRule"("shopId","code");
CREATE INDEX "PromotionRule_shopId_active_priority_idx" ON "PromotionRule"("shopId","active","priority");
CREATE INDEX "PromotionRule_shopId_startsAt_endsAt_idx" ON "PromotionRule"("shopId","startsAt","endsAt");

CREATE TABLE "PackageDefinition" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "components" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PackageDefinition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PackageDefinition_shopId_active_name_idx" ON "PackageDefinition"("shopId","active","name");

CREATE TABLE "PricingSnapshot" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "subtotalMinor" INTEGER NOT NULL,
  "discountMinor" INTEGER NOT NULL,
  "taxMinor" INTEGER NOT NULL,
  "tipMinor" INTEGER NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "rules" JSONB NOT NULL,
  "pricingHash" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PricingSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PricingSnapshot_shopId_sourceType_sourceId_pricingHash_key" ON "PricingSnapshot"("shopId","sourceType","sourceId","pricingHash");
CREATE INDEX "PricingSnapshot_shopId_createdAt_idx" ON "PricingSnapshot"("shopId","createdAt");
CREATE INDEX "PricingSnapshot_shopId_sourceType_sourceId_idx" ON "PricingSnapshot"("shopId","sourceType","sourceId");

CREATE TABLE "TipLedgerEntry" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "guestCheckId" TEXT,
  "paymentId" TEXT,
  "type" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "reason" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TipLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TipLedgerEntry_shopId_correlationId_key" ON "TipLedgerEntry"("shopId","correlationId");
CREATE INDEX "TipLedgerEntry_shopId_guestCheckId_createdAt_idx" ON "TipLedgerEntry"("shopId","guestCheckId","createdAt");
CREATE INDEX "TipLedgerEntry_shopId_paymentId_idx" ON "TipLedgerEntry"("shopId","paymentId");

CREATE TABLE "CustomerProfile" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "marketingConsentAt" TIMESTAMP(3),
  "consentSource" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerProfile_shopId_email_key" ON "CustomerProfile"("shopId","email");
CREATE UNIQUE INDEX "CustomerProfile_shopId_phone_key" ON "CustomerProfile"("shopId","phone");
CREATE INDEX "CustomerProfile_shopId_createdAt_idx" ON "CustomerProfile"("shopId","createdAt");

CREATE TABLE "MembershipTier" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "earnRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
  "benefits" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MembershipTier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MembershipTier_shopId_code_key" ON "MembershipTier"("shopId","code");
CREATE INDEX "MembershipTier_shopId_active_rank_idx" ON "MembershipTier"("shopId","active","rank");

CREATE TABLE "CustomerMembership" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "tierId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerMembership_shopId_customerId_key" ON "CustomerMembership"("shopId","customerId");
CREATE INDEX "CustomerMembership_shopId_tierId_status_idx" ON "CustomerMembership"("shopId","tierId","status");

CREATE TABLE "LoyaltyLedgerEntry" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "correlationId" TEXT NOT NULL,
  "note" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoyaltyLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LoyaltyLedgerEntry_shopId_correlationId_key" ON "LoyaltyLedgerEntry"("shopId","correlationId");
CREATE INDEX "LoyaltyLedgerEntry_shopId_customerId_createdAt_idx" ON "LoyaltyLedgerEntry"("shopId","customerId","createdAt");
CREATE INDEX "LoyaltyLedgerEntry_shopId_sourceType_sourceId_idx" ON "LoyaltyLedgerEntry"("shopId","sourceType","sourceId");

CREATE TABLE "StoredValueAccount" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "customerId" TEXT,
  "codeHash" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoredValueAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoredValueAccount_shopId_codeHash_key" ON "StoredValueAccount"("shopId","codeHash");
CREATE INDEX "StoredValueAccount_shopId_customerId_status_idx" ON "StoredValueAccount"("shopId","customerId","status");

CREATE TABLE "StoredValueLedgerEntry" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "paymentId" TEXT,
  "correlationId" TEXT NOT NULL,
  "note" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredValueLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoredValueLedgerEntry_shopId_correlationId_key" ON "StoredValueLedgerEntry"("shopId","correlationId");
CREATE INDEX "StoredValueLedgerEntry_shopId_accountId_createdAt_idx" ON "StoredValueLedgerEntry"("shopId","accountId","createdAt");
CREATE INDEX "StoredValueLedgerEntry_shopId_sourceType_sourceId_idx" ON "StoredValueLedgerEntry"("shopId","sourceType","sourceId");

CREATE TABLE "EventProposal" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "eventRequestId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "subtotalMinor" INTEGER NOT NULL,
  "depositMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "terms" JSONB NOT NULL,
  "validUntil" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventProposal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventProposal_shopId_eventRequestId_version_key" ON "EventProposal"("shopId","eventRequestId","version");
CREATE INDEX "EventProposal_shopId_eventRequestId_status_idx" ON "EventProposal"("shopId","eventRequestId","status");

CREATE TABLE "EventResourceHold" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "eventRequestId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'HOLD',
  "expiresAt" TIMESTAMP(3),
  "reservationId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventResourceHold_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventResourceHold_shopId_eventRequestId_status_idx" ON "EventResourceHold"("shopId","eventRequestId","status");
CREATE INDEX "EventResourceHold_shopId_resourceId_startsAt_endsAt_idx" ON "EventResourceHold"("shopId","resourceId","startsAt","endsAt");
ALTER TABLE "EventResourceHold" ADD CONSTRAINT "EventResourceHold_no_overlap" EXCLUDE USING gist (
  "shopId" WITH =,
  "resourceId" WITH =,
  tsrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("status" IN ('HOLD','CONFIRMED'));

CREATE TABLE "EventPaymentSchedule" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "eventRequestId" TEXT NOT NULL,
  "proposalId" TEXT,
  "label" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DUE',
  "paymentId" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventPaymentSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventPaymentSchedule_shopId_eventRequestId_status_dueAt_idx" ON "EventPaymentSchedule"("shopId","eventRequestId","status","dueAt");
CREATE INDEX "EventPaymentSchedule_shopId_paymentId_idx" ON "EventPaymentSchedule"("shopId","paymentId");

CREATE TABLE "EventExecution" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "eventRequestId" TEXT NOT NULL,
  "guestCheckId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventExecution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventExecution_eventRequestId_key" ON "EventExecution"("eventRequestId");
CREATE INDEX "EventExecution_shopId_status_createdAt_idx" ON "EventExecution"("shopId","status","createdAt");
CREATE INDEX "EventExecution_shopId_guestCheckId_idx" ON "EventExecution"("shopId","guestCheckId");

-- Append-only financial/customer ledgers and immutable pricing evidence.
CREATE OR REPLACE FUNCTION gospots_reject_growth_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only growth ledger/snapshot rows cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ReservationDepositLedgerEntry','PricingSnapshot','TipLedgerEntry','LoyaltyLedgerEntry','StoredValueLedgerEntry']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION gospots_reject_growth_mutation()', t || '_append_only', t);
  END LOOP;
END $$;

-- Tenant isolation follows the application-controlled RLS posture used by Chunks 01–15.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ReservationPolicy','ReservationExtension','ReservationDepositLedgerEntry','ReservationWaitlistEntry',
    'PromotionRule','PackageDefinition','PricingSnapshot','TipLedgerEntry',
    'CustomerProfile','MembershipTier','CustomerMembership','LoyaltyLedgerEntry','StoredValueAccount','StoredValueLedgerEntry',
    'EventProposal','EventResourceHold','EventPaymentSchedule','EventExecution'
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
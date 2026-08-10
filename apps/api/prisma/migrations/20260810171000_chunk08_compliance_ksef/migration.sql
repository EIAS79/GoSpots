-- Chunk 08 — Poland Fiscal & Compliance Adapter + KSeF (expand-only).
-- Jurisdiction-neutral durable compliance records; no automatic live KSeF calls.

CREATE TYPE "ComplianceDocumentKind" AS ENUM ('RECEIPT', 'INVOICE', 'CORRECTION', 'REFUND');
CREATE TYPE "ComplianceDocumentState" AS ENUM ('DRAFT', 'PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'UNKNOWN', 'DISABLED');
CREATE TYPE "ComplianceRequestState" AS ENUM ('CREATED', 'SENDING', 'SUBMITTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN');
CREATE TYPE "ComplianceProofType" AS ENUM ('KSEF_REFERENCE', 'KSEF_NUMBER', 'UPO', 'FISCAL_RECEIPT', 'OTHER');

CREATE TABLE "ComplianceProfile" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL DEFAULT 'PL',
  "legalName" TEXT NOT NULL,
  "taxId" TEXT NOT NULL,
  "streetAddress" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'PL',
  "defaultTaxCategoryCode" TEXT,
  "ksefEnvironment" TEXT NOT NULL DEFAULT 'TEST',
  "ksefTokenEncrypted" TEXT,
  "nextInvoiceSequence" INTEGER NOT NULL DEFAULT 1,
  "nextReceiptSequence" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ComplianceProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxCategory" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "ratePercent" DECIMAL(7,4) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaxCategory_rate_valid" CHECK ("ratePercent" >= 0 AND "ratePercent" <= 100)
);

CREATE TABLE "FiscalDevice" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalDeviceId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceDocument" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL,
  "kind" "ComplianceDocumentKind" NOT NULL,
  "state" "ComplianceDocumentState" NOT NULL DEFAULT 'DRAFT',
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceVersion" INTEGER NOT NULL DEFAULT 1,
  "parentDocumentId" TEXT,
  "documentNumber" TEXT,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL,
  "buyerName" TEXT,
  "buyerTaxId" TEXT,
  "netAmount" DECIMAL(19,4) NOT NULL,
  "taxAmount" DECIMAL(19,4) NOT NULL,
  "grossAmount" DECIMAL(19,4) NOT NULL,
  "taxSummary" JSONB,
  "payloadHash" TEXT NOT NULL,
  "payloadXml" TEXT,
  "externalSystem" TEXT,
  "externalReference" TEXT,
  "ksefNumber" TEXT,
  "createdById" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ComplianceDocument_amounts_nonnegative" CHECK ("netAmount" >= 0 AND "taxAmount" >= 0 AND "grossAmount" >= 0),
  CONSTRAINT "ComplianceDocument_total_consistent" CHECK ("grossAmount" = "netAmount" + "taxAmount")
);

CREATE TABLE "ComplianceDocumentLine" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "snapshotId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "lineReference" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "taxCategoryCode" TEXT NOT NULL,
  "taxRatePercent" DECIMAL(7,4) NOT NULL,
  "netAmount" DECIMAL(19,4) NOT NULL,
  "taxAmount" DECIMAL(19,4) NOT NULL,
  "grossAmount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplianceDocumentLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ComplianceDocumentLine_amounts_nonnegative" CHECK ("netAmount" >= 0 AND "taxAmount" >= 0 AND "grossAmount" >= 0),
  CONSTRAINT "ComplianceDocumentLine_total_consistent" CHECK ("grossAmount" = "netAmount" + "taxAmount"),
  CONSTRAINT "ComplianceDocumentLine_rate_valid" CHECK ("taxRatePercent" >= 0 AND "taxRatePercent" <= 100)
);

CREATE TABLE "ComplianceRequest" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "adapter" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "state" "ComplianceRequestState" NOT NULL DEFAULT 'CREATED',
  "externalReference" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "responseHash" TEXT,
  "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
  "lastAttemptAt" TIMESTAMP(3),
  "retryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ComplianceRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceEvent" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "payload" JSONB,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplianceEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceProof" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "type" "ComplianceProofType" NOT NULL,
  "externalReference" TEXT,
  "contentHash" TEXT NOT NULL,
  "content" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplianceProof_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComplianceProfile_shopId_key" ON "ComplianceProfile"("shopId");
CREATE INDEX "ComplianceProfile_shop_jurisdiction_idx" ON "ComplianceProfile"("shopId", "jurisdiction");
CREATE UNIQUE INDEX "TaxCategory_shop_code_key" ON "TaxCategory"("shopId", "code");
CREATE INDEX "TaxCategory_shop_active_idx" ON "TaxCategory"("shopId", "active");
CREATE UNIQUE INDEX "FiscalDevice_shop_label_key" ON "FiscalDevice"("shopId", "label");
CREATE UNIQUE INDEX "FiscalDevice_shop_provider_external_key" ON "FiscalDevice"("shopId", "provider", "externalDeviceId");
CREATE INDEX "FiscalDevice_shop_enabled_idx" ON "FiscalDevice"("shopId", "enabled");

CREATE UNIQUE INDEX "ComplianceDocument_shop_source_version_key"
  ON "ComplianceDocument"("shopId", "jurisdiction", "kind", "sourceType", "sourceId", "sourceVersion");
CREATE UNIQUE INDEX "ComplianceDocument_shop_number_key"
  ON "ComplianceDocument"("shopId", "jurisdiction", "documentNumber");
CREATE INDEX "ComplianceDocument_shop_state_created_idx" ON "ComplianceDocument"("shopId", "state", "createdAt");
CREATE INDEX "ComplianceDocument_shop_parent_idx" ON "ComplianceDocument"("shopId", "parentDocumentId");
CREATE INDEX "ComplianceDocument_shop_external_idx" ON "ComplianceDocument"("shopId", "externalSystem", "externalReference");
CREATE INDEX "ComplianceDocument_shop_ksef_idx" ON "ComplianceDocument"("shopId", "ksefNumber");

CREATE UNIQUE INDEX "ComplianceDocumentLine_document_position_key" ON "ComplianceDocumentLine"("documentId", "position");
CREATE INDEX "ComplianceDocumentLine_shop_document_idx" ON "ComplianceDocumentLine"("shopId", "documentId");
CREATE INDEX "ComplianceDocumentLine_shop_snapshot_idx" ON "ComplianceDocumentLine"("shopId", "snapshotId");
CREATE INDEX "ComplianceDocumentLine_shop_tax_idx" ON "ComplianceDocumentLine"("shopId", "taxCategoryCode");

CREATE UNIQUE INDEX "ComplianceRequest_shop_adapter_idempotency_key"
  ON "ComplianceRequest"("shopId", "adapter", "idempotencyKey");
CREATE INDEX "ComplianceRequest_shop_state_created_idx" ON "ComplianceRequest"("shopId", "state", "createdAt");
CREATE INDEX "ComplianceRequest_shop_document_created_idx" ON "ComplianceRequest"("shopId", "documentId", "createdAt");
CREATE INDEX "ComplianceRequest_shop_external_idx" ON "ComplianceRequest"("shopId", "externalReference");

CREATE INDEX "ComplianceEvent_shop_document_created_idx" ON "ComplianceEvent"("shopId", "documentId", "createdAt");
CREATE INDEX "ComplianceEvent_shop_type_created_idx" ON "ComplianceEvent"("shopId", "eventType", "createdAt");

CREATE UNIQUE INDEX "ComplianceProof_shop_document_type_hash_key"
  ON "ComplianceProof"("shopId", "documentId", "type", "contentHash");
CREATE INDEX "ComplianceProof_shop_document_created_idx" ON "ComplianceProof"("shopId", "documentId", "createdAt");
CREATE INDEX "ComplianceProof_shop_external_idx" ON "ComplianceProof"("shopId", "externalReference");

ALTER TABLE "ComplianceProfile" ADD CONSTRAINT "ComplianceProfile_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxCategory" ADD CONSTRAINT "TaxCategory_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDevice" ADD CONSTRAINT "FiscalDevice_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_parentDocumentId_fkey"
  FOREIGN KEY ("parentDocumentId") REFERENCES "ComplianceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceDocumentLine" ADD CONSTRAINT "ComplianceDocumentLine_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceDocumentLine" ADD CONSTRAINT "ComplianceDocumentLine_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "ComplianceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceRequest" ADD CONSTRAINT "ComplianceRequest_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "ComplianceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceRequest" ADD CONSTRAINT "ComplianceRequest_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "ComplianceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceProof" ADD CONSTRAINT "ComplianceProof_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "ComplianceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceProof" ADD CONSTRAINT "ComplianceProof_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ComplianceProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceProfile_tenant_policy" ON "ComplianceProfile"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "TaxCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "TaxCategory_tenant_policy" ON "TaxCategory"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "FiscalDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FiscalDevice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FiscalDevice_tenant_policy" ON "FiscalDevice"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "ComplianceDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceDocument_tenant_policy" ON "ComplianceDocument"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "ComplianceDocumentLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceDocumentLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceDocumentLine_tenant_policy" ON "ComplianceDocumentLine"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "ComplianceRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceRequest_tenant_policy" ON "ComplianceRequest"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "ComplianceEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceEvent_tenant_policy" ON "ComplianceEvent"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));
ALTER TABLE "ComplianceProof" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceProof" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceProof_tenant_policy" ON "ComplianceProof"
  USING (app_tenant_rls_ok("shopId")) WITH CHECK (app_tenant_rls_ok("shopId"));

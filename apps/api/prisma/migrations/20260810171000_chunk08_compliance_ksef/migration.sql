-- Chunk 08 — Poland Fiscal & Compliance Adapter + KSeF (expand-only).
-- Jurisdiction-neutral durable compliance records; no automatic live KSeF calls.

CREATE TYPE "ComplianceDocumentKind" AS ENUM ('RECEIPT', 'INVOICE', 'CORRECTION', 'REFUND');
CREATE TYPE "ComplianceDocumentState" AS ENUM ('DRAFT', 'PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'UNKNOWN', 'DISABLED');
CREATE TYPE "ComplianceRequestState" AS ENUM ('CREATED', 'SENDING', 'SUBMITTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN');
CREATE TYPE "ComplianceProofType" AS ENUM ('KSEF_REFERENCE', 'KSEF_NUMBER', 'UPO', 'FISCAL_RECEIPT', 'OTHER');

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

CREATE UNIQUE INDEX "ComplianceDocument_shop_source_version_key"
  ON "ComplianceDocument"("shopId", "jurisdiction", "kind", "sourceType", "sourceId", "sourceVersion");
CREATE INDEX "ComplianceDocument_shop_state_created_idx" ON "ComplianceDocument"("shopId", "state", "createdAt");
CREATE INDEX "ComplianceDocument_shop_parent_idx" ON "ComplianceDocument"("shopId", "parentDocumentId");
CREATE INDEX "ComplianceDocument_shop_external_idx" ON "ComplianceDocument"("shopId", "externalSystem", "externalReference");
CREATE INDEX "ComplianceDocument_shop_ksef_idx" ON "ComplianceDocument"("shopId", "ksefNumber");

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

ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_parentDocumentId_fkey"
  FOREIGN KEY ("parentDocumentId") REFERENCES "ComplianceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
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

ALTER TABLE "ComplianceDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceDocument_tenant_policy" ON "ComplianceDocument"
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

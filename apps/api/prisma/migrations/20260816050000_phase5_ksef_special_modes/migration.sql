-- Phase 5 — KSeF special legal procedures and deferred-submission evidence.
CREATE TYPE "KsefSpecialMode" AS ENUM ('OFFLINE24', 'SERVICE_UNAVAILABLE', 'ANNOUNCED_FAILURE', 'TOTAL_FAILURE');
CREATE TYPE "KsefSpecialModeStatus" AS ENUM ('AWAITING_SUBMISSION', 'SUBMITTED', 'RECONCILED', 'OVERDUE_REVIEW', 'NO_SUBMISSION_REQUIRED');

CREATE TABLE "KsefSpecialModeRecord" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "mode" "KsefSpecialMode" NOT NULL,
  "status" "KsefSpecialModeStatus" NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "triggeringEventReference" TEXT,
  "submissionDeadlineAt" TIMESTAMP(3),
  "buyerDeliveredAt" TIMESTAMP(3),
  "qrRequiredBeforeSubmit" BOOLEAN NOT NULL DEFAULT false,
  "offlineQrPayloadHash" TEXT,
  "offlineCertificateFingerprint" TEXT,
  "certificateQrPayloadHash" TEXT,
  "complianceRequestId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "legalBasisNote" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KsefSpecialModeRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KsefSpecialModeRecord_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KsefSpecialModeRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ComplianceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "KsefSpecialModeRecord_requestId_fkey" FOREIGN KEY ("complianceRequestId") REFERENCES "ComplianceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "KsefSpecialModeRecord_deadline_contract" CHECK (
    ("mode" = 'TOTAL_FAILURE' AND "submissionDeadlineAt" IS NULL AND "status" = 'NO_SUBMISSION_REQUIRED')
    OR
    ("mode" <> 'TOTAL_FAILURE' AND "submissionDeadlineAt" IS NOT NULL AND "status" <> 'NO_SUBMISSION_REQUIRED')
  ),
  CONSTRAINT "KsefSpecialModeRecord_qr_evidence_contract" CHECK (
    NOT "qrRequiredBeforeSubmit"
    OR ("offlineQrPayloadHash" IS NOT NULL AND "offlineCertificateFingerprint" IS NOT NULL AND "certificateQrPayloadHash" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "KsefSpecialModeRecord_documentId_key" ON "KsefSpecialModeRecord"("documentId");
CREATE UNIQUE INDEX "KsefSpecialModeRecord_complianceRequestId_key" ON "KsefSpecialModeRecord"("complianceRequestId");
CREATE INDEX "KsefSpecialModeRecord_shopId_status_submissionDeadlineAt_idx" ON "KsefSpecialModeRecord"("shopId", "status", "submissionDeadlineAt");
CREATE INDEX "KsefSpecialModeRecord_shopId_mode_issuedAt_idx" ON "KsefSpecialModeRecord"("shopId", "mode", "issuedAt");

ALTER TABLE "KsefSpecialModeRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KsefSpecialModeRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY "KsefSpecialModeRecord_tenant_policy" ON "KsefSpecialModeRecord"
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));

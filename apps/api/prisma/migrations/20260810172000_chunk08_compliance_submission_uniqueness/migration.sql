-- Gate 08: one external submission operation per immutable fiscal document.
-- Corrections/refunds are separate ComplianceDocument rows and therefore have their own operation.
CREATE UNIQUE INDEX "ComplianceRequest_document_adapter_operation_key"
  ON "ComplianceRequest"("documentId", "adapter", "operation");

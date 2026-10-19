-- T-009 Change A only. No changes to print dispatch, payment or ledger.
CREATE TYPE "PrintIncidentOutcome" AS ENUM ('CONFIRMED_PRINTED', 'CONFIRMED_NOT_PRINTED', 'UNDETERMINED');
CREATE TYPE "PrintIncidentState" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CONFLICT');
CREATE UNIQUE INDEX "PrintJob_shopId_id_key" ON "PrintJob"("shopId", "id");

CREATE TABLE "PrintIncidentCase" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "shopId" TEXT NOT NULL,
 "originalPrintJobId" TEXT NOT NULL,
 "state" "PrintIncidentState" NOT NULL DEFAULT 'OPEN',
 "physicalOutcome" "PrintIncidentOutcome",
 "version" INTEGER NOT NULL DEFAULT 1,
 "openedById" TEXT,
 "decidedById" TEXT,
 "reason" TEXT,
 "resolvedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PrintIncidentCase_originalPrintJob_fkey" FOREIGN KEY ("shopId","originalPrintJobId") REFERENCES "PrintJob"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PrintIncidentCase_version_check" CHECK ("version" >= 1),
 CONSTRAINT "PrintIncidentCase_resolution_check" CHECK (
   ("state" = 'RESOLVED' AND "physicalOutcome" IN ('CONFIRMED_PRINTED','CONFIRMED_NOT_PRINTED') AND "resolvedAt" IS NOT NULL)
   OR ("state" <> 'RESOLVED' AND "resolvedAt" IS NULL)
 )
);
CREATE UNIQUE INDEX "PrintIncidentCase_shopId_originalPrintJobId_key" ON "PrintIncidentCase"("shopId", "originalPrintJobId");
CREATE UNIQUE INDEX "PrintIncidentCase_shopId_id_key" ON "PrintIncidentCase"("shopId", "id");
CREATE UNIQUE INDEX "PrintIncidentCase_shopId_id_originalPrintJobId_key" ON "PrintIncidentCase"("shopId", "id", "originalPrintJobId");
CREATE INDEX "PrintIncidentCase_shopId_state_createdAt_idx" ON "PrintIncidentCase"("shopId", "state", "createdAt");

CREATE TABLE "PrintIncidentEvent" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "shopId" TEXT NOT NULL,
 "caseId" TEXT NOT NULL,
 "originalPrintJobId" TEXT NOT NULL,
 "kind" TEXT NOT NULL,
 "actorUserId" TEXT,
 "actorMembershipId" TEXT,
 "reason" TEXT NOT NULL,
 "evidence" JSONB,
 "physicalOutcome" "PrintIncidentOutcome",
 "correlationId" TEXT,
 "idempotencyKey" TEXT,
 "requestHash" TEXT,
 "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PrintIncidentEvent_case_fkey" FOREIGN KEY ("shopId","caseId","originalPrintJobId") REFERENCES "PrintIncidentCase"("shopId","id","originalPrintJobId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PrintIncidentEvent_reason_check" CHECK (char_length(trim("reason")) BETWEEN 8 AND 1000)
);
CREATE UNIQUE INDEX "PrintIncidentEvent_shopId_caseId_idempotencyKey_key" ON "PrintIncidentEvent"("shopId","caseId","idempotencyKey");
CREATE INDEX "PrintIncidentEvent_shopId_originalPrintJobId_occurredAt_idx" ON "PrintIncidentEvent"("shopId","originalPrintJobId","occurredAt");
CREATE INDEX "PrintIncidentEvent_shopId_caseId_occurredAt_idx" ON "PrintIncidentEvent"("shopId","caseId","occurredAt");

-- Immutable even against ORM update/delete attempts; only superuser/DB owner migration can alter trigger.
CREATE FUNCTION "t009_reject_print_incident_event_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PRINT_INCIDENT_EVENT_IMMUTABLE' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "t009_print_incident_event_append_only"
BEFORE UPDATE OR DELETE ON "PrintIncidentEvent"
FOR EACH ROW EXECUTE FUNCTION "t009_reject_print_incident_event_mutation"();

-- An incident is permanently bound to its original tenant and physical job.
CREATE FUNCTION "t009_reject_case_identity_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."id" <> OLD."id" OR NEW."shopId" <> OLD."shopId"
    OR NEW."originalPrintJobId" <> OLD."originalPrintJobId" THEN
  RAISE EXCEPTION 'PRINT_INCIDENT_CASE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "t009_print_incident_case_identity"
BEFORE UPDATE ON "PrintIncidentCase"
FOR EACH ROW EXECUTE FUNCTION "t009_reject_case_identity_mutation"();

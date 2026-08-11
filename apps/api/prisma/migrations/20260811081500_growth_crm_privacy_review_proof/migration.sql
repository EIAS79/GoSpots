-- Chunk 18 completion: verified-visit review linkage and CRM-aware privacy erasure.
ALTER TABLE "ReviewVisitProof" ADD COLUMN "reviewId" TEXT;
CREATE UNIQUE INDEX "ReviewVisitProof_reviewId_key" ON "ReviewVisitProof"("reviewId");
CREATE INDEX "ReviewVisitProof_shopId_visitId_idx" ON "ReviewVisitProof"("shopId","visitId");

-- Keep CRM PII aligned with the existing guest erasure/DSAR paths without
-- duplicating password-confirmation or DSAR authorization logic in Growth.
CREATE OR REPLACE FUNCTION gospots_redact_crm_customer_email(
  p_shop_id TEXT,
  p_email TEXT
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  customer_ids TEXT[];
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg("id"), ARRAY[]::TEXT[])
    INTO customer_ids
  FROM "CustomerProfile"
  WHERE "shopId" = p_shop_id
    AND lower("email") = lower(p_email);

  IF cardinality(customer_ids) = 0 THEN
    RETURN;
  END IF;

  DELETE FROM "CustomerIdentity"
  WHERE "shopId" = p_shop_id
    AND "customerId" = ANY(customer_ids);

  UPDATE "CustomerProfile"
  SET "name" = '[redacted]',
      "email" = NULL,
      "phone" = NULL,
      "marketingConsentAt" = NULL,
      "consentSource" = NULL,
      "notes" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "shopId" = p_shop_id
    AND "id" = ANY(customer_ids);
END;
$$;

CREATE OR REPLACE FUNCTION gospots_redact_crm_from_guest_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."guestEmail" IS NOT NULL
     AND NEW."guestEmail" IS NULL
     AND NEW."guestName" = '[redacted]' THEN
    PERFORM gospots_redact_crm_customer_email(NEW."shopId", OLD."guestEmail");
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Reservation_crm_privacy_sync" ON "Reservation";
CREATE TRIGGER "Reservation_crm_privacy_sync"
AFTER UPDATE OF "guestEmail", "guestName" ON "Reservation"
FOR EACH ROW EXECUTE FUNCTION gospots_redact_crm_from_guest_row();

DROP TRIGGER IF EXISTS "EventRequest_crm_privacy_sync" ON "EventRequest";
CREATE TRIGGER "EventRequest_crm_privacy_sync"
AFTER UPDATE OF "guestEmail", "guestName" ON "EventRequest"
FOR EACH ROW EXECUTE FUNCTION gospots_redact_crm_from_guest_row();

DROP TRIGGER IF EXISTS "GuestChat_crm_privacy_sync" ON "GuestChat";
CREATE TRIGGER "GuestChat_crm_privacy_sync"
AFTER UPDATE OF "guestEmail", "guestName" ON "GuestChat"
FOR EACH ROW EXECUTE FUNCTION gospots_redact_crm_from_guest_row();

DROP TRIGGER IF EXISTS "ContactMessage_crm_privacy_sync" ON "ContactMessage";
CREATE TRIGGER "ContactMessage_crm_privacy_sync"
AFTER UPDATE OF "guestEmail", "guestName" ON "ContactMessage"
FOR EACH ROW EXECUTE FUNCTION gospots_redact_crm_from_guest_row();

DROP TRIGGER IF EXISTS "VenueReview_crm_privacy_sync" ON "VenueReview";
CREATE TRIGGER "VenueReview_crm_privacy_sync"
AFTER UPDATE OF "guestEmail", "guestName" ON "VenueReview"
FOR EACH ROW EXECUTE FUNCTION gospots_redact_crm_from_guest_row();

-- Closing an ERASURE DSAR also guarantees that a CRM-only profile (one with no
-- legacy booking/contact row) is redacted. ACCESS requests are never mutated.
CREATE OR REPLACE FUNCTION gospots_redact_crm_from_closed_dsar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status"::text = 'CLOSED'
     AND OLD."status"::text <> 'CLOSED'
     AND NEW."type"::text = 'ERASURE' THEN
    PERFORM gospots_redact_crm_customer_email(NEW."shopId", NEW."guestEmail");
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "GuestDsarRequest_crm_privacy_sync" ON "GuestDsarRequest";
CREATE TRIGGER "GuestDsarRequest_crm_privacy_sync"
AFTER UPDATE OF "status" ON "GuestDsarRequest"
FOR EACH ROW EXECUTE FUNCTION gospots_redact_crm_from_closed_dsar();

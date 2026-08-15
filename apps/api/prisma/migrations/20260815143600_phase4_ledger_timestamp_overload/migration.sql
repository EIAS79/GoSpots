-- Phase 4 runtime hardening.
-- Trigger expressions such as COALESCE(row_timestamp, CURRENT_TIMESTAMP) resolve to
-- TIMESTAMPTZ in PostgreSQL. Keep the canonical LedgerEntry timestamp column in UTC
-- timestamp semantics while accepting those trigger inputs explicitly.
CREATE OR REPLACE FUNCTION gospots_phase4_post_fact(
  p_shop_id TEXT,
  p_currency TEXT,
  p_amount NUMERIC,
  p_kind "LedgerKind",
  p_channel "LedgerChannel",
  p_source_type "LedgerSourceType",
  p_source_id TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_created_by TEXT,
  p_guest_check_id TEXT,
  p_fact_type TEXT,
  p_reference_type TEXT,
  p_reference_id TEXT,
  p_settlement_id TEXT,
  p_metadata JSONB DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM gospots_phase4_post_fact(
    p_shop_id,
    p_currency,
    p_amount,
    p_kind,
    p_channel,
    p_source_type,
    p_source_id,
    (p_occurred_at AT TIME ZONE 'UTC')::timestamp,
    p_created_by,
    p_guest_check_id,
    p_fact_type,
    p_reference_type,
    p_reference_id,
    p_settlement_id,
    p_metadata
  );
END $$;

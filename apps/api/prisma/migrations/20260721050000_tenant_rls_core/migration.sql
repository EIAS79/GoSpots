-- Bible #3 / GO_SPOTS_RLS.md — Phase 2 core Tier A shop-scoped RLS (on disk; Neon deploy = operator).
--
-- Policy posture (safe gradual enable):
--   • Empty / unset app.rls_mode → ALLOW (migration + default TENANT_RLS=off stay compatible).
--   • app.rls_mode = bypass | system → ALLOW.
--   • app.rls_mode IN (tenant, public_insert) → row.shopId must equal app.current_shop_id.
-- App sets SET LOCAL via withTenantRls / TenantRlsInterceptor when TENANT_RLS=on.
--
-- FORCE ROW LEVEL SECURITY so table owners are subject to policies (Prisma role).

CREATE OR REPLACE FUNCTION app_tenant_rls_ok("shopId" text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(current_setting('app.rls_mode', true), '') = ''
    OR current_setting('app.rls_mode', true) IN ('bypass', 'system')
    OR (
      current_setting('app.rls_mode', true) IN ('tenant', 'public_insert')
      AND "shopId" IS NOT NULL
      AND "shopId" = NULLIF(current_setting('app.current_shop_id', true), '')
    );
$$;

-- Core / hot Tier A tables with direct shopId (Phase 2 + adjacent mutator surface).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Reservation',
    'ShopOrder',
    'Transaction',
    'PlaySession',
    'MenuItem',
    'MenuSection',
    'GalleryItem',
    'StoredImage',
    'Membership',
    'Resource',
    'ResourceCategory',
    'EventRequest',
    'VenueReview',
    'GuestChat',
    'Notification',
    'AuditLog',
    'OpeningHour',
    'ScheduleException',
    'ContactMessage',
    'ShopNote',
    'GamingSection',
    'DiningTableGroup',
    'SeatingTableGroup',
    'ShopLoss',
    'AnalyticsEvent',
    'ShopTag',
    'Subscription',
    'IdempotencyReceipt'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    -- Skip tables that were historically created via db push and are missing from migrate history.
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         FOR ALL
         USING (app_tenant_rls_ok("shopId"))
         WITH CHECK (app_tenant_rls_ok("shopId"))',
      t || '_tenant_isolation',
      t
    );
  END LOOP;
END $$;

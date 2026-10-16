-- CANDIDATE ONLY. NOT A PRISMA MIGRATION. DO NOT RUN AGAINST SHARED/STAGING/PRODUCTION.
-- In a disposable PostgreSQL 17 database named gospots_rls_ci_*:
-- In a separate setup command, set SESSION-scope gate using:
-- SELECT set_config('app.w1_rls_ci_authorized', 'I_UNDERSTAND_DISPOSABLE_ONLY', false);
-- Then run THIS FILE (it owns its own transaction) after provisioning test roles.
-- This script itself is not approved as production DDL.
BEGIN;
DO $guard$
BEGIN
  IF current_database() !~ '^gospots_rls_ci_[a-z0-9_]+$'
     OR current_setting('app.w1_rls_ci_authorized', true) IS DISTINCT FROM 'I_UNDERSTAND_DISPOSABLE_ONLY'
  THEN
    RAISE EXCEPTION 'Refusing fail-closed prototype outside explicit disposable CI database';
  END IF;
END;
$guard$;

-- Even an intentionally privileged mode is denied unless the DB role is a
-- member of the designated non-login role. Those roles must be provisioned
-- and reviewed separately. A session GUC must NEVER grant itself privilege.
CREATE OR REPLACE FUNCTION app_tenant_rls_ok("shopId" text)
RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT CASE
    WHEN current_setting('app.rls_mode', true) IN ('tenant', 'public_insert') THEN
      "shopId" IS NOT NULL
      AND NULLIF(current_setting('app.current_shop_id', true), '') IS NOT NULL
      AND "shopId" = NULLIF(current_setting('app.current_shop_id', true), '')
    WHEN current_setting('app.rls_mode', true) = 'system' THEN
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gospots_rls_worker')
        THEN pg_has_role(current_user, 'gospots_rls_worker', 'member')
        ELSE false END
    WHEN current_setting('app.rls_mode', true) = 'bypass' THEN
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gospots_rls_admin')
        THEN pg_has_role(current_user, 'gospots_rls_admin', 'member')
        ELSE false END
    ELSE false
  END;
$fn$;
COMMIT;

-- REQUIRE: a disposable PG17 database with two seeded tenant rows (one each
-- under shop-a and shop-b) in a shop-scoped financial table. Never use prod.
-- Run the candidate migration with the guard set at SESSION scope by the test
-- runner (not SET LOCAL before BEGIN, which would disappear on transaction end).
-- Assertions use anonymous DO blocks and raise on any bad result.
-- The setup must GRANT test role SELECT on chosen tenant table, enable and
-- FORCE RLS, and ensure the connection is not superuser/BYPASSRLS.
BEGIN;
SELECT set_config('app.rls_mode', '', true);
SELECT set_config('app.current_shop_id', '', true);
DO $test$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "Payment";
  IF n <> 0 THEN RAISE EXCEPTION 'RLS fail-closed violation: missing context saw % payments', n; END IF;
END $test$;
SELECT set_config('app.rls_mode', 'tenant', true);
SELECT set_config('app.current_shop_id', 'shop-a', true);
DO $test$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "Payment" WHERE "shopId" <> 'shop-a';
  IF n <> 0 THEN RAISE EXCEPTION 'RLS foreign read violation'; END IF;
END $test$;
ROLLBACK;
-- An independent connection from the same pool must have no residual context;
-- assert again with mode/current_shop_id unset in a SECOND physical session.

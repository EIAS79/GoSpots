-- Chunks 11–15 tenant isolation hardening.
-- Keep the same posture as 20260721050000_tenant_rls_core: the application
-- controls enforcement through app.rls_mode/app.current_shop_id, while every
-- direct shop-scoped row is protected when tenant mode is enabled.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'OperationsRatePlan',
    'SessionGroup',
    'OperationsSession',
    'OperationsSessionPause',
    'SessionResourceLink',
    'ResourceMaintenancePeriod',
    'ResourceStateEvent',
    'MenuModifierGroup',
    'MenuModifier',
    'MenuItemModifierGroup',
    'MenuItemVariant',
    'MenuItemCommerceProfile',
    'VenueOrder',
    'VenueOrderLine',
    'OrderLineModifier',
    'PrepStation',
    'PrepRoute',
    'PrepTicket',
    'PrepTicketLine',
    'PrepStatusEvent',
    'PrepDisplayDevice',
    'InventoryProfile',
    'InventoryLocation',
    'StockCategory',
    'StockItem',
    'Supplier',
    'Recipe',
    'RecipeComponent',
    'StockMovement',
    'PurchaseOrder',
    'PurchaseOrderLine',
    'GoodsReceipt',
    'GoodsReceiptLine',
    'Stocktake',
    'StocktakeLine',
    'StockTransfer',
    'LegacyInventoryMapping',
    'JobRole',
    'EmployeeRate',
    'ScheduleEntry',
    'TimePunch',
    'BreakRecord',
    'TimeAdjustment'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
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

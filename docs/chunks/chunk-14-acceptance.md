# Chunk 14 — Inventory, Recipes and Purchasing

Status: IMPLEMENTED_ON_FEATURE_BRANCH

## Delivered
- Inventory mode profile keeps the new ledger disabled by default and preserves legacy `MenuItem.stock` dual mode.
- Generic locations, stock categories/items, suppliers, recipes/components, purchase orders, goods receipts, stocktakes and transfers.
- `StockMovement` is append-only and is the sole stock-balance source of truth; dashboard balances are projections of movement sums.
- Recipe consumption posts deterministic idempotent sale movements when an order is completed.
- Pre-completion cancellation posts no movement. Post-completion refund/reversal posts equal and opposite `SALE_REVERSAL` movements; originals are never deleted.
- Waste/loss is an explicit negative movement.
- Goods receipts update weighted-average unit cost and post receipt movements.
- Stocktake stores expected/count/variance and posts only the adjustment movement.
- Transfers post paired OUT/IN movements.
- COGS report uses snapshotted movement cost, with gross-margin projection against completed order revenue.
- Stock items are generic and can represent food, drink, cue chalk, controllers, headsets or retail accessories.

## Gate 14
- [x] Order completion consumes recipe correctly and idempotently.
- [x] Cancellation/refund movement policy is explicit and reversible without history mutation.
- [x] Stocktake posts adjustments.
- [x] Purchasing updates weighted average cost.
- [x] COGS report.
- [x] Simple gaming venue does not need Inventory enabled.

Full branch CI is required before final completion sign-off.

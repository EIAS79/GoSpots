# Chunk 14 — Inventory, Recipes and Purchasing

Status: COMPLETE_ON_UNMERGED_REVIEW_BRANCH

## Delivered
- Inventory 2.0 starts disabled; `LegacyInventoryMapping` provides the explicit mapping/migration bridge while legacy `MenuItem.stock` remains available in dual mode.
- Optional mapping seeding posts an idempotent `LEGACY_OPENING` movement from legacy stock; it never mutates ledger history.
- Locations, stock categories/items, suppliers, recipes/components, purchase orders, receipts, stocktakes and transfers.
- `StockMovement` is append-only and is the sole stock-balance source of truth.
- Order completion and recipe consumption are atomic and deterministic/idempotent.
- Pre-completion cancellation posts no movement; completed refund/reversal posts equal/opposite `SALE_REVERSAL` rows.
- Waste/loss is explicit negative movement; receipts update weighted-average cost; stocktakes post only variance; transfers post paired OUT/IN.
- COGS uses snapshotted movement cost and excludes fully refunded orders from recognized order revenue.
- Stock items remain generic for food, drink and gaming/retail accessories.

## Gate 14
- [x] order completion consumes recipe correctly.
- [x] cancellation/refund policy defined.
- [x] stocktake posts adjustments.
- [x] purchasing updates weighted average cost.
- [x] COGS report.
- [x] simple gaming venue does not need Inventory enabled.

This PR is intentionally unmerged. Exact-head CI must remain green before merge is ever requested.

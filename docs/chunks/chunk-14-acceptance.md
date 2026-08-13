# Chunk 14 — Inventory, Recipes and Purchasing

Status: **ENGINEERING COMPLETE / OPERATIONAL PILOT OPEN**

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

## Repository Gate 14
- [x] order completion consumes recipe correctly.
- [x] cancellation/refund policy defined.
- [x] stocktake posts adjustments.
- [x] purchasing updates weighted average cost.
- [x] COGS report.
- [x] simple gaming venue does not need Inventory enabled.

## Phase 4 operational acceptance still required
- [ ] receive a real/pilot purchase order;
- [ ] record goods receipt;
- [ ] observe recipe consumption from a completed order;
- [ ] exercise the documented refund/cancel inventory policy;
- [ ] post waste/loss;
- [ ] perform a stocktake adjustment;
- [ ] reconcile weighted-average cost and COGS against the pilot records;
- [ ] validate movement/report behavior against representative production-scale stock data.

The engineering work is present on `main`. Chunk 14 must not be represented as operationally piloted until the Phase 4 evidence above is captured.

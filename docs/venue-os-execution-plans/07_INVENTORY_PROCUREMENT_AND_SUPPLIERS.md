# 07 — Inventory, Recipes, Purchasing, Goods Receipts and Supplier Control

**Classification:** P7 `COVERED_VERIFY_DEPTH`; invoice matching, lot/expiry and supplier financial liabilities `NEW_SCOPE_CANDIDATE` | **Priority:** P0 for inventory claims in a launched venue, P1 for complete back office.

## Baseline, risks and scope

Master P7 expressly includes stock movements, recipes, wastage, suppliers, purchasing, receiving, transfers, stocktake, costing, negative-stock controls and conservation testing. Current source has meaningful inventory tests/CI; no proof that every real SKU and recipe scenario was physically audited. New required completeness for an operator attempting to replace spreadsheets: supplier bills, purchase-to-pay evidence, expiry/lot tracking where food types demand it, accurate valuation, purchasing approvals, returns and procurement visibility. These items require checking existing models first.

## Canonical object/financial relationships

`StockItem` + unit/pack conversions + valuation policy, `Location`, `StockMovement` immutable quantity journal, `Supplier`, `PurchaseOrder` versioned lines, `GoodsReceipt` immutable receipt facts, `SupplierInvoice` external legal invoice/evidence, `ReturnToSupplier`, `StocktakeAdjustment`, `Waste`, `RecipeConsumption`, `Transfer` and `CostLayer`/valuation. Keep physical stock, purchase commitments, tax documents, amount payable, inventory asset value and cash payments separate. One supplier invoice is not automatically one delivery; permit partial fulfillment and many-to-many line allocation only with constraints.

## Engineering tasks

1. **Catalog hygiene:** approved units `piece, g, kg, ml, l` and conversion edges; no quantity rounding drift from binary floats; tax/category/stock tracked policies; packaging and supplier SKU; per-location thresholds and reorder points.
2. **Approval purchase order:** draft, authorized, sent, partially received, fulfilled, canceled; supervisor authority and spend limit by currency. Send vendor orders via communication outbox with copy/recipient proof; prevent duplicate ordering after retry.
3. **Goods receiving:** compare delivered vs ordered quantity, quality and price; accept/short/over/return with reason; post inventory only for accepted goods; scan invoice/delivery attachments and vendor lot/expiry where in scope. Do not retroactively rewrite a posted goods receipt—reverse and correct.
4. **Invoice matching:** link KSeF received invoice or scanned non-KSeF legal document to PO+goods receipts using purchase-order/receipt/invoice three-way match; flag price, amount, VAT and quantity discrepancies. Track due date and approved payable export; supplier payment execution is optional Tier C and must never be implied by a 'Paid' checkbox lacking bank evidence.
5. **Consumption:** generate deterministic recipe deduction by final production or service policy; handle ingredient substitution, yield loss, split portion and returned prepared food. Explicitly decide how offline order replay and wastage compete for stock. Each economic consumption event exactly once.
6. **Cycle counts and asset distinction:** count by aisle/bin/lot, blind count where applicable, supervisor-approved variance and movement reversal; equipment/table/cues as fixed assets or maintenance items (Plan 13), not edible stock. Cross-shop transfers must balance sender and receiver with in-transit status.
7. **Costing:** choose FIFO or weighted-average policy per SKU/location (or signed simpler standard), consistent receipts/wastage/transfers and adjustment book value. Historical COGS cannot be recomputed from today's vendor price. Display missing-cost/negative-stock explicitly.
8. **Traceability:** expiry/lot/serial tracking optional per item class; FEFO picking guidance for perishables; supplier recall report and disposal action. If no customer-level sale-lot mapping is possible, mark traceability limits clearly.

## Acceptance tests

- Two partial PO receipts + one disputed supplier invoice link without generating duplicate stock or payable.
- Partial return to supplier reduces stock and produces credit/claim history; original legal invoice preserved.
- Recipe consumption, cancel before production, cancel after production, waste and stocktake reconcile at shift close.
- Concurrent sell of last inventory unit enforces configured negative stock policy; no silent decrement below authorized threshold.
- Offline replay arrives after stocktake and transfer; movement history resolves or raises actionable conflict.
- Warehouse/shop transfer with source failure leaves in-transit, not received and available in both branches.
- Cost calculation and rounding preserve integer minor-unit value; multi-VAT purchase invoice line mismatches visible.

## Gate and artifacts

`inventory-and-value-conservation-evidence.md` required by R roadmap; also `purchase-to-pay-control-matrix.md`, `lot-expiry-recall-coverage.md`, supplier invoice reconciliation evidence. Acceptance requires both physical shelf count and automated conservation: opening stock + accepted receipts + transfers in − sales consumption − waste − transfers out ± approved adjustments = closing measured stock (with explicit shrinkage). Existing P7 source must be mapped line-by-line in R1; no automatic declaration of MISSING based on new proposal alone.

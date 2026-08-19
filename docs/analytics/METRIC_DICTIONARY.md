# GoSpots Analytics Metric Dictionary — Phase 14

**Contract version:** `phase14-metrics-v1-2026-08-19`

The executable dictionary is `apps/api/src/modules/growth/phase14-metric-dictionary.ts`. This document records the architectural rules that apply to every definition in that catalog.

## Authority

Analytics is a read model. It does not own revenue, payments, stock, reservations, stored value, staff actions or offline state.

Financial authority remains:

```text
GuestCheck / immutable commercial snapshots
  -> Settlement
  -> Payment / Refund
  -> LedgerEntry
  -> cash/provider/fiscal/KSeF/reconciliation projections
  -> analytics
```

`LedgerEntry` is the canonical source for realized sale/refund totals. Immutable `CheckSettlement`, `ChargeSnapshot`, `PricingSnapshot`, payment, cash, inventory, reservation, customer, workforce and operations facts explain the dimensions around those totals. No Phase 14 row creates a second revenue source.

## Time and business day

Every Phase 14 report accepts **venue business-date keys**, not raw UTC calendar dates. The API resolves those keys using `Shop.timezone` and `Shop.businessDayStartMinutes`, then queries a half-open UTC interval `[from, to)`.

This is intentional for venues operating after midnight. DST-forward and DST-backward days may contain 23 or 25 elapsed hours. Metrics normalize by the actual elapsed interval where their formula is time-based.

Comparisons must use equivalent business-day windows. Multi-location reports must keep each branch's business-day settings until the comparison layer; do not bucket every branch by one assumed UTC day.

## Refunds and corrections

Refunds are immutable new facts. They never rewrite the original sale. Gross sales preserve the original commercial value where defined; net sales explicitly subtract canonical refund ledger facts. Voids/comps/discounts are surfaced separately rather than hidden inside a single unexplained number.

## Tax

Tax is reported separately from immutable settlement/pricing snapshots. A KPI includes or excludes tax only according to its executable formula. The UI must not infer tax from a product's current catalog configuration.

## LTV limitation

`ltv_estimate` is deliberately named an **observed** lifetime-value estimate. It is historical settled `CustomerVisit` value up to the report end divided by distinct identified customers. It is descriptive and is not a predictive future-customer valuation model.

## Performance budgets

Phase 14 CI includes a production-sized calculation benchmark over 370,000 synthetic financial/resource facts. The current calculation-kernel budget is 5 seconds on the GitHub runner. This is a regression gate, not a promise that every database route completes in 5 seconds. Route/query optimization must be driven by measured production-like traces in later hardening work.

## Reconciliation Center

The Phase 14 center combines persisted Phase 5 `FinancialReconciliationIssue` records with live read-model diagnostics for:

- settled GuestCheck vs current Settlement;
- Settlement/Payment/Ledger and provider variance;
- cash shift variance;
- fiscal/KSeF unresolved work inherited from financial reconciliation;
- negative stored-value liability;
- negative inventory;
- failed/dead offline/Edge/sync domain events.

Every returned issue carries severity, amount where money-valued, affected entity references, first-seen/last-checked timestamps, a suggested next action and evidence links. Suggested actions are diagnostic guidance only; they do not perform high-risk mutations.

## Attention Center

The Attention Center is a cross-domain projection over reconciliation issues and selected operational exceptions such as low stock, high no-show rate and KDS SLA degradation. It is not a second alert source of truth; each item is derived from a canonical operational fact or reconciliation finding.

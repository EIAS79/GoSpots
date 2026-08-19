# GoSpots Phase 14 — Analytics, Reconciliation and Operational Intelligence

## Status

`IN_PROGRESS` until exact-head CI, merge, deployment and production verification are recorded.

## Source

GoSpots Master Product & Engineering Execution Plan v2 — Phase 14.

## Scope decisions

- Reuse `GrowthAnalyticsService` as the mature source for canonical finance, operations and customer analytic projections.
- Reuse Phase 5 `FinancialReconciliationRun/FinancialReconciliationIssue` as persisted reconciliation evidence.
- Add a Phase 14 owner read model rather than a second financial or inventory source of truth.
- No database schema change is required for Phase 14. Existing canonical and reconciliation schemas already contain the necessary facts. Consequently there is no Phase 14 migration; CI still deploys and validates the full clean migration chain.
- Preserve the pre-Phase-14 analytics workspace for backward compatibility and place the owner intelligence/reconciliation surface above it.

## Acceptance matrix

| Requirement | Evidence |
|---|---|
| Metric dictionary | `phase14-metric-dictionary.ts`, `docs/analytics/METRIC_DICTIONARY.md`, dictionary Jest gate |
| Financial KPIs | Phase14 owner service `financial()` over Ledger/Settlement/Payment/Cash/adjustment facts |
| Resource KPIs | Phase14 owner service `resources()` over canonical operations + opening/maintenance facts |
| Restaurant KPIs | `restaurant()` over VenueOrder/Line, GuestCheck profile, KDS and comp evidence |
| Inventory KPIs | `inventory()` over immutable StockMovement + StockItem costing configuration |
| Reservation KPIs | `reservations()` over Reservation/extension/deposit/waitlist/session facts |
| Customer KPIs | `customers()` over CustomerVisit, CustomerMembership, loyalty and stored-value ledgers |
| Workforce KPIs | `workforce()` over TimePunch, StaffActionEvidence, CashSession and operator sales |
| Reconciliation Center | persisted Phase 5 reconciliation + Phase 14 live invariants with evidence/action metadata |
| Attention Center | owner UI + cross-domain derived attention items |
| Performance | `phase14-performance-benchmark.ts` CI gate over 370k synthetic facts |
| DST/business day | `phase14-business-day.spec.ts` proves Warsaw spring/fall DST, 04:00 overnight boundary and different branch settings |
| Same-event consistency | `phase14-integrity-assert.ts` creates one cash sale and proves checkout=payment=ledger=cash plus tenant isolation |
| Empty/large range | API supports 1..370 venue business dates; empty datasets return zero/null projections without inventing totals |
| Tenant scope | every Phase 14 database query derives `shopId` from authenticated `JwtAccessPayload`; integrity fixture proves cross-shop ledger fact exclusion |

## Security

- Endpoints require `JwtAuthGuard` and `report.read`.
- Client input never supplies a trusted shop/tenant ID.
- Phase 14 performs read-only analytics/reconciliation projection; no refund, cash, inventory, permission or financial correction is performed from analytics.

## Rollout and rollback

The change is schema-neutral. Rollback is application-only: revert the Phase 14 API/UI commits. No canonical business fact needs reversal and no database column/table is removed.

## Stop boundary

Phase 15 automation/AI is outside this work. Phase 14 may expose evidence that Phase 15 can consume later, but it does not execute rules, send notifications, or add AI behavior.

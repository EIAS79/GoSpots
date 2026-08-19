# Phase 17 — Pilot, Certification, Go-Live and Release Requirements Matrix

**Source:** GoSpots Master Product & Engineering Execution Plan v2 — Phase 17  
**Baseline main:** `fe00ea5e4155ce79dd909903abfc7e094540795d` (Phase 17 software release-gate merge)  
**Continuation branch:** `phase-17-adyen-certification`

Phase 17 is a release-certification phase. It reuses the canonical operational and financial authorities from Phases 1–16; it must not create a pilot-only transaction path.

## Status model

- `AUTOMATED_GATE` — executable in CI against production-like isolated infrastructure.
- `PRODUCTION_GATE` — executable after merge against deployed GoSpots components.
- `BLOCKED_EXTERNAL` — requires a real provider, marketed hardware, physical venue operation or professional legal/accounting sign-off.

## Provider decision

- **Adyen Terminal API** is the Phase 17 venue/customer card-present certification target.
- **Stripe Billing** remains the separate GoSpots SaaS subscription/features billing provider. Stripe subscription state is not a GuestCheck, checkout, venue-payment, settlement or ledger authority.
- Existing provider-neutral `PaymentConnector`/`PaymentOperation` contracts remain canonical, so future venue-payment providers can be added without replacing checkout authority.

## Step 17.1 — Pilot profiles

| Pilot | Required workflow | Current reusable implementation | Phase 17 proof |
| --- | --- | --- | --- |
| Pilot A — Billiard/gaming | 8–20 resources represented by realistic seeded floor; timed sessions; rate snapshot; F&B; reservation; cash/card; membership/value foundations; closeout | Operations + GuestCheck + ordering + reservations + payment/cash + growth modules | Phase 17 permanent Playwright gate plus canonical persisted-state assertions; seed permanently asserts 8–20 billiard resources. Physical full-day venue operation remains external. |
| Pilot B — Restaurant/bar | floor; KDS; split checks; cash/card; service economics; inventory; closeout | Restaurant Phase 6, commercial Phase 4, inventory Phase 7, cash/payment Phase 5 | Permanent restaurant/KDS/checkout regressions and closeout financial contracts. Physical kitchen/device shift remains external. |
| Pilot C — Mixed venue | timed resources + restaurant/bar; shared GuestCheck; reservation; multiple-device/offline continuity | Mixed E2E, Phase 12 Edge continuity, canonical GuestCheck | Permanent mixed path plus Offline Lite/conflict and Edge hard-outage/printing drills. Physical Edge/multi-device venue drill remains external. |

## Step 17.2 — Opening checklist

| Requirement | Proof class | Current Phase 17 state |
| --- | --- | --- |
| Venue profile / tax-fiscal profile / users | AUTOMATED_GATE | Existing setup/auth/compliance implementation; seeded in release database. |
| Floor / resources / rates | AUTOMATED_GATE | Existing Phase 2/3 implementation and pilot fixtures. |
| Menu / inventory opening state | AUTOMATED_GATE + BLOCKED_EXTERNAL | Software state represented; physical stock count requires venue drill. |
| Devices / printers / KDS / terminal | AUTOMATED_GATE + BLOCKED_EXTERNAL | Durable device/print/KDS contracts and Adyen adapter tests exist; marketed physical models must be certified. |
| Adyen provider readiness | AUTOMATED_GATE + BLOCKED_EXTERNAL | Connector readiness validates configuration and Cloud Device API reachability; test merchant/API key/HMAC/test terminal remain external until provisioned. |
| Opening float / cash controls | AUTOMATED_GATE | Cash service and cash-close tests included in Phase 17 gate. |
| Backup verified | AUTOMATED_GATE | Independent PostgreSQL 17 `pg_dump`/`pg_restore` drill rerun on the exact Phase 17 head. |

## Step 17.3 — Busy-shift simulation

| Scenario | Phase 17 evidence |
| --- | --- |
| Simultaneous timed/session operations and resource moves | Gaming + existing operations concurrency tests in normal CI. |
| Reservation arrival / waitlist / capacity conflicts | Existing reservation/waitlist implementation and full API regression; mixed reservation E2E. |
| Product orders / kitchen load | Restaurant KDS E2E. |
| Split checks / mixed tender | Gaming, restaurant, mixed and checkout E2E. |
| Cash/card | Cash-close contracts plus fake card E2E. Adyen adapter tests cover request shape, success/decline/UNKNOWN semantics; real terminal remains external. |
| Payment timeout/UNKNOWN | Adyen connector stores the original SaleID/ServiceID/POIID identity and uses TransactionStatus instead of blind retry. |
| Refund | Adyen referenced ReversalRequest remains PROCESSING until webhook outcome; duplicate events are idempotent; late `REFUND_FAILED` / `REFUNDED_REVERSED` restore net payment state through reconciliation. Real provider refund remains external. |
| Discount approval / high-risk attribution | Workforce accountability E2E plus permission regressions. |
| Printer failure | Edge print continuity regression. Real marketed printer is external. |
| Temporary internet outage | Offline Lite browser paths plus Phase 12 full-outage Edge drill. Physical LAN/Edge outage remains external. |

## Step 17.4 — Day close

Phase 17 automated evidence covers:

- settled/open check visibility through existing checkout flows;
- cash count, expected amount and variance through cash close tests;
- payment and refund authority through the normal API suite, Adyen adapter/reconciliation tests and canonical reconciliation assertion;
- fiscal/KSeF exceptions as explicit unresolved states, never silently hidden;
- inventory exception visibility through existing inventory tests;
- staff attribution through Phase 10 E2E;
- canonical money reconciliation via `prisma/phase14-integrity-assert.ts`.

A literal staffed venue full-day close without a shadow spreadsheet/POS is a physical pilot gate and cannot be fabricated in CI.

## Step 17.5 — External certifications

All applicable items below remain `BLOCKED_EXTERNAL` until evidence exists:

1. **Adyen real/test-terminal certification:** success, decline, timeout/UNKNOWN, TransactionStatus recovery, cancel, referenced refund, duplicate webhook, late refund exception handling where testable and final provider reconciliation;
2. supported fiscal printer/provider: issue, outage, retry and reconcile;
3. KSeF TEST and DEMO/pre-production with permitted credentials/certificates, FA(3), KSeF number/UPO, duplicate/UNKNOWN/correction and applicable special-mode evidence;
4. marketed hardware matrix for printers, scanners, KDS, terminal, Edge host and access hardware where sold;
5. physical Edge outage/restart/reconnect drill with representative devices;
6. physical KDS screen and printer routing drill;
7. physical inventory receiving/sale/waste/stocktake reconciliation drill;
8. Polish accountant/tax/legal validation of the marketed fiscal/KSeF scope;
9. design-partner/pilot venue full-day operation without a shadow spreadsheet or POS;
10. exact merged web revision deployed and smoke/runtime verified in production.

## Step 17.6 — Release tiers

The operational runbook defines enforced progression:

`Internal -> Design partner -> Limited production -> General availability`

General availability is prohibited while any applicable Gate P17 external certification is unresolved.

## Step 17.7 — Rollback

Every release must have:

- backward-compatible migration status confirmed before rollout;
- feature/capability disable path for new operational behavior;
- application rollback procedure;
- explicit correction/reconciliation procedure for already-committed business facts that cannot be deleted by rollback.

## Gate P17

| Gate item | Proof owner |
| --- | --- |
| Critical E2E green | Phase 17 + repository CI |
| Clean and representative-upgrade migrations green | repository CI; revalidated by exact-head CI |
| Multi-tenant/security tests green | repository full API/security CI |
| Money reconciliation green | Phase 17 canonical integrity assertion |
| Adyen software adapter semantics | Phase 17 permanent connector/webhook tests |
| Real Adyen account/terminal evidence | BLOCKED_EXTERNAL |
| Offline-certified software workflows green | Phase 17 Edge + browser outage tests |
| Hardware evidence | BLOCKED_EXTERNAL |
| Fiscal/KSeF marketed-scope evidence | BLOCKED_EXTERNAL |
| DR restore drill | Phase 17 independent logical restore |
| Performance target | Phase 17 Phase-14 benchmark rerun + Phase 16 regression |
| Runbook complete | Phase 17 release-contract job |
| No unresolved critical/high production dependency issue | Phase 17 production dependency audit |
| Exact merged production deployment | PRODUCTION_GATE / currently unresolved |
| Full pilot day without shadow spreadsheet/POS | BLOCKED_EXTERNAL |

**Acceptance rule:** Phase 17 may reach `SOFTWARE_DONE / BLOCKED_EXTERNAL` when every executable software gate is green. It may reach `ACCEPTED` only after all applicable physical/provider/legal/pilot and production evidence above is recorded.

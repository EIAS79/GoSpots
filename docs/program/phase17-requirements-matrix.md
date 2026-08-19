# Phase 17 — Pilot, Certification, Go-Live and Release Requirements Matrix

**Source:** GoSpots Master Product & Engineering Execution Plan v2 — Phase 17  
**Baseline main:** `d379cd37c6e830a604fc96d15b9696690802d599` (Phase 16 merge)  
**Phase branch:** `phase-17-pilot-certification-go-live-v2`

Phase 17 is a release-certification phase. It must reuse the canonical operational and financial authorities from Phases 1–16; it must not create a pilot-only transaction path.

## Status model

- `AUTOMATED_GATE` — executable in CI against production-like isolated infrastructure.
- `PRODUCTION_GATE` — executable after merge against deployed GoSpots components.
- `BLOCKED_EXTERNAL` — requires a real provider, marketed hardware, physical venue operation or professional legal/accounting sign-off.

## Step 17.1 — Pilot profiles

| Pilot | Required workflow | Current reusable implementation | Phase 17 proof |
| --- | --- | --- | --- |
| Pilot A — Billiard/gaming | 8–20 resources represented by realistic seeded floor; timed sessions; rate snapshot; F&B; reservation; cash/card; membership/value foundations; closeout | Operations + GuestCheck + ordering + reservations + payment/cash + growth modules | Dedicated Phase 17 Playwright gate runs `gaming/golden-path.spec.ts`, checkout/accountability and canonical persisted-state assertions. Physical full-day venue operation remains external. |
| Pilot B — Restaurant/bar | floor; KDS; split checks; cash/card; service economics; inventory; closeout | Restaurant Phase 6, commercial Phase 4, inventory Phase 7, cash/payment Phase 5 | Dedicated Phase 17 Playwright gate runs `restaurant/restaurant-path.spec.ts`, KDS/order-to-check flow and closeout financial contracts. Physical kitchen/device shift remains external. |
| Pilot C — Mixed venue | timed resources + restaurant/bar; shared GuestCheck; reservation; multiple-device/offline continuity | Mixed E2E, Phase 12 Edge continuity, canonical GuestCheck | Dedicated Phase 17 Playwright mixed path plus Offline Lite/conflict and Edge hard-outage/printing drills. Physical Edge/multi-device venue drill remains external. |

## Step 17.2 — Opening checklist

| Requirement | Proof class | State before Phase 17 CI |
| --- | --- | --- |
| Venue profile / tax-fiscal profile / users | AUTOMATED_GATE | Existing setup/auth/compliance implementation; seeded in release database. |
| Floor / resources / rates | AUTOMATED_GATE | Existing Phase 2/3 implementation and pilot fixtures. |
| Menu / inventory opening state | AUTOMATED_GATE + BLOCKED_EXTERNAL | Software state represented; physical stock count requires venue drill. |
| Devices / printers / KDS / terminal | AUTOMATED_GATE + BLOCKED_EXTERNAL | Simulators and durable device/print/KDS contracts exist; marketed physical models must be certified. |
| Opening float / cash controls | AUTOMATED_GATE | Cash service and cash-close tests included in Phase 17 gate. |
| Backup verified | AUTOMATED_GATE | Independent PostgreSQL 17 `pg_dump`/`pg_restore` drill rerun on the exact Phase 17 head. |

## Step 17.3 — Busy-shift simulation

| Scenario | Phase 17 evidence |
| --- | --- |
| Simultaneous timed/session operations and resource moves | Gaming + existing operations concurrency tests in normal CI. |
| Reservation arrival / waitlist / capacity conflicts | Existing reservation/waitlist implementation and full API regression; mixed reservation E2E. |
| Product orders / kitchen load | Restaurant KDS E2E. |
| Split checks / mixed tender | Gaming, restaurant, mixed and checkout E2E. |
| Cash/card | Cash-close unit/service contracts plus simulated card methods in E2E. Real terminal is external. |
| Refund | Full API regression and Phase 5 financial authority; real provider refund is external. |
| Discount approval / high-risk attribution | Workforce accountability E2E plus permission regressions. |
| Printer failure | Edge print continuity regression. Real marketed printer is external. |
| Temporary internet outage | Offline Lite browser paths plus Phase 12 full-outage Edge drill. Physical LAN/Edge outage remains external. |

## Step 17.4 — Day close

Phase 17 automated evidence must cover:

- settled/open check visibility through existing checkout flows;
- cash count, expected amount and variance through cash close tests;
- payment and refund authority through the normal API suite plus reconciliation assertion;
- fiscal/KSeF exceptions as explicit unresolved states, never silently hidden;
- inventory exception visibility through existing inventory tests;
- staff attribution through Phase 10 E2E;
- canonical money reconciliation via `prisma/phase14-integrity-assert.ts`.

A literal staffed venue full-day close without a shadow spreadsheet/POS is a physical pilot gate and cannot be fabricated in CI.

## Step 17.5 — External certifications

All applicable items below remain `BLOCKED_EXTERNAL` until evidence exists:

1. supported real payment terminal/provider run: success, decline, timeout/UNKNOWN, reconcile, refund and duplicate callback;
2. supported fiscal printer/provider: issue, outage, retry and reconcile;
3. KSeF TEST and DEMO/pre-production with permitted credentials/certificates, FA(3), KSeF number/UPO, duplicate/UNKNOWN/correction and applicable special-mode evidence;
4. marketed hardware matrix for printers, scanners, KDS, terminal, Edge host and access hardware where sold;
5. physical Edge outage/restart/reconnect drill with representative devices;
6. physical KDS screen and printer routing drill;
7. physical inventory receiving/sale/waste/stocktake reconciliation drill;
8. Polish accountant/tax/legal validation of the marketed fiscal/KSeF scope;
9. design-partner/pilot venue full-day operation without a shadow spreadsheet or POS.

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
| Offline-certified software workflows green | Phase 17 Edge + browser outage tests |
| Hardware evidence | BLOCKED_EXTERNAL |
| Fiscal/KSeF marketed-scope evidence | BLOCKED_EXTERNAL |
| DR restore drill | Phase 17 independent logical restore |
| Performance target | Phase 17 Phase-14 benchmark rerun + Phase 16 regression |
| Runbook complete | Phase 17 release-contract job |
| No unresolved critical/high production dependency issue | Phase 17 production dependency audit |
| Full pilot day without shadow spreadsheet/POS | BLOCKED_EXTERNAL |

**Acceptance rule:** Phase 17 may reach `SOFTWARE_DONE / BLOCKED_EXTERNAL` when every executable software gate is green. It may reach `ACCEPTED` only after all applicable physical/provider/legal/pilot evidence above is recorded.
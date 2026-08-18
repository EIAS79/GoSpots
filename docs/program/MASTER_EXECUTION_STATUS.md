# GoSpots Master Execution Status

**Primary source:** GoSpots Master Product & Engineering Execution Plan v2  
**Status model:** `NOT_STARTED`, `IN_PROGRESS`, `SOFTWARE_DONE`, `BLOCKED_EXTERNAL`, `READY_FOR_ACCEPTANCE`, `ACCEPTED`, `DEFERRED`

This file maps the existing repository to the new Phase 0–17 program. It deliberately does **not** treat old chunk completion as automatic acceptance under the new plan. Existing code is evidence to reuse and re-audit in the appropriate v2 phase.

## Phase 0 baseline

- Phase 0 starting `main`: `f61c1b2f81eedb0ff7d5e67be4a62291c361c2bc`
- Phase 0 working branch: `phase-0-standalone-architecture-reset-v2`
- Phase 0 pull request: #40
- Product rule: GoSpots is standalone; generic integrations are optional extensions.
- Database migration required by Phase 0: **no**. The Phase 0 delta is code registration/UI/test cleanup plus architecture/program contracts.

## Repository reconciliation

### Active working branches inspected

| Branch | Classification | Phase 0 disposition |
| --- | --- | --- |
| `phase-4-external-operational-gates` | Mixed legacy-program branch | **MODIFY/EXTRACT** standalone connector cleanup; **DEFER** analytics scale test to Phase 14; do not merge legacy acceptance changes wholesale. |
| `phase-4-external-operational-certification` | Legacy branch at old baseline | **SUPERSEDED**; no Phase 0 implementation required from it. |
| `phase-0-standalone-architecture-reset-v2` | Current v2 Phase 0 branch | **KEEP** and complete through exact-head CI/merge/deployment. |

### Pull requests inspected

| PR | Classification | Phase 0 disposition |
| --- | --- | --- |
| #9 `Chunk 00: establish repository safety baseline` | Legacy draft superseded by later merged staged work/current `main` | **CLOSED UNMERGED** as superseded on 2026-08-14. |
| #7 `Add hourly pricing surcharge for gaming zones` | Old, diverged pricing feature | **DEFERRED** to v2 Phase 2 Rate Engine review; draft preserved, not merged into Phase 0. |
| #40 `Phase 0 v2: standalone architecture reset and baseline` | Current Phase 0 execution PR | **IN_PROGRESS** until exact-head CI/merge/deployment acceptance. |

## Existing implementation matrix

The `Code` column describes repository presence, not acceptance. `v2 status` is intentionally conservative until the phase is executed against the new source.

| Phase | Domain | Code baseline | Tests / E2E baseline | Migration baseline | Production / external state | v2 status / next action |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Baseline + standalone reset | Current branch removes the external-POS adapter/registration/UI assumption and adds canonical contracts. | Existing CI covers API/web/Edge/migrations/browser; Phase 0 adds a tracked-file standalone-boundary regression. | No new migration needed. One historical applied migration comment is intentionally immutable to avoid checksum drift. | Must pass exact-head CI, merge and production verification. | `IN_PROGRESS` — current phase. |
| 1 | Tenancy, auth, permissions, integrity | Canonical security/integrity kernel includes complete venue role/permission catalog, business-day boundaries, money allocation, immutable contextual audit, correlated consumer-idempotent events and tenant-scoped optimistic concurrency. | Exact-head and post-merge CI passed, including unit/property/security/integrity, clean/upgrade migration, browser, web and Edge suites. | `20260814090000_phase1_platform_kernel_v2` and `20260814130000_phase1_kernel_acceptance_hardening` are expand-only; clean, historical-upgrade and production assertions pass. | Final main `33246c762543712e420def14a583ce9b80403571` is live on Render and Vercel; Neon migration/data integrity, health, runtime logs and authenticated CSRF/settings/staff/audit acceptance passed. | `ACCEPTED` — Gate P1 passes; see `docs/acceptance/phase-1-platform-kernel-v2.md`. |
| 2 | Venue setup, floor, resources, rates, devices | Canonical venue profile, organization/branch defaults, zones/floors, versioned resources, complete server rate selection, immutable session snapshots, catalog extensions, device claim and 12-step readiness are integrated. Legacy PR #7 was inspected and superseded by the canonical rate implementation rather than merged. | Exact-head and post-merge CI passed: API/unit/security/concurrency, web, Edge, clean/upgrade migration and 13-case browser E2E. | `20260814150000_phase2_venue_setup_v2` is expand-first; clean, representative-upgrade and production constraint/index/tenant assertions pass. | Main `08558f1db815a781b7deda9c92d07e4650b6975f` is live on Render and Vercel; Neon migration, health, logs and a fresh no-SQL production venue drill passed with 12-step `operational=true`. | `ACCEPTED` — Gate P2 passes; see `docs/acceptance/phase-2-venue-setup-v2.md`. |
| 3 | Live operations, sessions, waitlist, floor | Operations/resource session engine and live/offline flows exist. | Operations tests plus gaming/mixed browser flows exist. | Operations migrations exist. | Prior production/offline validation exists, but v2 busy-floor gate not yet re-run. | `IN_PROGRESS`. |
| 4 | GuestCheck, orders, checkout, settlement, ledger | Canonical GuestCheck commercial spine, unified timed/product checkout, settlement, split allocations, adjustments, receipt and ledger fact authority are integrated; late-attached completed ShopOrders preserve GuestCheck ledger lineage without duplicate sale facts. | Exact-head and post-merge CI, dedicated Phase 4 validation, permanent browser E2E/persisted-state assertions, Phase 3 regression, standalone and Edge gates all pass. | Eight Phase 4 migrations through `20260816002000_phase4_shop_order_ledger_lineage` pass clean and representative-upgrade paths and are applied on production PostgreSQL 17 with no rollback. | Final accepted revision `ae7311b4e3cd2d649733fa55bf5ca7a37cd19d35` is live on Vercel; production Gate P4 run `31919110371` passed, and read-only Neon reconciliation proved `32.25 EUR` settlement = commercial ledger facts = successful payments = payment ledger facts with zero duplicate canonical fact keys. | `ACCEPTED` — Gate P4 passes; see `docs/acceptance/phase-4-commercial-core-v2.md`. |
| 5 | Payments, cash, refunds, invoices, fiscal, KSeF | Device-payment, cash and compliance/KSeF modules exist. | Payment/cash/compliance tests exist; provider simulators exist. | Device-payment/cash/compliance migrations exist. | Physical terminal/fiscal/KSeF/legal evidence remains phase-specific external work. | `IN_PROGRESS` — later may become `BLOCKED_EXTERNAL` after software audit. |
| 6 | Restaurant/bar/café operations | Ordering, kitchen/KDS and dining/menu foundations exist. | Ordering/kitchen tests and mixed browser flows exist. | Ordering/KDS migrations exist. | Physical KDS/printer venue acceptance not v2 certified. | `IN_PROGRESS`. |
| 7 | Inventory, recipes, purchasing, costing | Inventory-v2 and recipe/purchasing foundations exist. | Inventory service tests exist. | Inventory-v2 migrations exist. | Physical end-to-end stock drill not v2 certified. | `IN_PROGRESS`. |
| 8 | Reservations, deposits, waitlist, events | Reservation/growth capacity and public deposit flows exist. | Reservation/capacity/deposit tests exist. | Growth/deposit migrations exist. | Real deposit-provider roundtrip must be re-established under P8. | `IN_PROGRESS`. |
| 9 | Customers, membership, loyalty, packages, stored value | Phase 9 extends the canonical Growth domain with anonymous-first customer handling, consent provenance/preferences, membership lifecycle and usage ledgers, loyalty policy/expiry/refund reversal, prepaid package ledgers, stored-value policy/transfer/reconciliation, promotion usage evidence and a token-hash customer portal. Legacy Growth mutation paths are sealed through the shared Phase 1 idempotency/permission primitives instead of creating parallel authorities. | Dedicated Phase 9 rules, promotion stacking/time-window tests, a real-PostgreSQL operational concurrency pilot, refund/reversal assertion, reconciliation assertion and permanent Chromium customer-portal E2E are included alongside Growth regression suites. | `20260818100000_phase9_customer_value_completion` is expand-only with RLS/check constraints; dedicated CI verifies the full clean chain and a representative pre-Phase-9 upgrade preserving customer consent, loyalty and stored-value liability. | Software implementation evidence is complete on PR #69; exact final-head CI, merge and production runtime proof remain before acceptance. | `READY_FOR_ACCEPTANCE` — Gate P9 software evidence is recorded in `docs/acceptance/phase9-customer-value.md`; do not mark `ACCEPTED` until exact-head CI/merge/deployment/runtime proof closes. |
| 10 | Workforce, approvals, owner control | Workforce and staff-action/permission infrastructure exists. | Workforce/security tests exist. | Workforce migrations exist. | v2 approval/owner-control matrix not yet accepted. | `IN_PROGRESS`. |
| 11 | Ticketing, QR/RFID, access, occupancy, lockers | Ticketing/access/RFID-related foundations exist. | Ticketing and integrity tests exist. | Ticketing migrations exist. | Locker/full physical access certification requires later audit. | `IN_PROGRESS`. |
| 12 | Offline-first, Edge Hub, hardware continuity | Offline-sync, Edge Hub, hardware/printing and device registry are substantial. | Offline browser tests, Edge tests, outage/replay/rollback tests exist. | Edge local storage plus cloud schema migrations exist where required. | Physical hardware matrix and full venue outage certification remain external/operational work. | `IN_PROGRESS`. |
| 13 | Multi-location, SaaS admin, public API, integrations | Organization and provider-neutral integrations/API/webhooks exist. | Organization/integration security/reliability tests exist. | Organization/integration migrations exist. | Provider-specific connectors are optional; no external POS required. | `IN_PROGRESS`. |
| 14 | Analytics, reconciliation, intelligence | Growth analytics and metric dictionary exist. | Analytics unit fixtures exist; a scale test from the legacy Phase 4 branch is intentionally deferred for review here. | Growth/analytics migrations exist. | Production-sized performance and final reconciliation proof not v2 accepted. | `IN_PROGRESS`. |
| 15 | Automation + grounded AI | Automation and AI-insights modules exist. | Automation/AI unit tests exist. | Automation/AI migrations exist. | Grounding/evidence/safety acceptance must be audited under v2 P15. | `IN_PROGRESS`. |
| 16 | Security, privacy, DR, performance, SLOs | Reliability, GDPR/privacy docs, deployment/DR and CI foundations exist. | CI, security/integrity and Edge resilience coverage exists. | No single P16 migration implied; later changes depend on findings. | Real restore/load/SLO/security production hardening evidence must be refreshed. | `IN_PROGRESS`. |
| 17 | Pilot, certification, go-live | Historical acceptance docs and some production validation exist. | No v2 full multi-archetype pilot certification. | N/A until pilot fixes require changes. | Payment/fiscal/hardware/venue pilot evidence not complete under v2. | `NOT_STARTED`. |

## Domain acceptance notes

### Reusable canonical infrastructure

Do not create parallel replacements for these without an explicit design reason:

- `Shop` / `shopId` current venue-tenant boundary;
- Organization multi-location domain;
- canonical money utility;
- durable client idempotency;
- permission guards and capability/feature gates;
- audit context/logging;
- versioned domain-event outbox/consumer infrastructure;
- GuestCheck / CheckSettlement / Payment / Ledger financial flow;
- provider-neutral payment, fiscal and integration adapter boundaries;
- offline-sync and Edge event/replay primitives.

### Known legacy/superseded items

- Older chunk documents are historical evidence and do not override the v2 plan.
- The external-POS connector assumption is removed from runtime, UI and current architecture documentation.
- The applied `20260811160000_chunk22_integrations` migration is not edited merely to rewrite its historical first-line label; preserving applied migration checksum/history is intentional and does not create runtime dependency.
- Legacy Phase 4 acceptance work is not automatically equivalent to new v2 Phase 4.
- PR #7 pricing logic requires v2 Phase 2 review rather than direct merge from its old branch.

## Phase 0 gate tracking

| P0 gate item | Current state on this branch |
| --- | --- |
| Standalone product rule documented | Implemented; final exact-head CI/merge pending. |
| External-POS runtime dependency removed | Implemented; repository-wide boundary regression added. |
| Current branch/PR state reconciled | Implemented: #9 closed superseded; #7 deferred; mixed legacy branch classified. |
| Canonical product/domain/offline/financial/integration contracts | Implemented on this branch. |
| Current implementation matrix | This document. |
| Exact-head CI green | Pending final exact-head run after all Phase 0 fixes. |
| Phase 0 accepted | Not yet; requires merge/deployment/production verification per execution prompt. |

## Rule for advancing phases

The next phase may reuse existing code aggressively, but it must execute the v2 source audit and acceptance gate. A historical implementation does not silently promote a phase to `ACCEPTED`.
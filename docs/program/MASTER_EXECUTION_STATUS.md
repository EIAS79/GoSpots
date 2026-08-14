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
| 1 | Tenancy, auth, permissions, integrity | Existing kernel retained; v2 delta adds complete venue role/permission catalog, business-day boundaries, money allocation, immutable contextual audit and correlated consumer-idempotent events. | Unit/property/security/integrity tests plus permanent browser suites; exact-head proof pending. | `20260814090000_phase1_platform_kernel_v2` adds the v2 expand-only kernel delta and assertions. | Deployment/production validation follows exact-head merge. | `IN_PROGRESS` — implementation verification underway; see `docs/acceptance/phase-1-platform-kernel-v2.md`. |
| 2 | Venue setup, floor, resources, rates, devices | Resource/catalog/device foundations exist. Legacy zone-rate PR is unmerged. | Existing resource/booking tests; v2 rate/setup acceptance not audited. | Existing resource/device migrations; old PR adds an unaccepted migration. | No v2 setup-wizard/rate-engine acceptance record. | `IN_PROGRESS` — review existing work; rework/defer PR #7 under P2 rules. |
| 3 | Live operations, sessions, waitlist, floor | Operations/resource session engine and live/offline flows exist. | Operations tests plus gaming/mixed browser flows exist. | Operations migrations exist. | Prior production/offline validation exists, but v2 busy-floor gate not yet re-run. | `IN_PROGRESS`. |
| 4 | GuestCheck, orders, checkout, settlement, ledger | GuestCheck, checkout, settlement, allocations, merge and ledger domains are substantial. | Checkout/unit/browser integrity suites exist. | Checkout/settlement migrations exist. | Current production contains prior implementation; v2 P4 unified commercial-core audit pending. | `IN_PROGRESS`. |
| 5 | Payments, cash, refunds, invoices, fiscal, KSeF | Device-payment, cash and compliance/KSeF modules exist. | Payment/cash/compliance tests exist; provider simulators exist. | Device-payment/cash/compliance migrations exist. | Physical terminal/fiscal/KSeF/legal evidence remains phase-specific external work. | `IN_PROGRESS` — later may become `BLOCKED_EXTERNAL` after software audit. |
| 6 | Restaurant/bar/café operations | Ordering, kitchen/KDS and dining/menu foundations exist. | Ordering/kitchen tests and mixed browser flows exist. | Ordering/KDS migrations exist. | Physical KDS/printer venue acceptance not v2 certified. | `IN_PROGRESS`. |
| 7 | Inventory, recipes, purchasing, costing | Inventory-v2 and recipe/purchasing foundations exist. | Inventory service tests exist. | Inventory-v2 migrations exist. | Physical end-to-end stock drill not v2 certified. | `IN_PROGRESS`. |
| 8 | Reservations, deposits, waitlist, events | Reservation/growth capacity and public deposit flows exist. | Reservation/capacity/deposit tests exist. | Growth/deposit migrations exist. | Real deposit-provider roundtrip must be re-established under P8. | `IN_PROGRESS`. |
| 9 | Customers, membership, loyalty, packages, stored value | Growth CRM/commerce and customer/privacy foundations exist; value programs require phase audit. | CRM/growth rules tests exist; full stored-value/loyalty invariants not accepted under v2. | Growth migrations exist. | No v2 P9 operational acceptance. | `IN_PROGRESS`. |
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

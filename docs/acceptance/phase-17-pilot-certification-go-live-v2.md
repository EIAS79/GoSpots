# GoSpots Phase 17 — Pilot, Certification, Go-Live and Release

**Status:** `SOFTWARE_DONE / BLOCKED_EXTERNAL` — all executable Phase 17 software certification gates passed on the implementation head; physical/provider/legal/pilot evidence is still required for Gate P17 acceptance.  
**Source:** GoSpots Master Product & Engineering Execution Plan v2 — Phase 17.  
**Baseline:** `main` at `d379cd37c6e830a604fc96d15b9696690802d599` (Phase 16 merge).  
**Branch:** `phase-17-pilot-certification-go-live-v2`.  
**Verified implementation head:** `e248239628e6d5f4770b6f881c3189ce6bf56624`.

## Phase objective

Prove the existing GoSpots operational system as one release candidate across billiard/gaming, restaurant/bar and mixed-venue workflows. Phase 17 does not create a pilot-only financial authority and does not convert simulated evidence into physical certification.

## Implemented Phase 17 delta

- dedicated blocking `.github/workflows/phase17-validation.yml`;
- exact-head production dependency security gate;
- clean PostgreSQL 17 migration deployment/validation in the release gate;
- canonical settlement/payment/ledger/cash reconciliation assertion;
- production-sized analytics/performance benchmark rerun;
- cash-close/high-risk financial contract rerun;
- Edge hard-outage, replay and printing continuity rerun;
- independent PostgreSQL 17 logical backup/restore drill with canonical-count equality;
- permanent Playwright release gate covering all repository E2E with `--fail-on-flaky-tests`;
- canonical persisted-state assertion after the browser suite;
- Pilot A seed expanded to eight billiard tables, with a permanent CI assertion requiring 8–20 tables;
- E2E CSRF bootstrap corrected for authentication-context resets without weakening production CSRF enforcement;
- narrow-screen overview/report interactive targets hardened to meet the Phase 16 accessibility contract;
- release-tier, opening/day-close, external-evidence and rollback runbook;
- Phase 17 requirement matrix separating executable proof from external certification.

No Prisma schema change or Phase 17 database migration is required. Existing canonical domain and financial authorities remain in place.

## Pilot coverage

### Pilot A — Billiard/gaming

The release data set contains eight billiard tables. Automated proof covers timed start/pause/resume/move/end behavior, immutable rate snapshots, F&B on the same GuestCheck, reservation/customer-value foundations, split/mixed settlement, payment uncertainty/reconciliation, cash close and canonical persisted state.

### Pilot B — Restaurant/bar

Automated proof covers floor/check operation, variants/modifiers, KDS routing and production lifecycle, service-charge/tip commercial authority from the Phase 4 regression, split/mixed settlement, inventory software workflow, workforce attribution and closeout financial contracts.

### Pilot C — Mixed venue

Automated proof covers timed usage + F&B + reservation on one GuestCheck, split settlement, Offline Lite/conflict paths, Edge outage/reconnect/printing continuity and canonical post-run assertions.

These are release-candidate software simulations. They are not represented as evidence that a physical venue has completed an actual full day.

## Database and migrations

Phase 17 adds no Prisma schema change and no migration.

Verified on implementation head `e248239628e6d5f4770b6f881c3189ce6bf56624`:

- Prisma generate/validate passed;
- clean PostgreSQL 17 migration deployment/status passed;
- representative historical upgrade migration passed in repository CI;
- canonical persisted-state assertions passed;
- independent PostgreSQL 17 logical backup/restore equality drill passed.

## Security, tenancy and financial integrity

- production dependency audit rejected high/critical advisories and passed;
- repository API tests, tenant/permission/idempotency/concurrency regressions and builds passed;
- canonical checkout/payment/ledger/cash reconciliation assertion passed;
- payment `UNKNOWN` simulator path replays the same provider transaction and reconciles without blind retry;
- cash shift open/sale/pay-in/pay-out/refund/count/variance approval/close path passed;
- Edge/offline replay and hard-outage regressions passed;
- simulated card/payment/fiscal paths remain explicitly non-physical evidence.

## Exact-head CI evidence

### Phase 17 validation — run `32285320719`

On implementation head `e248239628e6d5f4770b6f881c3189ce6bf56624`:

- `Phase 17 gate · security · migrations · reconciliation · DR` — **SUCCESS**;
- `Phase 17 gate · full permanent browser release suite` — **SUCCESS**;
- `Phase 17 gate · release policy completeness` — **SUCCESS**.

The browser gate ran the permanent Playwright suite with flaky retries treated as release failures, then passed the canonical persisted-state assertion.

### Repository CI — run `32285321356`

All jobs — **SUCCESS**:

- API changed-lint, tests and build;
- web/offline tests, typecheck and build;
- clean PostgreSQL migration dry-run;
- representative historical upgrade migration;
- Edge Hub tests/build;
- permanent browser E2E and canonical persisted-state assertion.

### Exact-head phase regressions

All passed on the same implementation head:

- Phase 3 live operations — run `32285320948`;
- Phase 4 commercial core — run `32285320828`;
- Phase 7 inventory — run `32285320860`;
- Phase 8 reservations — run `32285320941`;
- Phase 9 customer value — run `32285320837`;
- Phase 10 workforce accountability — run `32285320683`;
- Phase 11 access entitlement — run `32285320866`;
- Phase 13 multi-location/integrations — run `32285320810`;
- Phase 16 production hardening — run `32285320919`;
- Edge hard-outage — run `32285320949`;
- standalone-product boundary — run `32285320914`.

## Production and release boundary

The Phase 17 PR may merge only after the final documentation-only head also passes every check that triggers on that exact revision. After merge, the resulting `main` revision must be checked and available production components verified.

The web production baseline has an inherited release constraint: the latest known-good Vercel production revision predates the Phase 16 merge, while direct deployment attempts from the connected tool do not preserve the repository monorepo root configuration. A root-mispackaged manual deployment is not acceptable evidence. Exact-revision web production proof therefore remains an external/tooling release gate until a source-traceable `apps/web` deployment can run.

## BLOCKED_EXTERNAL — required before Gate P17 acceptance

Phase 17 cannot be `ACCEPTED` until all applicable marketed-scope evidence exists:

1. real supported payment terminal/provider certification: success, decline, timeout/UNKNOWN, reconciliation, refund and duplicate callback;
2. real fiscal printer/provider certification: issue, outage, retry and reconciliation;
3. KSeF TEST and DEMO/pre-production certification plus production-readiness evidence for marketed Polish scope;
4. complete marketed physical hardware matrix;
5. physical Edge/multi-device outage/restart/reconnect drill;
6. physical KDS/printer screen workflow;
7. physical inventory receipt/sale/waste/stocktake reconciliation drill;
8. Polish accountant/tax/legal validation;
9. a design-partner/pilot venue completing a full operating day without a shadow spreadsheet/POS for core GoSpots workflows;
10. exact-revision web production deployment proof once the current Vercel release gate is cleared.

These gates cannot be replaced by mocks, simulators or prose.

## Acceptance checklist

- [x] Phase 17 release-integrity job green on verified implementation head.
- [x] Phase 17 full permanent no-flake browser release suite green on verified implementation head.
- [x] Phase 17 release-contract job green on verified implementation head.
- [x] Repository CI API/web/Edge/clean migration/upgrade migration/browser jobs green on verified implementation head.
- [x] Exact-head phase regressions required by the pilot scope green.
- [ ] Final documentation-only PR head green.
- [ ] Exact-head PR merged with expected-head protection.
- [ ] Post-merge `main` checks green.
- [ ] Exact merged revision deployed/verified on executable production components.
- [ ] Immediate production health/runtime errors checked.
- [ ] Real terminal/provider evidence complete for marketed scope.
- [ ] Fiscal/KSeF/legal evidence complete for marketed Polish scope.
- [ ] Marketed hardware/physical Edge/KDS/inventory evidence complete.
- [ ] Full pilot venue day completed without shadow spreadsheet/POS.

The correct program status is `SOFTWARE_DONE / BLOCKED_EXTERNAL`, not `ACCEPTED`.
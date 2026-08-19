# GoSpots Phase 17 — Pilot, Certification, Go-Live and Release

**Status:** `IN_PROGRESS` — executable certification work is being run; final program status cannot exceed `BLOCKED_EXTERNAL` until physical/provider/legal/pilot gates are evidenced.  
**Source:** GoSpots Master Product & Engineering Execution Plan v2 — Phase 17.  
**Baseline:** `main` at `d379cd37c6e830a604fc96d15b9696690802d599` (Phase 16 merge).  
**Branch:** `phase-17-pilot-certification-go-live-v2`.

## Phase objective

Prove the existing GoSpots operational system as one release candidate across billiard/gaming, restaurant/bar and mixed-venue workflows. Phase 17 must not create a pilot-only financial authority or hide external certification gaps.

## Implemented Phase 17 delta

- dedicated blocking `.github/workflows/phase17-validation.yml`;
- exact-head production dependency security gate;
- clean PostgreSQL 17 migration deployment/validation in the release gate;
- canonical settlement/payment/ledger/cash reconciliation assertion;
- production-sized analytics/performance benchmark rerun;
- cash-close/high-risk financial contract rerun;
- Edge hard-outage, replay and printing continuity rerun;
- independent PostgreSQL 17 logical backup/restore drill with canonical-count equality;
- permanent three-archetype Playwright pilot gate for gaming/billiards, restaurant and mixed venue;
- offline/conflict, checkout, workforce accountability, analytics and Phase 16 hardening browser coverage included in the pilot gate;
- canonical persisted-state assertion after pilot E2E;
- release-tier, opening/day-close, external-evidence and rollback runbook;
- Phase 17 requirement matrix separating executable proof from external certification.

No application schema or domain state machine is changed by this Phase 17 delta. Existing canonical authorities remain in place.

## Pilot coverage

### Pilot A — Billiard/gaming

Automated proof reuses the permanent gaming path: start/pause/resume/move/end timed resource use; preserve rate snapshot; attach F&B; split/mixed payment; close the paid check; simulate fiscal issuance; assert settled canonical state.

### Pilot B — Restaurant/bar

Automated proof reuses the restaurant path: table/check; variants/modifiers; KDS route and production lifecycle; immutable commercial completion; split/mixed settlement; close the paid check.

### Pilot C — Mixed venue

Automated proof reuses the mixed path: timed usage + F&B + reservation on one GuestCheck; split settlement; closeout; Offline Lite/conflict paths and Edge outage/reconnect evidence.

These are release-candidate software simulations. They are not represented as evidence that a physical venue has completed an actual full day.

## Database and migrations

Phase 17 adds no Prisma schema change and no migration. Required proof is nevertheless rerun on the final exact head:

- Prisma generate/validate;
- clean PostgreSQL 17 migration deploy/status in the Phase 17 release gate;
- representative historical upgrade in the repository CI gate;
- canonical persisted-state assertions;
- independent logical backup/restore equality.

## Security, tenancy and financial integrity

Phase 17 relies on and re-runs the canonical gates rather than adding shortcuts:

- full repository API tests include tenant/permission/idempotency/concurrency regressions;
- production dependency audit rejects high/critical production advisories;
- canonical reconciliation assertion proves checkout/payment/ledger/cash consistency;
- simulated card methods are clearly non-physical evidence;
- UNKNOWN/provider uncertainty is not treated as successful certification;
- Edge/offline replay remains idempotent and financial mutations are never silently merged.

## Production and release boundary

The Phase 17 software branch may be merged only after exact-head GitHub checks are green. After merge, the exact `main` revision must be verified on available production components and immediate logs/health inspected.

The web production baseline has an inherited release constraint: the latest known-good Vercel production revision predates the Phase 16 merge, while direct deployment attempts from the connected tool do not preserve the repository monorepo root configuration. The provider quota/reset and Git-root deployment path must be resolved using a source-traceable deployment; a root-mispackaged manual deployment is not acceptable evidence.

## BLOCKED_EXTERNAL — required before Gate P17 acceptance

Phase 17 cannot be `ACCEPTED` until all applicable marketed-scope evidence exists:

1. real supported payment terminal/provider certification;
2. real fiscal printer/provider certification;
3. KSeF TEST and DEMO/pre-production certification and production-readiness evidence for marketed Polish scope;
4. complete marketed physical hardware matrix;
5. physical Edge/multi-device outage/restart/reconnect drill;
6. physical KDS/printer screen workflow;
7. physical inventory receipt/sale/waste/stocktake reconciliation drill;
8. Polish accountant/tax/legal validation;
9. a design-partner/pilot venue completing a full operating day without a shadow spreadsheet/POS for core GoSpots workflows;
10. exact-revision web production deployment proof once the current Vercel deployment gate is cleared.

These gates cannot be replaced by mocks, simulators or prose.

## Acceptance checklist

- [ ] Phase 17 release-integrity job green on the exact final PR head.
- [ ] Phase 17 three-archetype pilot E2E job green on the exact final PR head.
- [ ] Phase 17 release-contract job green on the exact final PR head.
- [ ] Repository CI exact-head API/web/Edge/clean migration/upgrade migration/browser jobs green.
- [ ] Exact-head PR merged with expected-head protection.
- [ ] Post-merge `main` checks green.
- [ ] Exact merged revision deployed/verified on executable production components.
- [ ] Immediate production health/runtime errors checked.
- [ ] Real terminal/provider evidence complete for marketed scope.
- [ ] Fiscal/KSeF/legal evidence complete for marketed Polish scope.
- [ ] Marketed hardware/physical Edge/KDS/inventory evidence complete.
- [ ] Full pilot venue day completed without shadow spreadsheet/POS.

Until all external boxes are genuinely evidenced, the correct final status is `SOFTWARE_DONE / BLOCKED_EXTERNAL`, not `ACCEPTED`.
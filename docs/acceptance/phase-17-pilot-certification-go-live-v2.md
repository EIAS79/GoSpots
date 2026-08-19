# GoSpots Phase 17 — Pilot, Certification, Go-Live and Release

**Status:** `SOFTWARE_DONE / BLOCKED_EXTERNAL` — all executable Phase 17 software certification gates have passed; real provider/hardware/legal/pilot evidence is still required for Gate P17 acceptance.  
**Source:** GoSpots Master Product & Engineering Execution Plan v2 — Phase 17.  
**Initial Phase 17 merge:** `fe00ea5e4155ce79dd909903abfc7e094540795d` via PR #82.  
**Adyen continuation:** PR #83 merged to `main` as `25047e58f19ad311671cda2282faab0db39a837f`.  
**Final PR #83 head:** `a9304d13d56f74f1d8e3b97f550e7fb453d2779c`.

## Phase objective

Prove the existing GoSpots operational system as one release candidate across billiard/gaming, restaurant/bar and mixed-venue workflows. Phase 17 does not create a pilot-only financial authority and does not convert simulated evidence into physical certification.

## Implemented Phase 17 delta

Phase 17 delivered:

- dedicated blocking `.github/workflows/phase17-validation.yml`;
- exact-head production dependency security gate;
- clean PostgreSQL 17 migration deployment/validation;
- representative historical upgrade validation;
- canonical settlement/payment/ledger/cash reconciliation assertions;
- production-sized analytics/performance benchmark rerun;
- cash-close/high-risk financial contract rerun;
- Edge hard-outage, replay and printing continuity rerun;
- independent PostgreSQL 17 logical backup/restore drill;
- permanent Playwright release gate covering the complete E2E suite with `--fail-on-flaky-tests`;
- canonical persisted-state assertions after browser E2E;
- Pilot A seed expanded to eight billiard tables with a permanent 8–20 table assertion;
- release-tier, opening/day-close, external-evidence and rollback runbook;
- Adyen Terminal API as the active venue/card-present provider behind canonical GoSpots payment authority;
- deterministic Adyen PaymentRequest identity;
- explicit payment `UNKNOWN` plus TransactionStatus recovery instead of blind retry;
- AbortRequest plus status verification;
- referenced ReversalRequest refunds remaining non-final until provider evidence;
- HMAC-verified, merchant-validated, duplicate-safe Adyen webhook handling;
- `CANCEL_OR_REFUND`, `REFUND_FAILED` and `REFUNDED_REVERSED` reconciliation;
- permanent Adyen adapter/webhook/payment-state tests;
- Stripe Terminal removed from runtime venue payments while Stripe Billing remains SaaS subscription/features billing only;
- no-flake E2E hardening for authentication setup and Offline Lite conflict isolation.

No Phase 17 Prisma schema change or migration was required. GuestCheck, PaymentOperation, Refund, settlement, ledger and cash remain GoSpots canonical state.

## Pilot software coverage

### Pilot A — Billiard/gaming

The release data set contains eight billiard tables. Automated proof covers timed start/pause/resume/move/end behavior, immutable rate snapshots, F&B on the same GuestCheck, reservation/customer-value foundations, split/mixed settlement, payment uncertainty/reconciliation, cash close and canonical persisted state.

### Pilot B — Restaurant/bar

Automated proof covers floor/check operation, variants/modifiers, KDS routing and production lifecycle, service-charge/tip authority, split/mixed settlement, inventory software workflow, workforce attribution and closeout financial contracts.

### Pilot C — Mixed venue

Automated proof covers timed usage + F&B + reservation on one GuestCheck, split settlement, Offline Lite/conflict paths, Edge outage/reconnect/printing continuity and canonical post-run assertions.

These are release-candidate software simulations. They are not represented as evidence that a physical venue completed an actual full operating day.

## Database and integrity evidence

Verified during Phase 17 exact-head certification:

- all 115 migrations deployed successfully to clean PostgreSQL 17;
- Prisma generate/validate passed;
- representative historical upgrade migration passed;
- canonical persisted-state assertions passed;
- independent PostgreSQL 17 logical backup/restore equality drill passed;
- production dependency audit passed with no accepted high/critical production advisories;
- tenant, permission, idempotency and concurrency regressions passed;
- canonical checkout/payment/ledger/cash reconciliation passed;
- duplicate and late Adyen refund events remain reconciliation-safe;
- Edge/offline replay and hard-outage regressions passed.

## Exact final PR #83 evidence

Final PR #83 head `a9304d13d56f74f1d8e3b97f550e7fb453d2779c` passed every triggered workflow:

- CI `32300277490` — **SUCCESS**;
- Phase 17 pilot certification and release gate `32300277394` — **SUCCESS**;
- Standalone product boundary `32300277473` — **SUCCESS**;
- Edge hard-outage validation `32300277383` — **SUCCESS**;
- Phase 3 `32300277316` — **SUCCESS**;
- Phase 4 `32300277381` — **SUCCESS**;
- Phase 7 `32300277403` — **SUCCESS**;
- Phase 8 `32300277324` — **SUCCESS**;
- Phase 9 `32300277672` — **SUCCESS**;
- Phase 10 `32300277299` — **SUCCESS**;
- Phase 11 `32300277315` — **SUCCESS**;
- Phase 13 `32300277377` — **SUCCESS**;
- Phase 16 `32300277429` — **SUCCESS**.

PR #83 then merged to `main` as `25047e58f19ad311671cda2282faab0db39a837f`.

## Production evidence

### API / Render

The active Frankfurt Render service auto-deployed exact Phase 17 merge `25047e58f19ad311671cda2282faab0db39a837f` as deployment `dep-da31eknavr4c7394ri60`; status is **LIVE**. Immediate post-deploy error/fatal log inspection returned no matching records.

### Web / Vercel

The latest known source-traceable READY Vercel production deployment still predates the Phase 16/17 merges. The failed manual/direct deployment attempts were not valid production evidence: they uploaded a small synthetic bundle and evaluated it outside the real `apps/web` Next.js root, producing `NEXT_NO_VERSION`.

PR #84 (`phase-17-vercel-production-closeout`) replaces that fragile path with a guarded Git-backed release:

- canonical Vercel root remains `apps/web`;
- feature-branch Git deployments are disabled;
- only `main` may deploy;
- `ignoreCommand` skips normal `main` commits unless `apps/web/.vercel-release` changed;
- the Phase 17 closeout marker deliberately requests the exact production build after PR #84 is green and merged.

Until that merge produces and verifies a source-traceable production deployment, web production proof remains open.

## BLOCKED_EXTERNAL — required before Gate P17 acceptance

Phase 17 cannot be `ACCEPTED` until all applicable marketed-scope evidence exists:

1. **Adyen provider/terminal certification:** real test merchant/API credential/HMAC/boarded terminal; success, decline, timeout/UNKNOWN, TransactionStatus recovery, cancel, referenced refund, duplicate webhook and final reconciliation;
2. real fiscal printer/provider certification: issue, outage, retry and reconciliation;
3. KSeF TEST and DEMO/pre-production certification plus production-readiness evidence for marketed Polish scope;
4. complete marketed physical hardware matrix;
5. physical Edge/multi-device outage/restart/reconnect drill;
6. physical KDS/printer workflow;
7. physical inventory receipt/sale/waste/stocktake reconciliation drill;
8. Polish accountant/tax/legal validation;
9. a design-partner/pilot venue completing a full operating day without a shadow spreadsheet/POS for core GoSpots workflows;
10. source-traceable exact-revision Vercel production deployment and runtime verification.

Mocks, simulators and fake venue data remain valid software rehearsal evidence only; they are not substituted for physical/provider/legal acceptance.

## Acceptance checklist

- [x] Phase 17 release-integrity job green on final PR #83 head.
- [x] Adyen payment/refund/webhook/reconciliation contracts green on final PR #83 head.
- [x] Full permanent no-flake browser release suite green on final PR #83 head.
- [x] Repository CI API/web/Edge/clean migration/upgrade migration/browser jobs green on final PR #83 head.
- [x] Triggered Phase 3/4/7/8/9/10/11/13/16, Edge and standalone regressions green on final PR #83 head.
- [x] PR #83 merged with expected-head protection.
- [x] Resulting Phase 17 `main` revision identified and verified as `25047e58f19ad311671cda2282faab0db39a837f`.
- [x] Exact Phase 17 API revision deployed and verified on Render.
- [x] Immediate Render production error/fatal log check clean.
- [ ] PR #84 Vercel production-closeout head green and merged.
- [ ] Source-traceable Vercel production deployment verified on the resulting release revision.
- [ ] Immediate Vercel production runtime errors checked on that deployment.
- [ ] Real Adyen terminal/provider evidence complete.
- [ ] Fiscal/KSeF/legal evidence complete for marketed Polish scope.
- [ ] Marketed hardware/physical Edge/KDS/inventory evidence complete.
- [ ] Full pilot venue day completed without shadow spreadsheet/POS.

The correct overall program status remains `SOFTWARE_DONE / BLOCKED_EXTERNAL`, not `ACCEPTED`. Phase 18 does not exist in the current v2 phase map and has not been started.

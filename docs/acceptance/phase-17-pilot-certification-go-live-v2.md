# GoSpots Phase 17 — Pilot, Certification, Go-Live and Release

**Status:** `SOFTWARE_DONE / BLOCKED_EXTERNAL` — all executable Phase 17 software, CI, merge and production deployment gates have passed; real provider/hardware/legal/pilot evidence is still required for Gate P17 acceptance.  
**Source:** GoSpots Master Product & Engineering Execution Plan v2 — Phase 17.  
**Initial Phase 17 merge:** `fe00ea5e4155ce79dd909903abfc7e094540795d` via PR #82.  
**Adyen continuation:** PR #83 merged as `25047e58f19ad311671cda2282faab0db39a837f`.  
**Production closeout:** PR #84 merged as `3082ac9223c3704db3152015e69255e8581999dc`.

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
- permanent Playwright release gate over the complete E2E suite with `--fail-on-flaky-tests`;
- canonical persisted-state assertions after browser E2E;
- Pilot A seed expanded to eight billiard tables with a permanent 8–20 table assertion;
- release-tier, opening/day-close, external-evidence and rollback runbook;
- Adyen Terminal API behind canonical GoSpots `PaymentConnector` / `PaymentOperation` authority;
- deterministic Adyen PaymentRequest identity;
- explicit payment `UNKNOWN` plus TransactionStatus recovery instead of blind retry;
- AbortRequest plus status verification;
- referenced ReversalRequest refunds remaining non-final until provider evidence;
- HMAC-verified, merchant-validated, duplicate-safe Adyen webhook handling;
- `CANCEL_OR_REFUND`, `REFUND_FAILED` and `REFUNDED_REVERSED` reconciliation;
- permanent Adyen adapter/webhook/payment-state tests;
- Stripe Terminal removed from runtime venue payments while Stripe Billing remains SaaS subscription/features billing only;
- no-flake E2E hardening for authentication setup and Offline Lite conflict isolation;
- guarded Git-backed Vercel release flow from the real `apps/web` Next.js root.

No Phase 17 Prisma schema change or migration was required. GuestCheck, PaymentOperation, Refund, settlement, ledger and cash remain GoSpots canonical state.

## Pilot software coverage

### Pilot A — Billiard/gaming

The release data set contains eight billiard tables. Automated proof covers timed start/pause/resume/move/end behavior, immutable rate snapshots, F&B on the same GuestCheck, reservation/customer-value foundations, split/mixed settlement, payment uncertainty/reconciliation, cash close and canonical persisted state.

### Pilot B — Restaurant/bar

Automated proof covers floor/check operation, variants/modifiers, KDS routing and production lifecycle, service-charge/tip authority, split/mixed settlement, inventory software workflow, workforce attribution and closeout financial contracts.

### Pilot C — Mixed venue

Automated proof covers timed usage + F&B + reservation on one GuestCheck, split settlement, Offline Lite/conflict paths, Edge outage/reconnect/printing continuity and canonical post-run assertions.

These are release-candidate software simulations. They are not evidence that a physical venue completed an actual full operating day.

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

## Exact-head CI evidence

### PR #83 — Adyen continuation

Final head `a9304d13d56f74f1d8e3b97f550e7fb453d2779c` passed every triggered workflow, including repository CI, Phase 17 release certification, standalone product boundary, Edge hard-outage and Phase 3/4/7/8/9/10/11/13/16 validations. PR #83 merged as `25047e58f19ad311671cda2282faab0db39a837f`.

### PR #84 — production release closeout

Final head `2b798f06dc3219e14eb31af3ff65022a660ec837` passed:

- repository CI `32313820547` — **SUCCESS**;
- Phase 17 pilot certification and release gate `32313820558` — **SUCCESS**;
- standalone product boundary `32313820544` — **SUCCESS**;
- Edge hard-outage validation `32313820537` — **SUCCESS**;
- Phase 3 validation `32313820536` — **SUCCESS**;
- Phase 4 validation `32313820525` — **SUCCESS**;
- Phase 7 validation `32313820531` — **SUCCESS**.

PR #84 then squash-merged with expected-head protection as `3082ac9223c3704db3152015e69255e8581999dc`.

## Production evidence

### Web / Vercel — PASS

The former `NEXT_NO_VERSION` failures were caused by a manual synthetic-package deployment path that did not preserve the real monorepo application root. PR #84 removed that release path from the canonical process and restored guarded Git-backed deployment from `apps/web`.

Production deployment evidence:

- Vercel project: `gospots`;
- deployment: `dpl_51W5xjRk6JrQuPbAr49HbKBMDE2Y`;
- source: Git;
- branch: `main`;
- exact source SHA: `3082ac9223c3704db3152015e69255e8581999dc`;
- state: **READY**;
- production aliases include `gospots.eu`, `www.gospots.eu`, `gospots.pl` and `www.gospots.pl`;
- build output confirms the real repository/`apps/web` Next.js path and completed successfully;
- `https://www.gospots.eu/` returned HTTP **200**;
- `https://www.gospots.eu/login` returned HTTP **200**;
- Vercel post-release runtime error query returned **no runtime errors**.

The release policy now permits Git deployment only from `main` and uses `apps/web/.vercel-release` as the explicit release marker. Routine commits that do not change the marker are skipped by Vercel.

### API / Render — PASS

The Frankfurt Render service deployed exact release SHA `3082ac9223c3704db3152015e69255e8581999dc` as `dep-da33t83m8hqs739febk0`; status is **LIVE**. Post-deploy error/fatal log inspection returned no matching records.

End-to-end readiness through the production web origin also passed:

- `https://www.gospots.eu/api/v1/ready` returned HTTP **200**;
- API readiness reported `status=ok`, database `up`, web app `ready` and billing `ready`.

The prior Phase 17 API deployment `dep-da31eknavr4c7394ri60` at `25047e58f19ad311671cda2282faab0db39a837f` was correctly deactivated after the exact PR #84 release revision became live.

## BLOCKED_EXTERNAL — required before Gate P17 acceptance

The production deployment gate is now closed. Phase 17 still cannot be `ACCEPTED` until all applicable marketed-scope external evidence exists:

1. **Adyen provider/terminal certification:** real test merchant/API credential/HMAC/boarded terminal; success, decline, timeout/UNKNOWN, TransactionStatus recovery, cancel, referenced refund, duplicate webhook and final reconciliation;
2. real fiscal printer/provider certification: issue, outage, retry and reconciliation;
3. KSeF TEST and DEMO/pre-production certification plus production-readiness evidence for marketed Polish scope;
4. complete marketed physical hardware matrix;
5. physical Edge/multi-device outage/restart/reconnect drill;
6. physical KDS/printer workflow;
7. physical inventory receipt/sale/waste/stocktake reconciliation drill;
8. Polish accountant/tax/legal validation;
9. a design-partner/pilot venue completing a full operating day without a shadow spreadsheet/POS for core GoSpots workflows.

Mocks, simulators and fake venue data remain valid software rehearsal evidence only; they are not substitutes for physical/provider/legal acceptance.

## Acceptance checklist

- [x] Phase 17 release-integrity job green.
- [x] Adyen payment/refund/webhook/reconciliation software contracts green.
- [x] Full permanent no-flake browser release suite green.
- [x] Repository CI API/web/Edge/clean migration/upgrade migration/browser jobs green.
- [x] Triggered Phase 3/4/7/8/9/10/11/13/16, Edge and standalone regressions green for the Phase 17 implementation head.
- [x] PR #83 merged with expected-head protection.
- [x] PR #84 exact head green and merged with expected-head protection.
- [x] Source-traceable exact-revision Vercel production deployment verified.
- [x] Production homepage and login smoke checks passed.
- [x] Immediate Vercel runtime error check clean.
- [x] Exact release revision deployed and verified on Render.
- [x] Immediate Render error/fatal log check clean.
- [x] End-to-end production readiness endpoint returned HTTP 200.
- [ ] Real Adyen terminal/provider evidence complete.
- [ ] Fiscal/KSeF/legal evidence complete for marketed Polish scope.
- [ ] Marketed hardware/physical Edge/KDS/inventory evidence complete.
- [ ] Full pilot venue day completed without shadow spreadsheet/POS.

The correct overall program status remains `SOFTWARE_DONE / BLOCKED_EXTERNAL`, not `ACCEPTED`. Phase 18 does not exist in the current v2 phase map and has not been started.

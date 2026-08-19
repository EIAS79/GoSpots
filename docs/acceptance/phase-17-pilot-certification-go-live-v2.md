# GoSpots Phase 17 — Pilot, Certification, Go-Live and Release

**Status:** `SOFTWARE_DONE / BLOCKED_EXTERNAL` — all executable Phase 17 software certification gates have passed; physical/provider/legal/pilot and exact production evidence are still required for Gate P17 acceptance.  
**Source:** GoSpots Master Product & Engineering Execution Plan v2 — Phase 17.  
**Initial Phase 17 merge:** `fe00ea5e4155ce79dd909903abfc7e094540795d` via PR #82.  
**Continuation branch:** `phase-17-adyen-certification`, PR #83.  
**Verified Adyen implementation head:** `5c1bd0290e882651b9e7e25df4516d4228f895a3`.

## Phase objective

Prove the existing GoSpots operational system as one release candidate across billiard/gaming, restaurant/bar and mixed-venue workflows. Phase 17 does not create a pilot-only financial authority and does not convert simulated evidence into physical certification.

## Implemented Phase 17 delta

The initial Phase 17 release-certification work delivered:

- dedicated blocking `.github/workflows/phase17-validation.yml`;
- exact-head production dependency security gate;
- clean PostgreSQL 17 migration deployment/validation in the release gate;
- canonical settlement/payment/ledger/cash reconciliation assertion;
- production-sized analytics/performance benchmark rerun;
- cash-close/high-risk financial contract rerun;
- Edge hard-outage, replay and printing continuity rerun;
- independent PostgreSQL 17 logical backup/restore drill;
- permanent Playwright release gate covering the entire repository E2E suite with `--fail-on-flaky-tests`;
- canonical persisted-state assertion after the browser suite;
- Pilot A seed expanded to eight billiard tables, with a permanent CI assertion requiring 8–20 tables;
- E2E CSRF bootstrap correction for authentication-context resets;
- narrow-screen overview/report target hardening;
- release-tier, opening/day-close, external-evidence and rollback runbook;
- Phase 17 requirement matrix separating executable proof from external certification.

The Phase 17 continuation after the payment-provider decision adds:

- **Adyen Terminal API** as the active venue/customer card-present provider behind the existing provider-neutral `PaymentConnector`/`PaymentOperation` authority;
- synchronous Cloud Device API payment requests with deterministic request identity;
- explicit payment `UNKNOWN` for ambiguous outcomes and TransactionStatus recovery using the original SaleID/ServiceID/POIID;
- AbortRequest followed by status verification;
- referenced ReversalRequest refunds that remain non-final until provider webhook evidence;
- HMAC-verified, merchant-validated, idempotent Adyen refund webhooks;
- support for `CANCEL_OR_REFUND`, `REFUND_FAILED` and `REFUNDED_REVERSED`, including reconciliation-only backward net-refund corrections when the provider invalidates a previously successful refund;
- permanent Adyen adapter/webhook/payment-state tests in the Phase 17 release gate;
- removal of the legacy Stripe Terminal connector from the runtime venue-payment module so **Stripe Billing remains SaaS subscription/features billing only**;
- a no-flake E2E registration/session race fix discovered by the strengthened release gate.

No Prisma schema change or new Phase 17 database migration is required. Existing canonical GuestCheck, PaymentOperation, Refund, settlement, ledger and cash authorities remain in place.

## Pilot coverage

### Pilot A — Billiard/gaming

The release data set contains eight billiard tables. Automated proof covers timed start/pause/resume/move/end behavior, immutable rate snapshots, F&B on the same GuestCheck, reservation/customer-value foundations, split/mixed settlement, payment uncertainty/reconciliation, cash close and canonical persisted state.

### Pilot B — Restaurant/bar

Automated proof covers floor/check operation, variants/modifiers, KDS routing and production lifecycle, service-charge/tip commercial authority, split/mixed settlement, inventory software workflow, workforce attribution and closeout financial contracts.

### Pilot C — Mixed venue

Automated proof covers timed usage + F&B + reservation on one GuestCheck, split settlement, Offline Lite/conflict paths, Edge outage/reconnect/printing continuity and canonical post-run assertions.

These are release-candidate software simulations. They are not represented as evidence that a physical venue has completed an actual full day.

## Database and migrations

Phase 17 adds no Prisma schema change and no migration.

Verified on Adyen implementation head `5c1bd0290e882651b9e7e25df4516d4228f895a3`:

- all 115 migrations deployed successfully to clean PostgreSQL 17;
- Prisma generate/validate passed;
- representative historical upgrade migration passed in repository CI;
- canonical persisted-state assertions passed;
- independent PostgreSQL 17 logical backup/restore equality drill passed.

## Security, tenancy and financial integrity

- production dependency audit rejected high/critical advisories and passed;
- repository API tests, tenant/permission/idempotency/concurrency regressions and builds passed;
- canonical checkout/payment/ledger/cash reconciliation assertion passed;
- Adyen payment uncertainty preserves the original provider transaction identity for TransactionStatus recovery instead of blind retry;
- Adyen referenced refunds remain non-final until provider event evidence;
- duplicate refund events are idempotent;
- late Adyen refund failure/reversal events remove stale refund certainty only through an explicit reconciliation transition;
- cash shift open/sale/pay-in/pay-out/refund/count/variance approval/close paths passed;
- Edge/offline replay and hard-outage regressions passed;
- simulated provider/fiscal/hardware paths remain explicitly non-physical evidence.

## Exact-head implementation evidence

Every workflow triggered on verified Adyen implementation head `5c1bd0290e882651b9e7e25df4516d4228f895a3` completed successfully:

- Repository CI — run `32296331984` — **SUCCESS**;
- Phase 17 pilot certification and release gate — run `32296331982` — **SUCCESS**;
- Standalone product boundary — run `32296331952` — **SUCCESS**;
- Edge hard-outage validation — run `32296331969` — **SUCCESS**;
- Phase 3 live-operations validation — run `32296331975` — **SUCCESS**;
- Phase 4 commercial-core validation — run `32296331972` — **SUCCESS**;
- Phase 7 inventory validation — run `32296331962` — **SUCCESS**;
- Phase 16 production hardening validation — run `32296331971` — **SUCCESS**.

Within the Phase 17 run, release policy completeness, security/migrations/reconciliation/DR, and the full permanent no-flake browser suite all passed. The browser gate then passed canonical persisted-state assertions.

## No-flake defect found and fixed

A preceding exact-head run correctly failed because the Phase 2 empty-venue readiness E2E passed only on retry after an intermittent `SESSION_REVOKED` response. The test had mounted the interactive registration page while registering through the same browser request context, allowing registration-page auth probes to race the newly-issued owner cookies. The setup now performs registration only through the shared request context and mounts the UI after authenticated setup. The exact implementation head passed `--fail-on-flaky-tests` after this fix.

## Production and release boundary

PR #83 may merge only after the final documentation-only head also passes every workflow triggered on that exact revision. After merge, the resulting `main` revision must be checked and all executable production components verified.

The latest known READY Vercel production revision still predates the Phase 16/17 merges. Earlier direct deployment attempts from the connected deployment path did not preserve the repository monorepo application root, so a root-mispackaged deployment is not acceptable evidence. Exact-revision web production proof remains a release gate until a source-traceable `apps/web` deployment succeeds.

Because the Adyen continuation changes API runtime code, the exact merged API revision must also be verified on the production API hosting path after merge. A healthy older deployment is not proof that this continuation is deployed.

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
10. exact merged web/API production deployment proof.

These gates cannot be replaced by mocks, simulators or prose. Fake venue data remains valid rehearsal and software evidence only.

## Acceptance checklist

- [x] Phase 17 release-integrity job green on verified implementation head.
- [x] Adyen payment/refund/webhook/reconciliation contracts green on verified implementation head.
- [x] Phase 17 full permanent no-flake browser release suite green on verified implementation head.
- [x] Phase 17 release-contract job green on verified implementation head.
- [x] Repository CI API/web/Edge/clean migration/upgrade migration/browser jobs green on verified implementation head.
- [x] Triggered Phase 3/4/7/16, Edge and standalone regressions green on verified implementation head.
- [ ] Final documentation-only PR head green.
- [ ] PR #83 merged with expected-head protection.
- [ ] Resulting `main` revision verified.
- [ ] Exact merged revision deployed/verified on web and API production components.
- [ ] Immediate production health/runtime errors checked on the exact deployed revision.
- [ ] Real Adyen terminal/provider evidence complete.
- [ ] Fiscal/KSeF/legal evidence complete for marketed Polish scope.
- [ ] Marketed hardware/physical Edge/KDS/inventory evidence complete.
- [ ] Full pilot venue day completed without shadow spreadsheet/POS.

The correct overall program status is `SOFTWARE_DONE / BLOCKED_EXTERNAL`, not `ACCEPTED`. Phase 18 has not started.

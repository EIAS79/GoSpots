# Phase 17 — Adyen Terminal Certification Record

Status: `SOFTWARE_DONE / EXTERNAL_ACCOUNT_AND_HARDWARE_BLOCKED`

## Decision

For Phase 17 venue/customer card-present payments, GoSpots targets **Adyen Terminal API** through the existing provider-neutral payment connector boundary.

Stripe remains part of the separate SaaS billing/subscription domain. The legacy Stripe Terminal connector is deliberately no longer registered in the runtime venue-payment module, so Stripe Billing is not a GuestCheck, checkout, ledger, settlement or venue-payment authority.

## Implemented software certification scope

The Phase 17 Adyen continuation implements and permanently tests:

- synchronous Cloud Device API payment requests;
- deterministic provider request identity and tenant-scoped terminal assignment;
- explicit `UNKNOWN` on transport/time-out ambiguity;
- TransactionStatus reconciliation using the original SaleID/ServiceID/POIID instead of blind retry;
- AbortRequest followed by TransactionStatus verification rather than assuming cancellation;
- referenced ReversalRequest refunds;
- asynchronous `CANCEL_OR_REFUND` refund outcome handling;
- late `REFUND_FAILED` and `REFUNDED_REVERSED` correction handling so stale refund certainty cannot remain in canonical money state;
- Standard webhook HMAC verification, merchant validation and duplicate-event idempotency;
- refund/payment net-state recomputation through the canonical `Refund` and `PaymentOperation` records;
- no PAN, CVV, card secrets, API keys or raw sensitive terminal response persistence;
- connector health/readiness checks.

No Prisma schema change or Phase 17 migration was required. Existing GuestCheck, PaymentOperation, Refund, settlement, ledger and cash authorities remain canonical.

## Verified implementation head

Implementation head: `5c1bd0290e882651b9e7e25df4516d4228f895a3`.

Every workflow triggered on this exact implementation head completed successfully:

- Repository CI — run `32296331984` — **SUCCESS**;
- Phase 17 pilot certification and release gate — run `32296331982` — **SUCCESS**;
- Standalone product boundary — run `32296331952` — **SUCCESS**;
- Edge hard-outage validation — run `32296331969` — **SUCCESS**;
- Phase 3 live-operations validation — run `32296331975` — **SUCCESS**;
- Phase 4 commercial-core validation — run `32296331972` — **SUCCESS**;
- Phase 7 inventory validation — run `32296331962` — **SUCCESS**;
- Phase 16 production hardening validation — run `32296331971` — **SUCCESS**.

The Phase 17 release-integrity job passed the production dependency audit, all 115 clean PostgreSQL migrations, Prisma validation, Adyen payment/refund adapter tests, realistic 8-table pilot assertion, canonical money reconciliation, performance benchmark, cash-close contracts, Edge outage/printing tests and independent logical backup/restore drill.

The Phase 17 browser job passed the complete permanent Playwright suite with `--fail-on-flaky-tests` and then passed canonical persisted-state assertions.

### No-flake defect found and fixed

A prior exact-head run exposed an intermittent Phase 2 readiness E2E race: the interactive registration page could keep anonymous/auth probes alive while API registration replaced the browser-context auth cookies, intermittently revoking the freshly-created owner session before the first settings mutation. The test was corrected to perform registration exclusively through the shared browser request context and mount the UI only after the authenticated setup is complete. The exact implementation head above passed the no-flake release suite after this correction.

## Required external configuration

The software path cannot become real-provider certified until an Adyen test account exists and these secrets/identifiers are configured outside source control:

- `ADYEN_TERMINAL_ENABLED=true`
- `ADYEN_ENVIRONMENT=test`
- `ADYEN_API_KEY` with the required Cloud Device API permission
- `ADYEN_MERCHANT_ACCOUNT`
- `ADYEN_STANDARD_WEBHOOK_HMAC_KEY`
- a boarded/assigned Adyen test terminal ID in GoSpots `PaymentTerminal.externalTerminalId`

Optional:

- `ADYEN_TERMINAL_SALE_ID` (defaults to `GoSpots`)
- `ADYEN_TERMINAL_TIMEOUT_MS` (defaults to 160000; must remain above 150 seconds for synchronous cloud payment requests)
- `ADYEN_TERMINAL_BASE_URL` only for controlled automated testing.

## External evidence boundary

Automated mocks and fake venue data certify GoSpots adapter semantics, reconciliation safety, duplicate handling and release regressions. They **do not** replace the Phase 17 requirement for real provider/terminal evidence.

Real-provider acceptance still requires an Adyen test/live-appropriate exercise covering at least:

1. successful card-present payment;
2. decline;
3. communication timeout/uncertain payment followed by TransactionStatus recovery;
4. cancel while in progress;
5. referenced refund and `CANCEL_OR_REFUND` webhook;
6. duplicate webhook delivery;
7. late refund failure/reversal evidence where the provider test environment supports it;
8. provider/GoSpots reconciliation with no duplicate charge or refund.

## Phase boundary

The Adyen software certification is complete. Phase 17 remains `SOFTWARE_DONE / BLOCKED_EXTERNAL` overall until its real provider/hardware/legal/pilot/production gates are satisfied.

Phase 18 has not been started.

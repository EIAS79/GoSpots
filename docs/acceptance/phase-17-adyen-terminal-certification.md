# Phase 17 — Adyen Terminal Certification Record

Status: `SOFTWARE_IN_PROGRESS / EXTERNAL_ACCOUNT_AND_HARDWARE_BLOCKED`

## Decision

For Phase 17 venue/customer card-present payments, GoSpots targets **Adyen Terminal API** through the existing provider-neutral payment connector boundary.

Stripe remains part of the separate SaaS billing/subscription domain. This Phase 17 certification does not make Stripe Billing a GuestCheck, checkout, ledger, or venue-payment authority.

## Software certification scope

The Adyen adapter must preserve GoSpots canonical payment authority and implement:

- synchronous Cloud Device API payment requests;
- deterministic provider request identity and tenant-scoped terminal assignment;
- explicit `UNKNOWN` on transport/time-out ambiguity;
- TransactionStatus reconciliation using the original SaleID/ServiceID/POIID;
- AbortRequest followed by status verification rather than assuming cancellation;
- referenced ReversalRequest refunds;
- asynchronous `CANCEL_OR_REFUND` refund outcome handling;
- Standard webhook HMAC verification and duplicate-event idempotency;
- no PAN, card secrets, API keys, or raw sensitive terminal response persistence;
- connector health/readiness checks.

## Required external configuration

The software path cannot become real-provider certified until an Adyen test account exists and these secrets/identifiers are configured outside source control:

- `ADYEN_TERMINAL_ENABLED=true`
- `ADYEN_ENVIRONMENT=test`
- `ADYEN_API_KEY` with Cloud Device API role
- `ADYEN_MERCHANT_ACCOUNT`
- `ADYEN_STANDARD_WEBHOOK_HMAC_KEY`
- a boarded/assigned Adyen test terminal ID in GoSpots `PaymentTerminal.externalTerminalId`

Optional:

- `ADYEN_TERMINAL_SALE_ID` (defaults to `GoSpots`)
- `ADYEN_TERMINAL_TIMEOUT_MS` (defaults to 160000; must remain above 150 seconds for synchronous cloud payment requests)
- `ADYEN_TERMINAL_BASE_URL` only for controlled automated testing.

## Evidence boundary

Automated mocks and fake venue data may certify GoSpots adapter semantics, reconciliation safety, duplicate handling and release regressions. They **do not** replace the Phase 17 requirement for real provider/terminal evidence.

Real-provider acceptance still requires an Adyen test/live-appropriate exercise covering at least:

1. successful card-present payment;
2. decline;
3. communication timeout/uncertain payment followed by TransactionStatus recovery;
4. cancel while in progress;
5. referenced refund and `CANCEL_OR_REFUND` webhook;
6. duplicate webhook delivery;
7. provider/GoSpots reconciliation with no duplicate charge or refund.

Phase 18 is not started by this work.

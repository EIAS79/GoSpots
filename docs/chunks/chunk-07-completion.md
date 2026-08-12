# Chunk 07 — Payment Terminal Connectors

## Status

**ENGINEERING DONE — EXTERNAL PILOT REQUIRED FOR THE EXECUTION-PLAN PRODUCTION GATE.**

All repository implementation and automated acceptance for the first real provider connector are complete. The execution plan additionally requires a real provider sandbox/reference payment flow. That external evidence cannot be fabricated by repository CI and remains a controlled pre-production pilot requirement.

## Delivered

- Provider-neutral Chunk 06 domain retained as the only checkout/payment boundary.
- Real `StripeTerminalConnector` using Stripe Terminal server-driven flow.
- Poland-first PLN validation with exact decimal-to-minor-unit conversion; no floating-point money conversion.
- Durable local `PaymentOperation` remains authoritative.
- Mandatory client and provider idempotency.
- Terminal mapping through tenant-scoped `PaymentTerminal.externalTerminalId`.
- Payment creation, status/reconciliation, cancel and refund paths.
- Ambiguous network/provider outcomes persist as `UNKNOWN` + reconciliation-required; no blind duplicate-charge retry.
- Signed raw-body Stripe webhook verification and normalization into `PaymentWebhookEvent`.
- Provider/payment operation HTTP endpoints guarded by JWT and existing checkout permissions/domain gates.
- Existing Device settings provide terminal assignment, provider, active/disabled and last-seen/operator diagnostics.
- Operational rollout/timeout/refund/webhook/rollback runbook.

## Safety invariants

1. Checkout does not import the Stripe SDK.
2. No secret key/webhook secret is committed.
3. Local validation errors are deterministic `FAILED`, not `UNKNOWN`.
4. A remote ambiguity is `UNKNOWN`; the same provider PaymentIntent is reconciled rather than recreated.
5. Refunds reference the original captured operation and immutable allocations.
6. Valid Stripe webhooks that are not tied to a GoSpots Terminal `PaymentOperation` are ignored.
7. Duplicate provider events are idempotent.
8. Provider payment code does not claim offline capability.

## Automated acceptance

PR #36 repository verification confirms the connector remains compatible with the full platform gate:

- Stripe connector lifecycle tests;
- full API Jest suite;
- API TypeScript/Nest build;
- web checkout and Offline Lite tests;
- web TypeScript typecheck/build;
- Edge Hub tests/build;
- fresh PostgreSQL 17 migration deploy/status/Prisma validate.

## Execution-plan Gate 07

Repository-verifiable items:

- [x] duplicate webhook handling is harmless/idempotent;
- [x] timeout/ambiguous provider state is represented as `UNKNOWN` and reconciled rather than blindly retried;
- [x] refund path is implemented and tested;
- [x] successful provider payment is linked to the settlement/payment domain;
- [x] repeated operator/client requests are protected against double charge by idempotency and operation state.

External pilot evidence still required before declaring the **full real-provider production gate** complete:

- [ ] real Stripe Terminal sandbox/reference payment using provisioned test credentials/reader or Stripe-supported test terminal path;
- [ ] reference decline, timeout/unknown reconciliation, webhook replay, cancellation and refund exercised against that external environment.

## Rollout

The connector requires the existing venue payment gates plus `STRIPE_TERMINAL_ENABLED=true`. Keep it disabled by default until the external pilot evidence above is captured. Re-check current Stripe Terminal availability/support in Poland immediately before pilot activation.

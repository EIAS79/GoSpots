# Chunk 07 — Payment Terminal Connectors

## Status

Implementation complete for the first real provider connector. Automated acceptance is green. Physical-reader/provider-account acceptance remains an explicit pre-production pilot gate because repository CI has no Stripe Terminal hardware or account credentials.

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

The Chunk 07 branch passes:

- Stripe connector lifecycle tests
- full API Jest suite
- API TypeScript build
- web checkout tests
- web TypeScript typecheck/build
- fresh PostgreSQL migration deploy/status/Prisma validate

## External acceptance gate

The execution plan asks for a real provider sandbox/reference flow. That cannot be truthfully completed from repository CI without provisioned Stripe Terminal test credentials/reader access. The runbook therefore makes this a mandatory pilot gate before production enablement and lists the evidence to capture: reference payment, decline, timeout/unknown reconciliation, webhook replay, duplicate idempotency, cancellation, refund, reader offline and reassignment.

## Rollout

The connector requires the existing venue payment gates plus `STRIPE_TERMINAL_ENABLED=true`. Keep it disabled by default. Re-check current Stripe Terminal availability/support in Poland immediately before pilot activation.

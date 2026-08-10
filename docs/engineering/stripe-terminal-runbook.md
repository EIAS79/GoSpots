# Stripe Terminal runbook — Chunk 07

## Scope

GoSpots uses the provider-neutral `PaymentConnector` boundary introduced in Chunk 06. The first real implementation is the server-driven Stripe Terminal connector (`provider = stripe`). Checkout/domain code does not import Stripe SDK types.

## Rollout controls

Production remains opt-in. All of the following must be true before a venue can use provider payments:

1. Shop feature flag `payments_v1` is enabled.
2. Terminal/device functionality is deliberately enabled for the pilot venue.
3. `STRIPE_TERMINAL_ENABLED=true` is configured in the API environment.
4. `STRIPE_SECRET_KEY` is configured securely.
5. `STRIPE_TERMINAL_WEBHOOK_SECRET` is configured securely.
6. The venue has an ACTIVE `PAYMENT_TERMINAL` Device whose terminal row uses provider `stripe` and whose external terminal id is the Stripe reader id (`tmr_...`).

The connector is disabled when `STRIPE_TERMINAL_ENABLED` is absent or false. No credentials are stored in the repository or Device metadata.

## Poland pilot boundary

This implementation is Poland-first and accepts PLN only. Do not use it for another jurisdiction/currency without a separate verified connector configuration. Provider availability, supported readers and commercial terms must be re-checked with Stripe before each production rollout because they can change independently of GoSpots releases.

## Payment lifecycle

1. GoSpots creates a durable local `PaymentOperation` with a client idempotency key.
2. The operation enters `PROCESSING` before the remote call.
3. The Stripe connector creates exactly one `PaymentIntent` with `card_present` and a provider idempotency key.
4. The same PaymentIntent is handed to the assigned reader using server-driven `processPaymentIntent`.
5. Definite provider outcomes map to local states. Network/provider ambiguity maps to `UNKNOWN`, never to an automatic retry that creates another payment.
6. `reconcile` retrieves the same provider PaymentIntent and advances the local state when the provider outcome becomes known.
7. Signed webhooks normalize terminal PaymentIntent completion/failure/cancel events into the existing durable `PaymentWebhookEvent` receipt and local operation state.

## UNKNOWN / timeout operator procedure

- Do **not** start a second payment for the same sale merely because the browser timed out.
- Keep the existing local operation id.
- Use `POST /payments/operations/:id/reconcile` until Stripe returns a definite state.
- If the provider remains unknown, leave the operation reconciliation-required and investigate Stripe using the stored provider PaymentIntent id.
- Only after a definite failed/canceled state may the cashier start a new payment with a new intent/idempotency key.

This is a financial safety invariant designed to prevent duplicate card charges.

## Cancellation

`POST /payments/operations/:id/cancel` attempts to cancel the current reader action (when a terminal is known) and then cancels the same PaymentIntent. A transport/provider ambiguity is persisted for reconciliation rather than assumed canceled.

## Refunds

`POST /payments/operations/:id/refunds` requires an `Idempotency-Key`, exact amount and immutable refund allocations. The connector sends a Stripe refund against the original PaymentIntent using a provider idempotency key. Local refund lineage remains authoritative.

## Webhook endpoint

`POST /api/v1/payments/webhooks/stripe-terminal`

Configure this endpoint in Stripe and store the signing secret only in `STRIPE_TERMINAL_WEBHOOK_SECRET`. The API verifies the raw request body and `Stripe-Signature` before applying an event. Valid Stripe events for PaymentIntents not owned by GoSpots Terminal are ignored so SaaS billing PaymentIntents cannot cross-update venue payment state.

Handled terminal payment events:

- `payment_intent.succeeded` -> `CAPTURED`
- `payment_intent.amount_capturable_updated` -> `AUTHORIZED`
- `payment_intent.payment_failed` -> `FAILED`
- `payment_intent.canceled` -> `CANCELED`

Duplicate deliveries are idempotent through the existing unique provider event receipt.

## Testing

Automated connector tests cover:

- successful reader handoff
- exact PLN minor-unit conversion
- provider idempotency keys
- network timeout / uncertain reader handoff -> `UNKNOWN`
- reconciliation -> `CAPTURED`
- refund + refund idempotency
- invalid sub-grosz input rejected locally without a provider call

CI also runs the full API tests/build, web tests/typecheck/build and fresh PostgreSQL migration dry-run.

### External acceptance still required before a real pilot

Repository CI cannot claim physical hardware acceptance. Before enabling a production venue, run a controlled Stripe Terminal sandbox/test-mode exercise with the exact reader model/account that will be used and record evidence for:

- reference payment
- declined payment
- reader disconnected/offline
- API timeout after remote acceptance
- webhook replay
- repeated client idempotency key
- cancellation
- partial/full refund
- reader reassignment

Do not market the connector as generally available in Poland until provider availability and the pilot evidence are confirmed.

## Disable / rollback

1. Set `STRIPE_TERMINAL_ENABLED=false` (or remove it).
2. Disable the venue's provider-payment/terminal feature flag.
3. Keep historical `PaymentOperation`, `Refund`, `RefundAllocation`, and webhook receipts; never delete them during rollback.
4. Reconcile any operations already in `PROCESSING`/`UNKNOWN` before replacing or re-enabling a connector.

# Billing webhooks

## Durable inbox flow

```
Provider POST
  → verify (signature or API re-fetch)
  → INSERT BillingWebhookEvent status=RECEIVED
       unique (provider, eventId) → duplicate → 200 { duplicate: true }
  → enqueueSoon() + cron processDueEvents()
  → claim: RECEIVED|FAILED → PROCESSING (attemptCount++)
  → re-fetch provider object; apply state machine + entitlements
  → PROCESSED
     or FAILED + nextAttemptAt (exp backoff, capped 1h)
     or DEAD when attemptCount >= BILLING_WEBHOOK_MAX_ATTEMPTS
```

Endpoints (CSRF + throttle skipped; public):

| Path | Provider |
| --- | --- |
| `POST /api/v1/billing/webhooks/stripe` | Stripe |
| `POST /api/v1/billing/webhooks/mollie` | Mollie |
| `POST /api/v1/billing/webhooks/lemon-squeezy` | Legacy Lemon (HMAC; not dual inbox) |

Dual-provider ingest never mutates money until the processor runs. Lemon path remains synchronous in `BillingService.handleWebhook`.

## Stripe events handled

From `STRIPE_HANDLED` in `billing-webhook.service.ts`:

| Event | Effect |
| --- | --- |
| `checkout.session.completed` | Link/activate subscription; mark payment PAID |
| `customer.subscription.created` | Sync remote → canonical |
| `customer.subscription.updated` | Sync remote → canonical |
| `customer.subscription.deleted` | Force `CANCELED` |
| `invoice.paid` | Payment succeeded path + sync |
| `invoice.payment_failed` | PAST_DUE / failure notifications |
| `invoice.payment_action_required` | `REQUIRES_ACTION` + notify |
| `charge.dispute.created` | Payment → `DISPUTED` |

Other Stripe types are ingested (if delivered) but ignored at process time (logged).

Verification: `constructEvent(rawBody, Stripe-Signature, STRIPE_WEBHOOK_SECRET)`. Processor re-retrieves the event by id before mutating.

## Mollie events

Mollie posts `{ id: payment_id }` (form or JSON). Ingest:

1. Parse payment id
2. `retrievePayment` via API (authoritative)
3. Inbox `eventId = mollie_payment_{id}_{status}` (status changes are distinct events)
4. Store payment id on `canonicalEntityId`

Processor always re-fetches the payment. Maps status → canonical payment state; on `PAID` may create Mollie subscription after mandate; on failure may cancel incomplete checkout or mark PAST_DUE.

Event names stored as `payment.{status}` (e.g. `payment.paid`, `payment.failed`).

## Deduplication

- Unique constraint on `(provider, eventId)`
- Prisma `P2002` → `{ ok: true, duplicate: true }` (HTTP 200 so providers stop retrying)
- Claim uses conditional `updateMany` so concurrent workers do not double-process

## Retry / dead-letter

- Cron: every minute (`BillingWebhookProcessor`) + hourly billing job drain
- Backoff: `min(1h, 2^attempt * 1s)`
- Dead rows: `status=DEAD`, `lastError` truncated; investigate and optionally reset to `FAILED` with `nextAttemptAt=now` after fix

Do not delete webhook rows that may be needed for audit; redact PII in `redactedPayload` only.

# Dual-provider billing architecture

GoSpots SaaS billing is provider-neutral. Stripe and Mollie are adapters behind one orchestrator; Lemon Squeezy remains a soft-deprecated legacy path.

## Layers

```
BillingController (owner APIs + public webhooks)
  → BillingOrchestratorService
      → BillingCatalogService          (server-side prices / quotes)
      → BillingProviderRegistry
          → StripeBillingAdapter
          → MollieBillingAdapter
      → Prisma Billing* models
      → BillingEntitlementSync         (→ Subscription entitlement projection)
BillingWebhookController paths
  → BillingWebhookService.ingest*     (verify → durable inbox)
  → BillingWebhookProcessor           (claim → mutate → PROCESSED)
BillingJobsProcessor                  (reminders, grace, stale checkout, webhook retry)
```

## Adapters (`BillingProviderAdapter`)

Contract: `apps/api/src/modules/billing/billing-provider.adapter.ts`

| Concern | Stripe | Mollie |
| --- | --- | --- |
| Automatic renewal checkout | Checkout Session (subscription / `price_data`) | First payment (`sequenceType=first`) → mandate → subscription |
| Manual monthly | One-off Checkout / PaymentIntent | One-off payment (no mandate) |
| Pause | Native `pause_collection` | Cancel remote sub; local `PAUSED` |
| Portal / PM update | Stripe Customer Portal | New first payment to refresh mandate |
| Webhook auth | `Stripe-Signature` + `STRIPE_WEBHOOK_SECRET` | Re-fetch payment via `MOLLIE_API_KEY` |

Adapters map provider statuses → canonical subscription/payment states. Money amounts always come from `BillingCatalogService`, never from the client.

## Orchestrator

`BillingOrchestratorService` is the only mutating entry for owner flows when `BILLING_ENABLED=true`:

- Checkout, cancel, pause/resume, change plan, change renewal mode, switch provider, manual renewal, payment-method update, Stripe portal
- Resolves enabled provider via `readBillingConfig` / registry
- Wraps money POSTs in `withClientIdempotency` (`IDEMPOTENCY_SCOPES.BILLING_*`)
- Persists `BillingSubscription`, `BillingPayment`, `BillingOperation`, add-ons
- Does **not** activate paid entitlements until webhook confirms payment (`PROCESSING` / `CHECKOUT_PENDING` stay pre-paid)

## Webhook inbox

Durable table: `BillingWebhookEvent`

1. Verify (Stripe signature / Mollie API fetch)
2. Insert `RECEIVED` with unique `(provider, eventId)` — duplicates return `{ ok: true, duplicate: true }`
3. Immediately enqueue drain + cron retries
4. Claim → `PROCESSING` (optimistic `updateMany`)
5. Re-fetch provider objects; apply state machine + entitlement sync
6. `PROCESSED`, or `FAILED` with exponential backoff, or `DEAD` after `BILLING_WEBHOOK_MAX_ATTEMPTS`

Raw PAN/card data is never stored; inbox keeps redacted JSON + payload hash.

## Entitlement projection

Source of truth for commercial/provider state: `BillingSubscription` (+ payments, methods, ops).

Projection target: existing `Subscription` (status, pack, seats, add-ons, period, `billingSubscriptionId`).

`BillingEntitlementSync.syncShopEntitlementFromBilling` uses `canonicalToEntitlementStatus`:

| Canonical | Entitlement `Subscription.status` |
| --- | --- |
| TRIALING, ACTIVE, CANCEL_AT_PERIOD_END, RESUME_PENDING | ACTIVE |
| PAST_DUE | PAST_DUE |
| PAUSED, PAUSE_PENDING | PAUSED |
| CANCELED, EXPIRED, UNPAID, INCOMPLETE_EXPIRED | CANCELED |
| DRAFT, CHECKOUT_PENDING, INCOMPLETE, REQUIRES_ACTION, PROCESSING, PROVIDER_ERROR | TRIAL (pre-paid / legacy) |

Access policy (locked):

- ACTIVE / TRIALING: full purchased modules
- PAST_DUE within grace: keep access + banners
- UNPAID / EXPIRED / CANCELED after period: paid modules off; billing UI stays
- CANCEL_AT_PERIOD_END: access until `currentPeriodEnd`
- PROCESSING new checkout: do not activate until webhook PAID

## Config flags

See `billing-config.ts` and env templates: `BILLING_ENABLED`, per-provider toggles, grace days, webhook max attempts, Lemon soft-gate / legacy checkout escape hatch.

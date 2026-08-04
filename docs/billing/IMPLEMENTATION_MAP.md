# Dual-provider billing implementation map (Stripe + Mollie)

## Status: implemented

Phase 5 (tests + docs + env) complete. Dual-provider path is feature-flagged behind `BILLING_ENABLED`.

## Reuse
- Pack/add-on catalog: `venue-packs.ts` (server SoT); web mirrors for preview only
- Entitlements: `subscription-tier.ts`, `venue-entitlements.ts`, FeatureGate UI
- Mail outbox, notifications (`billing`/`subscription`), audit (`subscription`)
- `withPgAdvisoryXactLock` for cron; `withClientIdempotency` for money POSTs
- CSRF + throttle on authenticated billing mutations; skip both on webhooks
- Existing `Subscription` commercial fields (pack, seats, pending*, status, trial, period)

## Replace / deprecate
- New Lemon checkouts (`createCheckout` → feature-flagged off)
- Lemon portal as primary; keep read-only history of `lemon*` IDs
- Soft-deprecate `lemon-squeezy.client.ts` behind `BILLING_LEMON_ENABLED=false`

## Architecture (shipped)
```
BillingController (owner APIs)
  → BillingOrchestratorService
      → BillingCatalogService (server prices)
      → BillingProviderRegistry → StripeBillingAdapter | MollieBillingAdapter
      → Prisma Billing* models
      → BillingEntitlementSync (maps canonical status → Subscription.status)
Billing webhooks
  → BillingWebhookService (RECEIVED inbox) → BillingWebhookProcessor
BillingJobsProcessor (reminders, card expiry, scheduled resume, grace, stale checkout, webhook drain, reconcile)
```

Docs: [ARCHITECTURE](./ARCHITECTURE.md) · [STATE_MACHINE](./STATE_MACHINE.md) · [PROVIDERS](./PROVIDERS.md) · [WEBHOOKS](./WEBHOOKS.md) · [OPERATIONS](./OPERATIONS.md) · [TESTING](./TESTING.md) · [SECURITY](./SECURITY.md)

## Schema strategy
- Keep `Subscription` as entitlement projection (status/pack/period)
- Provider-neutral: BillingAccount, BillingSubscription, BillingPayment,
  BillingPaymentMethodSummary, BillingSubscriptionAddOn, BillingOperation,
  BillingNotificationDelivery
- `BillingWebhookEvent` with status/attempts (preserve Lemon rows)
- Preserve `lemon*` columns on Subscription for history

## Phased delivery
1. Schema + enums + state machine utils — **implemented**
2. Adapters + orchestrator + catalog — **implemented**
3. Durable webhooks + jobs — **implemented**
4. Frontend + LS cutover flag — **implemented** (flagged)
5. Tests + docs + env — **implemented**

## Access policy (locked)
- ACTIVE/TRIALING: full purchased modules
- PAST_DUE within grace: keep access + banners
- UNPAID/EXPIRED/CANCELED after period: paid modules off; billing UI stays
- CANCEL_AT_PERIOD_END: access until currentPeriodEnd
- PROCESSING new checkout: do not activate until webhook PAID

## Acceptance package

Full endpoint list, webhook events, env, rollout/rollback: [ACCEPTANCE.md](./ACCEPTANCE.md).

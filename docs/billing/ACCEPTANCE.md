# Dual-provider billing — acceptance & rollout

## Architecture summary

GoSpots SaaS subscriptions (venue owners paying GoSpots) use a **provider-neutral** billing layer:

- **Adapters:** `StripeBillingAdapter`, `MollieBillingAdapter` behind `BillingProviderRegistry`
- **Orchestrator:** checkout, cancel/pause/resume, plan change, renewal-mode change, provider switch, manual renewal, Stripe portal
- **Webhooks:** verify → durable `BillingWebhookEvent` inbox (`RECEIVED`) → async processor → mutate → `PROCESSED` (or `FAILED`/`DEAD`)
- **Jobs (hourly, advisory lock `GS`+`BL`):** reminders (5/3/1), card-expiry notices, scheduled resume, grace/expiry, stale checkout cleanup, webhook drain, reconciliation
- **Catalog:** server-side pack/add-on/seat quotes; never trust client prices
- **Entitlements:** `BillingEntitlementSync` maps canonical status → legacy `Subscription` + pack features
- **Lemon Squeezy:** soft-gated (`BILLING_LEMON_ENABLED` / `BILLING_LEMON_LEGACY_CHECKOUT`); history columns preserved

Renewal modes: `AUTOMATIC_RENEWAL` (Stripe Billing / Mollie mandate+subscription) and `MANUAL_MONTHLY` (hosted checkout each period).

## Prisma migration

- `apps/api/prisma/migrations/20260803180000_dual_provider_billing/migration.sql`
- Models: `BillingAccount`, `BillingSubscription`, `BillingSubscriptionAddOn`, `BillingPayment`, `BillingPaymentMethodSummary`, evolved `BillingWebhookEvent`, `BillingNotificationDelivery`, `BillingOperation`
- Enums for providers, renewal modes, canonical subscription/payment statuses, webhook/operation statuses
- Legacy `Subscription` Lemon columns retained; optional `billingSubscriptionId` link; `SubscriptionStatus.PAUSED` added

Apply with: `pnpm --filter @gospots/api migrate:deploy` (never `db push` in production).

## API endpoints (`/api/v1/billing`)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/status` | Dual or Lemon status |
| GET | `/catalog` | Trusted catalog quote inputs |
| GET | `/providers` | Enabled providers + features |
| GET | `/subscription` | Canonical + provider state |
| GET | `/payments` | Payment history |
| GET | `/invoices` | Alias of payments |
| GET | `/audit` | Billing-related audit rows |
| GET | `/health` | Owner/admin ops snapshot |
| GET | `/checkout/:operationId/status` | Confirming page poll |
| POST | `/checkout` | Dual or Lemon; Idempotency-Key |
| POST | `/subscription/cancel` | IMMEDIATE \| PERIOD_END |
| POST | `/subscription/pause` | Provider-aware |
| POST | `/subscription/resume` | |
| POST | `/subscription/change-plan` | |
| POST | `/subscription/change-renewal-mode` | |
| POST | `/subscription/switch-provider` | New hosted auth |
| POST | `/manual-renewal/checkout` | |
| POST | `/payment-method/update` | |
| POST | `/stripe/customer-portal` | Stripe only |
| POST | `/portal` | Legacy Lemon |
| GET | `/webhooks/dead-letter` | Owner (tenant) / SUPER_ADMIN |
| POST | `/webhooks/dead-letter/:id/replay` | |
| POST | `/webhooks/stripe` | Public, signature verified |
| POST | `/webhooks/mollie` | Public; re-fetch payment |
| POST | `/webhooks/lemon-squeezy` | Legacy |

## Stripe webhook events handled

`checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created|updated|deleted|paused|resumed|trial_will_end`, `invoice.created|finalized|paid|payment_failed|payment_action_required`, `payment_intent.processing|succeeded|payment_failed`, `charge.refunded`, `charge.dispute.created|closed`.

## Mollie

Payment webhooks: re-fetch payment by id; map statuses; create subscription after first/mandate for automatic renewal; never trust posted amount alone.

## Required Stripe dashboard config

1. Products/Prices for packs (or price map via `STRIPE_PRICE_MAP`)
2. Customer Portal enabled (payment method, invoices, cancel as desired)
3. Webhook endpoint → `https://<api>/api/v1/billing/webhooks/stripe` with events above
4. Test mode keys + CLI for local: `stripe listen --forward-to localhost:<api>/api/v1/billing/webhooks/stripe`

## Required Mollie dashboard config

1. Profile + test/live API key
2. Recurring payments / mandates enabled for automatic mode
3. Webhook URL on payments → `https://<api>/api/v1/billing/webhooks/mollie`
4. Redirect URLs allowlisted for GoSpots web origins

## Environment variables

See `apps/api/.env.example` and `.env.production.example`:

- `BILLING_ENABLED`, `BILLING_STRIPE_ENABLED`, `BILLING_MOLLIE_ENABLED`, `BILLING_DEFAULT_PROVIDER`
- `BILLING_GRACE_PERIOD_DAYS`, `BILLING_WEBHOOK_MAX_ATTEMPTS`, `BILLING_CRON`
- `BILLING_LEMON_ENABLED`, `BILLING_LEMON_LEGACY_CHECKOUT` (default off)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_API_VERSION`, `STRIPE_PRICE_MAP`
- `MOLLIE_API_KEY`, `MOLLIE_PROFILE_ID`, `MOLLIE_WEBHOOK_MODE`

Production boot fails if an enabled provider is missing secrets.

## Test commands

```bash
cd apps/api
pnpm test:billing
pnpm exec tsc --noEmit -p tsconfig.json
cd ../web && pnpm exec tsc --noEmit -p tsconfig.json
```

Provider E2E (manual): follow `docs/billing/TESTING.md` with Stripe CLI + Mollie test mode.

## Provider differences / limitations

- **Mollie pause** is local: stop future charges / clear provider subscription id; resume may recreate subscription or require new mandate — UI must not claim Stripe-identical pause.
- **Provider switch** never reuses payment methods across Stripe↔Mollie; cancel-at-period-end then new checkout.
- **Checkout success URL** only shows confirming UI; access requires webhook-confirmed state.
- Lemon remains for historical data / emergency flag only — not for new production checkouts when dual billing is on.

## Production rollout checklist

1. Migrate DB (`migrate deploy`)
2. Configure Stripe + Mollie secrets; keep `BILLING_ENABLED=false`
3. Register webhooks (test → live)
4. Enable `BILLING_STRIPE_ENABLED` / `BILLING_MOLLIE_ENABLED`
5. Canary: `BILLING_ENABLED=true` on staging; one auto + one manual per provider
6. Verify inbox → PROCESSED, entitlements, reminders
7. Cancel any remaining live Lemon subscriptions intentionally before cutover
8. Production flip; monitor DEAD webhooks and PAST_DUE
9. Remove Lemon live secrets after cutover window

## Rollback

```
BILLING_ENABLED=false
```

Optional Lemon escape: `BILLING_LEMON_ENABLED=true` (temporary). Do not drop billing tables. Details: `docs/billing/OPERATIONS.md`.

## Docs index

- `docs/billing/ARCHITECTURE.md`
- `docs/billing/STATE_MACHINE.md`
- `docs/billing/PROVIDERS.md`
- `docs/billing/WEBHOOKS.md`
- `docs/billing/SECURITY.md`
- `docs/billing/OPERATIONS.md`
- `docs/billing/TESTING.md`
- `docs/billing/IMPLEMENTATION_MAP.md`

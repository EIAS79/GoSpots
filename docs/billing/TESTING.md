# Billing testing

## Unit tests

From `apps/api` (Jest-style `*.spec.ts` colocated with modules):

```bash
# If Jest is wired in the workspace:
pnpm exec jest src/modules/billing/billing-state-machine.spec.ts
pnpm exec jest src/modules/billing/billing-catalog.service.spec.ts
pnpm exec jest src/modules/billing/billing-webhook.service.spec.ts
```

Coverage expectations:

- **State machine:** legal happy paths, illegal jumps, entitlement mapping
- **Catalog:** unknown pack / add-on rejected; quote amounts from server catalog (ignore client prices)
- **Webhook inbox:** duplicate `(provider, eventId)` → `{ duplicate: true }`

## Stripe CLI (test mode)

1. `stripe login` and use test keys (`sk_test_…`, `pk_test_…`)
2. Forward webhooks:

```bash
stripe listen --forward-to localhost:3001/api/v1/billing/webhooks/stripe
```

3. Put the CLI signing secret into `STRIPE_WEBHOOK_SECRET`
4. Env sketch:

```
BILLING_ENABLED=true
BILLING_STRIPE_ENABLED=true
BILLING_MOLLIE_ENABLED=false
BILLING_DEFAULT_PROVIDER=STRIPE
STRIPE_SECRET_KEY=sk_test_…
STRIPE_PUBLISHABLE_KEY=pk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…   # from stripe listen
# STRIPE_API_VERSION=            # optional pin
# STRIPE_PRICE_MAP={"gaming_suite":"price_…"}
```

5. Trigger: owner checkout in web app, or `stripe trigger checkout.session.completed` (may need metadata alignment)
6. Assert inbox row PROCESSED and `Subscription` entitlement updated

## Mollie test mode

1. Dashboard → test API key (`test_…`) and profile id
2. Env:

```
BILLING_ENABLED=true
BILLING_MOLLIE_ENABLED=true
BILLING_DEFAULT_PROVIDER=MOLLIE
MOLLIE_API_KEY=test_…
MOLLIE_PROFILE_ID=pfl_…
# MOLLIE_WEBHOOK_MODE=test
```

3. Expose local API (ngrok / Cloudflare tunnel) and set Mollie payment `webhookUrl` to  
   `https://YOUR_TUNNEL/api/v1/billing/webhooks/mollie`
4. Complete a first payment in Mollie test checkout; confirm mandate + subscription creation for automatic renewal
5. Confirm processor re-fetches payment (never trusts body amount)

## Manual checklist

- [ ] Automatic renewal checkout (Stripe and/or Mollie)
- [ ] Manual monthly checkout
- [ ] Cancel at period end + immediate cancel
- [ ] Pause / resume (note Mollie local pause)
- [ ] Payment failure → PAST_DUE → grace → UNPAID (shorten `BILLING_GRACE_PERIOD_DAYS` in staging)
- [ ] Idempotent checkout POST (same `Idempotency-Key`)
- [ ] CSRF required on authenticated billing mutations; webhooks exempt
- [ ] `BILLING_ENABLED=false` blocks dual orchestrator

## What not to do

- Do not point production webhook secrets at local tunnels
- Do not commit real keys
- Do not run destructive Prisma commands (`migrate reset`, drop) against shared DBs

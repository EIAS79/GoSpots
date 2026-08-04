# Billing security

## No PAN / card storage

- Card numbers, CVV, and full payment instrument PANs are **never** stored in GoSpots DB or logs
- Stripe and Mollie host PCI-sensitive collection
- We persist only provider ids, last-4 / brand summaries via `BillingPaymentMethodSummary` when the provider exposes them, amounts, currencies, and redacted webhook payloads
- Inbox `redactedPayload` must not include raw customer payment method secrets

## Webhook authenticity

| Provider | Rule |
| --- | --- |
| Stripe | Verify `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET` against **raw body**. Reject before inbox insert on failure (`401`) |
| Mollie | Body is not authoritative for money. Fetch payment with `MOLLIE_API_KEY`; processor re-fetches again |
| Lemon (legacy) | HMAC `X-Signature` with `LEMON_SQUEEZY_WEBHOOK_SECRET`; verify before handling |

Unsigned or invalid webhooks must not create processing side effects.

## CSRF

- Authenticated billing mutations use session/JWT + CSRF (same as other owner money paths)
- Webhook routes are `@Public()`, `@SkipCsrf()`, `@SkipThrottle()` — auth is provider signature / API re-fetch, not browser CSRF tokens

## Idempotency

- Owner money POSTs accept `Idempotency-Key` and use `withClientIdempotency` (`BILLING_CHECKOUT`, cancel, pause, resume, change plan, etc.)
- Webhook inbox unique `(provider, eventId)` prevents double insert
- Conditional claim prevents concurrent double-processing
- State machine same-state no-ops allow safe replays

## Secrets

Required when flags are on (see `production-secrets.util.ts`):

| Flag | Secrets |
| --- | --- |
| `BILLING_STRIPE_ENABLED` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `BILLING_MOLLIE_ENABLED` | `MOLLIE_API_KEY` |
| `BILLING_LEMON_ENABLED` | `LEMON_SQUEEZY_WEBHOOK_SECRET` |

Also protect: `STRIPE_PUBLISHABLE_KEY` (public by design but environment-scoped), `MOLLIE_PROFILE_ID`, optional `STRIPE_PRICE_MAP`.

- Never commit `.env` or real keys
- Rotate webhook secrets if leaked; update provider dashboard + env together
- Prefer least privilege API keys (Stripe restricted keys where possible)

## Amounts and trust boundaries

- Client may send `packId`, `addOnIds`, `seatQuantity`, `currency`, `provider` — **not** payable amounts
- `BillingCatalogService.quote` is server SoT (venue-packs + FX)
- Metadata on provider objects includes `shop_id` / `billing_subscription_id` for correlation; never trust client-supplied price fields in webhooks

## Access / tenancy

- Owner APIs require JWT + shop scope (`requireShopId`)
- Webhook processors resolve shop from verified provider metadata / customer linkage
- Entitlement projection only updates the matched shop’s `Subscription`

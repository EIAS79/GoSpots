# Stripe vs Mollie

Both providers implement `BillingProviderAdapter`. Product UX is unified; provider differences are encapsulated in adapters + orchestrator branches.

## Feature matrix

| Capability | Stripe | Mollie |
| --- | --- | --- |
| Automatic monthly renewal | Native Subscriptions | Subscriptions after valid **mandate** |
| Manual monthly | One-off Checkout / PaymentIntent | One-off payment (no mandate) |
| Pause | Native `pause_collection` (`mark_uncollectible`) | **No native pause** — cancel remote subscription; persist local `PAUSED` |
| Resume | Clear `pause_collection` on same subscription | Recreate subscription if mandate still valid |
| Cancel at period end | `cancel_at_period_end=true` | Cancel API (Mollie ends at period boundary) |
| Customer portal | Stripe Billing Customer Portal | No hosted portal — new first payment to update method |
| Webhook verification | HMAC signature (`STRIPE_WEBHOOK_SECRET`) | Body is payment id only; **always re-fetch** payment |
| Price catalog | Optional `STRIPE_PRICE_MAP` Price ids; else `price_data` | Amounts sent as Mollie `amount` (server quote) |
| SCA / action required | Checkout + `invoice.payment_action_required` | Redirect / open payment statuses |

## Mandates (Mollie)

Automatic renewal:

1. Create customer
2. First payment with `sequenceType=first` (establishes mandate)
3. On webhook `PAID`, orchestrator may call `ensureMollieSubscriptionAfterMandate`
4. Recurring charges use the mandate; updating payment method means another first payment

Manual monthly never creates a mandate/subscription.

## Pause semantics

- **Stripe:** remote pause; subscription id preserved; resume updates same id.
- **Mollie:** adapter cancels remote subscription and returns `localNote: 'PAUSED'`. Resume creates a **new** provider subscription when a valid mandate exists.

## Portal / payment method

- **Stripe:** `POST /billing/stripe/customer-portal` → Billing Portal session URL.
- **Mollie:** `changePaymentMethod` / management session creates a small first payment checkout (mandate refresh). There is no Stripe-equivalent hosted portal.

## Provider switch

`SwitchProviderDto` starts a new checkout on the target provider. Do not assume shared customer ids across Stripe and Mollie. Local `BillingAccount` is keyed by `(shopId, provider)`.

## Env enablement

```
BILLING_ENABLED=true
BILLING_STRIPE_ENABLED=true|false
BILLING_MOLLIE_ENABLED=true|false
BILLING_DEFAULT_PROVIDER=STRIPE|MOLLIE
```

A provider is usable only when the master flag is on, the per-provider flag is on, and secrets are present (`STRIPE_SECRET_KEY` / `MOLLIE_API_KEY`).

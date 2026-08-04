# Billing state machine

Canonical enums live on Prisma (`BillingCanonicalSubscriptionStatus`, `BillingCanonicalPaymentStatus`) and are enforced in `billing-state-machine.ts`.

Same-state updates are always allowed (idempotent webhook replays). Illegal jumps throw `InvalidBillingTransitionError`. Processors soft-skip illegal transitions on replay when appropriate.

## Subscription states

| State | Meaning |
| --- | --- |
| DRAFT | Local row before checkout redirect |
| CHECKOUT_PENDING | Customer sent to provider checkout |
| INCOMPLETE | Provider sub started but not paid |
| REQUIRES_ACTION | SCA / customer action needed |
| PROCESSING | Payment submitted; awaiting confirmation |
| TRIALING | In trial window |
| ACTIVE | Paid and current |
| PAST_DUE | Payment failed; inside grace |
| UNPAID | Grace exhausted |
| PAUSE_PENDING | Pause requested at provider |
| PAUSED | Collections paused (Stripe) or local pause (Mollie) |
| RESUME_PENDING | Resume in flight |
| CANCEL_AT_PERIOD_END | Will end at `currentPeriodEnd` |
| CANCELED | Ended |
| EXPIRED | Period ended without renewal (esp. manual) |
| INCOMPLETE_EXPIRED | Stale incomplete checkout |
| PROVIDER_ERROR | Provider call failed; recoverable |

### Allowed transitions (summary)

```
DRAFT → CHECKOUT_PENDING | CANCELED | PROVIDER_ERROR

CHECKOUT_PENDING → INCOMPLETE | REQUIRES_ACTION | PROCESSING | TRIALING | ACTIVE
                 | CANCELED | EXPIRED | INCOMPLETE_EXPIRED | PROVIDER_ERROR

INCOMPLETE → REQUIRES_ACTION | PROCESSING | TRIALING | ACTIVE | CANCELED
           | INCOMPLETE_EXPIRED | PROVIDER_ERROR

REQUIRES_ACTION → PROCESSING | TRIALING | ACTIVE | PAST_DUE | CANCELED
                | INCOMPLETE_EXPIRED | PROVIDER_ERROR

PROCESSING → TRIALING | ACTIVE | PAST_DUE | REQUIRES_ACTION | CANCELED | PROVIDER_ERROR

TRIALING → ACTIVE | PAST_DUE | CANCEL_AT_PERIOD_END | PAUSE_PENDING | CANCELED | EXPIRED | PROVIDER_ERROR

ACTIVE → PAST_DUE | UNPAID | CANCEL_AT_PERIOD_END | PAUSE_PENDING | CANCELED | EXPIRED | PROVIDER_ERROR

PAST_DUE → ACTIVE | UNPAID | CANCEL_AT_PERIOD_END | PAUSE_PENDING | CANCELED | EXPIRED | PROVIDER_ERROR

UNPAID → ACTIVE | PAST_DUE | CANCELED | EXPIRED | PROVIDER_ERROR

PAUSE_PENDING → PAUSED | ACTIVE | CANCELED | PROVIDER_ERROR
PAUSED → RESUME_PENDING | ACTIVE | CANCELED | EXPIRED | PROVIDER_ERROR
RESUME_PENDING → ACTIVE | PAUSED | CANCELED | PROVIDER_ERROR

CANCEL_AT_PERIOD_END → ACTIVE | CANCELED | EXPIRED | PAST_DUE | PROVIDER_ERROR

CANCELED | EXPIRED | INCOMPLETE_EXPIRED → CHECKOUT_PENDING | PROVIDER_ERROR

PROVIDER_ERROR → (most non-terminal recovery targets)
```

Terminal-ish: `CANCELED` / `EXPIRED` / `INCOMPLETE_EXPIRED` only reopen via new checkout.

### Happy paths

1. **New auto checkout:** `DRAFT` → `CHECKOUT_PENDING` → `PROCESSING` → `ACTIVE` (or `TRIALING`)
2. **Pause / resume:** `ACTIVE` → `PAUSE_PENDING` → `PAUSED` → `RESUME_PENDING` → `ACTIVE`
3. **Cancel at period end:** `ACTIVE` → `CANCEL_AT_PERIOD_END` → `CANCELED`
4. **Failed renewal:** `ACTIVE` → `PAST_DUE` → (grace cron) `UNPAID`

## Payment states

| State | Meaning |
| --- | --- |
| CREATED | Local payment row |
| OPEN | Checkout / payment open at provider |
| REQUIRES_ACTION | 3DS / redirect |
| PENDING | Provider pending |
| PROCESSING | In flight |
| AUTHORIZED | Auth hold (if applicable) |
| PAID | Successfully collected |
| FAILED / CANCELED / EXPIRED | Terminal failure paths |
| REFUND_PENDING / PARTIALLY_REFUNDED / REFUNDED | Refund lifecycle |
| DISPUTED / CHARGEBACK | Dispute lifecycle |
| UNKNOWN | Unmapped provider status |

### Allowed transitions (summary)

```
CREATED → OPEN | REQUIRES_ACTION | PENDING | PROCESSING | AUTHORIZED | PAID | FAILED | CANCELED | EXPIRED | UNKNOWN
OPEN → REQUIRES_ACTION | PENDING | PROCESSING | AUTHORIZED | PAID | FAILED | CANCELED | EXPIRED | UNKNOWN
… → PAID is the success sink for collection
PAID → REFUND_PENDING | PARTIALLY_REFUNDED | REFUNDED | DISPUTED | CHARGEBACK
CANCELED, CHARGEBACK → (empty — terminal)
EXPIRED → OPEN | CREATED (reopen)
UNKNOWN → any concrete state (recovery)
```

`PAID → OPEN` and `CANCELED → PAID` are illegal.

## Entitlement mapping

See `canonicalToEntitlementStatus` in `billing-state-machine.ts` and [ARCHITECTURE.md](./ARCHITECTURE.md).

## Cron-driven transitions

`BillingJobsProcessor` (when `BILLING_ENABLED` and `BILLING_CRON` not off):

- `PAST_DUE` + `gracePeriodEndsAt <= now` → `UNPAID`
- `CANCEL_AT_PERIOD_END` + period ended → `CANCELED`
- Manual renewal past period → `PAST_DUE` (grace) then `EXPIRED`
- Stale `DRAFT` (>24h) → `CANCELED`
- Stale `CHECKOUT_PENDING` / `INCOMPLETE` (>24h) → `INCOMPLETE_EXPIRED`

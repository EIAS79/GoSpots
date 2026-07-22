# Locora — Lemon webhook idempotency (Bible §9 / legacy #8)

**Date:** 2026-07-20 (handler + migration) / 2026-07-22 (residual docs lanes **WEBHOOK8-residual-docs**, **GUEST9-residual-docs**)  
**Status:** **Bible #8 / §9 DONE** (code ship bar) — durable `BillingWebhookEvent` receipt + Lemon handler dedupe = **DONE** on disk. **No code residual** for §9. Operator Neon migrate + Lemon URL/secret alignment + duplicate-delivery smoke are **explicitly residual**.  
**Bible:** P0 **§9** — subscription webhook handling must be proven idempotent (Lemon Squeezy billing).

---

## Section crosswalk (§9 ≠ guest contact)

**§9 is Lemon billing webhook idempotency — not guest contact, public guest flows, or guest token security.**

Agents searching “guest contact / public guest” should use these bible sections instead:

| Topic | Bible § | Residual doc |
|-------|---------|--------------|
| Guest status-link tokens (hash / expiry / Clear→DROP) | **§11** | [`GO_SPOTS_GUEST_TOKEN.md`](./GO_SPOTS_GUEST_TOKEN.md) |
| Guest contact fields + fragmented visit identity (`GuestChat`, reservations, orders) | **§19** | [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md) |
| Public contact / booking / chat abuse (throttle + CAPTCHA) | **§28** | [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) |
| Public guest UI i18n (booking, chat, status pages) | **§30** | [`GO_SPOTS_I18N.md`](./GO_SPOTS_I18N.md) |
| Public guest outage UX (booking/chat fail-closed; status cards) | **§33** | [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) |

Lane id **GUEST9** names a docs-only pass on **actual §9** after verifying the bible index — not a “guest contact §9” feature.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| `BillingWebhookEvent` unique `(provider, eventId)` | **DONE** | Migration `20260720210000_billing_webhook_events`; `schema.prisma` |
| Receipt insert **before** subscription mutations | **DONE** | `BillingService.handleWebhook` |
| Duplicate / concurrent delivery → no-op (`P2002`) | **DONE** | Returns `{ ok: true, duplicate: true }` |
| HMAC verify **before** receipt (bad sig never writes) | **DONE** | Controller + `verifySignature`; **401** bad sig; **503** if secret unset |
| Malformed JSON → **400**; non-object payload ignored | **DONE** | Controller / service guards |
| Unknown / non-subscription `event_name` → receipt + `{ ignored: true }` | **DONE** | No Subscription mutation |
| Mutating events handled idempotently | **DONE** | `subscription_created\|updated\|resumed\|unpaused\|cancelled\|expired\|paused` |
| Prod boot requires `LEMON_SQUEEZY_WEBHOOK_SECRET` | **DONE** | `assertCriticalSecretsAtBoot` + `BillingService.onModuleInit` |
| `@SkipCsrf()` + `@SkipThrottle()` on webhook route | **DONE** | `billing.controller.ts` — signature-verified external caller |
| Deploy checklist + `.env.production.example` | **DONE** | [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) migration **#1** |
| Jest edge characterization | **DONE** | `billing.service.spec` — signature + duplicate/P2002 + concurrent duplicate |
| **Operator:** Neon `migrate deploy` folder #1 of 18 | **RESIDUAL (operator)** | [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md); Render suspended — [`PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md) |
| **Operator:** Lemon dashboard URL + secret aligned with host | **RESIDUAL (operator)** | `POST /api/v1/billing/webhooks/lemon-squeezy` |
| **Operator:** post-deploy duplicate-delivery smoke | **RESIDUAL (operator)** | Replay same Lemon event → subscription unchanged; receipt dedupes |
| Client `Idempotency-Key` on staff money routes | **NOT §9** | Adjacent **§7 / #7** — [`GO_SPOTS_IDEMPOTENCY.md`](./GO_SPOTS_IDEMPOTENCY.md) |
| Public guest booking idempotency | **NOT §9** | Throttle + overlap locks today; separate product decision — same idempotency doc |
| Resend / mail provider webhook reconciliation | **NOT §9** | Deferred — [`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md) |
| Second billing provider (Stripe, etc.) | **NOT §9** | Lemon-only product surface today |

**§9 classification:** **DONE** — original P0 “webhook replay double-applies subscription” finding is **ALREADY FIXED**. Saying “§9 complete with zero follow-ups” is accurate for **code**; operator migrate + smoke remain before production acceptance (§37).

---

## Handler flow (receipt-first)

```
Lemon POST ──► verify HMAC (401/503 if fail)
                    │
                    ▼
              parse JSON (400 if bad)
                    │
                    ▼
         resolve eventId (meta.event_id │ meta.webhook_id │ body hash │ fingerprint)
                    │
                    ▼
         INSERT BillingWebhookEvent (provider=lemon, eventId)
                    │
         ┌──────────┴──────────┐
         │ P2002 duplicate     │ success
         ▼                     ▼
    { duplicate: true }   if ignored event_name → { ignored: true }
                          else apply Subscription + audit (idempotent upsert semantics)
```

**Secret rotation:** after rotating `LEMON_SQUEEZY_WEBHOOK_SECRET`, replay from Lemon dashboard is safe — duplicate receipts no-op by design.

---

## Operator verification checklist

Use after Render API is **resumed** and env matches [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) §1.

### Gate 0 — Migration applied

- [ ] `20260720210000_billing_webhook_events` applied on Neon (`pnpm prisma migrate deploy` from `apps/api` — folder **#1** in [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md)).
- [ ] `\d "BillingWebhookEvent"` shows unique index on `(provider, eventId)`.

### Gate 1 — Lemon dashboard + env

- [ ] Render **`gospots-api`:** `LEMON_SQUEEZY_WEBHOOK_SECRET` set (matches Lemon signing secret).
- [ ] Lemon webhook URL → `https://<api-host>/api/v1/billing/webhooks/lemon-squeezy`.
- [ ] API boots in production (secret fail-fast passes).

### Gate 2 — Duplicate delivery smoke

- [ ] Trigger a test subscription event (or use Lemon “send test”).
- [ ] Confirm Subscription row updates once; `BillingWebhookEvent` row exists.
- [ ] **Replay the same delivery** (Lemon dashboard or captured payload + valid signature) → HTTP 200, `{ duplicate: true }` or equivalent no-op; **no second audit side effect**.
- [ ] Bad signature → **401**, **no** new receipt row for that attempt.

### Gate 3 — Unknown event soak (optional)

- [ ] Send a non-subscription `event_name` → receipt stored, `{ ignored: true }`, Subscription unchanged.

---

## Related docs

| Doc | Relationship |
|-----|--------------|
| [`GO_SPOTS_IDEMPOTENCY.md`](./GO_SPOTS_IDEMPOTENCY.md) | Client money-path keys (#7) — separate stack from webhook receipts |
| [`GO_SPOTS_CSRF.md`](./GO_SPOTS_CSRF.md) | `@SkipCsrf()` on Lemon route documented |
| [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) | `@SkipThrottle` on billing webhooks |
| [`GO_SPOTS_IMPLEMENTATION_REPORT.md`](./GO_SPOTS_IMPLEMENTATION_REPORT.md) §1.1 | Wave 1 ship log |
| [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) | Legacy **#8** DONE entry |

**Verify (docs-only lane):** cross-links in `ORIGINAL_AUDIT_BIBLE.md` §9, `BIBLE_PROGRESS.md`, `GO_SPOTS_DEEP_AUDIT.md` §9, `BIBLE_RESIDUAL_INVENTORY.md` §9.

# Locora — Client Idempotency-Key coverage (design only)

**Date:** 2026-07-21  
**Status:** Design recorded — **no apps code, no schema change, no migrations.**  
**Bible:** P0 **#7** — payment and financial actions need idempotency.  
**Ship timing:** Hot-path layer **already shipped** (Lanes AA / NN). **Remaining money mutations + UI retry key handoff defer until after Friday submit.**

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Through Friday submit** | Keep the three wrapped finance writes + web headers. Do **not** expand scopes into `finance.service` guts or add migrations. Document gaps below as known limitations. |
| **Post-Friday Phase 0** | Inventory every staff money mutator (controller method + web client) → priority table in this doc (update as code moves). |
| **Post-Friday Phase 1** | Wrap **Tier A** endpoints with existing `withClientIdempotency` + new `IDEMPOTENCY_SCOPES` entries; web mints UUID once per user action (same CSRF-retry pattern as Lane NN). |
| **Post-Friday Phase 2** | UI **retry handoff** — on soft failure, reuse the same key for “Try again”; mint a new key only after success or explicit “new attempt”. |
| **Post-Friday Phase 3** | Optional: require `Idempotency-Key` (400 if missing) on Tier A scopes in production; keep optional for Tier B/C. **Shipped (Lane RRRR)** — env `IDEMPOTENCY_REQUIRE_MONEY_KEYS` default off; prod example `true`. |

**Why defer pre-Friday:** Expanding wrappers touches `finance.controller.ts` / clients next to hot pay paths; Phase 2 UI changes every finance panel retry UX. Conditional `updateMany` pay claims + Lemon webhook receipts already cover the worst double-apply cases for Friday smoke. Remaining risk is mostly **double-click / retry** on orders, losses, and cancels.

**Prerequisite already shipped:**

| Surface | Status |
|---------|--------|
| Helper | `withClientIdempotency` + `hashIdempotencyRequest` (`idempotency.util.ts`) |
| Storage | Expand-only `IdempotencyReceipt` (`20260721010000_*`) + in-process memory cache |
| Semantics | Replay same key+hash → stored JSON; key+different hash → **409**; in-flight → **409**; missing key → **passthrough** (no dedupe) |
| TTL | Default **24h** (`IDEMPOTENCY_DEFAULT_TTL_MS`) |
| API scopes | Hot + Tier A + Tier B + Tier C (orders/losses/cancels/play + bulk archive + `shop.currency.apply`); keys optional until Phase 3 (Tier A only when flag on) |
| Web | `finance-client` / `play-billing-client` / `shop-settings-client` (currency apply) + `idempotency-key.ts` — mint once per action fingerprint; reuse until success (Lane LLLL retry handoff); CSRF retries share same header; in-flight 409 → “Still saving…” (Lane OOOO) |
| Webhook (#8) | Lemon `BillingWebhookEvent` uniqueness — **separate** from client keys (DONE) |

---

## Problem (bible #7)

Staff money actions that **create revenue, stock movement, or irreversible cancel/pay state** must survive:

1. Double-click / Enter twice on Confirm  
2. Network timeout → user retries with a second request  
3. CSRF retry that must **not** mint a new key mid-attempt (already handled on the three hot paths)

Today only **three** finance mutations are key-wrapped. Orders, losses, play cancel/update, and most order-line edits can still double-apply if the client retries after an ambiguous failure (even when DB conditional claims mitigate some pay races).

---

## Goal (post-submit)

Reuse the **existing** receipt layer — do not invent a second idempotency stack — so every Tier A money mutation is safe under retry with the same key.

**Non-goals for this design:**

- Changing Lemon webhook receipt model (#8 DONE)  
- Making keys mandatory on **all** PATCH/DELETE before Phase 3  
- Offline write queues / local durable pending ops ([`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md))  
- Ledger posting idempotency ([`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) — ledger rows get their own insert keys later)  
- Public guest booking idempotency (throttle + overlap locks; separate product decision)  
- Rewriting `finance.service.ts` business logic (controller wrap only)

---

## As-is inventory (finance controller)

### Wrapped (shipped)

| Method | Route | Scope constant |
|--------|-------|----------------|
| `createTransaction` | `POST /finance/transactions` | `FINANCE_TRANSACTION_CREATE` |
| `markPlayBillingPaid` | `PATCH /finance/play-billing/:id/mark-paid` | `FINANCE_PLAY_BILLING_MARK_PAID` |
| `markPlaySessionPaid` | `PATCH /finance/play-sessions/:id/mark-paid` | `FINANCE_PLAY_SESSION_MARK_PAID` |
| `createShopOrder` | `POST /finance/orders` | `FINANCE_ORDERS_CREATE` (Tier A / GGGG) |
| `addShopOrderLine` | `POST /finance/orders/:id/lines` | `FINANCE_ORDERS_LINES_ADD` |
| `createLoss` | `POST /finance/losses` | `FINANCE_LOSSES_CREATE` |
| `cancelPlayBilling` | `PATCH /finance/play-billing/:id/cancel` | `FINANCE_PLAY_BILLING_CANCEL` |
| `cancelPlaySession` | `PATCH /finance/play-sessions/:id/cancel` | `FINANCE_PLAY_SESSIONS_CANCEL` |
| `createPlaySession` | `POST /finance/play-sessions` | `FINANCE_PLAY_SESSIONS_CREATE` |
| `updateShopOrder` | `PATCH /finance/orders/:id` | `FINANCE_ORDERS_UPDATE` (Tier B / LLLL) |
| `patchShopOrderLine` | `PATCH …/lines/:lineId` | `FINANCE_ORDERS_LINES_PATCH` |
| `deleteShopOrderLine` | `DELETE …/lines/:lineId` | `FINANCE_ORDERS_LINES_DELETE` |
| `deleteShopOrder` | `DELETE /finance/orders/:id` | `FINANCE_ORDERS_DELETE` |
| `updatePlayBilling` | `PATCH /finance/play-billing/:id` | `FINANCE_PLAY_BILLING_UPDATE` |
| `updatePlaySession` | `PATCH /finance/play-sessions/:id` | `FINANCE_PLAY_SESSIONS_UPDATE` |
| `deleteLoss` | `DELETE /finance/losses/:id` | `FINANCE_LOSSES_DELETE` (Tier C / OOOO) |
| `archiveOrders` | `PATCH /finance/orders/bulk/archive` | `FINANCE_ORDERS_BULK_ARCHIVE` |
| `unarchiveOrders` | `PATCH /finance/orders/bulk/unarchive` | `FINANCE_ORDERS_BULK_UNARCHIVE` |

### Not wrapped — proposed tiers

**Tier A — wrap first (money / stock / irreversible pay-cancel)** — **shipped (Lane GGGG)**

| Method | Route | Why | Proposed scope id |
|--------|-------|-----|-------------------|
| `createShopOrder` | `POST /finance/orders` | Creates order + stock SALE lines | `finance.orders.create` |
| `addShopOrderLine` | `POST /finance/orders/:id/lines` | Stock decrement | `finance.orders.lines.add` |
| `createLoss` | `POST /finance/losses` | Writes loss amount | `finance.losses.create` |
| `cancelPlayBilling` | `PATCH /finance/play-billing/:id/cancel` | Irreversible cancel claim | `finance.play-billing.cancel` |
| `cancelPlaySession` | `PATCH /finance/play-sessions/:id/cancel` | Irreversible cancel | `finance.play-sessions.cancel` |
| `createPlaySession` | `POST /finance/play-sessions` | Walk-in session + billing start | `finance.play-sessions.create` |

**Tier B — wrap second (mutations that can double-charge or double-restore)** — **shipped (Lane LLLL)**

| Method | Route | Notes |
|--------|-------|-------|
| `updateShopOrder` | `PATCH /finance/orders/:id` | Status COMPLETED/CANCELED transitions |
| `patchShopOrderLine` | `PATCH …/lines/:lineId` | Qty change ↔ stock adjust |
| `deleteShopOrderLine` | `DELETE …/lines/:lineId` | Stock restore |
| `deleteShopOrder` | `DELETE /finance/orders/:id` | Cascade + restore |
| `updatePlayBilling` | `PATCH /finance/play-billing/:id` | Amount/discount edits before pay |
| `updatePlaySession` | `PATCH /finance/play-sessions/:id` | Same |

**Tier C — optional / low urgency** — **shipped (Lane OOOO + TTTT)**

| Method | Route | Notes |
|--------|-------|-------|
| `deleteLoss` | `DELETE /finance/losses/:id` | Soft operational; race = 404 second time — **wrapped** |
| `archiveOrders` / `unarchiveOrders` | bulk archive | Idempotent-ish; archive twice is no-op if already archived — **wrapped** |
| Currency apply | `PATCH /shop/settings` when `currency` set | Preview (`POST /shop/currency/preview`) is read-only — **not wrapped**. Apply gated by `confirm:true` (Lane CC) + optional `Idempotency-Key` (Lane **TTTT**); **not** in `IDEMPOTENCY_TIER_A_SCOPES` / require-keys |

**Out of scope for #7 client keys**

| Surface | Reason |
|---------|--------|
| Lemon webhooks | Receipt table (#8) |
| Public booking / event / chat | Abuse throttle (#26); booking locks (#4) |
| GDPR erase / export | Forced reauth (#18); not money create |
| FX catalog reprice | Single `$transaction` + confirm gate (#20) |

---

## Target mechanics (reuse shipped helper)

```
Client action → mint key once (UUID)
  → POST/PATCH with Idempotency-Key + body
  → withClientIdempotency(prisma, { shopId, scope, key, requestHash })
       → memory hit / receipt COMPLETE → return stored JSON
       → receipt PENDING → 409 in progress
       → else run handler; store response JSON (expand-only insert)
```

| Rule | Detail |
|------|--------|
| Scope | **Stable string** per endpoint family; never reuse a scope across different verbs/semantics |
| `requestHash` | `hashIdempotencyRequest` of body **plus** path ids that affect meaning (`orderId`, `lineId`, `reservationId`) |
| Missing key | Keep **optional** until Phase 3 — older mobile/scripts must not brick |
| Shop isolation | Receipt unique on `(shopId, scope, key)` — already true |
| Hot services | Prefer **controller-only** wrap; do not refactor `finance.service` methods for idempotency |

### Web client pattern (extend Lane NN)

```ts
// Per user gesture — not per HTTP attempt
const idempotencyKey = crypto.randomUUID();

async function attempt() {
  return api(path, {
    method: "POST",
    body,
    headers: { "Idempotency-Key": idempotencyKey }, // same object reused on CSRF retry
  });
}
```

**Phase 2 retry handoff (UI):**

| Event | Key behavior |
|-------|----------------|
| First click | Mint key; store in component/`useRef` for this dialog attempt |
| CSRF / transient retry inside same attempt | Reuse key (already done via shared `init.headers`) |
| User sees error toast → clicks “Try again” | **Reuse same key** (server replays or finishes in-flight) |
| Success → open dialog again for a new sale | Mint **new** key |
| User edits body after failed attempt | Mint **new** key (old key+hash would 409) **or** keep key and warn that payload must match |

Document the edit-after-fail rule in staff UI copy once Phase 2 ships.

---

## Phased plan

### Phase 0 — Inventory freeze (docs only; this lane)

- This file is the inventory. Update tiers when endpoints move.  
- No CI gate yet.

### Phase 1 — Tier A API + web headers

1. Add scope constants to `IDEMPOTENCY_SCOPES`.  
2. Wrap Tier A controller methods (mirror mark-paid).  
3. Web: mint keys on corresponding clients (orders / losses / play session create+cancel).  
4. Specs: extend `idempotency.util.spec.ts` only if helper behavior changes; add thin controller/service specs only if existing patterns allow without rewriting hot services.

### Phase 2 — Retry UX

1. Shared small helper `useIdempotentMutation` (or per-panel ref) holding key until success/reset.  
2. Wire finance panels that currently re-call create on every click after error.  
3. Optional: surface 409 “already in progress” as “Still saving…” instead of generic error.

### Phase 3 — Require keys on Tier A (prod)

1. Env `IDEMPOTENCY_REQUIRE_MONEY_KEYS=true` (default off → on in production example).  
2. When set, missing key on Tier A scopes → `400`.  
3. Document in `.env.example` / `.env.production.example`.

---

## Test plan (post-impl; not this lane)

| Case | Expect |
|------|--------|
| Same key + same hash twice | Second returns identical JSON; handler runs once |
| Same key + different body | 409 |
| Parallel same key | One success / one 409 in-progress or replay |
| Missing key (Phase 1) | Passthrough; no receipt |
| Missing key (Phase 3 + env) | 400 on Tier A |
| UI Try again after timeout | Same key; no double order/loss |

Concurrency stress for stock last-unit remains [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) (separate from client keys).

---

## Files (when implementing — not this lane)

| Path | Role |
|------|------|
| `apps/api/src/common/idempotency.util.ts` | Scopes + helper (extend constants only) |
| `apps/api/src/modules/finance/finance.controller.ts` | Wrap Tier A/B/C methods |
| `apps/api/src/modules/shop/shop.controller.ts` | Currency apply wrap on `PATCH /shop/settings` when `currency` set (Lane TTTT) |
| `apps/web/src/lib/finance-client.ts` / play-billing / `shop-settings-client.ts` | Mint + retry handoff |
| `apps/api/.env.example` | Phase 3 require flag comment |

**Do not touch in first impl PR:** `finance.service.ts` internals, `schema.prisma`, new migrations (receipt table already exists).

---

## Tracker impact

| Doc | Update |
|-----|--------|
| `BIBLE_STATUS.md` #7 | Stay **PARTIAL**; link this design under “what exists” |
| `BIBLE_FINISHED.md` | Append Lane **DDDD** design entry |
| `BIBLE_PROGRESS.md` | Link under Design-only / Done notes for client keys |
| `AGENT_COORDINATION.md` | Complete lane **DDDD-idempotency-design** |

---

## Non-goals / Friday residual

- Full money-path coverage **not** required for Friday submit.  
- Operator smoke still proves: SALE + stock, play mark-paid, webhook dup (#8).  
- Double-click on **unwrapped** order/loss create remains a known residual until Phase 1.

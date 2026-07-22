# Locora — Postgres Row-Level Security vs app `shopId`

**Date:** 2026-07-21  
**Status:** **Implemented (ship bar)** — migration on disk + app `SET LOCAL` plumbing (Lane **ZZZZZ**). Neon deploy + `TENANT_RLS=on` = operator soak.  
**Bible:** P0 **#3** — **DONE** (app isolation + RLS belt; residuals below).  
**Ship timing:** App-layer `shopId` hardening shipped earlier; RLS Phase 2 core tables + request session vars shipped 2026-07-21 (opt-in flag).

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Code (done)** | Migration `20260721050000_tenant_rls_core` + `TENANT_RLS` interceptor / `withTenantRls` / Prisma ALS proxy. |
| **After migrate on Neon** | Soak with `TENANT_RLS=off` (policies fail-open when mode unset) → flip `TENANT_RLS=on` → monitor empty-result / pool timeouts. |
| **Later** | Split DB roles (`locora_app` / `locora_migrate` BYPASS); Tier B child tables; `public_insert` guest wrap; pooled live isolation suite. |

**Why fail-open when unset:** FORCE RLS with fail-closed policies would empty all rows the moment migrate deploys before the app sets session vars. Empty `app.rls_mode` → allow; `tenant`/`public_insert` → shop match.

---

## Problem (bible #3)

The deep audit flagged tenant isolation as **application-only** ([`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md) §2.3). A single missed `shopId` in a Prisma `where`, a raw query, or a future agent edit can expose or mutate another venue’s rows. Postgres RLS is the standard **defense-in-depth** belt when the ORM is the primary gate.

**Current posture (DONE ship bar):**

| Layer | Mechanism |
|-------|-----------|
| Session bind | JWT access token; `VenueContextInterceptor` rebinds `shopId` from `x-venue-path` (`slug` + `dashboardKey`) + active `Membership` (or `SUPER_ADMIN` override) |
| Guards | `requireShopId(actor)`; role/permission decorators on controllers |
| Mutations | Audited paths use `findFirst({ id, shopId })` or `shopScopedWhere(id, shopId)` on update/delete ([`tenant.ts`](../../apps/api/src/common/tenant.ts)) |
| Public create | `shopId` from **published venue slug only** — never from request body (`forbidNonWhitelisted` on public DTOs) |
| DB belt | RLS FORCE on 28 Tier A tables; `TenantRlsInterceptor` + `wrapPrismaWithTenantRls` SET LOCAL when `TENANT_RLS=on` |

**Accepted residuals:**

- Public `GET /media/:id` — opaque cuid, no shop check (intentional for public `<img>` URLs).
- Some global tables (`User`, `AuthSession`) are not shop-scoped by design.
- Child rows without denormalized `shopId` (`ShopOrderLine`, `TransactionLineItem`, `ResourceRate`, `GuestChatMessage`, `MenuItemTag`, `MembershipPermission`) — Tier B residual.
- Guest `public_insert` mode not yet auto-wrapped (fail-open when unset; use `withTenantRls` for scripts).
- Neon role split (`locora_app` without BYPASS) not provisioned.

---

## RLS vs app `shopId` — evaluation

### What app-only scoping gives

| Strength | Limit |
|----------|-------|
| Full expressiveness in TypeScript (membership OR filters, feature gates, SUPER_ADMIN) | **No safety net** if one query omits `shopId` |
| Works with Prisma migrations, `$queryRaw`, and Neon pooler **without** session setup | Bugs are **data leaks**, not query errors — hard to detect without dedicated IDOR tests |
| Easy local dev / Jest (single `DATABASE_URL`, no role matrix) | Cron, webhooks, and scripts must each remember scoping manually |
| Already audited on finance, reservations, notifications, hours, gallery, seating | Raw SQL utilities (stock adjust, advisory locks) bypass Prisma model guards |

### What Postgres RLS adds

| Strength | Limit |
|----------|-------|
| **Mandatory** row filter at DB — even `$queryRaw` and future ORM calls inherit policy | Policies are **coarser** than app logic (hard to encode per-permission CSV in SQL) |
| Cross-tenant IDOR becomes **empty set / permission denied** instead of silent wrong-tenant read | Requires **consistent session context** on every connection use |
| Auditable DDL (`pg_policies`) — security review can grep migrations | Child tables without `shopId` need **denormalize or subquery policies** (performance + migration cost) |
| Strong story for enterprise / SOC2 “database-enforced tenancy” | **Break-glass** (`SUPER_ADMIN`, billing webhook, platform ops) needs explicit `BYPASSRLS` role or separate DB user |

### Verdict for Locora

| Approach | Recommendation |
|----------|----------------|
| **App `shopId` only** | Keep as **primary** for permissions / packs / slug resolution. |
| **RLS as supplement** | **Shipped** on Tier A core tables (opt-in `TENANT_RLS`). |
| **RLS replacing app checks** | **Do not** — RLS enforces **shop boundary only**. |

---

## Implemented architecture

### Session variables (tenant context)

```sql
-- At start of each tenant-scoped request transaction (TENANT_RLS=on):
SELECT set_config('app.current_shop_id', '<cuid>', true);  -- LOCAL
SELECT set_config('app.rls_mode', 'tenant', true);
```

Helper: [`tenant-rls.util.ts`](../../apps/api/src/common/tenant-rls.util.ts) — `applyTenantRlsSession` / `withTenantRls` / ALS + `wrapPrismaWithTenantRls`.  
HTTP: [`tenant-rls.interceptor.ts`](../../apps/api/src/common/tenant-rls.interceptor.ts) after `VenueContextInterceptor` (skips `/notifications/stream`).

**Policy (`app_tenant_rls_ok`):** empty mode → allow; `bypass`/`system` → allow; `tenant`/`public_insert` → `"shopId" = current_shop_id`.

### Tables with FORCE RLS (migration `20260721050000_tenant_rls_core`)

`Reservation`, `ShopOrder`, `Transaction`, `PlaySession`, `MenuItem`, `MenuSection`, `GalleryItem`, `StoredImage`, `Membership`, `Resource`, `ResourceCategory`, `EventRequest`, `VenueReview`, `GuestChat`, `Notification`, `AuditLog`, `OpeningHour`, `ScheduleException`, `ContactMessage`, `ShopNote`, `GamingSection`, `DiningTableGroup`, `SeatingTableGroup`, `ShopLoss`, `AnalyticsEvent`, `ShopTag`, `Subscription`, `IdempotencyReceipt`.

### Env

| Var | Default | Meaning |
|-----|---------|---------|
| `TENANT_RLS` | off | `true`/`1`/`on` → interceptor wraps venue-bound requests |
| `DATABASE_URL_DIRECT` | optional | Documented for future migrate-role split |

### DB roles (Neon) — still operator residual

| Role | `BYPASSRLS` | Used by |
|------|-------------|---------|
| `locora_app` | No (target) | Nest API pool — **not provisioned yet**; app may still be table owner |
| `locora_migrate` | Yes | `prisma migrate deploy` |

---

## Risks with Prisma + connection pooling (Neon)

Still relevant when `TENANT_RLS=on`:

1. **SET LOCAL must be inside the request interactive transaction** — interceptor + ALS proxy address this; do not bare-`SET` outside `$transaction`.
2. **Nested `$transaction`** — proxy reuses the ALS tx (no second pool checkout).
3. **SSE** — skipped (must not hold a DB transaction open).
4. **Cron / webhooks** — mode unset → fail-open; prefer `withTenantRls` per shop when tightening.
5. **Long requests** — interceptor txn timeout 60s; raise if needed for heavy uploads.

---

## Phased plan (status)

| Phase | Scope | Status |
|-------|--------|--------|
| **0 — Inventory** | Tier A/B/C tables | Done (doc) |
| **1 — Plumbing** | SET LOCAL + ALS proxy + interceptor | **Done** (ZZZZZ) |
| **2 — FORCE on Tier A** | 28 core tables migration | **Done** on disk |
| **3 — Child tables + denorm** | Line items / chat messages | Residual |
| **4 — Cron / webhook / public** | `public_insert` + system modes | Residual |
| **5 — Hardening** | Non-owner app role; break-glass runbook | Residual |

---

## Testing

| Test | Status |
|------|--------|
| Unit: `tenant-rls.util` / interceptor | **Shipped** |
| Two-venue service tenant specs | **Shipped** (prior lanes) |
| Live pooled cross-tenant with TENANT_RLS=on | Residual |

---

## Summary

| Question | Answer |
|----------|--------|
| Replace app `shopId`? | **No** — RLS adds DB belt. |
| Code ship bar met? | **Yes** — migration + SET LOCAL + unit matrix. |
| Production enforce? | After Neon migrate + `TENANT_RLS=on` soak. |
| Biggest remaining risk? | Enabling flag under Neon pooler without soak; Tier B children; public inserts. |

---

*Parent status: [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) #3 · Board: [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · Deep audit: [`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md) §2.3*

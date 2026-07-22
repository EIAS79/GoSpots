# Locora — Postgres Row-Level Security vs app `shopId`

**Date:** 2026-07-21 (design) / 2026-07-22 (operator checklist **RLS6-soak-docs**)  
**Status:** **Implemented (ship bar)** — migration on disk + app `SET LOCAL` plumbing (Lane **ZZZZZ**); **`TENANT_RLS` default off**. Neon migrate **applied**; production enforce = operator Gates 0–4 below.  
**Bible:** §6 P0 tenant isolation — **DONE** (app + RLS belt); soak **OPERATOR**.  
**Ship timing:** App-layer `shopId` hardening shipped earlier; RLS Phase 2 core tables + request session vars shipped 2026-07-21 (opt-in flag).  
**Lanes:** **ZZZZZ-tenant-done** (code/migrate), **RLS6-soak-docs** (operator gates).

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Code (done)** | Migration `20260721050000_tenant_rls_core` + `TENANT_RLS` interceptor / `withTenantRls` / Prisma ALS proxy. |
| **After migrate on Neon** | Follow **Gates 0–4** below: smoke with flag off → `TENANT_RLS=on` → monitor empty-result / pool timeouts. |
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

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Tier A FORCE RLS + `app_tenant_rls_ok` policies | **DONE** | `20260721050000_tenant_rls_core` on disk; **applied** on Neon |
| App `SET LOCAL` + ALS Prisma proxy + interceptor | **DONE** (flagged) | `tenant-rls.util.ts`, `tenant-rls.interceptor.ts`; `TENANT_RLS` **default off** |
| Two-venue unit matrix + tenant-rls jest specs | **DONE** | Prior lanes + **14** interceptor/util specs |
| Neon migrate + `TENANT_RLS=on` soak | **OPERATOR** | Gates 0–4 below — **not started** until Render resume + smoke |
| DB role split (`locora_app` / `locora_migrate`) | **RESIDUAL** | Gate 5 — not provisioned |
| Tier B child policies + `public_insert` guest wrap | **RESIDUAL** | Phases 3–4 — future app lane |
| Live pooled cross-tenant suite with flag on | **RESIDUAL** | Post–Gate 4 optional hardening |

**Verify (at ship time):** `pnpm --filter @gospots/api test -- tenant-rls` PASS; tenant isolation specs PASS.

---

## Operator cutover checklist (`TENANT_RLS=on` soak)

Use after Neon has applied `20260721050000_tenant_rls_core` and production **manual smoke** ([`PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md)) passes. **Do not skip gates** — flipping `TENANT_RLS=on` before migrate or smoke can empty venue-bound reads when session vars are set without policies, or mask regressions when policies are missing. **Rollback lever:** set `TENANT_RLS=off` (or unset) — policies fail-open when `app.rls_mode` is unset; existing rows unchanged.

**Flag values accepted:** `on`, `true`, `1` (case-insensitive). **Default when unset:** off.

### Gate 0 — RLS migration applied + smoke

- [ ] `20260721050000_tenant_rls_core` applied on Neon (28 Tier A tables ENABLE+FORCE + `app_tenant_rls_ok`).
- [ ] `pnpm --filter @gospots/api run verify:migrations` green against production DB (disk **58** = applied **58**).
- [ ] Confirm `TENANT_RLS` **off** or unset on Render **`gospots-api`**.
- [ ] Manual smoke pass: health, CORS, login+CSRF, book, guest link, stock+sale, webhook dedupe ([`PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md) checklist).

### Gate 1 — Pre-cutover inventory (read-only SQL)

Confirm policies landed (expect **28** Tier A tables with FORCE RLS):

```sql
SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'Reservation', 'ShopOrder', 'Transaction', 'PlaySession', 'MenuItem',
    'MenuSection', 'GalleryItem', 'StoredImage', 'Membership', 'Resource',
    'ResourceCategory', 'EventRequest', 'VenueReview', 'GuestChat',
    'Notification', 'AuditLog', 'OpeningHour', 'ScheduleException',
    'ContactMessage', 'ShopNote', 'GamingSection', 'DiningTableGroup',
    'SeatingTableGroup', 'ShopLoss', 'AnalyticsEvent', 'ShopTag',
    'Subscription', 'IdempotencyReceipt'
  )
ORDER BY c.relname;
```

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE '%tenant%'
ORDER BY tablename;
```

- [ ] All 28 tables: `relrowsecurity = true`, `relforcerowsecurity = true`.
- [ ] `app_tenant_rls_ok` (or equivalent) policy present per Tier A table.
- [ ] Baseline row counts recorded for one high-traffic shop (reservations, orders, menu items) — used to spot empty-result regressions after Gate 3.

### Gate 2 — Post-migrate fail-open soak (`TENANT_RLS=off`)

Policies are **fail-open** when `app.rls_mode` is unset (default prod). Confirm normal ops with flag still off:

- [ ] Dashboard lists (reservations, orders, menu, finance) show expected rows for venue A.
- [ ] Mutations succeed: create reservation, complete order, quick SALE, mark play billed.
- [ ] Public book + guest hash status URL still work (public paths do not require flag).
- [ ] No new 500s / pool timeout spikes in Render logs (24–48 h recommended if traffic allows).

### Gate 3 — Enable live enforcement

On Render **`gospots-api`** env (only after Gates 0–2):

```text
TENANT_RLS=on
```

Redeploy / restart API.

- [ ] Flag set; API healthy (`/live`, `/ready` → `database: up`).
- [ ] Login + venue bind: dashboard lists match Gate 2 baseline counts for venue A (not empty).
- [ ] Cross-venue spot-check: staff bound to venue A cannot read venue B row by ID (expect empty / 404 — not another shop’s data).
- [ ] Mutations still succeed for venue A (create reservation, complete order, stock adjust).
- [ ] SSE notifications stream still works (interceptor **skips** `/notifications/stream` — must not hold DB txn).
- [ ] No immediate spike in 500s, `P2028` transaction timeouts, or “empty dashboard” support tickets.

**Rollback:** set `TENANT_RLS=off` or unset → redeploy. Session vars stop being set; policies fail-open again.

### Gate 4 — Enforcement soak (recommended ≥ 7 days)

- [ ] Daily ops across reservations, kitchen, quick sales, play billing, finance reports — no tenant bleed reports.
- [ ] Render logs: no recurring RLS-related empty results or Prisma transaction timeout pattern.
- [ ] Optional: repeat cross-venue IDOR spot-check on finance + reservations modules.
- [ ] Document in submit notes: **`TENANT_RLS=on` live**; app `shopId` remains primary permission gate; RLS is defense-in-depth belt.

**After Gate 4:** treat §6 tenant RLS **operator soak as closed**. Residual hardening (Gate 5+) is not a ship blocker.

### Gate 5 — DB role split + Tier B (future; not in repo yet)

- [ ] Provision Neon roles: `locora_app` (no BYPASSRLS) for API pool; `locora_migrate` (BYPASSRLS) for `prisma migrate deploy`.
- [ ] Point `DATABASE_URL` at `locora_app`; keep `DATABASE_URL_DIRECT` for migrate host only.
- [ ] Tier B child-table policies (`ShopOrderLine`, `TransactionLineItem`, etc.) + `public_insert` guest wrap per Phases 3–4 above.
- [ ] Live pooled cross-tenant jest / staging suite with `TENANT_RLS=on`.

---

## Quick reference

| Step | Env | Enforcement |
|------|-----|-------------|
| Default prod | `TENANT_RLS` off / unset | App `shopId` only; RLS policies **fail-open** |
| Gate 2 | off | Post-migrate soak — confirm ops normal |
| Gate 3 | `TENANT_RLS=on` | DB belt active on venue-bound requests |
| Rollback | off / unset | Fail-open immediately; no data migration |

---

## Summary

| Question | Answer |
|----------|--------|
| Replace app `shopId`? | **No** — RLS adds DB belt. |
| Code ship bar met? | **Yes** — migration + SET LOCAL + unit matrix; flag **default off**. |
| Production enforce? | Operator **Gates 0–4** — migrate applied; **`TENANT_RLS=on`** after smoke. |
| Biggest remaining risk? | Enabling flag under Neon pooler without soak; Tier B children; public inserts. |

---

*Parent status: [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) #3 · §6: [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) · Board: [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · Deep audit: [`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md) §2.3*

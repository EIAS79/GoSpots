# Locora — Dashboard capability key rotation

**Date:** 2026-07-22 (operator checklist lane **DASH13-key-docs**)  
**Status:** Slug-only bind + hash-at-rest dual-write **shipped** (bible **#19 / §13** ship bar). Plaintext DROP + stop dual-write remain **operator / future app+migration lane** — **no DROP migration folder on disk**.  
**Bible:** P1 **#19 / §13** — a secret-like dashboard key appears in the URL / capability path.  
**Ship timing:** URL leak cleanup (Lane EE). Rotate (IIII). Slug-only auth bind (MMMM). Strip membership key on wire (QQQQ). Phase 3 ignore-key bind + hash (QQQQQ).  
**Canonical operator path:** Neon expand migrate → soak → stop dual-write app deploy → contract DROP (future migration lane).

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Slug-only browser URLs + middleware strip | **DONE** | Lane EE; `venue-dashboard.ts` / middleware 307 |
| Membership-only `x-venue-path` bind (key ignored) | **DONE** | `classifyVenuePath` → slug only; interceptor + `resolveVenueShopId` |
| `/me` + verify omit `dashboardKey` | **DONE** | Lane QQQQ; auth JSON emits public `venuePath` |
| Owner rotate + password reauth + audit | **DONE** | `POST /shop/dashboard-key/rotate`; Lane IIII |
| Hash-at-rest + dual-write on create/rotate | **DONE** | `dashboardKeyPersistFields`; migration `20260721030000_dashboard_key_hash` |
| Operator runs expand migrate | **OPERATOR** | [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) migration #9 |
| Stop dual-write (hash-only persist) | **RESIDUAL** (app lane) | `dashboardKeyPersistFields` still writes plaintext; rotate still returns `dashboardPath` |
| Clear leftover plaintext at rest | **RESIDUAL** (operator + app lane) | **No clear CLI on disk** (unlike §11 guest tokens); column is `NOT NULL` until expand |
| DROP `Shop.dashboardKey` | **RESIDUAL** (operator + migration lane) | **No migration on disk** — illustrative SQL only |

**Unlike §11 guest tokens:** bind **never** looked up `Shop.dashboardKey` after Phase 3 — legacy `slug--key` headers parse to slug and discard the key. Residual risk is **plaintext at rest** and the owner-only rotate response, not broken staff bind.

---

## Operator cutover checklist (Clear → DROP)

Use after Neon has applied `20260721030000_dashboard_key_hash` and dashboard smoke passes ([`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) § smoke — slug-only URL, venue bind). **Do not skip gates** — DROP is irreversible without PITR.

### Gate 0 — Expand migration applied

- [ ] `20260721030000_dashboard_key_hash` applied on Neon (`Shop.dashboardKeyHash` + pgcrypto backfill + unique index).
- [ ] Smoke: staff lands on `/dashboard/{slug}/…` (no `slug--key` in address bar); `x-venue-path` bind works; `/auth/me` memberships have **no** `dashboardKey`.

### Gate 1 — Inventory (read-only SQL)

All **plaintext-without-hash** counts must be **0** (backfill complete):

```sql
SELECT COUNT(*) FROM "Shop"
WHERE "dashboardKey" IS NOT NULL AND "dashboardKeyHash" IS NULL;
```

Record **plaintext+hash** count (all shops should match total shop count until Gate 3):

```sql
SELECT COUNT(*) FROM "Shop"
WHERE "dashboardKey" IS NOT NULL AND "dashboardKeyHash" IS NOT NULL;
```

### Gate 2 — Soak (recommended ≥ 7 days)

- [ ] No venue-bind regressions after migrate (slug-only staff flow stable).
- [ ] Legacy bookmarked `slug--key` URLs still open dashboard (middleware/interceptor strip to slug; membership required).
- [ ] Owner rotate still works; audit `shop.dashboard_key.rotate` present; staff re-bind stays slug-only.
- [ ] Confirm no production log/metric dependency on reading `Shop.dashboardKey` for tenant resolution (already true in code — spot-check support tickets).

### Gate 3 — Stop dual-write (future **app** lane; not in repo yet)

Deploy an API release that persists **hash only** on shop create/rotate (stop writing `Shop.dashboardKey`); rotate response returns `{ slug }` only (drop secret `dashboardPath` from wire). Requires a preceding or bundled **expand** migration making `dashboardKey` nullable (today it is `NOT NULL` + `@unique` in `schema.prisma`).

- [ ] App + schema expand deployed; jest dashboard-path / dashboard-key specs updated.
- [ ] New shops/rotates: `dashboardKeyHash` set; `dashboardKey` null (or omitted).
- [ ] Rotate smoke: owner can invalidate old links without any secret in JSON response.

### Gate 4 — Clear leftover plaintext (operator; after Gate 3)

There is **no** `pnpm run clear:dashboard-plaintext` on disk (contrast §11 `clear:guest-plaintext`). After Gate 3 makes the column nullable and the app stops dual-write:

```sql
-- Illustrative only — run only after Gate 3 app is live and dual-write stopped
UPDATE "Shop"
SET "dashboardKey" = NULL
WHERE "dashboardKeyHash" IS NOT NULL
  AND "dashboardKey" IS NOT NULL;
```

- [ ] Pre-update inventory matches Gate 1 expectations.
- [ ] Update applied; re-run inventory: **plaintext+hash** count → **0**; all shops have hash.
- [ ] Spot-check: staff bind, rotate, and create-venue still work (bind never used plaintext).

### Gate 5 — Contract DROP (future **migration** lane; **not on disk**)

**Preconditions:** Gate 3 live; Gate 4 counts = 0 (or column already null); optional Gate 2 soak complete.

There is **no** `drop_dashboard_key_plaintext` migration folder in `apps/api/prisma/migrations/` today. When a dedicated lane adds one, it should drop `dashboardKey` and promote `dashboardKeyHash` to required:

```sql
-- Illustrative only — do not apply manually without a reviewed Prisma migration
ALTER TABLE "Shop" DROP COLUMN "dashboardKey";
ALTER TABLE "Shop" ALTER COLUMN "dashboardKeyHash" SET NOT NULL;
```

- [ ] Migration authored + reviewed (Prisma schema removes `dashboardKey`; `dashboardKeyHash` required).
- [ ] Neon `migrate deploy` during maintenance window.
- [ ] Post-DROP: rotate/create still issue hash via `issueDashboardKey()` / equivalent.

**Rollback:** forward-fix only after DROP — raw keys cannot be reconstructed from hash alone. Prefer Neon PITR / branch if premature. **Forbidden:** `prisma migrate reset`.

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Shipped** | Slug-only browser URLs + membership-only `x-venue-path` bind; owner rotate with password reauth; `/me` memberships omit `dashboardKey`; legacy `slug--key` strips to slug (key **not** verified); dual-write `dashboardKeyHash`. |
| **Operator now** | Neon `migrate deploy` of `20260721030000_dashboard_key_hash`; run Gates 0–2. |
| **Still open (optional)** | Gate 3 stop dual-write → Gate 4 clear plaintext → Gate 5 DROP `Shop.dashboardKey`. **No migration on disk yet.** |

**Prerequisite already shipped:**

| Surface | Status |
|---------|--------|
| Address bar / redirects | Slug-only `/dashboard/{slug}/…` (middleware 307 strips `slug--key`) |
| Client bind | `sessionStorage` `x-venue-path` = **public slug**; API header matches |
| Helpers | `generateDashboardKey`, `buildDashboardPath`, `parseDashboardPath`, `classifyVenuePath`, `toPublicVenuePath` |
| Lemon / activate / login `next=` | Return/redirect URLs strip to slug-only |
| Venue interceptor | Resolves shop via **slug only** (legacy `slug--key` accepted but key **ignored**); active membership (or `SUPER_ADMIN`) required |
| Auth JSON | Public `venuePath` (slug) — **not** secret `dashboardPath`; memberships omit `dashboardKey` |

---

## What exists today

| Piece | Behavior |
|-------|----------|
| Storage | `Shop.dashboardKey` — unique `String`, generated at shop create; owner can rotate |
| Capability path | Legacy `slug--{dashboardKey}` still **parses** for slug extraction; key not used for DB lookup |
| Auth JSON | Login / register / activate / refresh / me / createVenue / link return public `venuePath` (slug); `/me` memberships have **no** `dashboardKey` |
| Tenant bind | `VenueContextInterceptor` + `resolveVenueShopId` + `verifyVenueDashboard` accept slug-only when membership proves access |
| Membership gate | Slug alone is **not** enough — inactive/missing membership → no `shopId` bind |
| Rotation | Owner `POST /shop/dashboard-key/rotate` + password reauth (Lane IIII); only dedicated endpoint that returns `dashboardPath` |

---

## Problem (bible #19)

Deep audit: dashboard path mixed public slug with an unguessable key that historically appeared in URLs, logs, and referrers ([`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md)). Lane EE removed the **browser URL** leak. Lane MMMM removed the **auth top-level secret path** and client-held capability header. Lane QQQQ removed **membership `dashboardKey` on `/me`**. Remaining risk:

1. Plaintext at rest: `Shop.dashboardKey` still dual-written until Gates 3–5 (bind already slug-only).
2. Rotate response still returns `dashboardPath` for tooling (owner-only, not stored in session) — trim in Gate 3.

---

## Goal (post-submit)

Give **venue owners** a safe way to invalidate a leaked dashboard key without renaming the shop slug or wiping memberships — **and** stop requiring the key for normal staff bind.

**Non-goals for v1 rotate / Phase 2:**

- Per-staff capability keys  
- Time-limited signed dashboard URLs  
- Changing public venue slug / `/venue/{slug}`  
- Auto-rotate on every login  
- DROP `dashboardKey` column in the same PR as Phase 2

---

## Target design

### v1 — Immediate rotate (shipped — Lane IIII)

```
Owner (settings) → confirm password → POST /shop/dashboard-key/rotate
  → generateDashboardKey() → update Shop.dashboardKey (unique retry on conflict)
  → audit shop.dashboard_key.rotate
  → response: { dashboardPath: "slug--newKey", slug }
  → web: rewrite sessionStorage x-venue-path to **slug**; toast “Old dashboard links stop working”
```

| Rule | Detail |
|------|--------|
| Who | `VENUE_OWNER` (or equivalent owner shop role) only; staff cannot rotate |
| Reauth | Require password (`assertUserPassword` / same pattern as GDPR erase — Lane OO) |
| Effect | Old `slug--key` **fails interceptor lookup immediately** (no grace period in v1) |
| Sessions | Cookie JWT sessions stay valid; only the **venue bind header** must be refreshed |
| Multi-tab | Other open tabs keep old `sessionStorage` until reload — they lose shop context (fail closed). Optional: broadcast `storage` event or soft reload after rotate |
| Audit | `shop.dashboard_key.rotate` with actor userId + shopId (never log full new key) |
| Idempotency | Not money-path critical; optional `Idempotency-Key` if UI double-clicks |

**Grace period (optional v1.1):** keep `dashboardKeyPrevious` + `dashboardKeyPreviousUntil` for ~15 minutes so in-flight staff tabs survive. Adds columns/migration — **skip for first rotate ship** unless multi-staff venues report pain.

### Phase 2 — Drop client-held capability key (shipped — Lane MMMM)

1. Interceptor accepts **slug-only** `x-venue-path` when JWT already proves membership.
2. Auth JSON returns public `venuePath` (slug) — not secret `dashboardPath`.
3. Web stores slug in sessionStorage; venue-gate binds with slug.
4. Legacy `slug--key` still accepted (bookmarks / old tabs).

### Phase 2.5 — Strip membership key on wire (shipped — Lane QQQQ)

1. `/auth/me` memberships omit `shop.dashboardKey`.
2. `verifyVenueDashboard` response omits the key (rotate remains the only owner-facing secret return).
3. Web types/helpers no longer require `dashboardKey` for routing or bind.

### Phase 3 — Slug-only bind + hash-at-rest (shipped — Lane QQQQQ)

1. `classifyVenuePath` / interceptor / resolve always slug-only (legacy key discarded).
2. `dashboardKeyHash` dual-write via `dashboardKeyPersistFields` on register/createVenue/rotate.
3. Migration `20260721030000_dashboard_key_hash` on disk (pgcrypto backfill). **OPERATOR:** Neon deploy.

**Residual (Gates 3–5):** stop dual-write → clear/null plaintext → DROP column — see operator checklist above.

---

## API sketch

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/v1/shop/dashboard-key/rotate` | Owner + password; CSRF on; throttle strict |
| Response | `{ slug, dashboardPath }` | Client binds with **slug**; `dashboardPath` optional for tooling |
| Auth session | `{ user, venuePath }` | `venuePath` = public slug |
| `GET` | `/api/v1/auth/me` | Memberships include slug/name/… — **no** `dashboardKey` |

---

## Web UX sketch

- Shop settings → Security: **“Regenerate dashboard key”** (shipped)
- On success: update `x-venue-path` to slug; soft-navigate reminder

---

## Tests required (when implementing)

| Case | Expect |
|------|--------|
| Wrong password | 401/403; key unchanged |
| Non-owner | 403; key unchanged |
| After rotate | Old `slug--key` → no shop bind; new key or slug-only binds |
| Membership still required | Slug + no membership → no bind |
| Auth me / login | Returns public `venuePath` (no `--` secret); `/me` memberships omit `dashboardKey` |
| Middleware | Location never contains new key |
| Audit | One rotate event; key not in payload |

Prefer unit/integration with mocked Prisma before e2e.

---

## Risks & constraints

| Risk | Mitigation |
|------|------------|
| Mid-shift staff tabs lose venue | Toast + “refresh” copy; optional grace later |
| Unique collision on generate | Retry `generateDashboardKey` few times (same as create) |
| Logging new key | Redact in request logs / Sentry scrub |
| Parallel agents | Do not touch `auth.service.ts` / `schema.prisma` without a dedicated lane |

---

## Phased plan

| Phase | Work | Timing |
|-------|------|--------|
| **0** | This doc | Done (Lane AAAA) |
| **1** | `POST …/rotate` + password reauth + audit + settings UI + sessionStorage rewrite | Done (Lane IIII) |
| **2** | Slug-only / membership-only bind; stop emitting secret `dashboardPath` | Done (Lane MMMM) |
| **2.5** | Strip `dashboardKey` from `/me` (+ verify response) | Done (Lane QQQQ) |
| **3** | Stop key lookup (slug-only); hash-at-rest dual-write + migrate on disk | Done (Lane QQQQQ); Neon deploy OPERATOR |
| **4** | Stop dual-write; clear plaintext; DROP `dashboardKey` | **RESIDUAL** — operator Gates 3–5; **no migration on disk** |

---

## Related

- [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) §19  
- Lane EE — URL leak cleanup (`BIBLE_FINISHED.md`)  
- [`dashboard-path.ts`](../../apps/api/src/common/dashboard-path.ts) · web `venue-dashboard.ts` / middleware  
- Forced reauth pattern — GDPR erase (Lane OO)  
- Sessions revoke — Lanes J / O (orthogonal; rotate does not revoke cookies)

# Locora — Dashboard capability key rotation

**Date:** 2026-07-21  
**Status:** Phase 0–3 shipped (rotate, membership bind, `/me` omit, Phase 3 slug-only + hash-at-rest dual-write). Optional DROP plaintext after soak.  
**Bible:** P1 **#19** — a secret-like dashboard key appears in the URL / capability path.  
**Ship timing:** URL leak cleanup (Lane EE). Rotate (IIII). Slug-only auth bind (MMMM). Strip membership key on wire (QQQQ). Phase 3 ignore-key bind + hash (QQQQQ).

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Shipped** | Slug-only browser URLs + membership-only `x-venue-path` bind; owner rotate with password reauth; `/me` memberships omit `dashboardKey`; legacy `slug--key` strips to slug (key **not** verified); dual-write `dashboardKeyHash`. |
| **Operator** | Neon `migrate deploy` of `20260721030000_dashboard_key_hash`. |
| **Still open (optional)** | DROP plaintext `Shop.dashboardKey` after soak. |

**Prerequisite already shipped:**

| Surface | Status |
|---------|--------|
| Address bar / redirects | Slug-only `/dashboard/{slug}/…` (middleware 307 strips `slug--key`) |
| Client bind | `sessionStorage` `x-venue-path` = **public slug**; API header matches |
| Helpers | `generateDashboardKey`, `buildDashboardPath`, `parseDashboardPath`, `classifyVenuePath`, `toPublicVenuePath` |
| Lemon / activate / login `next=` | Return/redirect URLs strip to slug-only |
| Venue interceptor | Resolves shop via slug (membership) **or** legacy `{ slug, dashboardKey }` + active membership (or `SUPER_ADMIN`) |
| Auth JSON | Public `venuePath` (slug) — **not** secret `dashboardPath`; memberships omit `dashboardKey` |

---

## What exists today

| Piece | Behavior |
|-------|----------|
| Storage | `Shop.dashboardKey` — unique `String`, generated at shop create; owner can rotate |
| Capability path | Legacy `slug--{dashboardKey}` still accepted for bind |
| Auth JSON | Login / register / activate / refresh / me / createVenue / link return public `venuePath` (slug); `/me` memberships have **no** `dashboardKey` |
| Tenant bind | `VenueContextInterceptor` + `resolveVenueShopId` + `verifyVenueDashboard` accept slug-only when membership proves access |
| Membership gate | Slug alone is **not** enough — inactive/missing membership → no `shopId` bind |
| Rotation | Owner `POST /shop/dashboard-key/rotate` + password reauth (Lane IIII); only dedicated endpoint that returns `dashboardPath` |

---

## Problem (bible #19)

Deep audit: dashboard path mixed public slug with an unguessable key that historically appeared in URLs, logs, and referrers ([`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md)). Lane EE removed the **browser URL** leak. Lane MMMM removed the **auth top-level secret path** and client-held capability header. Lane QQQQ removed **membership `dashboardKey` on `/me`**. Remaining risk:

1. Long-term: optional hash-at-rest / DROP of `dashboardKey` once legacy capability bind is retired.
2. Rotate response still returns `dashboardPath` for tooling (owner-only, not stored in session).

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

### Phase 3 — Optional drop or hash-at-rest

Only after soak; retire legacy capability bind; then hash-at-rest or DROP column (needs migrate — not this lane).

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
| **3** | Stop key lookup (slug-only); hash-at-rest dual-write + migrate on disk | Done (Lane QQQQQ); Neon deploy OPERATOR; DROP plaintext optional |

---

## Related

- [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) §19  
- Lane EE — URL leak cleanup (`BIBLE_FINISHED.md`)  
- [`dashboard-path.ts`](../../apps/api/src/common/dashboard-path.ts) · web `venue-dashboard.ts` / middleware  
- Forced reauth pattern — GDPR erase (Lane OO)  
- Sessions revoke — Lanes J / O (orthogonal; rotate does not revoke cookies)

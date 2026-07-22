# Locora — Pack + add-ons vs legacy `SubscriptionTier` collapse

**Date:** 2026-07-21  
**Status:** Phase 1 **shipped** (pack-only authz + runtime synthesis + backfill script). Optional DROP `tier` deferred.  
**Bible:** P1 **#12** — **DONE** (Lane **FFFFFF**).  
**Audit:** [`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md) §2.12.  
**Related (do not conflate):** CSV add-on/permission cutover — [`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md); product bundle positioning — [`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md).  
**Ship timing:** Phase 1 code complete without Neon. Keep writing derived `tier` via `tierForPack`. DROP column only after soak + CSV confidence.

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Shipped (FFFFFF)** | Authz pack-only: modules from pack + effective add-ons; `menu_orders` includes `bar`; ENTERPRISE billed tier preserves `multi_shop`/`integrations` gap; web `plan.ts` parity; `pnpm backfill:legacy-addon-tier` dry-run/apply. |
| **Operator optional** | Run `backfill:legacy-addon-tier -- --apply` after smoke so CSV/rows match synthesized STANDARD+ add-ons. |
| **After CSV verification window** ([`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md)) | Prefer rows-only add-ons before optional DROP of `tier`. |
| **Phase 2–3 residual** | Derived-only `tier` polish; optional DROP; dedicated catalog add-ons for `multi_shop`/`integrations`. |

**Why defer:** Authz touches every gated route, Lemon webhook, trial/pending plan apply, web `plan.ts` mirror, and marketing feature matrices. Mid-ship collapse risks shrinking paid access for STANDARD+ shops still on empty stored add-ons with legacy `tier` synthesis.

**Out of scope for this doc:** Removing venue packs from the catalog; changing Lemon variant SKUs; marketplace free-directory entitlement split ([`GO_SPOTS_MARKETPLACE.md`](./GO_SPOTS_MARKETPLACE.md)).

---

## What exists today (intentional dual)

### Schema

| Field | Role |
|-------|------|
| `Subscription.packId` | Commercial pack id (default `"gaming"`) — **intended source of truth** for modules |
| `Subscription.addOns` CSV + `SubscriptionAddOn` rows | Add-on ids; dual-read via `resolveAddOnsCsv` |
| `Subscription.tier` (`SubscriptionTier` enum) | Legacy billed tier; still **written** on pack/webhook apply via `tierForPack`; still **read** for empty-add-ons legacy synthesis and `billedTier` |
| `staffSeatQuantity` | Paid seat cap (not tier-derived for paid ACTIVE) |

### Resolution path (API)

Central engine: `getVenueEntitlements` → `resolveSubscriptionAccess` (`subscription-tier.ts` + `venue-packs.ts`).

| Case | Modules come from |
|------|-------------------|
| `packId` set | `modulesForPackAndAddOns(packId, effectiveAddOns)` |
| Pack + **empty** stored add-ons + legacy `tier` ∈ {STANDARD, PRO, ENTERPRISE} | Pack modules **∪** `legacyModulesFromTier(tier)` (belt-and-suspenders — never shrink access) |
| No `packId` | `legacyModulesFromTier(tier)` only |
| Locked (CANCELED / PAST_DUE / expired TRIAL) | Empty modules; `effectiveTier = FREE` |

Effective add-ons: CSV∪rows; if still empty and legacy paid tier → `legacyAddOnsFromTier(tier)`.

Derived displays:

- `billedTier` = stored `Subscription.tier`
- `effectiveTier` = `syntheticTierFromModules(modules)` (ENTERPRISE if `multi_shop`/`integrations`, else PRO/STANDARD/STARTER/FREE)
- `tierForPack(packId, addOns)` = same synthetic map — used when **writing** `tier` on Lemon / plan apply (`billing.service.ts`)

Deprecated but still present: `FEATURE_MATRIX` / `tierHasFeature` / `MARKETING_FEATURE_MATRIX` (tier-keyed). Seat paid path prefers `staffSeatQuantity` + modules (`roles`); trial uses `TRIAL_STAFF_SEAT_LIMIT`.

### Web mirror (Lane DDDDDD)

`apps/web/src/lib/plan.ts` `resolveSubscriptionAccess`:

- Uses pack+effectiveAddOns **or** legacy tier when `packId` absent.
- Mirrors API `effectiveAddOnsForSubscription` (legacy add-on synthesis when stored empty + STANDARD+).
- Pack path does **not** union `legacyModulesFromTier` (aligned with pack-only Phase 1 / Lane **FFFFFF**).

**Implication:** Dashboard module visibility follows pack+synthesized add-ons, same as post–Phase-1 API.

---

## Problem (bible #12)

Two mental models for the same shop:

1. **Pack catalog** — `venue-packs` modules + add-ons (commercial).
2. **Legacy tier enum** — `FEATURE_MATRIX` / seat fallbacks / marketing matrices / stored `tier`.

Drift modes:

- Webhook or admin updates `tier` without pack/addOns (or vice versa).
- Empty STARTER pack intentionally has no add-ons; STANDARD+ empty add-ons still mean “legacy paid” via `tier` — easy to mis-read as “no add-ons = starter”.
- Call sites that still check `tierHasFeature(tier, …)` instead of `hasFeature(entitlements, …)`.
- CSV cutover and pack/tier collapse interact: cutting CSV before pack-only authz leaves `legacyAddOnsFromTier` as the only bridge for empty-add-on paid shops.

---

## Goal (post-submit)

**Single source of truth = `packId` + add-on set (rows after CSV cutover).**  
`Subscription.tier` is either:

- **Derived-only** (computed on write for analytics/display, never consulted for authz), or  
- **Dropped** after a soak with zero pack-less rows and zero `tierHasFeature` call sites.

**Non-goals for v1 collapse:**

- Renaming packs / changing customer-facing SKU names in the same PR  
- Deleting `FEATURE_MATRIX` before all callers migrate (mark deprecated → delete in Phase 3)  
- Changing trial length or seat quantity rules  
- Product focus bundle UX ([`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md) Phase A–D)

---

## Target design

### Invariants (must hold every phase)

1. **Never shrink access** for ACTIVE/TRIAL shops during migration (same rule as CSV cutover / guest dual-read).
2. Authz for dashboard features goes through `getVenueEntitlements` / `hasFeature` / `assertShopHasFeature` — not raw `FEATURE_MATRIX[tier]`.
3. Lemon webhook and trial/pending plan apply keep writing **pack + addOns (+ rows)**; `tier` write stays `tierForPack(...)` until Phase 2 stops reading it.
4. Web `plan.ts` stays behavior-compatible with API `resolveSubscriptionAccess` (characterization fixtures shared or mirrored).

### Phase 0 — Inventory (docs + grep; no schema)

| Check | Pass criteria |
|-------|----------------|
| Call sites | List every `tierHasFeature`, `FEATURE_MATRIX[`, `staffSeatLimit(tier)`, `legacyModulesFromTier` outside `resolveSubscriptionAccess` |
| Pack-less rows | Count `Subscription` where `packId` is null/empty (expect ~0 after default `"gaming"`) |
| Empty-add-on paid | Count ACTIVE shops with empty CSV+rows and `tier` ∈ STANDARD/PRO/ENTERPRISE — these still need synthesis until backfill |
| Web vs API | Fixture matrix: pack-only, pack+addOns, pack+empty+legacy tier, tier-only, locked statuses |

### Phase 1 — Authz pack-only (expand behavior, keep column)

1. Backfill empty-add-on STANDARD+ shops: write explicit add-on CSV/rows from `legacyAddOnsFromTier(tier)` (expand-only; idempotent).  
2. Remove belt-and-suspenders union in `resolveModules` once backfill verified (modules = pack+addOns only when `packId` set).  
3. Align web `plan.ts` with API (same empty-add-on rules **or** rely on backfill so both sides never need the union).  
4. Migrate residual `tierHasFeature` call sites → entitlements/`hasFeature`.  
5. Keep writing `tier = tierForPack(...)` so `billedTier` / reporting stay populated.

**Exit:** No production authz path reads `FEATURE_MATRIX` or `legacyModulesFromTier` except deprecated helpers used by backfill scripts.

### Phase 2 — Derived tier only

1. Treat stored `tier` as cache: always set from `tierForPack` on pack/add-on writes; optional read-repair cron if drift detected.  
2. Stop exposing `billedTier` as authoritative in new API fields; prefer `packId` + `addOns` + `effectiveTier` (synthetic).  
3. Marketing matrices: rekey off modules/pack or `effectiveTier` synthetic — do not use stale stored tier if pack changed.

### Phase 3 — Contract drop (optional, after soak)

Only after:

- Phase 1–2 green in prod (≥ 7 days or 100% shop spot-check).  
- CSV add-on cutover complete or add-ons rows-only (so pack resolution does not depend on CSV).  
- Zero pack-less subscriptions; characterization suite covers pack×add-on→modules.

Then: migration drops `Subscription.tier` **or** keeps column as non-authz denormalized cache (product choice). Prefer **keep derived column** one release if analytics/SQL dashboards filter on `tier`.

---

## Migration sketch (illustrative — do not run pre-Friday)

```sql
-- Phase 1 backfill idea (pseudo): for ACTIVE/TRIAL with empty addOns + paid tier,
-- set addOns / SubscriptionAddOn from legacyAddOnsFromTier — app-side script safer
-- than raw SQL so catalog validation applies.

-- Phase 3 (only after soak):
-- ALTER TABLE "Subscription" DROP COLUMN "tier";
-- DROP TYPE "SubscriptionTier";  -- only if no other columns use the enum
```

**Risk:** DROP while any code path still reads `tier` → boot/runtime failures. Require grep gate + API/web typecheck in the same PR as contract migration.

---

## Tests required (post-Friday implementation)

| Layer | Cases |
|-------|--------|
| Unit | `resolveSubscriptionAccess`: pack+addOns; pack+empty after backfill; locked statuses; trial active/expired |
| Unit | `tierForPack` ↔ `syntheticTierFromModules` stability for catalog packs |
| Unit | Web `plan.ts` fixtures match API for the same SubInput shapes |
| Integration | Lemon webhook updates pack+addOns and derived tier together |
| Matrix | Every pack × add-on → expected `ModuleKey` set (expand [`GO_SPOTS_TEST_MATRIX.md`](./GO_SPOTS_TEST_MATRIX.md)) |
| Seat | Trial 3-seat cap; paid `staffSeatQuantity`; no `roles` → 0 |

**Characterization gate:** Snapshot module sets for seed shops before Phase 1 removal of legacy union; diff must be empty (or only intentional backfill expansions).

---

## Relationship to other tracks

| Track | Interaction |
|-------|-------------|
| CSV cutover (#13) | Finish dual-read confidence first; pack resolution already merges CSV+rows. Do not DROP `tier` in the same migration as CSV DROP. |
| Product focus (#33) | Marketing/register can hide packs without deleting entitlement math. |
| Marketplace (#35) | Directory entitlement may split from `marketing` module later — still pack/add-on shaped, not tier enum. |
| Service split (#11) | Billing/webhook pack writes may move with `billing.service`; keep `tierForPack` next to pack catalog. |

---

## Tracker updates (Phase 1 / FFFFFF)

| Doc | Change |
|-----|--------|
| `BIBLE_STATUS.md` | #12 **DONE** |
| `BIBLE_FINISHED.md` | Lane **FFFFFF** ship entry |
| `BIBLE_PROGRESS.md` | Move pack/tier to Done |
| `AGENT_COORDINATION.md` | Complete lane **FFFFFF-pack-tier-done** |

**Verify:** jest venue-entitlements + pack-tier-backfill **29** PASS; `tsc` PASS.

**Residual:** optional DROP `tier`; pack-less `legacyModulesFromTier`; OPERATOR `backfill:legacy-addon-tier -- --apply`; dedicated multi_shop/integrations add-ons; full pack×add-on CI matrix.

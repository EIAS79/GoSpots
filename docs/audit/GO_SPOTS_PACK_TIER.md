# Locora — Pack + add-ons vs legacy `SubscriptionTier` collapse

**Date:** 2026-07-22 (operator checklist lane **PACK15-tier-docs**)  
**Status:** Phase 1 **shipped** (pack-only `resolveModules` + runtime add-on synthesis + backfill script). Optional DROP `Subscription.tier` remains **operator / future app+migration lane** — **no DROP migration folder on disk**.  
**Bible:** P1 **#12 / §15** — **DONE** (PARTIAL residual). Lane **FFFFFF** ship bar met.  
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

**Why defer DROP (not Phase 1 authz):** Module authz is already pack-only in `resolveModules`, but `Subscription.tier` is still **read** for empty-add-on synthesis, `billedTier`, and pack-less fallback — and **written** on Lemon/plan apply. Dropping the column before those reads stop and rows are backfilled risks boot/runtime failures and analytics drift.

**Out of scope for this doc:** Removing venue packs from the catalog; changing Lemon variant SKUs; marketplace free-directory entitlement split ([`GO_SPOTS_MARKETPLACE.md`](./GO_SPOTS_MARKETPLACE.md)).

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Pack-only `resolveModules` (no `legacyModulesFromTier` belt union when `packId` set) | **DONE** | Lane **FFFFFF**; `subscription-tier.ts` |
| `effectiveAddOnsForSubscription` synthesizes from legacy `tier` when CSV+rows empty + STANDARD+ | **DONE** (intentional bridge) | Same file; web `plan.ts` parity |
| Pack-less fallback `legacyModulesFromTier(tier)` only | **DONE** (expect ~0 rows) | Default `packId` = `"gaming"` |
| Derived `tier` write on pack/webhook/plan apply (`tierForPack`) | **DONE** | `billing.service.ts` (+ trial/pending paths) |
| `menu_orders` includes `bar`; ENTERPRISE `multi_shop`/`integrations` catalog gap preserved | **DONE** | `venue-packs.ts` |
| Web `plan.ts` pack-only module path (no legacy module union) | **DONE** | Lane **DDDDDD** parity with API |
| Backfill empty-add-on STANDARD+ → explicit add-ons | **DONE** (script) | `pnpm backfill:legacy-addon-tier` dry-run/`--apply` |
| Operator runs backfill `--apply` after smoke | **OPERATOR** | [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) when scheduled |
| Phase 2 derived-only (`tier` cache / stop authoritative `billedTier`) | **RESIDUAL** (app lane) | Not deployed |
| Stop reading `tier` for synthesis / authz helpers | **RESIDUAL** (app lane) | Requires zero empty-add-on paid rows + grep gate |
| Stop writing `Subscription.tier` | **RESIDUAL** (app lane) | After reads removed; prefer one release with synthetic-only API fields |
| DROP `Subscription.tier` (+ optional enum) | **RESIDUAL** (operator + migration lane) | **No migration on disk** — illustrative SQL only |
| Dedicated catalog add-ons for `multi_shop` / `integrations` | **RESIDUAL** (product) | ENTERPRISE gap bridged via synthesis today |
| Full pack × add-on CI matrix | **RESIDUAL** | Expand [`GO_SPOTS_TEST_MATRIX.md`](./GO_SPOTS_TEST_MATRIX.md) |

**Unlike §11/§13:** there is no hash/plaintext dual-read — residual risk is **mis-read empty add-ons** and **SQL/reporting** that filter on stored `tier`, not broken tenant bind.

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
| `packId` set | `modulesForPackAndAddOns(packId, effectiveAddOns)` only — **no** `legacyModulesFromTier` belt union (Phase 1 / **FFFFFF**) |
| Pack + **empty** stored add-ons + legacy `tier` ∈ {STANDARD, PRO, ENTERPRISE} | Same pack path; access preserved via **synthesized add-ons** in `effectiveAddOnsForSubscription`, not module union |
| No `packId` | `legacyModulesFromTier(tier)` only (pack-less residual) |
| Locked (CANCELED / PAST_DUE / expired TRIAL) | Empty modules; `effectiveTier = FREE` |

Effective add-ons: CSV∪rows; if still empty and legacy paid tier → `legacyAddOnsFromTier(tier)` (runtime bridge until backfill + Phase 2).

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

### Phase 1 — Authz pack-only (expand behavior, keep column) — **SHIPPED (FFFFFF)**

1. Backfill empty-add-on STANDARD+ shops: write explicit add-on CSV/rows from `legacyAddOnsFromTier(tier)` (expand-only; idempotent) — script on disk; **OPERATOR** `--apply` optional.  
2. ~~Remove belt-and-suspenders union in `resolveModules`~~ **DONE** — modules = pack + `effectiveAddOns` only when `packId` set.  
3. Align web `plan.ts` with API — **DONE** (pack-only module path + shared empty-add-on synthesis).  
4. Migrate residual `tierHasFeature` call sites → entitlements/`hasFeature` — **DONE** on authz path; grep gate still required before DROP.  
5. Keep writing `tier = tierForPack(...)` so `billedTier` / reporting stay populated — **still active**.

**Exit (met):** No production **module authz** path reads `FEATURE_MATRIX` or `legacyModulesFromTier` belt union on the pack path. `tier` still read for synthesis/display and pack-less fallback.

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

## Operator cutover checklist (optional DROP `Subscription.tier`)

Use after Phase 1 (**FFFFFF**) is live and entitlement smoke passes. **Do not skip gates** — DROP is irreversible without PITR. **Do not combine** with §16 CSV DROP in the same migration.

### Gate 0 — Phase 1 pack-only authz shipped

- [ ] Lane **FFFFFF** deployed: `resolveModules` uses pack + `effectiveAddOnsForSubscription` only when `packId` set (no belt union).
- [ ] Jest venue-entitlements + pack-tier-backfill suite green (29 cases at ship time).
- [ ] Smoke: paid shop module gates match pack + effective add-ons; trial/locked statuses unchanged.

### Gate 1 — Inventory (read-only SQL)

Pack-less subscriptions (expect **0** after default `"gaming"`):

```sql
SELECT COUNT(*) FROM "Subscription"
WHERE "packId" IS NULL OR TRIM("packId") = '';
```

Empty-add-on **paid** rows still relying on runtime `tier` synthesis (backfill targets):

```sql
SELECT COUNT(*) FROM "Subscription" s
WHERE s."status" IN ('ACTIVE', 'TRIAL')
  AND s."tier" IN ('STANDARD', 'PRO', 'ENTERPRISE')
  AND COALESCE(NULLIF(TRIM(s."addOns"), ''), '') = ''
  AND NOT EXISTS (SELECT 1 FROM "SubscriptionAddOn" sa WHERE sa."subscriptionId" = s."id");
```

Record counts; Gate 2 should drive empty-add-on paid → **0** (or accept residual runtime synthesis until Phase 2 app lane).

### Gate 2 — Persist synthesized add-ons (operator CLI)

From `apps/api` against the target database:

```bash
# Default dry-run — JSON counts only, no writes
pnpm backfill:legacy-addon-tier

# Apply when dry-run counts look expected (expand-only; idempotent)
pnpm backfill:legacy-addon-tier -- --apply
```

- [ ] Dry-run reviewed.
- [ ] `--apply` run (or consciously deferred with documented empty-add-on count).
- [ ] Re-run Gate 1 empty-add-on query → **0** (target).

### Gate 3 — §16 CSV add-on confidence

- [ ] Relational `SubscriptionAddOn` rows authoritative for entitled shops ([`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md)).
- [ ] Neon CSV DROP applied **or** app rows-only cutover verified — pack resolution must not depend on CSV alone.

### Gate 4 — Soak (recommended ≥ 7 days)

- [ ] No “module disappeared” support tickets after backfill.
- [ ] Lemon webhook + trial/pending plan apply still write pack + add-ons + derived `tier` together.
- [ ] Spot-check ENTERPRISE shops: `multi_shop` / `integrations` access matches pre-backfill (catalog gap bridged until dedicated add-ons exist).

### Gate 5 — Stop `tier` reads (future **app** lane; not in repo yet)

Deploy releases that remove **all runtime reads** of stored `Subscription.tier` except optional analytics export:

- [ ] `effectiveAddOnsForSubscription` no longer calls `legacyAddOnsFromTier(tier)` (all paid rows have explicit add-ons).
- [ ] Pack-less path removed or backfilled (`legacyModulesFromTier` unused in prod).
- [ ] API prefers `effectiveTier` (synthetic) over `billedTier`; new fields omit stored tier.
- [ ] Grep gate: no `tierHasFeature`, `FEATURE_MATRIX[`, or `legacyModulesFromTier` outside backfill/deprecated helpers.
- [ ] Jest + web `plan.ts` fixtures updated.

### Gate 6 — Stop `tier` writes (future **app** lane; after Gate 5)

- [ ] Lemon webhook, trial/pending apply, and admin pack updates stop persisting `Subscription.tier`.
- [ ] Optional one-release window: keep writing synthetic tier for BI only, with zero authz/synthesis reads (product choice).

### Gate 7 — Contract DROP (operator + migration lane)

**No migration folder on disk yet.** Only after Gates 0–6 green:

```sql
-- Illustrative only — run only after Gate 6 app is live and grep gate passes
-- ALTER TABLE "Subscription" DROP COLUMN "tier";
-- DROP TYPE "SubscriptionTier";  -- only if no other columns use the enum
```

- [ ] Expand migration authored + reviewed (separate PR from §16 CSV DROP).
- [ ] Staging DROP + full API/web typecheck + entitlement matrix smoke.
- [ ] Production DROP during maintenance window; PITR confirmed.

**Product alternative (valid):** skip Gate 7 — keep `tier` as non-authz denormalized cache forever (`tierForPack` on write only). Document in runbooks so operators do not treat stored tier as SoT.

---

## Migration sketch (illustrative — do not run until Gate 7)

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

**Residual:** Gates 5–7 optional DROP checklist above; Phase 2 derived-only polish; pack-less `legacyModulesFromTier`; OPERATOR `backfill:legacy-addon-tier -- --apply`; dedicated multi_shop/integrations add-ons; full pack×add-on CI matrix.

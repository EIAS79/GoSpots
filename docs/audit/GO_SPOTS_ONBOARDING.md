# Locora — Guided venue onboarding (Bible §32 / #31)

**Date:** 2026-07-21 (wizard ship bar) / 2026-07-22 (residual docs **ONBOARD32-residual-docs**; apply-template **ONBOARD32-apply-template**; web apply **ONBOARD32-web-apply**; Phase 1 plan **ONBOARD32-phase1-plan**)  
**Status:** **Bible #31 / §32 PARTIAL** — web 10-step wizard + five templates + localStorage resume **DONE** (ship bar met). Idempotent `POST /shop/onboarding/apply-template` **DONE** (no schema; orchestrates existing category APIs). Server progress, mixed-template dining seed, and #33 Phase B sidebar polish are **explicitly deferred** — phased plan below. **No `onboardingCompletedAt` column on disk.**  
**Audit:** P2 §2.31 / original prompt **§32** (crosswalk: old bible **#31**).  
**Lane (shipped):** **LLLLLL-onboarding-wizard**

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| 10-step guided wizard | **DONE** | `/dashboard/[venuePath]/onboarding`; `onboarding-wizard.tsx` |
| Five venue templates (gaming + mixed) | **DONE** | `onboarding-templates.ts` — billiard, console lounge, PC café, bowling, mixed |
| Template apply via existing APIs | **DONE** | Primary: `POST /shop/onboarding/apply-template` via `apply-onboarding-template.ts`; residual client orchestration on 404/network only |
| Progress + skip/resume (single browser) | **DONE** | `onboarding-progress.ts` → `localStorage` `locora.onboarding.v1.{slug}` |
| Owner resume banner | **DONE** | `onboarding-resume-banner.tsx` in tenant shell |
| Register + create-venue → wizard | **DONE** | Register / venue-switcher wires |
| Steps compose existing settings/APIs | **DONE** | Hours, staff invite, play-session test, publish checklist — no monolithic service |
| en/pl copy | **DONE** | `onboarding.*` keys |
| Server `onboardingCompletedAt` / shop progress | **RESIDUAL** | **No schema column**; **no progress API** — `OnboardingController` has `apply-template` only; Phase 1 ticket below |
| Multi-device / multi-browser resume | **RESIDUAL** | localStorage-only until Phase 1 implement lane; clearing browser data loses progress |
| Idempotent `POST /shop/onboarding/apply-template` | **DONE** | `OnboardingController` + `OnboardingService`; idempotency via `shopId` + derived `onboarding:{templateId}` key + existing `idempotencyReceipt` table — **no schema** |
| Web delegates template apply to API | **DONE** | Wizard `TemplateStep` → `applyOnboardingTemplate()` → `POST /shop/onboarding/apply-template`; client fallback if route unreachable |
| Mixed template dining table-group seed | **RESIDUAL** | Comment in template: dining via section APIs post-setup; gaming-only seeds today |
| #33 Phase B sidebar F&B group polish | **RESIDUAL** | [`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md) Phase B |
| Subscription upsell before wizard | **RESIDUAL** (product) | Product-focus doc: setup wizard before subscription upsell — not wired |
| Neon / schema migration for onboarding | **RESIDUAL** | Ship bar explicitly avoided schema |

**§32 classification:** **PARTIAL** — first-run checklist ship bar met; server persistence and template API documented here, not hidden.

---

## Ship bar (Lane LLLLLL — what landed)

| Piece | Implementation |
|-------|----------------|
| Route | `/dashboard/[venuePath]/onboarding` |
| Progress | `localStorage` (`locora.onboarding.v1.{slug}`) — resume banner until finish/dismiss |
| Templates | Five declarative seeds in `onboarding-templates.ts`; apply via `createResourceCategory` + `syncVenueCategories` (no new API) |
| Steps 1–10 | Details → TZ/currency → hours → template → categories → resources → pricing → test play-session → staff invite → public preview/checklist |
| Entry | Register + create-venue → onboarding; owner resume banner in tenant shell |
| i18n | `onboarding.*` en/pl |

**Explicitly not in this ship bar:** schema columns (`onboardingCompletedAt`), `POST /shop/onboarding/apply-template`, Neon, dining table-group auto-seed in mixed template.

---

## Problem (bible #31)

Venue owners must discover and configure many unrelated dashboard areas before the product feels “live.” There was no single path from signup → bookable/visible venue.

**Required fix (ship bar):** guided templates + staged onboarding (10 steps + five templates). **Met on web.**

**Still open (residual):** durable progress across devices, atomic template seeding, mixed-venue dining bootstrap, dashboard discoverability polish.

---

## What exists today (code truth)

### Web wizard (shipped)

| Surface | Behavior |
|---------|----------|
| Orchestrator | Thin client wizard — template apply via idempotent `POST /shop/onboarding/apply-template`; client orchestration fallback on 404/network only |
| Progress model | `OnboardingProgress`: `currentStep`, `completedSteps`, `skippedSteps`, `templateId`, `templateCategoryIds`, `completedAt`, `dismissedBanner` |
| Template replace | `applyOnboardingTemplate({ replace, previousCategoryIds })` deletes prior categories best-effort, then recreates |
| Templates | `packId` is **suggest-only** — does not change subscription pack |
| Mixed template | Seeds billiard + console + arcade only; **no** dining table groups |

### Venue creation (adjacent — not the wizard)

| Surface | Behavior |
|---------|----------|
| `AuthService.createVenueForOwner` | Register flow creates shop + owner membership; **by design** stays on auth facade ([`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md)) |
| Post-create redirect | Web sends owner to `/onboarding` — not a server “onboarding state” flag |

### Explicitly absent (residual)

| Gap | Why it matters |
|-----|----------------|
| Server progress | Support cannot see setup status; owner switching laptop loses checklist |
| Apply-template API | **Shipped + wired** — `POST /shop/onboarding/apply-template`; wizard delegates; client fallback on 404/network |
| Dining seed in mixed | Mixed ICP expects F&B later; today manual dining layout step |
| Analytics / directory gating | No server `onboardingCompletedAt` to gate marketplace CTAs or ops dashboards |

---

## Architecture

```
[Register / create venue] --> [/onboarding wizard]
                                    |
         +--------------------------+--------------------------+
         |              |           |            |             |
   shop settings    hours API   resources CRUD  staff invite  play-session
   venue-categories             (template seed — server apply-template; client fallback residual)
```

Wizard is a thin orchestrator — no monolithic onboarding service.

**Target (residual — partial):**

```
[Wizard] --> GET/PATCH /shop/onboarding/progress   (RESIDUAL — needs schema)
         --> POST /shop/onboarding/apply-template    (DONE — idempotent, no schema)
                    |
                    +--> categories + venue tags via ResourcesService + ShopService
                    +--> optional dining groups (Phase 3 RESIDUAL)
```

---

## Five templates

`billiard_hall` · `console_lounge` · `pc_cafe` · `bowling_center` · `mixed_activity`  
(See `apps/web/src/lib/onboarding-templates.ts`.)

| Template | Pack hint | Gaming seeds | Dining seeds |
|----------|-----------|--------------|--------------|
| billiard_hall | gaming | Billiard + counter PC | — |
| console_lounge | gaming | PS + PC + foosball | — |
| pc_cafe | gaming | 12× PC | — |
| bowling_center | gaming | 4× bowling (MIXED mode) | — |
| mixed_activity | mixed | Billiard + console + arcade | **RESIDUAL** — manual dining layout |

---

## Residual phased plan

Phases ordered by owner pain vs implementation cost. **Do not add schema until Phase 1 is scoped** — ship bar intentionally stayed web-only.

### Phase 0 — Web wizard + localStorage (**DONE**)

- [x] 10-step wizard + five templates
- [x] Register/create-venue redirect + resume banner
- [x] Template seed via existing resource/category APIs
- [x] en/pl

**Exit:** New owner can reach publish checklist in one browser session without hunting settings.

**Verify:** `pnpm --filter @gospots/web run i18n:check` — dashboard **1953**/1953, public **1003**/1003; `pnpm --filter @gospots/web run typecheck` — PASS.

### Phase 1 — Server progress + multi-device resume (**RESIDUAL** — plan lane **ONBOARD32-phase1-plan**)

**Lane ID (implement):** `ONBOARD32-phase1-implement` — **not started**; requires exclusive `schema.prisma` + migrations lock when schema lane runs.  
**This lane (plan):** docs-only — SQL sketch, DTO/API contract, web sync design. **No Prisma migration shipped.**

**Trigger:** Support tickets about “lost setup progress”; product need to show setup status in admin/ops views; marketplace/directory gating on `onboardingCompletedAt`.

**Goal:** Progress survives browser clear and works across devices for the same shop (all owners/managers see the same checklist state).

#### Schema verdict (honest)

| Question | Answer |
|----------|--------|
| Is additive DDL **technically** safe? | **Yes** — nullable columns, no backfill required; existing shops stay `NULL` (= “unknown / legacy pre-server-progress”). |
| Ship migration in **this** lane? | **No** — `schema.prisma` + `prisma/migrations/**` are **hot files** (board rule); other lanes may hold schema lock. Default: **implement lane** owns migration after plan review. |
| Minimum columns | `Shop.onboardingCompletedAt DateTime?` — set once when wizard finishes step 10 (idempotent). |
| Recommended companion | `Shop.onboardingProgress Json?` — mirrors web `OnboardingProgress` snapshot (see wire shape below). Avoids future migration if step indices / template ids need persistence before completion. |
| Alternative (not recommended v1) | Progress-only JSON without `onboardingCompletedAt` — forces parsing JSON for gating; keep both. |
| RLS / tenant | Columns on `Shop` — existing shop-scoped JWT + `requireShopId(user)`; no cross-shop leak. |

**Prisma sketch (implement lane — not on disk):**

```prisma
model Shop {
  // ... existing fields ...
  /// First time venue owner finished guided onboarding (step 10). Null = incomplete or pre-feature shop.
  onboardingCompletedAt DateTime?
  /// Latest wizard snapshot for multi-device resume. Schema version inside JSON (`version: 1`).
  onboardingProgress    Json?
}
```

**SQL sketch (Neon — expand-only, online-safe):**

```sql
-- Migration name suggestion: YYYYMMDDHHMMSS_shop_onboarding_progress
-- Expand-only; no backfill; NULL = legacy / incomplete.

ALTER TABLE "Shop"
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingProgress" JSONB;

COMMENT ON COLUMN "Shop"."onboardingCompletedAt" IS
  'First completion of guided onboarding wizard (step 10). NULL = incomplete or pre-feature.';
COMMENT ON COLUMN "Shop"."onboardingProgress" IS
  'OnboardingProgress v1 JSON snapshot for multi-device resume; see GO_SPOTS_ONBOARDING.md.';
```

**Operator migrate plan (hard gate before API deploy):**

| Step | Action | Verify |
|------|--------|--------|
| 0 | Board claim **`ONBOARD32-phase1-implement`**; lock `schema.prisma` + migrations folder exclusively | No parallel schema lanes |
| 1 | Add columns via Prisma migrate (SQL above) | `\d "Shop"` shows both columns nullable |
| 2 | `migrate deploy` on staging → prod | App release **after** migrate (API reads/writes new columns) |
| 3 | Smoke: new venue wizard step 3 → PATCH progress → second browser GET same `currentStep` | Manual |
| 4 | Legacy shops: `onboardingCompletedAt IS NULL` — banner may still show until owner finishes or dismisses | Product accepts |

#### API surface (implement lane)

Extend existing `OnboardingController` (`shop/onboarding`) — **do not** fold into `ShopController` settings PATCH (keep onboarding concerns isolated).

| Method | Path | Auth | Permission | Behavior |
|--------|------|------|------------|----------|
| `GET` | `/shop/onboarding/progress` | JWT + shop scope | Any authenticated member with dashboard access (same as `GET /shop/settings`) | Return wire snapshot + `completedAt` from `Shop` columns |
| `PATCH` | `/shop/onboarding/progress` | JWT + shop scope | **`PERMISSIONS.SETTINGS_WRITE`** or owner-only — **pick one and document**; recommend **`SETTINGS_WRITE`** so managers can resume shared checklist | Upsert `onboardingProgress` JSON; set `onboardingCompletedAt` when body signals finish (see DTO) |

**CSRF:** PATCH requires CSRF double-submit (same as other shop mutations). GET exempt.

**Idempotency:** PATCH does **not** need idempotency receipts — last-write-wins on JSON snapshot is acceptable for wizard step advances. Optional: reject PATCH when `onboardingCompletedAt` already set unless `forceReopen` (out of scope v1).

**Response envelope:** Standard `{ data: OnboardingProgressWire }` — match existing shop API patterns.

#### DTO sketch (implement lane — `apps/api/src/modules/onboarding/dto/`)

Mirror web `OnboardingProgress` (`apps/web/src/lib/onboarding-progress.ts`) with ISO date strings on wire.

```typescript
/** GET response + PATCH body (partial allowed on PATCH). */
export class OnboardingProgressWireDto {
  version!: 1;
  currentStep!: number; // 0..9
  completedSteps!: number[];
  skippedSteps!: number[];
  templateId!: string | null;
  templateCategoryIds!: string[];
  completedAt!: string | null; // ISO — mirrors Shop.onboardingCompletedAt when set
  dismissedBanner!: boolean;
  startedAt!: string; // ISO
}

export class PatchOnboardingProgressDto {
  @IsOptional() @IsInt() @Min(0) @Max(9) currentStep?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) completedSteps?: number[];
  @IsOptional() @IsArray() @IsInt({ each: true }) skippedSteps?: number[];
  @IsOptional() @IsString() templateId?: string | null;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) templateCategoryIds?: string[];
  @IsOptional() @IsBoolean() dismissedBanner?: boolean;
  /** When true, server sets onboardingCompletedAt = now() and merges completedAt into JSON. */
  @IsOptional() @IsBoolean() finish?: boolean;
}
```

**Server mapping rules:**

| Event | DB effect |
|-------|-----------|
| First PATCH for shop | Merge DTO into stored JSON; preserve `startedAt` if absent (default `now()`) |
| `finish: true` | Set `onboardingCompletedAt = now()`; JSON `completedAt` = same instant; `currentStep = 9`; union `completedSteps` 0..9 |
| GET, no JSON yet | Return **empty** wire (`currentStep: 0`, empty arrays, `completedAt: null`) — do not fabricate `startedAt` until first PATCH |
| Completed shop + PATCH without `finish` | **409** or noop — product choice; recommend **409** `ONBOARDING_ALREADY_COMPLETED` (optional domain code, §36 lane) |

#### Web progress sync design (implement lane — `apps/web`)

**Module:** new `apps/web/src/lib/onboarding-progress-sync.ts` (or extend `onboarding-progress.ts` with API hooks — prefer **separate sync module** to keep localStorage helpers testable).

**Flow:**

```
[Wizard mount / tenant shell banner]
        |
        v
  GET /shop/onboarding/progress  -----> server snapshot (source of truth when present)
        |
        +---- merge with localStorage (one-time migration, see table)
        |
        v
  in-memory OnboardingProgress  -----> existing wizard + banner UI (unchanged shape)
        |
        v
  on step / skip / finish / dismiss
        |
        v
  PATCH /shop/onboarding/progress (debounced 500ms on step change; immediate on finish/dismiss)
        |
        +---- still write localStorage (offline/degraded fallback until server ACK)
```

**Merge policy (first load after deploy):**

| localStorage | Server | Winner | Action |
|--------------|--------|--------|--------|
| absent | any | server | Use server |
| present | absent / empty | local | PATCH local → server (upload once) |
| present | present | **Higher `currentStep`**; tie-break **newer `completedAt` or `startedAt`** | PATCH winner → server; overwrite loser |
| present | `completedAt` set | server | Clear local key; hide banner |

**Degraded / 404:** If GET 404 or network fail, **keep today’s behavior** (localStorage only) — same fallback pattern as apply-template client orchestration.

**Banner (`shouldShowOnboardingBanner`):** True when `(server incomplete OR local incomplete) AND NOT dismissed` — after sync, single merged progress drives UI.

**Settings / ops (optional v1):** Expose `onboardingCompletedAt` on `GET /shop/settings` for admin dashboards — **optional**; progress GET is sufficient for wizard.

**i18n:** No new user-facing strings required for sync itself; optional admin label deferred.

**Non-goals (Phase 1):** Per-user progress (checklist is **per shop**, not per staff member); forcing completion before dashboard access (skip remains); analytics events.

#### Tests (minimum bar — implement lane)

| Layer | Cases |
|-------|-------|
| API service | GET empty shop; PATCH step advance; PATCH finish sets `onboardingCompletedAt`; owner/manager OK; wrong shop 403; completed + PATCH 409 |
| Controller | CSRF on PATCH; JWT required |
| Web sync | Merge table unit tests (local vs server winners); debounce mock |
| Manual | Register → wizard step 4 on device A → login device B → same step |

Verify: `jest src/modules/onboarding`; `nest build`; `pnpm --filter @gospots/web run typecheck`; `i18n:check` if new strings.

#### Exit criteria (implement lane **`ONBOARD32-phase1-implement`**)

- [ ] Migration applied on staging (+ prod when operator schedules)
- [ ] `GET` + `PATCH /shop/onboarding/progress` shipped with DTOs above
- [ ] Web wizard hydrates + PATCH sync; localStorage remains fallback on network failure
- [ ] Owner opens wizard on second device and sees same `currentStep`
- [ ] `Shop.onboardingCompletedAt` set when step 10 finished (`finish: true`)
- [ ] Resume banner respects server `completedAt` + `dismissedBanner`
- [ ] Document operator smoke in submit notes

**Plan lane exit (this doc):** Phase 1 ticket complete — implement lane can start without redesign.

### Phase 2 — Idempotent apply-template API (**DONE** — Lane **ONBOARD32-apply-template**)

**Prerequisite:** Phase 1 recommended for durable `templateCategoryIds` on replace — **not required** for idempotent initial apply.

**Goal:** One seed per template choice; safe retry on network failure.

| Work | Notes |
|------|--------|
| API | `POST /shop/onboarding/apply-template` — body `{ templateId, replace?, previousCategoryIds? }` |
| Server | `OnboardingService` orchestrates `ResourcesService.createCategory` / `deleteCategory` + `ShopService.syncVenueCategories`; templates mirror web in `onboarding-templates.util.ts` |
| Idempotency | `withClientIdempotency` scope `shop.onboarding.apply-template`; derived key `onboarding:{templateId}` (or header); **no new columns** |
| Audit | Existing category create/delete + venue.categories.sync audit entries |
| Web | **DONE** (Lane **ONBOARD32-web-apply**) — wizard delegates to API; client orchestration fallback on 404/network only |
| Tests | `onboarding.service.spec.ts` + `onboarding-idempotency.util.spec.ts` — happy path, replace, unknown template, key derivation |

**Exit:** Template apply is idempotent server-side; double-click / retry does not duplicate categories when same key replayed.

**Verify:** `jest src/modules/onboarding`; `nest build` PASS.

### Phase 3 — Mixed template dining seed (**RESIDUAL**)

**Prerequisite:** Phase 2 or proven dining section APIs stable; [`GO_SPOTS_RESOURCE_MODEL_MERGE.md`](./GO_SPOTS_RESOURCE_MODEL_MERGE.md) Phase 3+ if table groups unify with resources.

**Goal:** `mixed_activity` optionally creates starter dining section + table group (or documents deep-link to dining layout step).

| Work | Notes |
|------|--------|
| Product | Align with gaming-first Phase B — “Add F&B” may stay optional, not auto-seed |
| API | Extend apply-template or separate `POST /shop/onboarding/seed-dining` |
| Template | Add `diningSeeds` block to `mixed_activity` when product approves auto-create |

**Exit:** Mixed pack owners get bookable dining **or** explicit wizard step linking to dining layout (product choice documented).

### Phase 4 — Product polish (#33 Phase B) (**RESIDUAL**)

**Goal:** Dashboard sidebar + onboarding copy align with gaming-first ICP ([`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md)).

| Work | Notes |
|------|--------|
| Sidebar | Collapse / de-emphasize F&B nav group until pack/add-on |
| Wizard copy | Step 10 directory CTA tied to marketplace density plan ([`GO_SPOTS_MARKETPLACE.md`](./GO_SPOTS_MARKETPLACE.md)) |
| Register funnel | Optional: subscription upsell **after** wizard completion |

**Exit:** Onboarding and nav tell one story; no accidental restaurant/hotel setup paths in v1.

---

## API sketch (future phases — partial on disk)

| Phase | Method | Path | Notes |
|-------|--------|------|--------|
| 1 | `GET` | `/shop/onboarding/progress` | Owner/staff; returns `OnboardingProgressWire` — **not implemented** (ticket: Phase 1 plan **ONBOARD32-phase1-plan**) |
| 1 | `PATCH` | `/shop/onboarding/progress` | Partial upsert + optional `finish: true` → sets `onboardingCompletedAt` — **not implemented** |
| 2 | `POST` | `/shop/onboarding/apply-template` | Body `{ templateId, replace?, previousCategoryIds? }`; idempotent — **implemented** |
| 3 | `POST` | `/shop/onboarding/seed-dining` | Optional; mixed template only — **not implemented** |

CSRF + shop scope: follow existing shop settings / onboarding apply-template patterns (`JwtAuthGuard`, `requireShopId`, CSRF on PATCH).

---

## Tests required (when implementing residuals)

| Phase | Minimum bar |
|-------|-------------|
| 1 | Progress round-trip; owner-only 403; banner hides when `completedAt` set |
| 2 | Template apply creates expected categories; replace removes old ids; retry idempotent — **service specs on disk** |
| 3 | Mixed dining seed or wizard link e2e smoke (manual or Playwright) |
| 4 | Visual/docs review only unless sidebar code changes |

Verify: new API jest specs; `nest build`; web typecheck; `i18n:check` for new strings.

---

## Operator checklist (Phase 0 — current prod)

- [x] Web deploy includes onboarding route + templates (no API flag)
- [ ] Smoke: register → create venue → wizard step 1 → apply template → test session → publish checklist
- [x] Document in submit notes: **guided onboarding v1 web-only progress; apply-template API wired from wizard; client fallback on 404/network**

---

## Related

- Bible §32 tracker — [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) §32
- Legacy #31 status — [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) §31
- Ship log — [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) #31
- Product focus / Phase B — [`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md)
- Marketplace step 10 — [`GO_SPOTS_MARKETPLACE.md`](./GO_SPOTS_MARKETPLACE.md)
- Auth venue create (separate) — [`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md)

**Verify (Lane ONBOARD32-apply-template):** `jest src/modules/onboarding` **6** PASS; `nest build` PASS. **Verify (Lane ONBOARD32-web-apply):** `pnpm --filter @gospots/web run typecheck` + `i18n:check` PASS. **Verify (Lane ONBOARD32-phase1-plan):** docs-only — Phase 1 SQL/DTO/API/web-sync ticket in Phase 1 section; **no schema on disk**. **No schema** (Phases 0–2 ship bar).

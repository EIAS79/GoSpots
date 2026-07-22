# Locora — `offeringConfig` typed models

**Date:** 2026-07-21 (Phase 0 ship bar) / 2026-07-22 (residual docs lane **OFFER18-residual-docs**)  
**Status:** **Bible #15 / §18 DONE** (ship bar) — validators + `schemaVersion: 1` + 4dp string prices + inventory CLI **shipped** (Lane **EEEEEE** + money wire **XXXXX**). Optional relational rate de-duplication / `{ rateId }` pointers / column promote = Phase 1–3 **residual** (**no Phase 1 DDL on disk**).  
**Bible:** P1 **#15** / original prompt **§18** — stable business rules live in generic JSON on `ResourceCategory.offeringConfig`.  
**Ship timing:** Write validation + price normalize + Phase 0 `schemaVersion` **shipped**. Typed relational money cutover **defers** until after soak.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| `@IsOfferingConfig()` / `validateOfferingConfig` on category writes | **DONE** | rejects garbage payloads; human-readable errors |
| `normalizeOfferingConfigPrices` (known keys → 4dp strings) | **DONE** | Lane **XXXXX** money wire; dual-read `number \| string` |
| `prepareOfferingConfigForWrite` / `schemaVersion: 1` stamp | **DONE** | Lane **EEEEEE**; category create/update + API emit + FX reprice plan |
| Typed `OfferingConfigV1` / `BowlingModeV1` contract | **DONE** | exported from `offering-config.util.ts` |
| `pnpm inventory:offering-config` (read-only scan) | **DONE** | invalid / missing-version rows reported |
| `mapOfferingConfigPrices` in atomic FX reprice txn | **DONE** | with `ResourceRate` + `Resource.hourlyRate` + menu |
| `ResourceRate` + `Resource.hourlyRate` (relational Decimal) | **DONE** (parallel) | already canonical for many tariffs; **not replaced by JSON** |
| JSON behavioral overlay (`bowlingModes`, `noShowMinutes`, …) | **SHIPPED as-is** | intentional until Phase 1–3; not a ship blocker |
| Three-surface price duplication (JSON vs rates vs hourly) | **RESIDUAL** | same tariff may exist in multiple places |
| Phase 1 rate de-duplication / `{ rateId }` pointers | **RESIDUAL (optional)** | prefer `ResourceRate`; **no DDL on disk** |
| Phase 3 column promote (`noShowMinutes`, …) | **RESIDUAL (optional)** | illustrative SQL only; defer unless reporting needs |
| Legacy rows missing `schemaVersion` / dirty prices | **RESIDUAL (operator)** | until next edit, reprice, or inventory-driven backfill |

**§18 classification:** **DONE** ship bar (validators + version stamp close the “untyped bag” gap); deeper relational normalize is **optional post-soak**, documented here, not hidden.

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Ship bar (DONE)** | Keep `offeringConfig` JSONB + validators; stamp `schemaVersion: 1` on write/API emit; string decimal prices (#1). Run `pnpm inventory:offering-config` after Neon migrate soak. |
| **Post-soak Phase 1** | **Split money from rules:** move category-level timed rates into `ResourceRate` (already relational + Decimal); stop duplicating the same prices inside JSON where possible. |
| **Post-soak Phase 2** | **Versioned JSON for behavioral config only** (`bowlingModes`, `noShowMinutes`, player bounds) — nested prices become `{ rateId }` pointers to `ResourceRate` when ready. |
| **Post-soak Phase 3 (optional)** | Promote high-churn scalars to columns (`noShowMinutes`, `defaultGames`) if query/report needs arise; keep bowling mode arrays in JSON or child table. |

**Why Phase 0 only for DONE:** Pricing today is **split across three surfaces** (`offeringConfig` JSON, `ResourceRate`, `Resource.hourlyRate`). A schema cutover mid-ship risks billing drift. Validators + version stamp close the “untyped bag” bible gap without DDL.

---

## As-is (today)

### Three pricing surfaces (overlap is the problem)

| Surface | Storage | Money type | Validated on write | Primary use |
|---------|---------|------------|-------------------|-------------|
| `ResourceCategory.offeringConfig` | `Json?` JSONB | 4dp decimal **strings** on write/emit (dual-read `number \| string`) | `@IsOfferingConfig()` → `validateOfferingConfig` | Bowling modes + nested rates; dining `noShowMinutes`; legacy flat keys (`pricePerHour`, `pricePerGame`, …) |
| `ResourceRate` | relational rows | `Decimal(19,4)` | `ResourceRateDto` class-validator | Timed block tariffs per category (`label`, `durationMinutes`, `price`) |
| `Resource.hourlyRate` | column per unit | `Decimal(19,4)` | `UpdateResourceDto` | Per-seat/table/lane override |

Migration `20260708193000_arena_offering_config` added JSONB. Money migration `20260720230000_money_decimal_core` upgraded **rates + hourlyRate** but **not** JSON internals.

### Shipped validation (Lane prior — keep)

| Helper | Role |
|--------|------|
| `validateOfferingConfig` / `isValidOfferingConfig` | Structural reject on category create/update; human-readable errors |
| `@IsOfferingConfig()` | class-validator decorator on `CreateCategoryDto` / `UpdateCategoryDto` |
| `OFFERING_PRICE_KEYS` | Known money keys walked by normalize + FX reprice |
| `normalizeOfferingConfigPrices` | `roundMoney` on known keys after DTO pass |
| `mapOfferingConfigPrices` | FX catalog reprice (`shop.service` atomic txn with menu + rates + hourlyRate) |

Validated shapes today:

- Top-level price keys: `pricePerPerson`, `pricePerGame`, `pricePerHour`, `price`, `hourlyRate`, `basePrice`
- Dining: `noShowMinutes` (integer 5–180)
- Bowling: `bowlingModes[]` with `chargeType` (`TIME` \| `GAME` \| `PERSON`), player bounds, nested `rates[]` with required `price`
- Legacy single-mode counters at top level when `bowlingModes` absent

Runtime readers (still tolerate partial legacy):

- `bowling-modes.util.ts` / web `bowling-modes.ts` — parse modes for billing + public booking
- `dining-reservation.util.ts` / web `dining-reservation.ts` — `parseNoShowMinutes` with default fallback

### Residual risks (Phase 1–3 after DONE ship bar — optional)

| Risk | Detail |
|------|--------|
| JSON not a Decimal column | Money lives in JSONB strings, not `Decimal(19,4)` columns — weaker for SQL reporting than `ResourceRate` |
| Duplication | Same tariff may exist in `ResourceRate` **and** inside `bowlingModes[].rates` or top-level keys |
| Legacy rows | Pre-validation / pre-`schemaVersion` rows until next edit, reprice, or inventory-driven cleanup |
| Type-specific rules in one bag | Bowling + dining + generic keys share one blob — no DB constraint per `ResourceType` |

Deep audit §2.15 “unvalidated JSON” is **partially closed**: writes are validated; reads still fallback on legacy/garbage rows predating validation.

---

## Design choice: versioned JSON vs relational rates

### Option A — Versioned JSON (evolve in place)

Keep a single `offeringConfig` column; add contract versioning and typed TS models per venue offering kind.

```json
{
  "schemaVersion": 1,
  "noShowMinutes": 30,
  "bowlingModes": [
    {
      "id": "bm_lane_time",
      "name": "Lane · time slot",
      "chargeType": "TIME",
      "slotMinutes": 60,
      "pricePerPerson": null,
      "pricePerGame": null,
      "defaultGames": 1,
      "minPlayers": 1,
      "maxPlayers": 6,
      "rates": [
        { "label": "1 hr", "durationMinutes": 60, "price": "45.0000" }
      ]
    }
  ]
}
```

| Pros | Cons |
|------|------|
| Minimal migration; matches current API `{ offeringConfig: object }` | JSONB still weak for money integrity / SQL reporting |
| Flexible per-type shapes behind `schemaVersion` | Easy to re-introduce duplicate rates vs `ResourceRate` |
| Validators already centralised | String decimals need dual-read with legacy numbers (#1 wire) |

**When to prefer:** Behavioral config (modes, hold windows, player bounds) and fast product iteration on bowling UX.

### Option B — Relational rates (normalize money)

Promote money to existing / new tables; JSON holds only non-money rules or foreign keys.

| Money | Target |
|-------|--------|
| Timed blocks | **`ResourceRate`** (exists; Decimal) — canonical for category tariffs |
| Per-unit override | **`Resource.hourlyRate`** (exists) |
| Bowling nested `rates[]` | Either rows in `ResourceRate` with `bowlingModeId` FK **or** drop nested rates and reference rate ids |

| Pros | Cons |
|------|------|
| Money aligns with M1 Decimal + FX reprice | More joins; API must compose category + rates + config |
| SQL-friendly price lists | Bowling nested rate UX needs careful UI refactor |
| Removes float JSON money | New columns/FKs if bowling modes become rows |

**When to prefer:** Reporting, FX correctness, and parity with menu `MenuItem.price` (already Decimal column).

### Recommended hybrid (post-Friday)

**Do not pick exclusively.** Split responsibilities:

1. **Relational = money catalog** — `ResourceRate` + `Resource.hourlyRate` remain source of truth for numeric tariffs; FX reprice already atomic across menu, rates, JSON, hourlyRate (Lane D).
2. **Versioned JSON = behavioral overlay** — `schemaVersion`, `bowlingModes` structure, `noShowMinutes`, player/game defaults; nested prices migrate to string decimals or `{ rateId }` pointers to `ResourceRate`.
3. **Validators gate both** — `@IsOfferingConfig()` stays on JSON writes; rate DTOs stay on `rates[]` array; cross-check optional Phase 1 rule: “no duplicate price path for same label/duration.”

This closes #15 without a big-bang rewrite of public booking / play billing parsers.

---

## Target typed models (TypeScript contract)

Canonical types live in shared package or mirrored API/web (today duplicated in `bowling-modes.util.ts` / `bowling-modes.ts`). Post-Friday, generate from one source.

```ts
/** Discriminator written on every offeringConfig save (Phase 0). */
type OfferingConfigV1 = {
  schemaVersion: 1;
  noShowMinutes?: number;
  /** Legacy flat keys — deprecate when rates table owns price */
  pricePerHour?: number | string | null;
  bowlingModes?: BowlingModeV1[];
};

type BowlingModeV1 = {
  id: string;
  name: string;
  chargeType: "TIME" | "GAME" | "PERSON";
  slotMinutes: number;
  pricePerPerson?: number | string | null;
  pricePerGame?: number | string | null;
  defaultGames?: number;
  minutesPerGame?: number | null;
  minPlayers?: number;
  maxPlayers?: number;
  rates?: BowlingModeRateV1[];
};

type BowlingModeRateV1 = {
  label: string;
  durationMinutes: number | null;
  /** Phase 2: string decimal; Phase 0–1: number dual-read */
  price: number | string;
};
```

Per-type views (not separate DB columns yet):

| `ResourceType` / mode | JSON fields | Relational |
|-----------------------|-------------|------------|
| `BOWLING` | `bowlingModes`, legacy counters | `ResourceRate` for published lane tariffs |
| `DINING` | `noShowMinutes` | `Resource.hourlyRate` rarely used |
| `PC` / `CONSOLE` / `OTHER` | optional flat `pricePerHour` | `ResourceRate` + per-unit `hourlyRate` |

---

## Validator evolution (keep + extend)

**Non-negotiable:** retain current rejection behavior for invalid writes.

| Phase | Change |
|-------|--------|
| 0 | If `schemaVersion` present, must be supported integer; default missing → `1` on write |
| 1 | `validateOfferingConfig` accepts `price` as `number \| string` when string matches money parse rules (`parseMoneyString`) |
| 2 | Optional warning (log metric, not 400) when JSON contains known price keys **and** non-empty `ResourceRate` rows with overlapping semantics |
| 3 | Stricter: reject nested `rates[].price` when `rateId` set (single source) |

Do **not** revert DTOs to `@IsObject()` only. Specs in `offering-config.util.spec.ts` + DTO integration tests remain the regression gate.

---

## Migration sketch (post-Friday — no folder until Phase 1 PR)

### Phase 0 — Version stamp (expand-only, no DDL) — **DONE (EEEEEE)**

- API write/emit path: `prepareOfferingConfigForWrite` injects `schemaVersion: 1` when absent + normalizes money strings.
- Inventory CLI: `pnpm inventory:offering-config` (read-only) reports invalid / missing-version rows.
- **No** new migration required.

### Phase 1 — De-duplicate money paths (app + optional DDL)

1. Inventory categories with both `rates` relation rows **and** JSON price keys / `bowlingModes[].rates`.
2. Choose canonical per category (prefer `ResourceRate` when staff UI already edits rate table).
3. One-time backfill: copy JSON prices → missing `ResourceRate` rows **or** strip JSON duplicates after verify.
4. Optional expand: `ResourceRate.bowlingModeId String?` + index — only if nested mode↔rate linkage needed.

### Phase 2 — String decimals in JSON (pairs with [`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md)) — **mostly DONE**

1. Write path + API emit: known keys as 4dp strings — **DONE** (Lane **XXXXX**).
2. Client dual-read `number \| string` in billing parsers — **DONE** where wired.
3. FX reprice: `mapOfferingConfigPrices` through string money helpers — **DONE** (atomic txn with rates).

**Residual:** strip remaining legacy numeric JSON in DB until rows are touched; optional Phase 1 de-duplication before dropping JSON price keys entirely.

### Phase 3 — Promote scalars (contract migration, later — optional)

Only if analytics or SQL filters need it:

```sql
-- Illustrative — not for Friday
ALTER TABLE "ResourceCategory"
  ADD COLUMN "noShowMinutes" INTEGER,
  ADD COLUMN "offeringSchemaVersion" INTEGER NOT NULL DEFAULT 1;
-- Backfill from offeringConfig->>'noShowMinutes'
-- Dual-read: COALESCE(column, (offeringConfig->>'noShowMinutes')::int, 30)
-- Later: stop writing noShowMinutes into JSON; DROP JSON key after window
```

Bowling modes as child table (`BowlingMode`, `BowlingModeRate`) is **optional Phase 4** — defer unless JSON size or edit concurrency hurts.

### Verification window (before dropping JSON money keys)

1. All categories pass `validateOfferingConfig` on read.
2. FX reprice preview matches pre-migration totals for sample shops (bowling + dining + PC).
3. Public booking + staff reservation dialogs compute same amounts on golden fixtures.
4. No category relies solely on JSON for prices that were removed.

---

## API / web compatibility

| Consumer | Today | After Phase 0–1 |
|----------|-------|-----------------|
| `GET` category payloads | `offeringConfig: object \| null` + `rates[]` | unchanged shape; may gain `schemaVersion` inside JSON |
| Resources dashboard | edits JSON + rate table | UI should prefer rate table for timed prices when hybrid rule applies |
| Public gaming booking | reads `bowlingModes` from JSON | same; parsers dual-read string prices in Phase 2 |
| Play billing / finance | `computeBowlingBillingAmount` | keep util; extend for string prices |
| Currency preview / apply | `mapOfferingConfigPrices` in atomic reprice | must handle string prices when wire flips |

**Breaking change avoided:** HTTP field remains `offeringConfig` object; internal evolution is version + optional column promote.

---

## Explicitly out of scope (this lane / pre-Friday)

- New Prisma migrations or `offeringConfig` column drop
- Replacing `validateOfferingConfig` with Zod-only or `@IsObject()`
- Moving bowling billing off notes-encoded mode ids (separate concern)
- Unified ticket / ledger (#6, #10) — but ledger postings must use Decimal amounts derived from validated config
- Full relational normalization of every bowling field

---

## Related docs

| Doc | Link |
|-----|------|
| Money Decimal decision | [`GO_SPOTS_MONEY_DECISION.md`](./GO_SPOTS_MONEY_DECISION.md) |
| Money JSON wire | [`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md) |
| Currency reprice (atomic) | Lane D in [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) |
| Resource / dining merge | [`GO_SPOTS_RESOURCE_MODEL_MERGE.md`](./GO_SPOTS_RESOURCE_MODEL_MERGE.md) |
| Deep audit §2.15 | [`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md) |

---

*Lane **EEEEEE** — Phase 0 shipped (#15 DONE). Lane **OFFER18-residual-docs** — honest §18 shipped vs residual. Verify: `pnpm exec jest src/common/offering-config.util.spec.ts` · `pnpm inventory:offering-config`.*

# Resource vs dining / seating model merge

**Date:** 2026-07-20 (design) · **Updated:** 2026-07-22 (Phase 3 web inventory + implementation ticket)  
**Status:** **DONE (Phase 0–2 ship bar)** — Option C locked + Phase 1 observability + Phase 2 expand dual-write (`sourceDiningTableGroupId`) on disk. **Phase 3 API guardrails + advisory panel SHIPPED 2026-07-22 (`RES17-ui-cutover`).** Phase 4 DROP = residual (soak gate §4.1).  
**Lane:** `OOOOOO-resource-merge` (Phase 0+1) · `OOOOOO-resource-merge-p2` (Phase 2) · `RES17-cutover-docs` (Phase 3–4 checklist) · `RES17-phase3-prep` (web inventory + ticket) · **`RES17-ui-cutover` (Phase 3 ship)**  
**Related:** Bible §17 / old #14, `schema.prisma` (`Resource*` / `DiningTableGroup` / `SeatingTableGroup.sourceDiningTableGroupId`), `resources.service.ts`, `seating-tables.service.ts`, `resource-dining-dual-write.util.ts`, `resource-dining-drift.util.ts`.

---

## Ship bar (honest)

| Status | Meaning for #14 / §17 |
|--------|------------------------|
| **DONE (current ship bar)** | Phase 0 Option C + Phase 1 drift CLI/contract + Phase 2 expand dual-write (`sourceDiningTableGroupId`) on disk. |
| **Residual** | Phase 4 contract DROP after soak. **No DROP migration on disk.** Phase 3 guardrails + advisory panel **shipped** (`RES17-ui-cutover`). |

---

## Shipped vs residual (board snapshot)

| Phase | Scope | Status |
|-------|--------|--------|
| **0** | Option C (Hybrid) product decision — Resource SoT for bookable DINING; advisory seating counts; `isCustom` event blocks kept | **LOCKED** 2026-07-21 |
| **1** | Read-only drift report + mutation-surface contract constants | **SHIPPED** — `resource-dining-drift.util.ts`, `pnpm run detect:resource-dining-drift`, jest |
| **2** | Expand FK + advisory mirror dual-write from dining layout writers | **SHIPPED** — migrate `20260721120000_seating_source_dining_table_group`, `resource-dining-dual-write.util.ts`, `RESOURCE_DINING_DUAL_WRITE` default **on** |
| **3** | Staff UI cutover — one mental model for DINING inventory; stop parallel non-custom seating edits | **SHIPPED (code)** 2026-07-22 — API guardrails + read-only advisory panel on Sessions dining tab; operator drift baseline + soak **residual** — §4.1 |
| **4** | Remove superseded seating CRUD paths; optional schema DROP after soak | **RESIDUAL** — checklist §4.2 |

---

## 1. Why this exists

Venues that mix gaming + restaurant end up with **two parallel “table inventory” concepts**:

1. **Bookable DINING resources** — real units on the digital floor, locked for public/staff reservations and walk-ins.
2. **Seating capacity counters** — staff-facing “how many tables free” groups, also used as optional floor blocks when approving event requests.

They share vocabulary (tables, floors, zones, capacity) but **do not share write paths or invariants**. Staff can update seating availability without touching bookable `Resource` rows, and vice versa. Audit called this **P1 duplication** (dual UIs / mental models; event seating vs DINING resources can diverge).

---

## 2. Current split (as-is)

### 2.1 Bookable inventory (Resource tree)

Canonical bookable unit is `Resource`. Dining reuses the gaming layout stack with type `DINING`:

| Layer | Model | Role |
|-------|--------|------|
| Offering | `ResourceCategory` (`type = DINING`) | One dining “room” offering per venue pattern; rates, `offeringConfig`, slot minutes |
| Zone / area | `GamingSection` | Floor, VIP, optional `zone` (INDOOR/OUTDOOR), `defaultTableCapacity`, image |
| Same-size batch | `DiningTableGroup` | Capacity bucket inside a section (e.g. four 2-tops); owns image / seats-per-row |
| Unit | `Resource` | Individual table; `capacity`, `tableGroupId`, `sectionId`, `status`, `hourlyRate` |

**Consumers of this tree:**

- Public `…/dining/reservations` + schedule (kind gate: resource type must be DINING).
- Staff reservation create/update when `resourceId` set.
- Walk-in `PlaySession` when linked to a dining (or any) resource.
- Booking concurrency: `withResourceBookingLock` on the `Resource` row + overlap asserts.
- Dashboard layout UI: `resources` module + web `gaming-layout-client` / dining area detail.
- Finance play vs dining channel split uses resource-backed billed reservations vs unassigned.

**Mental model:** “This physical table is bookable for this interval.” Availability is derived from reservations / sessions / resource status, not from a free-count field on the group.

### 2.2 Floor availability counters (SeatingTableGroup)

Shop-scoped model; Phase 2 adds optional FK to bookable layout:

| Field | Meaning |
|-------|---------|
| `zone` / `floor` | Indoor vs outdoor; building level |
| `label` / `capacity` | Display + seats per table |
| `totalCount` / `availableCount` | Staff-maintained inventory vs free-now |
| `isCustom` + event window | Event-approved floor blocks |
| `sourceDiningTableGroupId` | **Phase 2:** nullable unique FK → `DiningTableGroup` for advisory mirrors |
| `note` | Free text |

**Consumers:**

- `SeatingTablesService` CRUD (feature: `reservation`); staff floor board.
- `EventRequest.seatingTableGroupId` — on approve, optionally creates a **custom** `SeatingTableGroup` (`createFloorBlock`) when there is no `resourceCategoryId`.
- Web `seating-tables-client` summaries (tables/seats free by zone).
- Phase 2 dual-write from `ResourcesService` dining table-group create/update/delete (+ section floor/zone move).

**Mental model:** “How many tables of this size are free right now?” — operational whiteboard, not reservation lock target. Counts are **not** updated automatically when a public dining booking lands on a `Resource`.

### 2.3 How the two paths meet today

```
Public/staff dining book ──► Resource (DINING) ──► Reservation / PlaySession
                                      ▲
                                      │ layout + Phase 2 mirror totalCount
                         DiningTableGroup ⊂ GamingSection ⊂ ResourceCategory
                                      │
                                      ▼ (sourceDiningTableGroupId)
                         SeatingTableGroup (advisory; availableCount staff-only)

Event request approve ──► optional SeatingTableGroup (custom block)
Staff floor board   ──► SeatingTableGroup (manual availableCount)
```

### 2.4 Intentional product difference (do not erase blindly)

| Concern | Resource / DiningTableGroup | SeatingTableGroup |
|---------|----------------------------|-------------------|
| Granularity | Per physical unit | Aggregated counts |
| Booking lock | Yes (`FOR UPDATE` on unit) | No |
| Public book | Yes | No |
| Event “block the floor” | Not primary | Yes (`isCustom`) |
| Drift risk | Overbook if lock forgotten | Manual count stale vs bookings |

A merge must preserve **both** “assign a specific table” and “hold N tables for a party/event” unless product explicitly drops one.

---

## 3. Risks of merging

(Unchanged — see prior revision.) Naïve sync of `availableCount` from bookings remains forbidden. Phase 2 only mirrors **totalCount** / floor / zone / capacity / label.

---

## 4. Phased approach

### Phase 0 — Product decision — **LOCKED 2026-07-21**

**Decision: Option C (Hybrid).**

Written invariants (binding until Phase 3+ cutover):

1. **Bookable DINING inventory** SoT = `Resource` (`type = DINING`) via layout tree.
2. **Non-custom `SeatingTableGroup` counts are advisory** for shops that also have DINING resources — staff whiteboard only; **never** decremented by public/staff dining book or walk-in pay.
3. **`isCustom` seating rows** remain the event floor-block model until a future hold-reservation replaces them.
4. **Non-DINING lounge/capacity counters** may remain on `SeatingTableGroup` without requiring Resource units.
5. **No auto-sync** of `availableCount` from reservations in Phase 0–2.

### Phase 1 — Observability & contract — **SHIPPED 2026-07-21 (OOOOOO)**

- API mutator surface docs + contract constants in `resource-dining-drift.util.ts`.
- Drift report CLI: `pnpm run detect:resource-dining-drift`.
- Jest drift + contract specs.

### Phase 2 — Dual-write / dual-read (Option C) — **SHIPPED 2026-07-21 (OOOOOO-p2)**

- Expand migration `20260721120000_seating_source_dining_table_group` on disk — nullable unique `SeatingTableGroup.sourceDiningTableGroupId` → `DiningTableGroup` (`ON DELETE CASCADE`).
- Dual-write util `resource-dining-dual-write.util.ts`: upsert/delete advisory mirrors; `RESOURCE_DINING_DUAL_WRITE` default **on** (`off`/`0`/`false` to disable).
- Wired: `ResourcesService` create/update/delete dining table group + DINING section floor/zone update.
- Seating create accepts optional `sourceDiningTableGroupId` (rejects `isCustom` + link).
- Event approve: unchanged — `createFloorBlock` only when no `resourceCategoryId` (prefer category link over opaque custom).
- **No Neon deploy** from agents.

### Phase 3 — Staff UI cutover (**SHIPPED code 2026-07-22 — `RES17-ui-cutover`**)

**Goal:** Staff see **one** dining floor for bookable inventory (`Resource` / `DiningTableGroup` layout). The seating board stops being a second write path for DINING-equivalent capacity; it becomes read-only derived summaries, **event custom blocks only**, or **non-DINING lounge** counters.

**Shipped (lane `RES17-ui-cutover`):**

- API: `resource-dining-seating-guard.util.ts` — deny staff `SeatingTablesService` create/update/delete on non-custom rows when shop has DINING layout or row is a dual-write mirror (`sourceDiningTableGroupId`); `isCustom` event blocks + non-DINING lounge counters still allowed; optional `SEATING_MIRROR_MANUAL_OVERRIDE=on` for emergencies.
- Web: `seating-tables-client.ts` (`sourceDiningTableGroupId`, `isAdvisoryDiningMirror`); read-only `SeatingAdvisoryPanel` embedded on Sessions → Dining tab; event-request floor-block copy (`eventRequests.floorBlock*`).
- Contract: `SEATING_MANUAL_EDIT_GUARD_SURFACES` in `resource-dining-drift.util.ts`.
- **`RESOURCE_DINING_DUAL_WRITE` stays on** (default); no schema/DROP.

**Preconditions (operator / product — still open):**

- [ ] Neon migrate `20260721120000_seating_source_dining_table_group` applied in target env
- [ ] `RESOURCE_DINING_DUAL_WRITE` left **on** (default) through cutover soak
- [ ] Baseline drift report: `pnpm --filter @gospots/api run detect:resource-dining-drift` — record `driftedBuckets` per shop (informational; Option C allows advisory mismatch until UI converges)

#### 4.3 Web surface inventory (2026-07-22 — `RES17-phase3-prep`)

**Headline:** Bookable floor/booking paths on web **already read `Resource` / schedule units** (`resourceId`). There is **no staff seating-board page** wired today — `seating-tables-client.ts` is an orphan API client (zero component imports). Phase 3 UI work is **net-new seating summary UI + guardrails**, not rewiring existing floor maps.

| Surface | Path / module | Reads today | Writes today | Phase 3 target |
|---------|---------------|-------------|--------------|----------------|
| **Dining layout editor (SoT)** | `dashboard/…/dining/page.tsx` → `dining-layout-editor.tsx` → `dining-area-detail.tsx` | `GamingSection` + `DiningTableGroup` + nested `Resource` units via `gaming-layout-client.ts` (`/resources/gaming-sections`, `/resources/dining-table-groups`) | Same — create/update/delete sections, table groups, unit counts | **Keep primary** DINING inventory editor (unchanged SoT) |
| **Gaming layout editor** | `dashboard/…/resources/page.tsx` → `gaming-layout-editor.tsx` | `GamingSection` + gaming `Resource` units via `gaming-layout-client.ts` | Section CRUD + unit status | Unchanged (non-DINING bookable inventory) |
| **Staff reservations floor map** | `dashboard/…/sessions/page.tsx` → `GameBookingSchedule` / `SeatFloorMap` (`seat-floor-map.tsx`) | `fetchDaySchedule` + `fetchResourceCatalog` — agenda + floor tiles keyed by `resourceId` / `ScheduleUnit` | `createReservation` / `updateReservation` / `updateResourceUnit` (status) via `reservation-dialog.tsx` | Unchanged — already Resource-backed |
| **Staff day agenda** | `booking-day-agenda.tsx` | Schedule `resourceId` | Opens reservation dialog | Unchanged |
| **Public dining book** | `venue-dining-tab.tsx` + `public-dining-client.ts` | Public schedule units + `resourceId` on submit | `POST …/dining/reservations` | Unchanged |
| **Public gaming book** | `venue-gaming-tab.tsx` + `public-gaming-client.ts` | Same pattern | Gaming reservation POST | Unchanged |
| **Walk-in / play billing** | `game-billing-panel.tsx`, `sessions/page.tsx` | `fetchResourceCatalog` → `resourceId` | Play session create | Unchanged |
| **Onboarding seed** | `onboarding-wizard.tsx` + `apply-onboarding-template.ts` | `createResourceCategory` / layout APIs | Resource tree only | Unchanged |
| **Event requests approve** | `event-requests-panel.tsx` | Displays `seatingTableGroupId` when approved | `reviewEventRequest({ createFloorBlock: !resourceCategoryId })` → API creates **`SeatingTableGroup` (`isCustom`)** | **Keep** custom floor blocks; copy clarifies layout vs event hold |
| **Staff seating counters (missing UI)** | `seating-tables-client.ts` only | — (client unused) | — | **SHIPPED:** read-only `SeatingAdvisoryPanel` on Sessions dining tab; API denies manual non-custom edits when DINING layout |
| **Deprecated helper (removed)** | `dining-layout.ts` `diningZoneLabel` | — | — | Removed 2026-07-22 (`RES17-phase3-prep`); all callers already use `seatingZoneLabel` |

**API-only (no web UI today):** `SeatingTablesService` CRUD at `/seating-tables` — still reachable via API/direct client; Phase 3 should add **server guardrails** (§4.4) even if web board stays unshipped.

**Dual-write:** Layout edits (`createDiningTableGroup`, `updateGamingSection` floor/zone, etc.) already mirror advisory `SeatingTableGroup.totalCount` server-side when `RESOURCE_DINING_DUAL_WRITE` is on — web does not call seating APIs for that.

#### 4.4 Phase 3 implementation ticket — lane `RES17-ui-cutover` (**DONE 2026-07-22**)

**Scope:** Web seating summary + staff copy + API guardrails. **No schema / no DROP / no column changes.** Keep `RESOURCE_DINING_DUAL_WRITE` **on** through soak.

**Preconditions (same as §4.3 operator list +):**

- [ ] Drift baseline captured per shop (`detect:resource-dining-drift`)
- [x] Product sign-off on whether to ship a read-only seating summary panel or API-only guardrails first — **shipped both** (advisory panel + API guards)

**Web files (implement lane — do not start until board claim):**

| File | Work |
|------|------|
| `apps/web/src/lib/seating-tables-client.ts` | Add optional `sourceDiningTableGroupId?: string \| null` on `SeatingTableGroup`; helper `isAdvisoryDiningMirror(g)`; export read-only fetch wrapper if needed |
| `apps/web/src/components/seating/seating-advisory-panel.tsx` *(new)* | Read-only grouped summary: total/available by zone; badge “mirrored from layout” when `sourceDiningTableGroupId`; **no** edit for linked non-custom rows |
| `apps/web/src/app/(tenant)/dashboard/[venuePath]/sessions/page.tsx` | Optional embed advisory panel on dining tab when shop has DINING categories; link to `/dining` layout for edits |
| `apps/web/src/components/reservations/event-requests-panel.tsx` | Tooltip/copy: event floor block vs bookable layout table |
| `apps/web/src/lib/i18n.ts` (+ pl block) | Keys: advisory vs bookable table vocabulary (`seating.advisory*`, `eventRequests.floorBlock*`) |
| `apps/web/src/components/layout/tenant-shell.tsx` | Only if standalone `/seating` route added — otherwise sessions embed is enough |

**API guardrails (lane `RES17-ui-cutover` — shipped):**

| File | Work |
|------|------|
| `apps/api/src/modules/reservations/seating-tables.service.ts` | Reject PATCH/POST/DELETE that mutates **non-custom** rows when `sourceDiningTableGroupId IS NOT NULL` **or** shop has active DINING `ResourceCategory` (unless `SEATING_MIRROR_MANUAL_OVERRIDE=on`) |
| `apps/api/src/common/resource-dining-seating-guard.util.ts` | Guard helpers + jest |
| `apps/api/src/common/resource-dining-drift.util.ts` | `SEATING_MANUAL_EDIT_GUARD_SURFACES` contract constants |
| `apps/api/src/modules/reservations/seating-tables.service.guardrails.spec.ts` | Characterization: deny advisory mirror manual edit; allow `isCustom` create |

**Explicit non-goals (this ticket):**

- No DROP / no new migrations / no `prisma migrate reset`
- No auto-sync of `availableCount` from reservations (Option C)
- No removal of `seating-tables-client.ts` until Phase 3 UI or guardrails land (client is Phase 3 entry point)
- No Neon deploy from agents

**Verify (implement lane):**

```bash
pnpm --filter @gospots/api exec jest src/common/resource-dining-drift.util.spec.ts src/common/resource-dining-dual-write.util.spec.ts src/modules/seating-tables --runInBand
pnpm --filter @gospots/api exec nest build
pnpm --filter @gospots/web run typecheck
pnpm --filter @gospots/web run i18n:check
# optional local DB:
pnpm --filter @gospots/api run detect:resource-dining-drift
```

**Soak gate (before Phase 4):** unchanged — §4.1 soak bullets below.

**Web UI checklist (legacy table — superseded by §4.3 inventory):**

| Surface | Today | Phase 3 target |
|---------|-------|----------------|
| Bookable layout | `gaming-layout-editor` / `dining-layout-editor` / `dining-area-detail`; dashboard `…/resources` | **Primary** DINING inventory editor (unchanged SoT) |
| Floor counters | `seating-tables-client` + staff seating board CRUD | For shops with DINING resources: **hide or read-only** non-custom rows linked via `sourceDiningTableGroupId`; keep **create/edit** for `isCustom` event blocks and shops **without** DINING layout |
| Event approve | `createFloorBlock` when no `resourceCategoryId` | Unchanged — custom blocks remain until hold-reservation product exists |
| Staff messaging | Two parallel “table” vocabularies | Copy/tooltips: bookable tables = layout; seating board = advisory / event-only where applicable |

**API / server guardrails (shipped `RES17-ui-cutover`):**

- [x] Reject `SeatingTablesService` create/update/delete of **non-custom** groups when shop has DINING `ResourceCategory` or row is a layout mirror (unless `SEATING_MIRROR_MANUAL_OVERRIDE=on`)
- [ ] Optional one-shot **backfill** script: for opted-in shops, link orphan non-custom seating rows to nearest `DiningTableGroup` or archive duplicates (script not on disk — design before implement)
- [ ] Drift CLI exit 1 remains informational; **do not** auto-sync `availableCount` from reservations (Option C invariant)

**Soak gate before Phase 4:**

- [ ] At least one production shop with DINING layout uses layout-only edits for ≥2 weeks with dual-write on
- [ ] Drift buckets stable or explained (staff no longer manually editing mirrored totals)
- [ ] Event custom seating still creatable where product requires floor blocks

### Phase 4 — Contract DROP (**RESIDUAL**)

**Goal:** Remove superseded dual-model paths after Phase 3 soak. Append-only safety: **no DROP until UI + API guardrails shipped and soaked.**

**Preconditions:**

- [ ] Phase 3 UI + API guardrails deployed
- [ ] Drift report shows no shops relying on manual non-custom seating CRUD for DINING capacity
- [ ] Product sign-off: event `isCustom` blocks sufficient without parallel DINING-equivalent seating rows

**Implementation checklist (future lane):**

| Step | Action |
|------|--------|
| 1 | Remove or hard-disable staff seating CRUD endpoints/UI for superseded non-custom DINING mirrors |
| 2 | Set `RESOURCE_DINING_DUAL_WRITE=off` only after mirrors no longer required for read paths (or remove util calls entirely) |
| 3 | Optional expand migration: soft-delete/archive orphan `SeatingTableGroup` rows where `sourceDiningTableGroupId IS NOT NULL` and `isCustom = false` |
| 4 | **DROP migration (last):** only if product drops advisory mirror entirely — e.g. drop `sourceDiningTableGroupId` column **or** entire non-custom seating model for DINING shops; **not on disk** |
| 5 | Update [`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md) P1 duplication note → **Resolved** |

**Explicit non-DROP (remain until separate product lane):**

- `isCustom` `SeatingTableGroup` + `EventRequest.seatingTableGroupId` event floor blocks
- Non-DINING lounge capacity counters without `Resource` units
- Bookable `Resource` / reservation / walk-in lock paths

**Rollback:** Prefer forward-fix + feature flag (`RESOURCE_DINING_DUAL_WRITE`) over column DROP. If DROP shipped prematurely, Neon PITR / branch — **forbidden:** `prisma migrate reset`.

**Suggested future lanes:** `RES17-ui-cutover` (Phase 3) · `RES17-seating-drop` (Phase 4). DROP pattern: [`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md).

---

## Explicit deferral

| Item | Timing |
|------|--------|
| Staff seating board UI cutover | Phase 3 lane — **after** Neon migrate + dual-write soak |
| API guardrails blocking non-custom seating CRUD | Phase 3 lane — with or immediately after UI |
| Opt-in backfill / dedupe script | Phase 3 optional — before Phase 4 if drift noisy |
| DROP `sourceDiningTableGroupId` or seating model trim | Phase 4 — **after** Phase 3 soak only |
| Auto-sync `availableCount` from reservations | **Out of scope** (Option C forbids) |
| Merge event holds into Resource locks | Separate product lane |

---

## 5. Explicit non-goals (this lane / Phase 0–2)

- No Neon deploy / `migrate reset`.
- No UI redesign of dining or seating boards (Phase 3).
- No auto-sync of `availableCount` from reservations.

---

## 6. Acceptance criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Phase 0 decision recorded (A / B / C) | **Met — C** |
| 2 | One primary write path for **bookable** dining inventory | Documented; SoT = Resource; cutover residual |
| 3 | Event floor blocks map to holds **or** remain explicit `isCustom` | **Kept `isCustom`** (Option C) |
| 4 | Public dining book + staff resource lock unchanged | **Met** (no seating `availableCount` from books) |
| 5 | Migration expand-only; rollback path; board claim | **Met** Phase 2 on disk |
| 6 | Tests: layout / book / event consistency per option | Drift + dual-write jest shipped; e2e residual |

---

## 7. Verify

```bash
pnpm --filter @gospots/api exec jest src/common/resource-dining-drift.util.spec.ts src/common/resource-dining-dual-write.util.spec.ts --runInBand
pnpm --filter @gospots/api exec nest build
# optional against local DB (never Neon from agents):
pnpm --filter @gospots/api run detect:resource-dining-drift
```

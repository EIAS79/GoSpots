# Resource vs dining / seating model merge

**Date:** 2026-07-20 (design) · **Updated:** 2026-07-21 (Phase 2 ship → DONE)  
**Status:** **DONE** — Phase 0 Option C + Phase 1 observability + Phase 2 expand dual-write (`sourceDiningTableGroupId`) on disk. Phases 3–4 cutover/DROP = residual.  
**Lane:** `OOOOOO-resource-merge` (Phase 0+1) · `OOOOOO-resource-merge-p2` (Phase 2)  
**Related:** Deep audit §2.14, `schema.prisma` (`Resource*` / `DiningTableGroup` / `SeatingTableGroup.sourceDiningTableGroupId`), `resources.service.ts`, `seating-tables.service.ts`, `resource-dining-dual-write.util.ts`, `resource-dining-drift.util.ts`.

---

## Ship bar (honest)

| Status | Meaning for #14 |
|--------|-----------------|
| **DONE (current)** | Phase 0+1 **and** Phase 2 expand dual-write (`sourceDiningTableGroupId`) on disk. |
| Residual | Phases 3–4 UI cutover / DROP superseded non-custom seating for DINING-equivalent shops. |

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

### Phase 3 — Cutover (residual)

- UI: single dining floor for bookable inventory; seating board either read-only derived or limited to event customs + non-DINING lounge.
- Stop creating non-custom seating groups for DINING-equivalent capacity when resources exist.
- Backfill script for shops that opt in.

### Phase 4 — Contract drop (residual)

- Remove unused seating CRUD for superseded cases; drop columns/tables only after dual-read window.
- Update deep audit §2.14 → Resolved.

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

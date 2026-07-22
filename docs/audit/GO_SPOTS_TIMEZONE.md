# Locora — Venue timezone / scheduling (Bible §21 / #21)

**Date:** 2026-07-20 (schema + API wiring) / 2026-07-21 (settings IANA UI — Lane **B-timezone-ui**) / 2026-07-22 (residual docs lane **TZ21-residual-docs**)  
**Status:** **Bible #21 / §21 PARTIAL** — schema + API venue day keys + settings UI = **DONE** ship bar. Web display formatting and client date pickers still use browser-local calendar semantics; operator Neon migrate = **OPEN**. Phased plan below.  
**Audit:** P1 §21 / legacy #21.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| `Shop.timezone` column (IANA, default `UTC`) | **DONE** | migration `20260720220000_shop_timezone` on disk |
| API `venue-timezone.util` (day keys, bounds, wall→UTC) | **DONE** | `apps/api/src/common/venue-timezone.util.ts` + jest spec |
| `loadShopVenueTimeContext` (locale + IANA resolve) | **DONE** | `shop-venue-time.util.ts`; raw SQL fallback pre-migrate |
| Shop settings IANA select + API validation | **DONE** | Lane **B-timezone-ui**; `shop-settings-panel.tsx`; `shop.service.ts` `isValidIanaTimeZone` |
| Onboarding wizard timezone step | **DONE** | `onboarding-wizard.tsx` + `iana-timezone.ts` |
| Schedule day bounds + horizon (staff + public) | **DONE** | `reservations-schedule.service.ts` → `dayBoundsInTimeZone` |
| Public booking horizon vs venue “today” | **DONE** | `reservations-public.service.ts` → `calendarDayInTimeZone` |
| Finance / menu stock day reset (`venueDayKey`) | **DONE** | `menu-stock.util.ts`; orders, transactions, analytics |
| Opening-hours weekday + span day keys | **DONE** | `opening-hours.util.ts` |
| Floor status “today” when zone passed | **DONE** | `booking-floor-status.ts` → `calendarDayInTimeZone` |
| Characterization / util tests | **DONE** (minimal) | `venue-timezone.util.spec.ts`; schedule characterization uses `dayBoundsInTimeZone` |
| Neon `migrate deploy` of timezone column | **OPERATOR** | column defaults `UTC` until applied; loader tolerates missing column |
| Web `formatDate` / `toLocale*` display paths | **PARTIAL** | `formatDate(iso, locale, timeZone?)` + staff notifications + overview reservations wired (Lane **TZ21-format-timezone**); ~35 other paths still browser-local |
| Client date pickers (`todayDateInput`, event datetime) | **PARTIAL** | Staff sessions + event-requests + dining/resources layout schedule day **DONE** (Lanes **TZ21-staff-event-today**, **TZ21-staff-layout-today**); public gaming/dining schedule defaults + secondary booking/floor-map + public event form **DONE** (Lanes **TZ21-public-timezone**, **TZ21-public-secondary**, **TZ21-event-today**); bulk `toLocale*` event datetime display **residual** |
| Web venue day-key helpers (`calendarDayInTimeZone`, …) | **PARTIAL** | `apps/web/src/lib/venue-timezone.ts` + `test:venue-tz`; staff sessions default day + finance report day labels wired; public pickers / ~40 `toLocale*` paths **residual** |
| Deprecated `dayBoundsLocal` / `isSameLocalCalendarDay` | **RESIDUAL** (dead) | retained in `booking-floor-status.ts`; no callers |
| DST / non-UTC venue soak matrix | **RESIDUAL** | util covers offset iteration; no broad characterization suite |
| Mail / PDF timestamp display in venue zone | **RESIDUAL** (low) | reservation mail + invoice templates use default `toLocale*` |

**§21 classification:** **PARTIAL** — money/scheduling **correctness paths on API use venue IANA day keys** (ship bar met). Residuals are **display/picker polish** and **operator migrate**, not hidden blockers.

---

## Problem

Audit: venues in Poland (or any non-UTC zone) need calendar-day boundaries for stock reset, finance day buckets, and schedule overlap — not the API host’s process timezone or the staff browser’s local offset.

## Decision (ship bar — locked)

| Option | Verdict |
|--------|---------|
| **A. `Shop.timezone` IANA + API day-key util** | **Done** — explicit column; `resolveVenueTimeZone` prefers IANA, locale heuristic fallback |
| **B. Wire critical mutators + schedule queries** | **Done** — finance/menu stock, schedule bounds, opening hours, public horizon |
| **C. Settings UI + validation** | **Done (Lane B-timezone-ui)** — IANA select; API rejects invalid zones |
| **D. Web display + pickers in venue zone** | **Deferred** — accepted residual; API truth is authoritative |
| **E. Remove all process-local day helpers** | **Deferred** — low priority cleanup |

### Ship bar (Bible #21)

| In scope (DONE) | Explicit non-goals / later |
|-----------------|----------------------------|
| Schema + migration on disk | Neon migrate (operator) |
| API schedule/finance/stock day keys | Web `toLocale*` venue-zone pass |
| IANA settings + onboarding | Client `calendarDayInTimeZone` mirror |
| Util + schedule characterization tests | Full DST matrix / every UI surface |

---

## What exists today (code truth)

### Core util (`venue-timezone.util.ts`)

| Export | Role |
|--------|------|
| `isValidIanaTimeZone` | Runtime Intl validation + cache |
| `resolveVenueTimeZone` | Prefer explicit IANA → locale map → `UTC` |
| `calendarDayInTimeZone` | `YYYY-MM-DD` in zone |
| `dayBoundsInTimeZone` | Inclusive UTC instants for venue calendar day |
| `zonedWallTimeToUtc` | Wall clock `YYYY-MM-DD` + `HH:mm` → UTC `Date` |
| `weekdayInTimeZone` | JS weekday in zone (opening hours) |
| `parseDateKey` | Strict calendar key validation |

Locale→TZ map covers `en`, `pl`, `de`, `fr`, `es`, `ar`, common `en-US` / `en-GB` — **fallback only** when IANA unset/invalid.

### Wired API surfaces

| Surface | Day-key source |
|---------|----------------|
| Staff + public schedule | `loadShopVenueTimeContext` → `dayBoundsInTimeZone` |
| Public gaming booking horizon | `calendarDayInTimeZone` vs venue today |
| Menu stock reset / order lines | `venueDayKey(resolvedTimeZone)` |
| Finance transactions (stock gate) | same |
| Finance analytics day buckets | `loadShopVenueTimeContext` (comment: IANA preferred) |
| Opening-hours validation | `calendarDayInTimeZone` + `weekdayInTimeZone` |
| Unit floor status (when zone arg set) | `calendarDayInTimeZone` |

### Web (settings only)

- `shop-settings-panel.tsx` — full IANA list via `Intl.supportedValuesOf('timeZone')` when available
- `onboarding-wizard.tsx` — timezone step on first-run
- `iana-timezone.ts` — validation + list only (**no** day-bound helpers)

### Pre-migrate safety

`loadShopVenueTimeContext` uses raw SQL for `Shop.timezone`; on failure falls back to Prisma locale-only + `UTC`. Expand-only migration; default `UTC` is safe until operator applies.

---

## Residual phased plan

Phases ordered by correctness impact. **Do not block ship on Phase 2** — API day keys are authoritative for stock/finance/schedule.

### Phase 0 — Schema + API day keys + settings UI (**DONE**)

- [x] Migration `20260720220000_shop_timezone`
- [x] `venue-timezone.util` + `shop-venue-time.util`
- [x] Schedule, finance, menu, opening-hours wiring
- [x] Settings + onboarding IANA UI (Lane **B-timezone-ui**)
- [x] API rejects invalid IANA on settings update

**Exit:** Venue owner can set IANA; API mutators/query bounds use venue calendar days.

### Phase 1 — Operator migrate + venue TZ smoke (**OPERATOR**)

**Trigger:** Production deploy includes API build expecting `Shop.timezone` column.

| Gate | Action |
|------|--------|
| **0** | Confirm migration #2 in ordered deploy list ([`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md)) |
| **1** | Neon `migrate deploy` — verify `Shop.timezone` exists, default `UTC` |
| **2** | Set real IANA per venue (e.g. `Europe/Warsaw`) in settings |
| **3** | Smoke near venue midnight: schedule day flip, menu stock day reset, finance “today” report — compare UTC host vs venue boundary |

**Non-goals:** Code changes; DST exhaustive matrix.

**Exit:** Live DB has column; at least one non-UTC venue verified manually.

### Phase 2 — Web display + picker alignment (**PARTIAL**)

**Trigger:** Staff in different TZ than venue report confusing date labels **or** post-launch polish sprint.

| Work | Notes |
|------|--------|
| Shared web helper | **PARTIAL (Lane TZ21-web-day-helper)** — `apps/web/src/lib/venue-timezone.ts` mirrors API `calendarDayInTimeZone` / `venueDayKey` / `resolveVenueTimeZone`; `pnpm --filter @gospots/web run test:venue-tz` |
| Staff sessions default day | **DONE** — `sessions/page.tsx` uses `venueDayKey(resolveVenueTimeZone({ timezone: shop.timezone, locale }))` + `addVenueCalendarDays` |
| Staff event-requests phone log default | **DONE** (Lane **TZ21-staff-event-today**) — `event-requests-panel.tsx` via `useVenueSettingsOptional().shop.timezone` |
| Staff dining/resources layout schedule day | **DONE** (Lane **TZ21-staff-layout-today**) — `dining/page.tsx` + `resources/page.tsx` `fetchDaySchedule(venueDayKey(...))` via `useVenueSettings().shop.timezone` |
| Finance report day labels | **DONE** — `finance-reports-panel.tsx` formats API day keys via `formatVenueDayKey` |
| `format.ts` `formatDate` | Accept optional `timeZone`; default browser for backward compat — **PARTIAL** (Lane **TZ21-format-timezone**): helper + staff **notifications** + overview **reservations** list wired; ~35 other `formatDate`/`toLocale*` paths **residual** |
| Date pickers | Staff: `venueDayKey(resolveVenueTimeZone({ timezone: shop.timezone, locale }))` via `useVenueSettings()` / `useVenueSettingsOptional()` — **DONE** (sessions, event-requests panel, dining layout, resources layout). Public gaming/dining schedule defaults: **DONE** (Lane **TZ21-public-timezone**). Secondary public “today” labels: **DONE** (Lane **TZ21-public-secondary**). Public event form default date: **DONE** (Lane **TZ21-event-today**). **Residual:** bulk `toLocale*` event datetime display |
| Schedule / finance panels | Pass `shop.timezone` into remaining `toLocale*` options — **residual** |
| Gaming / dining status pages | Display in venue zone (public pages may still prefer visitor locale — product choice) — **residual** |

**Non-goals:** Rewriting every chart axis; mail template i18n overhaul.

**Exit:** Staff-facing “today” and date labels match venue IANA when configured.

### Phase 3 — Cleanup + test depth (**RESIDUAL**)

**Prerequisite:** Phase 2 started or explicitly waived.

| Work | Notes |
|------|--------|
| Remove `dayBoundsLocal` / `isSameLocalCalendarDay` | No callers; delete or mark internal-only |
| Characterization tests | Non-UTC shop fixture (`Europe/Warsaw`) for schedule bounds + stock day flip |
| DST edge cases | `zonedWallTimeToUtc` spring/fall dates in util spec |
| Locale fallback audit | Document when locale heuristic still used (invalid IANA in DB) |

**Exit:** No deprecated process-local day helpers; confidence for EU venues with DST.

---

## Recommendation (when to pull which phase)

| When | Action |
|------|--------|
| **Today (pre-submit / single region)** | Phase 0 sufficient; set venue TZ in settings after migrate |
| **Prod deploy** | Phase 1 operator gates (migrate + one smoke venue) |
| **Support tickets on “wrong day” labels** | Phase 2 web display pass |
| **EU expansion / DST incidents** | Phase 3 tests + cleanup |

---

## Operator checklist (Gates 0–3)

Use after Render resume + ordered migrate deploy.

| Gate | Check | Pass criteria |
|------|--------|---------------|
| **0** | Migration on disk | `20260720220000_shop_timezone` in preflight PASS |
| **1** | Neon apply | `\d "Shop"` shows `timezone` text NOT NULL default `UTC` |
| **2** | Settings persist | Save `Europe/Warsaw` (or venue zone) → reload shows same; audit log mentions timezone |
| **3** | Boundary smoke | With venue TZ ≠ UTC: schedule query for venue “today” includes bookings after UTC midnight but before venue midnight; menu stock resets on venue day key |

Record gate outcomes in [`docs/PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md) when executed.

---

## Files

| Path | Role |
|------|------|
| `docs/audit/GO_SPOTS_TIMEZONE.md` | This design + residual plan |
| `apps/api/src/common/venue-timezone.util.ts` | IANA day-key core |
| `apps/api/src/common/shop-venue-time.util.ts` | Load shop locale + timezone |
| `apps/api/src/common/menu-stock.util.ts` | `venueDayKey` wrapper |
| `apps/api/src/modules/shop/shop.service.ts` | IANA validation on settings |
| `apps/api/prisma/migrations/20260720220000_shop_timezone/` | Expand-only column |
| `apps/web/src/lib/iana-timezone.ts` | Client validation + select list |
| `apps/web/src/lib/venue-timezone.ts` | Web day-key helper (mirrors API util) |
| `apps/web/src/components/reservations/event-requests-panel.tsx` | Staff event phone-log default date (venue today) |
| `apps/web/src/app/(tenant)/dashboard/[venuePath]/dining/page.tsx` | Staff dining layout schedule day (venue today) |
| `apps/web/src/app/(tenant)/dashboard/[venuePath]/resources/page.tsx` | Staff resources layout schedule day (venue today) |
| `apps/web/src/components/settings/shop-settings-panel.tsx` | Regional timezone UI |

## Non-goals (this lane / pre-submit)

- Changing how UTC instants are stored (always UTC in DB)
- Per-user staff timezones (venue is the boundary)
- Automatic TZ from geocoding / address
- Blocking ship until every UI label uses venue zone

## Operator next steps

1. Phase 1 gates after Neon migrate in deploy window
2. Set each venue’s IANA in settings (onboarding or Regional tab)
3. Phase 2–3 only if display confusion or DST testing is prioritized post-launch

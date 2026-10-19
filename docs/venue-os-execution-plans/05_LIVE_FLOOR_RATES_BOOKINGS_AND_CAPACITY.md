# 05 — Live Venue: Resources, Sessions, Pricing, Reservations and Time Semantics

**Classification:** `COVERED_VERIFY_DEPTH` for P2/P3/P8; `CONFIRMED_FINDING` for reservation-format timezone | **Priority:** P0 | **R maps:** R3/R5/R9.

## Scope preserved from the master

P2 covers venue configuration, zones/resources/rates/devices; P3 covers start/pause/resume/move/extend/waitlist/downtime/handover; P8 covers booking, deposits, capacity, attendance and event groups. The work is **re-certification plus precision on concurrency and timezone**, not a new live-floor rewrite. Current audited reservation staff/public `formatWindow()` implementations use `toLocaleDateString` and `toLocaleTimeString` without explicit shop timezone. PR #95 has overlapping draft work—diff against main before new implementation.

## Canonical time model

Persist start/end as UTC instants, venue IANA timezone as `Shop.timezone` (e.g. `Europe/Warsaw`), wall-clock user input with offset/zone disambiguation when necessary, and a configurable venue `businessDayStartsAt` independent of UTC midnight. Display client preference explicitly but confirm booking in **venue local time**, including zone abbreviation/offset on ambiguous DST day. Price duration via monotonic elapsed-duration and authoritative server clock; no independent browser billing clock. Record tariff version effective at session start and full pause/resume/move/rate snapshots. Never change old bills when owner updates prices.

## Engineering tasks

1. Enumerate all resource kinds and finite capacities, resource state-machine guards, maintenance blocks and nested/group resource exclusivity. Two operators racing to start or book the final resource must resolve in one DB transaction or versioned compare-and-swap; no double occupancy.
2. Audit timed session lifecycle: walk-in, reservation check-in, prepaid package, pause, resume, resource move, bundle/multiple participants, time extension, split table bill, timed expiry, no-show, customer transfer, session restart, overnight. Define the only action that crystallizes a session's final charge into GuestCheck and ensure timer cannot reopen paid check silently.
3. Validate rates: minimum billing unit/grace period, hourly vs fixed, happy hour crossing, weekends/holidays, variable zone, combo food+game, package depletion, price override permissions, rounding and tax status. Define snapshot semantics for rate schedule changes mid-session. Keep a price quote/preview endpoint separate from binding checkout snapshot.
4. Reservations: hold/confirm/cancel/no-show/arrive, deposit collection/forfeiture/refund and rescheduling, capacity calendar, double-booked slots, email+SMS confirmations, staff manual override. Enforce availability server-side; hold TTL has monotonic DB expiry. Do not send confirmation until booking is committed.
5. Replace server-local `formatWindow` with explicit shop timezone and locale; avoid string roundtrips. Audit **all** paths formatting booking/reminder/event/receipt/staff notes, not just two methods. Reconcile still-open draft PR #95 and #100 with current code.
6. Operator UX: floor map (occupied/available/booked/maintenance), search check/customer, close/transfer/undo where permitted, overdue and abandoned session alerts, 'What needs attention' queue, device and provider state badges with valid meaning, touch/tablet scanning, keyboard shortcuts, screen reader affordances.
7. Integrate with Edge conflict authority: online DB owns sessions unless explicit certified Edge mode; command IDs and resource lease/version prevent simultaneous cloud+Edge sessions. Reconnect replays commands exactly once and surfaces unresolvable conflicts before checkout.

## Test matrix

| Case | Assertion |
| --- | --- |
| Two cashiers tap Start simultaneously | One session, one occupied state, losing actor receives safe conflict |
| Pause across business-day boundary | Accurate paused duration and tariff snapshot |
| DST spring gap | Invalid venue-local nonexistent time rejected or valid disambiguation |
| DST fall repeated hour | Operator chooses correct occurrence or booking includes offset |
| Traveler books Warsaw from non-Polish time zone | Venue-local time correct in confirmation and staff view |
| Reservation hold + concurrent walk-in | Capacity not oversold |
| Rate changes during ongoing timed play | Frozen or explicitly contracted price applies |
| Internet outage while timer runs | Certified authoritative clock/Edge continuity, no double-billing |
| No-show deposit + later refund | Ledger/tax/fiscal/booking history consistent |
| Overnight shift at configured 04:00 close | Consistent report day, timestamps and invoice rules |

## Definition of done

R3 and R5 accept complete empty-tenant setup and all above scenarios. Ship a real busy-shift run with two employees and last-resource races; require locale/timezone snapshots in audit evidence and no unexplained occupancy/charge discrepancy. Deliver `venue-timezone-business-day-contract.md`, `tariff-pricing-contract.md`, `capacity-and-session-concurrency-results.md` and visual/operator E2E evidence.

**Source anchors:** `apps/api/src/modules/reservations/reservations-staff.service.ts`, `reservations-public.service.ts`; P2/P3/P8; PR #95/#100; live floor and rate modules discovered in R1.

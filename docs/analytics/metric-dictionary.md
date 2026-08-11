# GoSpots Analytics 2.0 — Metric Dictionary

Status: **Chunk 20 canonical definitions**

This document is the contract for decision-grade analytics. Product UI, API responses,
exports and future aggregates must use these definitions rather than re-implementing
metrics ad hoc.

## Global conventions

### Time boundary

Unless a metric explicitly says otherwise, a day means the venue-local calendar day
using the shop time zone. UTC is storage/transport only. A range is half-open:
`[from, to)`.

### Money

- Monetary calculations use integer minor units in the source currency.
- No cross-currency addition is permitted without an explicit FX conversion layer.
- A multi-currency shop/range is returned grouped by currency.
- Rounded display values never feed another metric.
- Payments count only when their canonical payment state is successful/settled.
- Refunds count only when their canonical refund state is successful.
- Pricing snapshots are evidence of the price decision, not the cash ledger.

### Revenue reconciliation

Revenue analytics reconcile to canonical settlement/payment sources. `PricingSnapshot`,
`TipLedgerEntry`, promotions and packages explain composition; they do not create
revenue independently.

### Resource time

All resource-duration metrics clip sessions/reservations to the requested time range.
A session crossing midnight contributes only the seconds/minutes inside each venue-local
day. Maintenance and closed periods do not count as available capacity.

---

## Finance KPIs

### Settled gross sales

- **Definition:** successful captured/tendered customer payments before successful refunds.
- **Numerator:** sum of canonical successful `Payment` amounts in minor units.
- **Denominator:** none.
- **Time boundary:** payment settlement/capture timestamp inside the range.
- **Exclusions:** failed, canceled, pending, unknown/unreconciled payments; stored-value loads
  when reported as liability rather than sales.
- **Currency behavior:** grouped per currency.

### Refunds

- **Definition:** successfully completed customer refunds.
- **Numerator:** sum of successful `Refund` amounts.
- **Denominator:** none.
- **Time boundary:** refund completion timestamp.
- **Exclusions:** failed/pending refund attempts and voided authorizations.
- **Currency behavior:** grouped per currency.

### Net settled revenue

- **Definition:** cash-settlement revenue after successful refunds.
- **Numerator:** `settled gross sales - refunds`.
- **Denominator:** none.
- **Time boundary:** component transaction timestamps.
- **Exclusions:** unpaid checks, deposits still held as liabilities when not yet applied to a
  completed sale, gift/stored-value liability loads.
- **Currency behavior:** grouped per currency.

### Discounts

- **Definition:** price reduction recorded by immutable pricing evidence.
- **Numerator:** sum of `PricingSnapshot.discountMinor` for final/currently effective sale
  snapshots without double-counting superseded snapshots.
- **Denominator:** none.
- **Time boundary:** source sale/check settlement day; snapshot timestamp is fallback only.
- **Exclusions:** abandoned quotes, preview-only calculations, fully reversed applications.
- **Currency behavior:** grouped per currency.

### Tips

- **Definition:** gratuity attributable to customer settlement.
- **Numerator:** append-only signed `TipLedgerEntry.amountMinor` balance, cross-checked against
  settlement/payment tip evidence.
- **Denominator:** none.
- **Time boundary:** tip ledger event timestamp.
- **Exclusions:** reversed/voided tips net naturally through reversal entries.
- **Currency behavior:** grouped per currency.

### COGS

- **Definition:** inventory consumption cost attributable to sales/production.
- **Numerator:** canonical Inventory 2.0 outbound/consumption movements multiplied by their
  stored cost basis in minor units.
- **Denominator:** none.
- **Time boundary:** stock movement occurred-at timestamp.
- **Exclusions:** transfers between locations, count corrections that are not consumption,
  opening balances.
- **Currency behavior:** grouped per cost currency.

### Labor cost

- **Definition:** cost of worked labor in the selected range.
- **Numerator:** approved/valid worked seconds multiplied by the effective wage/cost rate for
  each worker and interval.
- **Denominator:** none.
- **Time boundary:** punches clipped to the requested range.
- **Exclusions:** scheduled-but-not-worked time unless a jurisdiction/policy explicitly pays it.
- **Currency behavior:** grouped per currency.

### Labor percentage

- **Definition:** labor cost as a share of net settled revenue.
- **Numerator:** labor cost.
- **Denominator:** net settled revenue.
- **Time boundary:** same range for both components.
- **Exclusions:** metric is null when denominator is zero or negative.
- **Currency behavior:** only computed within a single currency.

### Contribution margin

- **Definition:** revenue remaining after direct COGS, labor and promotion discount expense.
- **Numerator:** `net settled revenue - COGS - labor cost`.
- **Denominator:** none; contribution margin percentage uses net settled revenue.
- **Time boundary:** same range for all components.
- **Exclusions:** fixed rent/overhead unless explicitly added to a future fully-loaded margin.
- **Currency behavior:** only computed within a single currency.

### Finance reconciliation variance

- **Definition:** unexplained difference between canonical settled revenue and analytics-derived
  settlement facts.
- **Numerator:** `canonical net settlement - analytics net settlement`.
- **Denominator:** none.
- **Time boundary:** identical venue-local range.
- **Exclusions:** none; a non-zero value is an operational alert, not an adjustment.
- **Currency behavior:** grouped per currency; never net currencies together.

---

## Resource / operations KPIs

### Available resource minutes

- **Definition:** minutes a resource could legally/operationally accept a session or reservation.
- **Numerator:** venue opening minutes minus closures/exceptions/maintenance, clipped per resource.
- **Denominator:** none.
- **Time boundary:** requested range in venue-local time.
- **Exclusions:** disabled/decommissioned resources and maintenance/closed intervals.
- **Currency behavior:** not applicable.

### Occupied resource minutes

- **Definition:** actual active-session time consuming resource capacity.
- **Numerator:** sum of `OperationsSession` occupied intervals clipped to the range.
- **Denominator:** none.
- **Time boundary:** session start/end, with current time used for an active open session only in
  real-time views.
- **Exclusions:** paused intervals where the resource is explicitly released; canceled sessions.
- **Currency behavior:** not applicable.

### Resource utilization

- **Definition:** share of available resource time that was occupied.
- **Numerator:** occupied resource minutes.
- **Denominator:** available resource minutes.
- **Time boundary:** identical range.
- **Exclusions:** null when available minutes are zero.
- **Currency behavior:** not applicable.

### RevPAH — Revenue per available hour

- **Definition:** resource-attributable settled revenue per available resource hour.
- **Numerator:** settled revenue attributed to resource sessions.
- **Denominator:** `available resource minutes / 60`.
- **Time boundary:** same venue-local range.
- **Exclusions:** revenue without a defensible resource/session attribution; null when no available
  hours.
- **Currency behavior:** computed per currency.

### Menu attachment per player

- **Definition:** menu sales attachment to activity participation.
- **Numerator:** settled menu-item quantity or menu net revenue linked to activity GuestChecks.
- **Denominator:** player/participant count from resource/activity sessions.
- **Time boundary:** session/check completion within the range.
- **Exclusions:** unrelated walk-in dining checks unless explicitly attached to the session/event.
- **Currency behavior:** quantity form is currency-neutral; revenue form is per currency.

---

## Reservations KPIs

### Booking conversion

- **Definition:** eligible booking attempts/offers that become confirmed reservations.
- **Numerator:** confirmed reservations.
- **Denominator:** eligible booking funnel entries available in canonical acquisition/booking facts.
- **Time boundary:** reservation creation/funnel event range.
- **Exclusions:** bot/invalid attempts and staff test data.
- **Currency behavior:** not applicable.

### No-show rate

- **Definition:** confirmed reservations ultimately marked no-show.
- **Numerator:** no-show reservations.
- **Denominator:** confirmed reservations whose scheduled start has passed sufficiently to have a
  final attendance outcome.
- **Time boundary:** scheduled reservation start day.
- **Exclusions:** canceled-before-window reservations and future reservations.
- **Currency behavior:** not applicable.

### Waitlist claim rate

- **Definition:** waitlist demand converted after a valid offer.
- **Numerator:** `CLAIMED` waitlist entries.
- **Denominator:** entries that reached `OFFERED` with a completed offer window.
- **Time boundary:** offer timestamp.
- **Exclusions:** entries canceled before any offer.
- **Currency behavior:** not applicable.

---

## Kitchen KPIs

### KDS SLA attainment

- **Definition:** completed prep tickets finished within their station/service SLA.
- **Numerator:** completed tickets with prep duration <= configured SLA.
- **Denominator:** completed tickets with a valid routed/started/completed lifecycle.
- **Time boundary:** ticket completion timestamp.
- **Exclusions:** canceled tickets and tickets without valid timestamps.
- **Currency behavior:** not applicable.

### Average prep time

- **Definition:** mean elapsed prep duration for completed tickets.
- **Numerator:** sum of valid prep durations.
- **Denominator:** count of completed tickets with valid duration.
- **Time boundary:** completion timestamp.
- **Exclusions:** canceled/incomplete tickets and invalid negative durations.
- **Currency behavior:** not applicable.

---

## Guest / CRM KPIs

### Completed visit

- **Definition:** a completed, verifiable customer interaction derived from a settled GuestCheck,
  completed resource session/reservation or completed event.
- **Numerator:** one canonical visit fact per deduplicated qualifying visit.
- **Denominator:** none.
- **Time boundary:** visit completion timestamp.
- **Exclusions:** inquiry-only, canceled/no-show and unpaid abandoned activity.
- **Currency behavior:** not applicable.

### Repeat-visit rate

- **Definition:** share of identified customers with a completed visit who had at least one prior
  completed visit before the measured visit/window.
- **Numerator:** customers meeting the repeat condition.
- **Denominator:** identified customers with >=1 completed visit in the range.
- **Time boundary:** visit completion timestamp.
- **Exclusions:** anonymous customers that cannot be deterministically linked.
- **Currency behavior:** not applicable.

### Loyalty liability

- **Definition:** outstanding loyalty points from the append-only loyalty ledger.
- **Numerator:** signed point balance across loyalty accounts.
- **Denominator:** none.
- **Time boundary:** ledger entries posted on or before range end; balance views are point-in-time.
- **Exclusions:** none; reversal entries net naturally.
- **Currency behavior:** points are non-currency. Monetary valuation, if configured later, is a
  separate metric.

### Stored-value liability

- **Definition:** outstanding redeemable monetary value owed to holders.
- **Numerator:** signed balance of append-only stored-value ledger entries.
- **Denominator:** none.
- **Time boundary:** point-in-time at range end.
- **Exclusions:** expired value only when expiration policy is legally/configurationally valid and
  represented by a ledger entry.
- **Currency behavior:** grouped per currency.

---

## Acquisition / promotion KPIs

### Acquisition-to-settled-visit conversion

- **Definition:** attributable acquisition interactions that lead to a settled completed visit.
- **Numerator:** acquisition identities/campaign touches with a defensible attributed settled visit.
- **Denominator:** eligible acquisition interactions or leads for the selected channel/campaign.
- **Time boundary:** attribution uses the configured lookback window; reporting groups by the
  acquisition touch day unless a report explicitly chooses conversion day.
- **Exclusions:** unverifiable/self-referrals and test traffic.
- **Currency behavior:** conversion rate is currency-neutral; attributed revenue is per currency.

### Promotion profitability

- **Definition:** incremental attributable contribution after promotion cost/discount.
- **Numerator:** promotion-attributed net revenue minus attributable COGS, labor/direct package cost
  and promotion discount cost.
- **Denominator:** promotion-attributed net revenue for margin %, or promotion discount cost for a
  return-on-discount view.
- **Time boundary:** settled sale date.
- **Exclusions:** preview quotes, canceled checks and reversed promotions.
- **Currency behavior:** computed per currency.

---

## Events KPIs

### Event booked value

- **Definition:** accepted/confirmed event commercial value from the effective proposal/package.
- **Numerator:** accepted proposal amount.
- **Denominator:** none.
- **Time boundary:** event confirmation timestamp.
- **Exclusions:** draft/rejected/expired proposals.
- **Currency behavior:** grouped per currency.

### Event collected value

- **Definition:** successful payments allocated to the event, including deposit and final settlement.
- **Numerator:** successful canonical payment allocations for the event.
- **Denominator:** none.
- **Time boundary:** payment settlement timestamp.
- **Exclusions:** failed/pending payments and unapplied liabilities.
- **Currency behavior:** grouped per currency.

### Event contribution

- **Definition:** event settled revenue less attributable inventory/COGS, labor and package/promotion
  direct costs.
- **Numerator:** event net settled revenue - direct costs.
- **Denominator:** none; margin % uses event net settled revenue.
- **Time boundary:** event completion range with transaction-level reconciliation retained.
- **Exclusions:** unrelated venue overhead unless explicitly allocated by future policy.
- **Currency behavior:** computed per currency.

---

## Semantic fact contracts

The API may calculate these facts on demand initially and materialize them later without changing
metric meaning:

- `DailyShopFact`: settlement, refund, discount, tip, COGS, labor and contribution totals.
- `HourlyResourceFact`: available/occupied minutes, session count and attributable revenue.
- `DailyStaffFact`: worked time, labor cost and sales/service attribution where defensible.
- `DailyCustomerFact`: completed visits, new/repeat guests, loyalty/stored-value movement.
- `DailyInventoryFact`: consumption, waste/adjustment and COGS.
- `DailyKitchenFact`: tickets, SLA attainment and prep durations.
- `DailyAcquisitionFact`: eligible acquisition touches, attributed settled visits and revenue.

Any materialized fact must retain source-range/version metadata and be reproducible from canonical
transactional sources. Rebuilds must not change historical values unless the canonical source itself
was corrected through its supported append-only/reversal/audit mechanism.

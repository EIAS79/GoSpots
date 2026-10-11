# 20 — What Must Be True Before GoSpots Can Replace a Venue's Other Operating Systems?

**Purpose:** capability-by-capability replacement contract and realistic market scope. **Status:** proposed product/release requirements, NOT claims that all items currently work.

## Definition: three levels of replacement

- **Single operational system:** cashier/staff/owner can open, operate, take money, invoice, close, review and export through GoSpots; no legacy POS or shadow spreadsheet for financial/stock control. External bank, Adyen, fiscal printer and KSeF remain trusted authorities for their own functions.
- **Single management cockpit:** adds planning, staff, suppliers, kitchen compliance support, maintenance, exceptions, customer follow-up and management decisions. External accounting/payroll may be integrated instead of duplicated.
- **Single legal/business back office:** even statutory accounting, bank flows and payroll in one UI; much broader regulatory scope and optional tier.

## Core capability acceptance grid

| Domain | Venue problem GoSpots must solve | Source coverage and workstream | Replacement criterion |
| --- | --- | --- | --- |
| Create/open venue | configure entity, branch, devices, fiscal, staff | P2/P13, 01/12 | new operator configures in guided UI without SQL |
| Live floor | game/tables/rooms availability + rate/billing | P2/P3, 05 | 2 cashiers cannot double start/bill |
| Reservation & events | advance slots, deposits, arrivals, cancellations | P8, 05/08 | booking→session→check→invoice→refund fully linked |
| Menu/orders | cashier/waiter, KDS, takeout, QR | P6, 06 | live kitchen shift without paper backup tickets |
| Payment collection | cash, Adyen card, split, exception | P4/P5, 02 | no false paid states or duplicated card charges |
| Legal receipts | consumer fiscal document as required | P5, 03/10 | tested certified fiscal path or documented lawful exemption |
| VAT invoicing | KSeF where applicable, originals/corrections | P5, 03 | valid accepted invoice and authoritative audit history |
| Cash control | tills, shifts, blind count, day close | P5, 04 | exact expected/actual and signed variance tracking |
| Provider settlement | fees, payouts, bank/disputes | P5/P14 depth, 04 | every payout matched/in-transit/exception |
| Stock management | goods, recipes, shrinkage, valuation | P7, 07 | physical stock vs ledger reconcile |
| Purchasing | PO/receipt/supplier bill | P7 plus new Tier B, 07 | matched order, delivery, supplier invoice |
| Guests and value | CRM, packages, loyalty, gift, refunds | P8/P9, 08 | liability conserved; lawful consent |
| Team operations | staff sessions, roles, schedules, approvals | P10, 09 | every high-risk act authorized and attributable |
| Entertainment access | tickets/QR/occupancy/lockers | P11, 08/10 | scanner entitlement exact-once for sold mode |
| Offline continuity | WAN/API/Edge/hardware recover | P12, 10 | certified subset operational; no invented offline cards |
| Venue upkeep | equipment, opening/closing, cleaning, incidents | New Tier B, 13 | daily tasks/maintenance tracked and actionable |
| Restaurant food compliance | allergens/temp logs/traceability assist | New Tier B, 06/07 | food manager validates data + task history |
| Owner finance | daily and monthly close, profits *if inputs complete* | P14 depth, 04/15 | no hidden omitted cost/fee source |
| Full history | staff action and every financial/legal event | P1/P14, 15 | search/export preserves legal originals and corrections |
| SaaS operation | signup, support, migration, exit | P13/P17 depth, 12 | onboarding and exit without engineering edits |
| Security/backup | multi-tenant safe, DR, privacy, PCI responsibilities | P1/P16, 11 | independent test + restore + incident runbook |
| Statutory bookkeeping | GL/tax journals/statements/filings | Deliberately excluded, 14 | separately professional certified or partner integration |
| Payroll | worker payslips, tax/social filings | Deliberately excluded, 14 | separately professional certified or partner integration |

## Venue archetype release envelopes

### 1. Billiard/snooker/gaming lounge — shortest path to credible GA

Required: resource setup/rate engine/timer, booking and walk-in, table transfer/pause, snacks and drinks if sold, cash/card, split bill, Polish fiscal and KSeF where legally applicable, staff permissions, end-of-day cash/payout report, refunds and historical lookup, device/Edge outage controls. Optional: memberships, tournaments, darts leaderboards, maintenance schedule, gift cards. **Cannot claim** unknown gaming device integration without certification.

### 2. Café/restaurant/bar — broader hardware and legal exposure

All payments above plus seating, dining tables/bar tabs, modifiers/allergens, production status/KDS/physical printer, meal courses, recipes/portion consumption and food traceability where required, food-safety operating practices and inventory. QR ordering is marketed only if secure and physically tested; adding alcohol product requires its own retail/tax/licensing evaluation, not merely enabling a menu category.

### 3. Mixed entertainment + restaurant — full shared settlement

One GuestCheck must support game time, food, bookings, packages, group splits and tips without a second cashier program, duplicate charge snapshot or double-counted tax/refund. Required full mixed-use pilot with at least two staff roles, one physical provider and one fiscal device, and Edge recovery.

### 4. General retail shop — NOT certified merely by existing venue POS

To market broadly beyond target verticals, create a separate **retail capability extension**: SKU variants/GTIN/EAN barcode scanners, weight/unit pricing and verified scales if sold, shelf/store inventory, receiving+retail purchase invoices, product returns/exchanges/credit notes, tax/exemption mapping by item, promotion/multibuy, cash drawer and barcode label print, customer receipts, stock valuation, serial/lot/warranty where applicable, omnichannel sync only if explicitly contracted. Industry-specific businesses (pharmacies, age-restricted goods, fuel, gambling etc.) have distinct restrictions and may be out of scope entirely. Require a *retail-specific* pilot and hardware/legal gate.

### 5. Service/appointment venue — future vertical

Requires appointment capacity, worker qualifications, time-based services, prepayments, no-show, service invoices, consumables and optionally recurring plans. Cosmetic/medical services may add regulated personal/health records and separate rules. Never expose medical data under the existing restaurant CRM without dedicated safeguards.

## “No other system” operational test

A merchant must be able to complete these tasks without direct database access and without opening a second POS:

1. Set up its shop/roles/devices/rates and handle legally required config.
2. Open day, check resources, admit/seat customers, take and fulfill orders, run sessions.
3. Accept cash/card safely, issue all applicable receipts/invoices, refund/correct a transaction.
4. Receive and account for inventory, monitor liabilities and staff oversight.
5. Identify/fix errors using supported exception UI with an auditable trail.
6. Close shift/day and reconcile sales, physical cash, provider statements and documents.
7. Retrieve any legal invoice/payment/receipt and export for accountant or auditors.
8. Continue sold essential workflows through *declared* outages and know when to stop accepting payments.
9. Ask trained support for device/provider/fiscal problems and recover safely.
10. Offboard/migrate its complete export without data captivity.

**Pass criterion:** no shadow POS or hidden spreadsheet for core operational balances. Accounting/payroll software may remain by explicit design; replacement cannot imply replacement of government, bank or payment processor.

## Release and pricing strategy

Package a small audited core + vertical-specific certified modules: `Gaming Core`, `Hospitality`, `Customers & Membership`, `Stock & Purchasing`, `Site Operations`, `Events & Access`, `Multi-Venue`, `Back-Office Integration`. Feature flags must never permit a merchant to turn on untested legal/hardware/country paths. Publish transparent external costs (Adyen fees, terminal, fiscal device, KSeF credential management, SMS, bank sync) separately from SaaS subscription. Do not force customers to buy advanced AI just to access their legal invoice history.

**Go/no-go:** GA is per product/venue/legal/hardware configuration, not an unrestricted label 'suitable for every shop'. This matrix should appear in onboarding contracts and be signed by product, support and legal/finance reviewers.

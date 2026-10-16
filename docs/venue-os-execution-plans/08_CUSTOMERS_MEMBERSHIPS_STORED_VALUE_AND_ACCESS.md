# 08 — Customer Lifecycle, Reservations, Deposits, Memberships, Gift Value and Access

**Classification:** P8/P9/P11 `COVERED_VERIFY_DEPTH`; service/customer complaint operations and certain lifecycle proofs proposed deeper | **Priority:** P1 where sold; critical stored-value money scenarios P0 if enabled.

## Scope and canonical authority

Master P8 provides bookings/deposits/waitlists/events; P9 customer identity, merge, subscriptions/memberships, prepaid packages, loyalty, gift/stored value, promotions and customer portal; P11 ticket QR/RFID/lockers and occupancy. These already constitute a broad customer domain. Do not duplicate them in a new CRM. Audit correctness across money, customer and access boundaries.

A customer profile may be absent for anonymous POS purchases. A reservation holds capacity but is not automatically a paid check; a deposit is an accountable financial liability or revenue treatment according to reviewed rules; a gift card is **a liability or contractually defined deferred obligation**, not cash collected twice at redemption; loyalty points and prepaid hours use independent auditable value ledgers. QR admission/ticket use is a one-time or counted-use entitlement—not a cash receipt by itself.

## Implementation and audit tasks

1. Identity: anonymous guest, linked verified email/phone, staff-created profile, consent preferences, loyalty enrollment and GDPR requests. Strong duplicate merge must preserve each transaction's historical payer/recipient reference and legal retention; never merge across tenants by same phone without authorization.
2. Booking: pay deposit before/after confirmed reservation based on rule; reschedule, no-show, cancellation/refund/forfeiture, booking-to-session conversion and attendee arrival; prevent capacity double sale. Use local zone formatting (Plan 05).
3. Stored value ledger: issuance, top-up, use, expiry (only legally/contractually allowed), adjustment, chargeback reversal and cross-venue acceptance. `ValueTransaction` append-only, unique idempotency key, recoverable balance projection and liability reporting. Ensure revenue recognized once by finance policy, not at both top-up and redemption.
4. Membership: defined plan entitlements and validity dates, usage metering, multi-tier/prorated changes only if offered, membership payment and cancellation contract, employee comp approval, expired-plan handling offline. Reconcile package sessions to timed resources and bookings.
5. Promotions: deterministic order of coupon, happy-hour, group bundle, loyalty, prepaid, discount, tax rounding and tips. Enforce caps/usage and anti-stacking rules server-side; customer app never invents discounts.
6. Ticket/access: unique signed QR or cryptographic references with replay detection, counts and lease semantics for intermittent scanners; occupancy with privacy-preserving reports, return/re-entry and revoked/canceled ticket rights, lost wristband replacement with deactivation.
7. Support: link customer complaints to affected check, order, membership and access event; refund, replacement or rebooking through privileged and auditable workflows, not admin edits.
8. Marketing separation: GDPR lawful basis and explicit consent where required; separate transactional reminders from marketing, opt-out, retention and export; no inference that all customers consent to advertising.

## Negative tests

- Same gift-card redemption replayed from two shops or offline devices may spend value **at most once**; if multi-site offline redemption can't be made safe, disable it during offline mode.
- Chargeback on original gift top-up reverses unspent value and creates loss/liability management when already redeemed.
- Overlapping promotions cannot produce negative check totals unless explicit liability/credit model supports them.
- Reservations paid deposits cancel/refund after KSeF/fiscal issuance with correct correction history.
- QR reused for two admissions fails under supported occupancy rules; canceled ticket never grants access after sync.
- GDPR deletion request does not unlawfully delete mandated invoices/ledger history; personal identifiers are minimized or access-restricted instead.
- Customer merger does not attach one venue's purchase history to another tenant.

## Gate and evidence

Existing R5/R6 functional tests, plus a customer-value conservation run and multi-device access drill for marketed scanners. Evidence `customer-value-liability-and-conservation.md`, `reservation-to-check-end-to-end.md`, `access-device-certification.md`, `privacy-consent-and-data-rights-runbook.md`. Feature-gate unproved offline gift redemption and device types.

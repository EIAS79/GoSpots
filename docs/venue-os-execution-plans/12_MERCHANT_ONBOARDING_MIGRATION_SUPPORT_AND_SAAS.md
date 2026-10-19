# 12 — Commercial Merchant Onboarding, Data Migration, SaaS Provisioning and Support

**Classification:** P2 onboarding/P13 SaaS/P17 pilots `COVERED_VERIFY_DEPTH`; production customer service and merchant operating lifecycle `NEW_SCOPE_CANDIDATE` | **Priority:** P1 before commercial cohort beyond design partners.

## Why technical correctness alone fails a shop

A shop must be able to sign up, configure its legal seller, install devices, import its current menu and inventory, train staff, contact support, resolve payment anomalies and exit with its records. The master includes setup wizard and multi-location/SaaS, while R14 defines design partners, but neither is a full merchant success/service operation contract. Some features may exist in code; audit before classifying implementation.

## End-to-end merchant lifecycle

`Lead/trial → eligibility/terms → merchant organization → legal entity and shop → admin security → SaaS plan/entitlements → Adyen merchant/terminal → fiscal/KSeF credentials → opening stock/rates/menu → hardware certification profile → staff onboarding → dress rehearsal → go-live → first reconciliation → ongoing support/renewal → exit/export`. Each transition has required inputs, blocker reasons, approval owner, audit, time-to-complete, reminders and operator rollback.

## Implementation tasks

1. **Identity and tenant ownership:** verify NIP/organization tax profile where needed for tax scope, authorized merchant admin proof, terms/DPA acceptance with version/timestamp, multi-location hierarchy and least-privilege seeded roles. Do not conflate merchant with SaaS billing payer or Adyen legal account holder if different.
2. **SaaS billing controls:** entitlement by venue/feature/device/staff limits; invoice/payment collection and cancellation of GoSpots SaaS fees via separate Stripe provider surface, never mix these payments into shop's own customer GuestChecks or Adyen terminal payouts. Proration, failed invoices, grace period, downgrade protection, feature offboarding and access to legally required historical records. Owner export must remain possible after subscription ends under lawful policy.
3. **Hardware provisioning:** guided checklist for each device pairing, test-ticket and test-payment option clearly sandbox/fiscal status, Wi-Fi/LAN compatibility, setup labels/serial capture, peripherals per table/kitchen/till, rollback, spare replacement and escalation to fiscal provider/Adyen.
4. **Legacy import:** price/menu units, floor map/tables, customer consents, memberships, gift liabilities, opening stock, existing reservations and A/R balance; transformations validated with field-level provenance. **Never backfill historical legal invoices by pretending they were created in GoSpots.** Import read-only historic documents with origin and retained authority, or provide appropriate accountant-approved cutover.
5. **Cutover playbook:** choose one cutover business-day boundary, frozen opening balances, open reservations and gift liabilities, last legacy daily close, first GoSpots opening, exception contacts, rehearsal. No double collection and no double VAT report across two POS systems.
6. **Support model:** human-help intake inside admin, ticket priority and affected tenant/order/check correlation, incident vs how-to vs invoice issue, receipt-redacted diagnostic bundle, data access approval, vendor escalation, service credits only if contract offers them. Define practical support hours and payment-blocker emergency contact before commercializing.
7. **Monitoring and customer success:** onboarding funnel, setup step abandonment, frequent cashier errors, stalled provider payments, cash variance, repeated offline periods, first-sale success and first-30-days weekly health reviews. Segment by venue archetype; don't collect unnecessary identifiable customer data.
8. **Lifecycle exit:** tax/legal document export, customer transactional history export, rate/resource inventory, finance CSV, device key revocation, invoices/Adyen reconciliation outstanding state, data retention/redaction and written deletion confirmation where permissible. Test merchant exit before first paid sale.

## Service-level and support contract

Define objectively measurable service levels for platform availability vs third-party provider disruption, incident response vs resolution, data export time, backup restore commitments and supported environments. Never promise 24/7 if no staffed on-call roster exists. Define who pays Adyen processing fees, hardware, printer paper, fiscal support, KSeF certificates and SMS, and which operator does legal filing.

## Acceptance tests

- New business tenant configures from zero and runs first legal test transaction without engineer's database changes.
- Migrate 500 menu SKUs and 100 opening reservations with deterministic counts; cutover and reconciliation match source balances.
- Onboarding fails halfway through Adyen pairing; resume without duplicate merchant/device config.
- SaaS subscription payment fails; operator cannot lose access to exported legally required documents unexpectedly.
- Merchant with two branches sees correct role/inventory/terminal separation.
- Support case can be troubleshot without revealing customer secrets or performing unaudited write.
- Merchant cancellation produces complete verified export and revocation.

## Gate and artifact ownership

`merchant-onboarding-runbook.md`, `production-cutover-and-rollback.md`, `merchant-support-escalation.md`, `data-migration-reconciliation.md`, `saas-subscription-boundary.md`, `merchant-exit-and-data-portability.md`. Pilot merchant signs training/hand-off and independently completes first close. Commercial lead and support lead sign, not just engineer.

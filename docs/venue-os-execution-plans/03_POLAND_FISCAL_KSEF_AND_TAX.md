# 03 — Poland Fiscal Receipts, VAT Invoices, KSeF 2.0 and Document Integrity

**Classification:** `COVERED_VERIFY_DEPTH` + `CURRENT_PROOF_MISSING` + `LEGAL_REVIEW_REQUIRED` | **Priority:** P0 for Poland marketed scope | **Maps to:** P5, P17, R4/R11.

## Current product and regulatory context

The master plan already addresses Invoice, fiscal documents, KSeF 2.0 and outage modes in P5 (steps 5.8–5.11); the closure roadmap requires external legal/device certification. In the observed acceptance state, full real legally compliant fiscal+KSeF production proofs were not available. Lack of a signed acceptance packet **does not prove code is absent**.

**Official status checked 2026-10-09:** Poland rolled out mandatory KSeF issuing from 2026-02-01 for qualifying large taxpayers, from 2026-04-01 for most others, and 2027-01-01 for smallest taxpayers within a 2026 monthly invoiced-sales <= PLN 10,000 gross transition. Receiving obligations began 2026-02-01. Consumer invoices can be voluntarily issued in KSeF. The FA(3) logical schema and special offline/offline24/outage modes require precise handling; these rules must be rechecked before shipping and should be configurable by applicability, not an always-on hard-coded rule. Sources: [KSeF stages](https://ksef.podatki.gov.pl/etapy-wdrozenia-ksef/), [scope](https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/zakres-obowiazkowego-ksef/), [offline24](https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/tryb-offline24/), [cash registers](https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/ewidencja-sprzedazy-z-wykorzystaniem-kas-rejestrujacych/).

**Fundamental separation:** (1) processor/card slip, (2) legally recorded fiscal receipt via compliant cash register / fiscal printer path when required, and (3) VAT invoice with the legally prescribed KSeF lifecycle. A POS-generated PDF alone is not legal evidence of either (2) or (3).

## Specification and implementation sequence

### A. Fiscal obligation decision engine

Inputs: venue tax identity (NIP), seller VAT status, buyer classification (consumer vs B2B), kind of goods/services, transaction date/business day, sale/payment characteristics, return/correction, qualified exemption if any, country, applicable ruleset effective date. Output: `FISCAL_REQUIRED | EXEMPT_WITH_REASON | REQUIRE_ACCOUNTANT_REVIEW`. Link every result to versioned rule ID and operator evidence. Do not infer exemption simply because a card payment occurred or the venue calls itself 'entertainment'. For exemptions/complex transaction classes, block rollout until reviewed by qualified Polish tax professional.

### B. Fiscal device/provider adapter

Provider-neutral `prepare → submit/print → confirm fiscal number and receipt evidence → handle timeout/unknown → reconcile`, with immutable reference to settled GuestCheck and tax/price snapshot. Store device serial/firmware, operator, fiscal number, error code, submitted payload hash, provider proof and issue time. Device outage may **not** silently issue a nonfiscal receipt labeled as fiscal. Define compliant contingency workflow per certified device/vendor and accountant. Retry a potentially already printed transaction by status lookup/reconciliation—not duplicate physical fiscalization. Test VAT/exempt classifications, split payments, fiscalized vs not yet paid, post-sale correction, cash advance/deposit treatment and refund paths with qualified reviewer.

### C. KSeF issuer and inbound invoice lifecycle

Implement a separate, versioned `TaxInvoice` legal document object with immutable invoice snapshot, seller/buyer NIP data checks, line/tax allocation, legal issue date, structured FA(3) XML generation and validation, API auth/certificates and permissions, signed request/response hashes, submission/pending/accepted/rejected states, official KSeF ID/UPO and receipt timestamps. Display 'issued legally' vs 'accepted by KSeF' using reviewed legal semantics; no optimistic legal finality. For failed validation, correct and resubmit with proper identifiers; for accepted invoices, use lawful correction mechanisms rather than editable PDFs. Provide deterministic XML and an accessible human-readable rendering derived from the same signed/versioned snapshot.

Include receive-side retrieval if sold as a full invoicing desk: assigned permissions, supplier-invoice inbox, company NIP isolation, metadata/attachment history, duplicate supplier bill controls, linkage to receiving and accounts payable (Plan 07/14). Receiving KSeF invoices for buyers is legally important, even if issuing volume is small.

### D. Special KSeF modes

Design separate explicit states for normal online, offline24, announced unavailability, emergency failure and system outage. For each rule version document certificate prerequisite, QR verification, issue/delivery timestamp, legally mandated eventual submission deadline, eventual KSeF acceptance, customer delivery format and recovery if certificate expires during outage. Derive deadlines from official rule config, **not a guessed universal 24-hour delay**. Test the crossing of monthly/year boundary and Warsaw DST, duplicate submission after timeout, buyer correction and restored connectivity. Quarantine ambiguous issuance for owner/accountant action.

### E. Controls, security and retention

Store tax identity and certificate secrets in approved secret management, isolate per merchant/NIP/branch, enforce approver role and delegated accountant access, log every viewing/export/correction, protect from cross-tenant data exposure. Define legal retention and deletion exceptions with counsel. Create reversible import/export of legal artifacts and an owner end-of-day checklist showing unpaid checks, unconfirmed provider payments, fiscal unissued, KSeF pending/rejected, correction queue and cash discrepancy. A branch closure must not delete prior documents.

## Acceptance matrix (must be real, not mocks only)

- Consumer cash sale, card sale, mixed-tender sale, refunded sale, VAT rate variants and applicable exemptions: correct receipt and tax totals.
- B2B invoice generated from paid check, buyer NIP validation, KSeF acceptance and retrievable evidence.
- Duplicate submit/timeout: no second fiscal receipt or duplicate legal invoice number without lawful workflow.
- Offline24/other legally relevant outage mode: valid form, QR/certificate, deadline, receipt of final KSeF ID.
- Unknown fiscal result and printer restart: operator sees unconfirmed status; system reconciles before retry.
- Partial return after fiscal/invoice issuance: immutable history + legally reviewed reversal/corrective documents.
- Two physical certified printer configurations, if both advertised; exact hardware/firmware supported scope documented.
- Legally reviewed tax/exemption matrix, owner/accountant sign-off and evidence recording official device/provider references.

## Release gate and exclusions

Ship only the tested Poland tax profiles and fiscal hardware; explicitly disable unsupported exemptions, countries, invoice types and device makes. Obtain fiscal device vendor evidence and Polish tax accountant/legal review. Complete `external-certification-matrix.md`, `fiscal-ksef-regulatory-ruleset.md`, `document-lifecycle-and-correction-matrix.md` and logs of real lawful KSeF test/production acceptance under approved conditions. Compliance claims remain conditional until independently validated.

## System dependencies

Plan 02 settlement authority; Plan 04 reconciliation; Plan 07 supplier invoice; Plan 10 fiscal printer/Edge; Plan 11 secret isolation; Plan 16 real pilot. Source anchors: `apps/api/src/modules/checkout/`, invoice/fiscal/KSeF modules identified by R1; P5 Step 5.8–5.11.

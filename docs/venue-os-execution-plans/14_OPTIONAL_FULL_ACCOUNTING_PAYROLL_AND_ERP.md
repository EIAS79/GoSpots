# 14 — Optional Tier C: Accounts Payable/Receivable, Statutory Accounting and Payroll

**Classification:** `DELIBERATELY_EXCLUDED` from master initial commercial release, section 27 | **Priority:** P3 separate business case, NOT prerequisite for standalone POS.

## Product decision before code

"One system to run a venue" may mean cash register+restaurant+inventory+reports+team control **or** also general ledger, statutory accounts, payroll, payroll taxes and bank transfers. The original master intentionally rejects the latter as launch prerequisites. Reframing them as newly discovered defects would be wrong. Decide three levels in a signed product requirements document: `(1) GoSpots-native operational source of truth with accountant exports`, `(2) integrated accounting/payroll provider so owner works primarily in one UI`, `(3) GoSpots-built statutory finance/HR engine`. Recommend build level 1 first, partner integration level 2 where demanded, and only build level 3 after professional ownership and commercial ROI.

## A. Finance subledger extension

Accounts receivable (A/R): customer B2B invoice lifecycle, payment terms, aging, credit notes, customer statements, collection reminders, partial payments and bad-debt approval; prevent duplication of GuestCheck settlement when an invoice represents the same sale. Accounts payable (A/P): KSeF incoming/supplier legal invoices, PO/receipt matching, vendor credits, due dates, approver workflow, open balance, bank transfer proof and tax treatment. **Subledgers must reconcile to operational ledger without redefining sale authority.** A gift card liability and refundable deposit require their own recognized accounting treatments reviewed by accountant.

Bank connectivity may expand Plan 04 into authorized payment initiation only if banking partner/security/legal posture permits, and with multi-party approval; never directly initiate bank payments from an unattended AI agent.

## B. Statutory general ledger and tax

If built: immutable double-entry journals with balanced debits/credits per entity/currency, configurable Polish chart of accounts, opening balances, sales/cost/stock/gift/tip/voucher/fee accrual, period lock, reversal-only closed-period correction, fixed assets and depreciation, month/year close, bank reconciliation, foreign currency and FX revaluation, VAT input/output, accountant adjustments, statutory reports and Polish electronic files/JPK and other filings as required for the entity/tax period. Accounting rules are not derivable safely from simple POS sales categories; use a qualified Polish CPA/accounting firm to own specs, test vectors and updates. Formal management of legal cash-register operation and KSeF invoicing remains Plan 03.

## C. Payroll and HR

If built: employment/contract types, wages/bonuses/overtime, holiday and sick time, PIT/ZUS/PPK as applicable, employer vs employee contributions, changing legal minima, different statuses and contracts, salary bank file, employee payslip, employer taxes, offboarding documents, regulatory reporting and highly sensitive PII access. Staff timesheet (Plan 09) alone is **not** lawful payroll. Support cross-shift DST and correction approvals, immutable posted payroll periods and employee privacy. No unsupported claim of automated legal accuracy.

## D. Build-vs-integrate evaluation

For each provider or self-build option assess real Poland support, KSeF integration and receipt of invoices, source-of-truth split, webhook/event contract, exports, data residency/privacy, reconciliation quality, vendor lock-in, price per merchant, long-term maintenance staffing and incident ownership. Separate regulated authorities: Adyen acquires card payments, banks hold funds, KSeF registers qualifying invoices, fiscal devices record legally required consumer sales. GoSpots never fabricates those external confirmations.

## Acceptance gate — only if Tier C commissioned

- Trial balance exact equality and proper period close across refund, chargeback, payroll, supplier credit and inventory variance events.
- Accountant redoes full month's VAT/books independently from source exports and signs results.
- Import opening balances from old accountant/provider, reconcile through first month and year-end.
- Payroll independently recomputed and reconciled using representative Polish contract/leave/tax cases with a qualified payroll specialist.
- Bank payment attempted only with authenticated dual authorization and anti-fraud controls.
- Law/regression rule versions and liability/contract documents maintained with release cadence.

**Executive warning:** Tier C materially increases legal, security, support and product maintenance cost. Do not block useful Tier A/B product waiting for this. Put accounting/payroll features behind an explicitly **NOT INCLUDED** entitlement until fully implemented and certified. Outputs: `full-erp-business-case.md`, `partner-vs-build-decision.md`, `statutory-accounting-design.md`, `payroll-compliance-responsibility.md`, `accountant-signoff-matrix.md`.

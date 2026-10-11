# 04 — Cash, Provider Settlements, Bank Imports, Disputes and Financial Close

**Classification:** P5 cash/reconciliation and P14 reports are `COVERED_VERIFY_DEPTH`; provider fees/chargeback/bank-matching and full payable/receivable are `NEW_SCOPE_CANDIDATE` pending repo inventory | **Priority:** P0 for ability to prove correct money; P1 for automated bank depth.

## Why a successful checkout is not a reconciled business

A card captured by Adyen is not yet a payout to the merchant's bank. A displayed sales report is not proof that all refunds, chargebacks, fees, tips, cashier movements, tax and unpaid balances reconcile. Existing P5 5.5–5.6/5.12 and P14 already cover shifts, blind counts and high-level financial reconciliation, so extend their **economic proof model**, not rebuild it. The master and R0–R15 append-only first section contain no dedicated contract for bank statements, chargeback workflows or A/P-A/R subledgers: proposed scope, not confirmed missing code.

## Authoritative objects and ledgers

Source ledger: `ChargeSnapshot` and allocations → `CustomerPayment` (cash or provider) → `PaymentOperation` → `Refund/Dispute/Adjustment` → append-only `OperationalJournal` → business-day reconciliation. Parallel evidence feeds: `(1) cash drawer events and actual count`, `(2) PSP transaction reports and net settlement batches`, `(3) bank credits/debits`, `(4) fiscal/KSeF issuance`, `(5) fees/tips/customer deposits/stored-value liability`. Use unique external references and explicit source names to avoid duplicate economic facts; never invent matching keys from amounts alone.

Canonical identities: shop/merchant account; terminal; `checkId`, `settlementId`, `paymentId`; PSP reference/tender reference; payout batch ID; fee type; bank account currency/IBAN token or masked reference; bank transaction ID; business date vs value date; reversal lineage. Represent commissions, VAT and payment processing fees separately from gross customer spend.

## Engineering tasks

1. **Shift opening and blind count:** enforce operator identity, configurable float, opening signed count, authorized cash in/out, paid-in/paid-out, safe drops, till handover and denomination ledger. Second approver for above-threshold variance; no retroactive cash event edit. Lost terminal/card connection is not a cash event.
2. **Day close:** choose venue timezone and configurable business-day boundary; freeze an immutable daily snapshot of sold gross/net/VAT by rate, sales by tender, outstanding checks, deposits, refunds, voids, tips, gift liabilities, discounts, canceled items, provider pending/captured, cash expected/actual/variance and fiscal/KSeF pending. State `DRAFT → RECONCILIATION_PENDING → CLOSED_WITH_EXCEPTIONS / CLOSED`; versioned revision as adjustment rather than mutating the prior close.
3. **PSP settlement ingest:** import Adyen reports via official API/export where authorized, persist raw vendor evidence securely, parse with versioned schemas, aggregate gross transactions, refunds, fee deductions, chargeback movements, payment status and net payout. Handle both one payout→many payments and one payment→multiple downstream adjustments. Match on exact durable provider IDs, date/currency/merchant; use fuzzy similarity for suggestions only, never auto-match solely by same amount.
4. **Bank reconciliation:** receive CSV/MT940/camt or certified bank API based on targeted bank and consent; validate format, dedupe statement ID and line keys, reconcile expected PSP net payout and cash deposit vs received bank entry, surface delays and fees. Never overwrite imported bank evidence; bank secrets scoped per company, not per staff browser.
5. **Chargeback/dispute:** optional but essential for independent venue support: ingest chargeback/dispute webhook/report, link original payment/check and provider evidence, create financial reserve/settlement adjustment, owner task with evidence deadline, manage won/lost outcome, report write-offs. Do not model chargeback as normal refund.
6. **Accounting bridge:** export immutable daily journal batches by tax bucket/venue/payment method, provide reconciliation IDs and currency precision, configurable GL mappings **only if reviewed by accountant**, include corrections and attachments. A proper general ledger is Tier C (Plan 14).
7. **Exception dashboard:** classify `PAYMENT_UNKNOWN`, `CAPTURE_NOT_ALLOCATED`, `CHECK_PAID_NO_FISCAL`, `FISCAL_NO_CHECK`, `PAYOUT_SHORT`, `BANK_UNMATCHED`, `DRAWER_SHORT`, `TAX_BUCKET_MISMATCH`, `REFUND_PENDING`, `CHARGEBACK_ACTION_DUE`, `DUPLICATE_EXTERNAL_REFERENCE`. Every exception gets owner/SLA/timestamp/action log and safe correction workflow.

## Conservation proofs

Daily check: opening physical cash + cash inflows − refunds/pay-outs/safe drops = expected closing cash. Provider account: gross successful captures − provider refunds − chargebacks − fees ± settlement adjustments = expected payout by batch (subject to timing and provider report conventions). Bank: total provider net payouts settled = matched bank receipts + outstanding in transit + verified differences. Check payable: charge line snapshot = successful applied tenders + outstanding/reversal balances. Fiscal: legally reportable sales tie to document/exemption matrix. No forced elimination of timing differences.

## Adversarial acceptance

- Multi-currency PSP payout is not casually mixed with PLN sales; FX rates and fee lineages explicit.
- Full card capture at 23:58 with bank payout three days later remains reconciled as in transit, not missing.
- Duplicate Adyen batch import does not duplicate money.
- A cash drawer shortage is visible and attributable but cannot be hidden by sales adjustment.
- Partial refund after day close posts correcting journal in permitted current period and retains history.
- Chargeback without prior local payment is quarantined, never silently assigned to nearest check.
- Bank statement duplicate and reversed/returned credit are correctly distinguished.

## Acceptance artifacts

`financial-reconciliation-evidence.md` with before/after totals and hashes, `cash-drawer-conservation-tests.md`, `adyen-payout-to-bank-match-report.md`, `end-of-day-close-playbook.md`, plus accountant-reviewed GL export specifications. **GA core:** no unexplained captured-money gaps. **Bank automation** can be staged if a documented reconciled manual import supports Tier A without a shadow POS; avoid promising automatic bank sync until certified.

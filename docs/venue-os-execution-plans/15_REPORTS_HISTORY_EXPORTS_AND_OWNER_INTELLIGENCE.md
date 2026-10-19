# 15 — Immutable History, Owner Dashboard, Audit-Grade Reports and Exportability

**Classification:** P14/P15 `COVERED_VERIFY_DEPTH`, multi-ledger statement depth proposed expansion | **Priority:** P0 for transaction history / fiscal export; P1 for advanced management analytics.

## Existing plan contract

P14 defines analytics, reporting, reconciliation and metric dictionary; P15 defines attention center, automation and grounded AI. The codebase has analytics/reporting modules and CI checks. This plan expands **legal trust**, definitional precision and business-replacement capability. A report cannot be the authoritative ledger, and an AI narrative cannot alter accounting meaning.

## Source-driven read model

All views read from canonical append-only economic events and current status projections with immutable original references. Define consistency and freshness separately: cashier check status must reflect committed writes; aggregated owner dashboard may be eventually consistent but carries `lastReconciledAt`, `sourceCutoff`, known exceptions and data completeness. Reports carry `{tenant, location(s), business day/timezone, currency, schemaVersion, ruleVersion, sourceWatermark, filter set, export timestamp, signature/hash}`. Never show a plausible total that silently drops missing data.

## Core report families

1. **Sales:** per SKU/service, time band, zone/table, staff, taxed/net/gross, discounts, VAT, cancellations, returns, tips/service charge, comp/override reason, booking source.
2. **Payment:** cash, provider captured/pending/unknown, refunds, chargebacks, fees, PSP payout status, bank matching, merchant account and shift.
3. **Fiscal:** fiscal/receipt number, exceptions, KSeF submission/acceptance/correction, VAT buckets, invoices awaiting seller action, export for accountant.
4. **Sessions and utilization:** table occupancy, idle intervals, utilization by true available capacity, rate/revenue per table-hour, waitlist conversion, reservation no-show, overdue play.
5. **Food/stock:** menu item margin, recipe estimated vs actual consumption, waste/shrinkage, COGS version, purchase commitments, receiving discrepancies, supplier performance and expiring batches if captured.
6. **Staff and security:** timekeeping, high-risk discounts/refunds, PIN switch, approval turnaround, unexpected differences; avoid unsupported automated worker-performance judgments.
7. **Customer value:** package liabilities, gift card outstanding, loyalty spend/redemption, deposits outstanding, membership renewals/refunds; clear recognized-revenue definitions.
8. **Owner profitability:** recognized sales gross/net, explicit cost sources, payroll estimate only if configured, rents/utilities/other operating costs **only if entered/integrated**, cash-flow vs profit distinction. Do not call total sales minus selected stock costs 'net profit' without allocating all applicable costs/taxes.

## Engineering tasks

Define a metric dictionary for each numerator/denominator, inclusions/exclusions, date rules and data lineage. Generate report reconciliation test fixtures with hand-checked expected values and negative transactions. Implement event/outbox ingestion dedupe, rebuild projections from durable journals, watermark monitoring and discrepancy alarms. Export CSV/XLSX/PDF/JSON only when legal policy allows, with UTF-8 safe formulas and protection against CSV injection, user/tenant access logs, row counts and checksums. Fiscal/legal source document download should contain original legal version plus view; do not replace original document with synthetic report.

Historical data UI: search GuestCheck, operator, external payment ref, business day, customer, session, receipt number, invoice number; show linked timeline from booked → occupied → ordered → priced → paid → fiscalized → refunded/reversed → payout/close with actor, timestamp and reason. Keep audit log and customer PII distinct; redact support views while maintaining statutory source.

AI/automation safety: report LLM answers cite source metrics IDs and timestamp, no unreviewed finance claims, optional suggested adjustments requiring human approval, guard prompt injection via imported customer notes/menus, prohibiting autonomous refunds, bank transfers, invoice reissue, gift balance change, user permission grant or legal tax decision. Rate-limit/human verify costly actions.

## Adversarial acceptance

- Import a duplicate provider webhook and rebuild analytics from events; totals unchanged.
- Refunded sale after day close appears in original history and correct current correcting period; no retroactive deletion.
- Two shops share an organization owner; owner sees combined authorized view but cashier cannot query other branch data via exported download URL.
- Cross-midnight session uses documented venue business day and invoice issue date independently.
- CSV cell beginning `=`, `+`, `-`, `@` from a customer field cannot execute as spreadsheet formula on export.
- AI reports 'not enough evidence' if payouts/COGS/payroll missing rather than inventing gross margin/net profit.
- Tenant can export history and preserve referential integrity during SaaS cancellation (Plan 12).

## Gate/evidence

`metric-dictionary.md`, `history-and-export-contract.md`, `report-ledger-reconciliation.md`, `ai-grounding-and-side-effects-test.md`, audited multi-tenant export access proofs. **Legal reports require qualified finance review; management estimations clearly marked.**

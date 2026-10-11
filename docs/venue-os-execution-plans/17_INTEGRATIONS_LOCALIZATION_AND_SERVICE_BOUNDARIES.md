# 17 — External Integrations, Localization, API Contracts and Country Expansion Boundaries

**Classification:** P5/P13/P16 `COVERED_VERIFY_DEPTH` plus new integration governance depth | **Priority:** P1, with P0 dependencies for marketed payment/fiscal service.

## Principle: standalone ≠ no providers

GoSpots owns commercial, operational and historical facts. Real card authorization belongs to an approved payment processor; actual bank balance belongs to a bank; Polish structured invoice processing belongs to KSeF; fiscal status belongs to a compliant fiscal register/provider. A guest-check fact must never become editable by an unrelated provider without a verified signed operation. This preserves master section 1.3's standalone doctrine.

## Provider adapter catalog

- **Adyen terminal merchant:** configuration/terminal assignment, capture/decline/UNKNOWN, refund/cancel/chargeback, webhook verification, payout reports, provider credential isolation, enabled offline behavior and reconciliation. Separate from Stripe's GoSpots SaaS subscriptions.
- **Polish fiscal device:** model/firmware/certification, print/retrieve, idempotent external jobs, fiscal daily operations and technical support.
- **KSeF 2.0:** FA(3), auth/certificates, issue/reject/accept, UPO, QR and special modes; supplier invoice receiving where offered.
- **Banks/accountants:** CSV/camt/MT940 imports, optional read-only consent integration, export of approved accounting journals to selected ERP; never automatically initiate money movement unless separately authorized/regulated.
- **Messaging:** email/SMS provider with consent basis, template version, locale+venue timezone, opt-out and rate limit; notifications cannot be authoritative booking/payment status.
- **Devices:** Edge Hub, KDS, receipt printers, scanners, access gates/lockers; signed enrollment, profile and command ack.
- **Optional external partners:** delivery platforms, accounting/payroll, supplier catalogs, hardware support and analytics exports; no runtime POS provider dependency.

## API contract standard

Every integration defines `{owner, tenant, credential mode, scopes, request/response version, source event IDs, idempotency strategy, retry class, webhook signature/auth, allowed ingress IP/rate, timeout policy, UNKNOWN resolution, retention, redaction, SLA/outage page, fallbacks, cost, portability, certification proof}`. Version public/event schemas and apply consumer-contract tests. Provider events enter a verified raw inbox, produce domain events through strictly scoped service, and are deduped by durable identity. Store original payload hash for forensic replay; never store full card data in raw logs.

## Country and language architecture

Use explicit `CountryRegime`/ruleset versions selected by merchant legal seller, not guessed by UI locale. Currency ISO code, per-line tax categories, localized date/number/receipt format and business timezone must not rewrite historical invoices, settled tax or payment journal. `pl-PL`, `en` and other locale UI libraries may differ from legal language on issued fiscal documents. Polish `.pl` and international `.eu` marketing/transaction domains need a signed canonical-host decision, lawful cookie/redirect strategy and tax-identity correlation.

Avoid claiming other EU countries supported simply because software allows EUR. Market certification per country requires its own cash register/VAT invoice/consumer receipts rules, data retention, device support and supported payment methods. Disable non-Poland tax profiles until reviewed.

## Testing gates

- Expired Adyen credential and vendor outage generate explicit pending/error states, not paid check.
- KSeF certificate rotated during outage, old request replay cannot issue duplicates.
- Webhook signature invalid, merchant mismatch or unknown event version quarantined without effects.
- Same event received out-of-order across clusters still produces one economic fact.
- Bank CSV old format ingested after schema update—versioned parser with audit and no duplicate payout.
- Translate venue UI to Polish, change browser country, send booking reminder: Warsaw local time remains exact.
- `.eu`/`.pl` login and payment return cannot unintentionally cross insecure cookie origins.
- Third-party failure has a readable operator runbook and a contractual provider escalation path.

## Outputs

`integration-catalog-and-contracts.md`, `provider-ownership-and-pci-matrix.md`, `legal-ruleset-versioning.md`, `domain-and-localization-decision.md`, `third-party-outage-playbook.md`, `country-certification-coverage.md`. Every provider/country entitlement is disabled by default until certified and contractually supported.

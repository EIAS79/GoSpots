# 11 — Tenant Isolation, Access Security, PCI Boundary, GDPR, Reliability and Disaster Recovery

**Classification:** RLS default `CONFIRMED_FINDING` (not a leak); other P1/P16 controls `COVERED_VERIFY_DEPTH` and `CURRENT_PROOF_MISSING` | **Priority:** P0.

## What is known

Inspected `apps/api/src/common/tenant-rls.util.ts` defaults `TENANT_RLS` to off and describes PostgreSQL policies failing open when expected request session variables are missing. GoSpots still has application-level auth, scopes, guards and shop boundary rules: **no breach or tenant data leakage was established.** A financial SaaS should certify these controls under adversarial testing and deliberately choose a defense-in-depth SQL RLS policy. Source also uses Helmet, CORS, validation, CSRF and JWT controls; preserve these. Current API/DB deployment cannot be read from the unrelated connected Render/Neon workspace.

## A. Tenant and authorization threat model

Security boundary: organization→shop→staff/device/customer scopes, delegated accountant, jobs/system admin, support impersonation, webhooks and Edge. Enumerate `Shop.shopId`, organization hierarchy and client-supplied path/query/header identifiers. Verify tenant resolution remains server-authoritative and every read/export/mutation—including background analytics and provider jobs—is scoped by data origin. Write a policy table specifying permitted cross-shop operations (owner portfolio, transfer, package redemption) and mandated journal/event isolation.

RLS decision: if enabled, choose **fail-closed by default** policy for untrusted app role, tenant GUC set transaction-locally, DB pool lifecycle and `SECURITY DEFINER` review; service jobs require explicitly fenced scopes. Prove Prisma connection pooling, streaming/SSE, cron and migrations don't accidentally inherit previous tenant context; avoid turning on a risky config flag in prod before integration soak. If deliberately off, write compensating control and targeted adversarial test coverage with signed risk acceptance.

## B. Identity/device and operational abuse

Role separation and server-side permissions (Plan 09); MFA for high-risk merchant owner/support where policy requires; rate limiting on login, public booking, QR orders, voucher lookup and reset; secure password/token rotation, session invalidation and anomaly detection. Secrets (KSeF, Adyen, bank import, SMS, database) stored and rotated by service boundaries; audit protected, secret redaction in logs. Encrypt sensitive PII and backup artifacts, least-privilege production access, reason-bound break-glass escalation, separation of SaaS support billing permissions from merchant money access.

## C. PCI scope and Adyen responsibility

No PAN/CVV/track data in GoSpots code, telemetry, queues, crash reports or logs. Terminal ID and provider token/reference allowed under PCI-scoping review. Maintain acquirer/Adyen third-party responsibility matrix, supported terminal tamper inspection/checklist, provider compliance evidence and applicable merchant PCI validation path. Outsourcing card handling reduces scope but **does not erase merchant PCI responsibilities**. See [PCI SSC merchant guidance](https://www.pcisecuritystandards.org/merchants/) and [outsourcing FAQ](https://www.pcisecuritystandards.org/faqs/does-pci-dss-apply-to-merchants-who-outsource-all-payment-processing-operations-and-never-store-process-or-transmit-cardholder-data/).

## D. GDPR and data rights

Document venue as controller and GoSpots SaaS as processor where factually applicable; account for GoSpots own controller functions (billing/support) separately. Signed Data Processing Agreement, subprocessors and international transfers, records of processing, data minimization and legal basis, role-level field visibility, data subject access/export/erasure workflows, breach assessment and notification runbook. Under GDPR the controller's notification deadline is generally within 72 hours where required; processor reports to controller without undue delay. Never promise automated deletion of invoices, tax records or financial ledger where retention law requires preservation. Source: [GDPR Regulation (EU) 2016/679, Articles 28, 32–34](https://eur-lex.europa.eu/eli/reg/2016/679).

## E. Resilience and production SLO contract

Define measured SLI/SLOs *before* numeric marketing guarantees: availability of web login/core check/payments, API p95/p99 latency by action, webhook lag, order/KDS time-to-deliver, provider UNKNOWN age, settlement divergence, backup age, queue depth, cash close completeness, tenant isolation failures, recovery RPO/RTO. Establish incident severity/response roster, pager path, runbooks, deploy freeze and customer notice templates. Vercel Ready status and Render `/health` alone do not prove transactional integrity.

Backup: DB encrypted backups and validated PITR capability, periodic full restore to segregated environment, cross-region risk analysis, secure object storage for documents, immutable audit backups and tested KSeF/fiscal references. Schema and code must restore as compatible pair; prove migration rollback logic or forward-fix strategy in production-shaped staging. Test backup restore **with** payment and fiscal external events arriving during failover.

## Adversarial matrix

- Tenant A staff accesses shop B check, supplier invoice, raw export, webhook, stored-value balance, admin dashboard and Edge replay: denied/logged.
- Admin support switch from merchant A to B does not leak cached data, Prisma connection or SSE events.
- Expired credential cannot make refund or provisioning request; CSRF token missing on browser mutation fails.
- Provider callback replay with correct signature but wrong merchant correlation quarantined.
- Production logs and backups scanned for sensitive PAN/KSeF secrets/health PII leaks.
- Backup restore to isolated DB passes full sample settlement, invoice and stock-conservation checks.
- DB unavailable, provider down, partial region outage: operator receives accurate action restrictions and incident report, not falsely healthy status.

## Gate

Independent security review/penetration test of auth+tenant+financial APIs, SBOM and dependency SCA, mandatory successful current-RC backup restore, measured SLO report, incident playbook drill, signed GDPR/PCI shared-responsibility register. Produce `security-performance-dr-evidence.md` and `tenant-isolation-and-rls-decision-record.md`; no GA with unresolved cross-tenant boundary or unrecoverable DB state.

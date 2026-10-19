# 18 — Auditable Requirement Matrix, Gap Register, Owner and Certification Templates

**Classification:** `CURRENT_PROOF_MISSING` for consolidated R outputs | **Priority:** P0 | **Source:** user final readiness roadmap R0–R15.

## Required output contract

The prior final pre-production plan explicitly requires the following exact deliverable filenames **in the repository for the current release candidate**; at audit time none were found by these exact names in main, although many older acceptance records exist. This packet provides **templates and starting workstream content**, not a false assertion that certification has been performed.

1. `full-system-requirements-matrix.md`
2. `gap-register.md`
3. `ui-api-surface-matrix.md`
4. `role-permission-capability-matrix.md`
5. `financial-reconciliation-evidence.md`
6. `inventory-and-value-conservation-evidence.md`
7. `external-certification-matrix.md`
8. `hardware-certification-matrix.md`
9. `security-performance-dr-evidence.md`
10. `staging-dress-rehearsal-report.md`
11. `pilot-day-report.md`
12. `go-no-go-checklist.md`

The R campaign must fill every row with specific source paths, test cases, external provider/device IDs, exact commit, migrations and deployments. These evidence files must **not** be marked VERIFIED/ACCEPTED without real proof.

## 1. Atomic requirement record

```yaml
id: P05-PAY-001
source: 'Master P5 Step 5.2; readiness R4; additional plan 02'
intent: 'No card charge is marked paid before provable success'
status: NEEDS_TEST # VERIFIED | PARTIAL | MISSING | BROKEN | DUPLICATED | LEGACY | EXTERNAL_BLOCKED | DEFERRED
severity: S0 # S0 | S1 | S2 | S3
scope: 'PL, cash-and-Adyen venues, specified device class'
canonical_model: 'Payment/PaymentOperation/CheckSettlement [verify actual schema]'
code_refs: ['apps/api/src/modules/checkout/checkout-payment.service.ts']
ui_ref: 'apps/web/src/components/checkout/split-payment-panel.tsx'
permission: 'CHECKOUT_WRITE; high-risk manual exception [design pending]'
test_refs: ['TO_CREATE: api direct manual-card denied']
external_evidence: 'NONE_YET'
release_sha: 'TO_FREEZE'
production_deployment: 'NOT_VERIFIED'
owner: 'TO_ASSIGN'
reviewer: 'TO_ASSIGN'
target_release: 'TO_ASSIGN'
acceptance_rule: 'Direct generic MANUAL_CARD cannot create provider-backed success'
risks: ['False paid state']
```

Use actual model symbols from source; names in the above example other than observed `Payment`/`CheckSettlement` are **illustrative**.

## 2. Gap register

Every gap has reproducible steps and risk to customer, not generic 'fix security'. Mandatory fields: `ID, discovery_date, source_reference, exact_sha, current_result, expected_result, impact_scope, severity, root_cause_hypothesis, owner, mitigation/feature_flag, proposed_schema_change, backwards_compatibility, test_cases, legal/provider dependency, rollback, evidence_links, signoff`. Mark hypothesized issues explicitly as such; link a closed PR only when merge SHA and regression exist.

Examples to seed (not all resolved):

| ID | Finding or possible gap | Category | Next independent proof |
| --- | --- | --- | --- |
| G-001 | Main unprotected at audit | CONFIRMED_FINDING | GitHub ruleset and required CI readback |
| G-002 | Generic `MANUAL_CARD` local success | CONFIRMED_FINDING | API denial + privileged reconciliation tests |
| G-003 | Booking formatted without explicit shop timezone | CONFIRMED_FINDING | DST and user-travel tests |
| G-004 | R required evidence packet not in repo under exact filenames | CURRENT_PROOF_MISSING | 100% P0–P17 map + signed artifacts |
| G-005 | Integrated physical Adyen/fiscal/KSeF/Edge/pilot gate not signed | CURRENT_PROOF_MISSING | Real provider/hardware/pilot proof |
| G-006 | GoSpots Render/Neon access mismatch | CURRENT_PROOF_MISSING | verified actual environment chain |
| G-007 | `.pl` canonical host differs from docs | CONFIRMED_FINDING | signed locale-domain policy and tests |
| G-008 | Stale PRs and conflicting historical phase notes | CONFIRMED_FINDING | diff disposition / current-rc status |
| G-009 | RLS defaults off | CONFIRMED_FINDING, not breach | tenant matrix and RLS risk decision |
| G-010 | Tracked `dev.db`, dual lockfiles | CONFIRMED_FINDING tree; content unexamined | sensitive-data review and policy |
| G-011 | Vercel canceled head release attempt | CURRENT_PROOF_MISSING active alias; not outage | active alias vs tested code manifest |
| N-001 | Bank/provider payout matching depth | NEW_SCOPE_CANDIDATE | repo model/endpoint inventory and merchant needs |
| N-002 | Chargeback/fee operations | NEW_SCOPE_CANDIDATE | provider feature matrix |
| N-003 | HACCP/cleaning/temp/expiry and allergen lifecycle | NEW_SCOPE_CANDIDATE | kitchen flow inventory and legal signoff |
| N-004 | Physical assets/maintenance and checklists | NEW_SCOPE_CANDIDATE | operators' daily work study |
| N-005 | Full accounting and payroll | DELIBERATELY_EXCLUDED | strategic build-vs-partner decision |

## 3. Evidence report minimum header

```markdown
# [Requirement/Gate] Acceptance Proof
- Venue/product scope and exclusions:
- QA scenario IDs:
- Repo branch, immutable SHA and exact run IDs:
- Source/CI link:
- API/Web/Edge/DB migration deployed version:
- Environment identity (redacted), merchant provider config class:
- Physical device model, firmware, locale and timezone:
- Expected vs observed and reconciliation arithmetic:
- Negative/failure test results:
- Logs, screenshots and external evidence reference (redacted):
- S0/S1 remaining:
- Primary reviewer, legal/provider reviewer as applicable, signed date:
- Result: VERIFIED | NEEDS_TEST | EXTERNAL_BLOCKED | FAILED
```

## 4. Test-to-requirement crosswalk

Treat each feature as a multi-dimensional proof: `main user flow × role (allow/deny) × tenant/shop × retry/concurrency × offline mode × refund/correction × audit/history × fiscal/legal obligations × browser/hardware × restoration`. Use equivalence partitioning to avoid combinatorial explosion, but every security and financial boundary gets direct adversarial tests. Maintain linked test ID and per-scope supported configurations.

## 5. Program and signoff roles

- **Engineering owner:** implementation, tests, schema, migrations and rollback.
- **Security/privacy owner:** tenancy, access, PCI/GDPR and log redaction.
- **Finance owner/accountant:** price/tax/cash/payout/invoice reconciliation and tax regimes.
- **Venue operator:** full day without backup POS; usability and day close.
- **Fiscal/Adyen provider owner:** certifiable physical evidence and vendor scope.
- **SaaS support/release owner:** support response, device provisioning, monitoring, customer migration and operational go/no-go.

One human may hold several functions in an early company, but each function needs independent documented evidence and no self-certified legal conclusions.

## 6. Final decision checklist

`GO — GENERAL AVAILABILITY` requires 0 unresolved S0/S1 in sold scope, applicable P0–P17 current-RC evidence, R0–R15 signed, provider/legal/hardware real proof, passed DR/security/load, full-day pilot and postdeploy traceability, staffed support, and fully reconciled money/value history. `LIMITED PRODUCTION` may exclude unproven optional configurations via product/contract flags with explicit customer consent. `NO-GO` if basic real cash/card/legal/tenant reliability cannot be proved. Any new release invalidating material certified behavior must re-run affected proof.

**Important:** Completing these templates is **not** the same as completing the tasks. The plan pack intentionally leaves live evidence unsigned and missing external proofs clearly unverified.

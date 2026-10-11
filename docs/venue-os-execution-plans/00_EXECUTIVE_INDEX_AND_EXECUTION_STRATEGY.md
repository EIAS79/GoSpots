# GoSpots — Venue Operating System: Integrated Execution Strategy

**Version:** 1.0 | **Prepared:** 2026-10-09 | **Repository:** `EIAS79/GoSpots` | **Baseline for planning:** `b3e444e4deed5b9392c947f7d9b130a118897738` (revalidate before execution)

## 1. Decision and scope

GoSpots can become the **system of operation and record for a certified venue configuration**, encompassing floor management, guest checks, orders, checkout, cash/card receipts, legal fiscalization/invoicing, booking, inventory, customer value, employee operation, reporting and incident recovery. It must remain independent of another POS system. This does **not** mean that a private software company can itself become a card acquirer, the Polish tax authority, a fiscal printer manufacturer, bank, or the statutory employer; these regulated external functions remain integrations/operational dependencies.

This packet **extends**, not supersedes, the two user-provided sources:

1. `GoSpots_Master_Product_and_Engineering_Execution_Plan_v2(1).md`, dated 2026-08-14: canonical **Phase P0–P17** and product invariants.
2. `GoSpots_FINAL_PreProduction_Full_Audit_Gap_Closure_and_GoLive_Roadmap(1).md`: canonical **readiness gates R0–R15**, followed by a verbatim copy of the master plan. Do not double-count this embedded copy as new requirements.
3. `GoSpots_Deep_ReadOnly_Audit_2026-10-09.md`: risk-prioritized repository assessment, **not** a full 1,441-file line-by-line audit, production pen-test or real device certification.

**No extra official phase 18 is created.** The numbered files in this packet are engineering workstreams, not claims that previous P/R phases are complete. The user can pursue optional expansion only after a scope-defined reliable core launch.

## 2. Evidence labels — mandatory in every workstream

| Label | Definition | What it does NOT mean |
| --- | --- | --- |
| `CONFIRMED_FINDING` | Observed in inspected source/config or current repo/connected metadata on 2026-10-09 | Verified exploitable in production |
| `CURRENT_PROOF_MISSING` | Software/docs exist but current-SHA full gate/provider/venue proof not held | Feature absent |
| `COVERED_VERIFY_DEPTH` | Requirement substantially addressed in original P0–P17/R0–R15, but edge cases or operations need expansion | Need wholesale rewrite |
| `NEW_SCOPE_CANDIDATE` | Materially absent from initial plan; not yet verified absent from all repository modules | Defect in initial release |
| `DELIBERATELY_EXCLUDED` | Original plan explicitly excludes from initial commercial release | Must be built immediately |
| `LEGAL_REVIEW_REQUIRED` | Country/product-specific rule requiring qualified review and current official sources | This packet is a legal certification |

For all implementation statuses use `VERIFIED`, `NEEDS_TEST`, `PARTIAL`, `MISSING`, `BROKEN`, `DUPLICATED`, `LEGACY`, `EXTERNAL_BLOCKED`, `DEFERRED` from R1; no coding based only on search-term absence. Enforce severity S0–S3 as defined by R program.

## 3. Scope tiers: do not confuse a POS with an entire ERP

**Tier A — Safe certified frontline POS (commercial launch core):** P0–P17/R0–R15; physical Adyen/fiscal/KSeF/Edge only for configurations actually sold; open/close, timed resources, orders, cash/card, split/refund, invoice/receipt, full audit and reconciliation. No parallel POS or shadow financial spreadsheet.

**Tier B — Complete day-to-day venue operations (recommended expansion):** supplier invoice receipt and three-way matching, bank/payout imports, exceptions and disputes, detailed facilities/cleaning/equipment, food safety and expiry where needed, customer incident handling, owner operations dashboard, migration and vendor support. Still permits an independent licensed accountant and payroll processor.

**Tier C — Broad back-office suite (separate major investment):** statutory Polish bookkeeping, VAT register/JPK obligations, accounts payable/receivable subledgers, payroll, HR law, payroll/ZUS/PIT reporting, asset depreciation, bank connectivity and full period close. **Explicitly outside master initial GA**, large regulated maintenance surface; compare build-vs-certified accounting/payroll partner and choose signed product scope.

## 4. Workstream documents

| File | Focus | Priority | Source alignment |
| --- | --- | --- | --- |
| `01_BASELINE_TRACEABILITY_AND_AUDIT_CLOSURE.md` | Full inventory, all findings, ownership, branch release policy | P0 | P0–P17, R0/R1/R9 |
| `02_CHECKOUT_PAYMENTS_REFUNDS_AND_LEDGER.md` | Manual-card boundary, provider lifecycle, money invariants | P0 | P4/P5, R4 |
| `03_POLAND_FISCAL_KSEF_AND_TAX.md` | Receipt vs payment vs invoice, FA(3), audit | P0 legal gate | P5, R4/R11 |
| `04_CASH_BANK_PAYOUT_AND_FINANCIAL_RECONCILIATION.md` | Cash, payouts, fee/dispute and bank evidence | P0 core / P1 depth | P5/P14, R4/R8 |
| `05_LIVE_FLOOR_RATES_BOOKINGS_AND_CAPACITY.md` | Gaming/venue resources, timing, pricing, DST | P0 | P2/P3/P8, R3/R5 |
| `06_RESTAURANT_KDS_AND_FOOD_COMPLIANCE.md` | Restaurant operations, printer/kitchen and food safety | P0/P1 | P6/P7, R5; new food-safety depth |
| `07_INVENTORY_PROCUREMENT_AND_SUPPLIERS.md` | Cost, receiving, traceability, purchase invoices | P1 | P7; new payables/lot depth |
| `08_CUSTOMERS_MEMBERSHIPS_STORED_VALUE_AND_ACCESS.md` | Booking/customer money, access, data rights | P1 | P8/P9/P11 |
| `09_WORKFORCE_APPROVALS_AND_HR_BOUNDARY.md` | Time, roles, staffing, tip and payroll boundary | P1/P2 | P10; payroll deliberately excluded |
| `10_EDGE_OFFLINE_DEVICE_AND_HARDWARE_CERTIFICATION.md` | LAN loss, cash vs card policies, device matrix | P0 | P12/P17, R7/R11 |
| `11_SECURITY_TENANCY_PRIVACY_AND_DISASTER_RECOVERY.md` | Isolation, RLS, auth, privacy, backup, SLO | P0 | P1/P16, R2/R10 |
| `12_MERCHANT_ONBOARDING_MIGRATION_SUPPORT_AND_SAAS.md` | Make deployment supportable by real clients | P1 | P13/P17; expanded field ops |
| `13_FACILITY_MAINTENANCE_SAFETY_AND_VENUE_CONTROL.md` | New site-operations scope | P2, vertical-driven | NEW_SCOPE_CANDIDATE |
| `14_OPTIONAL_FULL_ACCOUNTING_PAYROLL_AND_ERP.md` | Tier C choice, highly controlled back-office expansion | P3 optional | DELIBERATELY_EXCLUDED |
| `15_REPORTS_HISTORY_EXPORTS_AND_OWNER_INTELLIGENCE.md` | Audit-grade history and metric contracts | P0/P1 | P14/P15, R8 |
| `16_FULL_PRODUCT_TEST_PILOT_GO_LIVE_AND_SCALE.md` | Real test/evidence matrix, canary, gate | P0 | P16/P17, R0–R15 |
| `17_INTEGRATIONS_LOCALIZATION_AND_SERVICE_BOUNDARIES.md` | Plugin/provider contracts, multilingual/tax boundaries | P1 | P5/P13/P16 |
| `18_REQUIREMENTS_GAP_REGISTER_AND_EVIDENCE_TEMPLATES.md` | Runnable templates, cross-references and test matrix | P0 | R1/R9/R15 |

Priority P0 means **blocking that scope's GA**; P1 means commercial completeness/reliability depth and may be gate-blocking if marketed; P2/P3 is discretionary expansion, **not** a blocker if excluded and capability-flagged.

## 5. Program dependency graph

```text
Baseline + freeze (01) → exhaustive requirement registry (18)
   ├── auth/tenant/security/DR (11)
   ├── financial authority (02) → fiscal/KSeF (03) → payout & bank reconciliation (04)
   ├── venue timing/booking (05) → customer value/access (08)
   ├── kitchen operations (06) → stock/procurement (07)
   ├── workforce (09) └── hardware/Edge (10)
   └── platform onboarding/support (12), integrations (17), reporting (15)
                  ↓
             release campaign (16)
                  ↓
       design partner → limited GA scope → proven multi-venue scale

Tier-B add-on 13, Tier-C optional 14 must not delay Tier-A certification unless sold/required.
```

## 6. Release waves and promotion controls

**Wave 0 — governance, before code:** record immutable main SHA, reconcile open PR #7/#92/#95/#100, enable protection and required exact-head CI, inventory GoSpots-only production infrastructure and credentials through authorized personnel; do not mistake the connected Edulytics Render/Neon workspace for GoSpots.

**Wave 1 — stop money/data escape:** remove generic cashier `MANUAL_CARD` paid-state shortcut; prove provider and refund idempotency and immutable ledger; verify tenant isolation, time semantics and exact business-day boundaries; lock down physical device policy.

**Wave 2 — finish legal and operational proof:** certify Polish fiscal printer/KSeF as applicable, physical Adyen flow, canonical deployed environment and audit-grade payout/cash evidence; prove physical peripherals and offline restrictions; complete 12 required R outputs.

**Wave 3 — real pilot:** one immutable release candidate SHA, scripted end-to-end staging, busy shift including exceptional failures, 1+ design partners without alternate POS/spreadsheets, daily reconciliation, signed LIMITED PRODUCTION. Expand by vertical/device/venue cohort only after repeated clean shifts.

**Wave 4 — Tier B:** vendor bill matching, bank reconciliation depth, facilities and HACCP modules, operational support automation, expanded analytics.

**Wave 5 — optional Tier C:** only after staffed finance/HR compliance operation and business demand. Prefer interoperable accounting/payroll first.

**Vercel resource protection:** No commits were made for this packet. Future engineering should batch logically coherent changes into a minimal number of PRs, rely on local/unit/CI and Vercel's deliberate `.vercel-release` promotion process, and avoid repeated preview deployments. CI may run on branches without forcing web deployments.

## 7. Non-negotiable release assertions

- Exactly one commercial authority for a payable GuestCheck and its immutable settlement snapshot; no second POS.
- Every tender is traced to a real receipt, signed cash operator action or verified provider capture; **terminal slip ≠ Polish fiscal receipt ≠ VAT invoice**.
- `sum(allocated_paid) <= settled_due` except explicit refund/reopen semantics; duplicate command/webhook cannot increase funds.
- Every financial correction is append-only and attributable; no invisible edit to issued fiscal/invoice/ledger history.
- All queue, retry, refund, invoice and offline states converge safely, including `UNKNOWN` states; no manual database surgery as normal recovery.
- Isolation must hold for all user, system job, email, report, device and support-admin paths.
- Certified operating envelope is documented per country, hardware model, firmware, provider, venue archetype, device networking mode and marketed feature.
- A venue may retrieve its own complete lawful audit/history/export on exit, without losing integrity or other tenants' data.
- Every promoted production deployment is tied to exact tested SHA and stable rollback/restore evidence.

## 8. Source of truth and legal notes

Existing plans are authoritative on **intended scope**, while the October 9 audit is authority for **observed but limited current baseline**. `NEEDS_TEST` is not `BROKEN`. New scope suggestions are not proven repo omissions until R1/R9 inventory confirms. Polish legal rules change: validate against Ministry of Finance KSeF guidance, Polish cash-register guidance, GDPR, PCI Security Standards Council, and Adyen terminal policies at implementation and launch dates; obtain Polish accountant/tax counsel and certified fiscal-provider signoff.

See the specific workstream for detailed tasks, negative tests, acceptance artifacts and rollback. Never merge, run real charges, rotate secrets or deploy solely based on this planning packet.

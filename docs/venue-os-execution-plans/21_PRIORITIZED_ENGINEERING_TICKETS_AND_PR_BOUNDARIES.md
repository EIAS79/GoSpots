# 21 — Concrete Engineering Ticket Queue, Safe PR Boundaries and Dependency Gates

**Purpose:** translate the audit and plan additions into actionable work units. **All tickets are unstarted by this document**; the current repo may already contain equivalent fixes by the time implementation begins. Confirm source delta and exact branch head before coding. Do **not** use this ticket queue to generate a large number of incidental Vercel deployments.

## Priority and acceptance rules

S0 = financial integrity, auth escape, data loss and unrecoverable production failure; S1 = sold feature incomplete/unreliable; S2 = signed limited-scope deferral possible; S3 = nonblocking polish. *Do not classify an architectural preference as S0 without exploit or violated contract.* Work should be batched into **small numbers of coherent PRs** (one for financial boundary, one for time/booking, one for release governance/evidence, etc.), not one PR per individual test. Vercel release marker should not change accidentally.

## Fix group 1 — Baseline and correctness blockers

### T-001: Protect default branch and freeze one release reference

**Source:** F01, F11; original R0. **Priority:** S1 release control. **Owner:** repo admin + release engineer.

1. Re-read branch rules/rulesets, protected branch exemptions and test workflow names. Enable required checks on exact main head and no direct push/force push for normal work, reviewed PR merge. Document emergency escape with after-the-fact audit.
2. Validate web build ignore/release marker and which backend paths require API redeploy, independent from Next frontend.
3. Save a source-to-environment manifest with active Vercel aliases, verified current GoSpots Render and Neon IDs—not unrelated Edulytics services.

**Test:** Attempt a non-required CI failing PR to a test branch; verify cannot merge via ordinary path; confirm no Vercel preview created merely by auditing docs. **Evidence:** ruleset readback and reference deployment SHA. **Risk:** misconfigured checks can stall emergencies; document break-glass and minimal recovery.

### T-002: Close generic MANUAL_CARD success path

**Source:** F02. **Priority:** S0 if an ordinary cashier can falsely mark tender as successful in a sold configuration. **Owner:** checkout backend + security + finance.

1. Build negative request fixture against `POST /checkout/settlements/:id/payments` as cashier using DTO method `MANUAL_CARD`; capture observed returned status and resulting journals in isolated test DB. Do not test against production money.
2. Inventory all legitimate callers and semantics. Remove direct generic card success; reuse captured provider path or separate audited manager external-card attestation command with its own state and external evidence.
3. Migrate or map old manual card records **without fabricating provider PSP references**; quarantine records lacking attestation in reconciliation exception queue.
4. Add API/server unit/concurrency and browser tests; ensure no other generic DTO enum or Edge replay path bypasses the new boundary.

**Test:** cashier direct call forbidden; manager conditional external tender requires distinct role, reason, verified reference and clear non-Adyen label; Adyen normal UI still works. **Rollback:** feature-flag external exception off first; do not revert to unsafe generic card path.

### T-003: Venue local time and DST consistency

**Source:** F03 and draft PR #95. **Priority:** S1 where confirmations mislead customer; S2 otherwise. **Owner:** reservations + web.

1. Diff PR #95 vs current main to avoid duplicate changes. Replace both `formatWindow` methods and any equivalent booking email/reminder/audit paths with explicit `Shop.timezone` via stable time library.
2. Use canonical UTC instant, zone-aware wall-clock input and clear offset disambiguation; add tests for Warsaw DST gap/overlap, client abroad, shift spans business-day boundary.
3. Keep API compatibility for older clients, but update formatted text generation.

**Test:** public/staff emails show identical confirmed Warsaw local time, independent of Render server TZ. **Rollback:** retain authoritative ISO times; if presentation rolls back, block ambiguous booking message rather than giving wrong hour.

### T-004: Production identity and webhook canonicalization

**Source:** F06 + F11. **Priority:** S1 evidence blocker; S0 only if uncovered live money callback failure confirmed. **Owner:** operations/provider administrator.

1. Securely identify true GoSpots Render service+Neon branch, API SHA and migration, web API target, Adyen merchant/webhook host and event signatures. Do not print secret values.
2. Inspect legacy Render webhook URLs and Adyen delivery history. Keep old endpoint in safe dual validation where provider rollout requires; switch only after dedupe and rollback planning.
3. Create read-only health checks for provider UNKNOWN age, unsuccessful callback count and unallocated capture count.

**Test:** known signed Adyen TEST callback into canonical endpoint with intentional duplicate/out-of-order events and no duplicate allocation. **Evidence:** test ref and deployment identity.

### T-005: Resolve PRs, legacy docs, dev DB and dual lockfiles

**Source:** F08/F10. **Priority:** S2 unless sensitive development DB proven. **Owner:** repository maintainer.

1. Compare #7/#92/#95/#100 commits to main and intended business contract; cherry-pick only missing tests/features or close as superseded with explanation.
2. Inspect `apps/api/prisma/dev.db` in restricted review, scan secrets, decide history treatment; if no real data, remove from tracking after schema/test migration.
3. Confirm pnpm canonical install and need for `package-lock.json`; update CI frozen install consistently.
4. Version current acceptance status independently from historical docs.

**Test:** frozen install passes CI; no internal secrets/PII in tracked local DB; no duplicate UI/DTO authority after PR disposition.

### T-006: Decide tenant RLS policy and penetration negative suite

**Source:** F09, R2/R10. **Priority:** S0 if bypass confirmed, otherwise S1 multi-tenant certification. **Owner:** security+DB.

1. Build full tenant isolation harness across API jobs/analytics/invoice/download URLs/Edge/provider/admin, including trust of `x-venue-path` and shop IDs.
2. Stress multiple DB pooled sessions under RLS on/off with system admin and async jobs, reject cross-context data. Design fail-closed RLS rollout *only* with migration and soak.
3. Independent pentest review and document compensating controls if RLS remains disabled.

**Test:** every cross-tenant read/write rejected and audit preserved; no data leakage in SSE/cache. **Rollback:** RLS migration/config reverted only with validated app scoping and security risk acceptance.

## Fix group 2 — physical and fiscal acceptance

### T-007: Adyen signed integrated checkout flow

**Source:** F05, issue #55 context, R4/R11. **Priority:** S0 external gate.

**Implementation:** provider state contracts from Plan 02; real authorized test success/decline/cancel/UNKNOWN, `TransactionStatus`, duplicate webhook, full/partial referenced refund, terminal loss and report match. **Evidence:** separate transaction IDs, exact test tenant, device model, terminal firmware, host SHA and journal totals. **Test:** one check/one effective captured amount despite all retries.

### T-008: Fiscal device + KSeF legal certification

**Source:** F05, P5/R11. **Priority:** S0 sold Polish legal scope.

**Implementation:** device/vendor signed receipt evidence, legally applicable tax category/exemption review, FA(3) invoice state and official KSeF ID/UPO/QR scenarios, special offline mode and correction. **Test:** legally reviewed sample cases produce correct real fiscal/KSeF result; no terminal slip mislabeling. **Risk:** must involve Polish fiscal vendor/tax accountant; engineers cannot self-certify law.

### T-009: Edge+KDS physical interruption suite

**Source:** F05, issue #57 context, R7/R11. **Priority:** S1 for marketed offline/restaurant scope.

**Implementation:** real Edge journal restart, WAN partition, Cloud/Edge fencing, physical KDS printer delivery/reprint, authenticated QR and safe blocked offline provider methods. **Test:** reconstruct floor/check/orders after outage with exact-once economic events; no unsupported card 'success'.

### T-010: Current-RC DR, security, performance and support proof

**Source:** F04, R10–R15. **Priority:** S1 release gate.

**Implementation:** migrations on empty+upgraded PG17, tenant-focused pen test, secure backup restore, load and p95/p99, observability, incident escalation; on-site day rehearsal+pilot; sign 12 R evidence artifacts. **Test:** owner closes real shift, retrieves legal records, no manual SQL, reconciles every sold tender/stock/value. **Rollback:** versioned release manifest/feature flags and safe data migration strategy.

## Fix group 3 — business-replacement depth (scope gated)

### T-011: Financial exception reconciliation console (Plan 04)

**Priority:** P0 for unresolved captured money, P1 for bank automation. **Tasks:** provider transaction/payout batch ingest, fees, disputes, unmatched bank credits, safe exception workflows and audit. **Test:** simulate payout with fees/refunds and chargeback; all balances explainable and source-linked.

### T-012: Procure-to-pay matching (Plan 07)

**Priority:** P1 Tier B. **Tasks:** link POs→partial goods receipts→supplier invoice/KSeF input→approval/credit and payable export. **Test:** duplicate supplier invoice rejected and valuation conserved.

### T-013: Food safety/traceability assistance (Plan 06)

**Priority:** P1 Tier B hospitality. **Tasks:** ingredient allergens/modifiers, signed menu reviews, temperatures, cleaning, goods batch/expiry and corrective action. **Test:** changed ingredient invalidates stale allergen declaration; alert cannot be hidden by cashier.

### T-014: Asset/maintenance/physical site operating queue (Plan 13)

**Priority:** P2 unless contracted. **Tasks:** table/equipment work orders, downtime lock, cleaning/open-close evidence, staff escalation and supplier parts; **Test:** broken resource blocked from book and manager authorizes repair signoff.

### T-015: Merchant self-service onboarding and migration (Plan 12)

**Priority:** P1 before multi-merchant launch. **Tasks:** tax identity, entitlement, vendor/devices, importer, data reconciliation, support, merchant export/exit; **Test:** non-engineer onboards a venue and closes first day.

### T-016: Full accounting/payroll decision (Plan 14)

**Priority:** P3 optional. **Tasks:** formal partner/build assessment, business case, accountant/payroll expert responsibility and legal currentness; **Test:** none until commissioned—do not market as existing.

### T-017: Per-vertical supported capability matrix (Plan 20)

**Priority:** P1 go-to-market integrity. **Tasks:** isolate Gaming, Hospitality, Mixed, Retail, Services entitlements and geography/hardware; keep unsupported verticals out of sales docs. **Test:** onboarding cannot enable untested features, devices or country legal modes.

## Recommended PR batching and deployment discipline

- **PR batch A (P0 code):** T-002 plus its test migration; avoid unrelated UI redesign.
- **PR batch B (P0 booking):** T-003 with all reservation string consumers.
- **PR batch C (P0 platform):** T-006 hardening where safe; separate risky RLS rollout behind gate.
- **No code PR required for many checks:** T-001 governance and T-004 identity are administrative/read-only until changes proven necessary; T-005 documentation and cleanup can be batched.
- **External test campaign:** T-007 to T-010 executed on intentionally promoted immutable RC, not every feature commit.
- **Product expansions:** T-011–T-017 shipped as entitled vertical-specific releases *after* reliable Tier A.

Every PR must include changed-source map, migration plan, test/evidence links, affected offline/provider/fiscal behaviors, exact-head checks, signoff owner and feature-flag rollback. Do not self-report VERIFIED from generated code or a written plan.

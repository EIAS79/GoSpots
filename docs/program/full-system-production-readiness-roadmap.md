# GoSpots — Full-System Gap Closure & Production Readiness Roadmap

**Status:** Proposed post-Phase-17 readiness program  
**Repository:** `EIAS79/GoSpots`  
**Source of truth:** GoSpots Master Product & Engineering Execution Plan v2, Phases 0–17  
**Purpose:** Re-audit every phase, find and close missing/partial/broken behavior, run a production-grade whole-product test campaign, complete remaining real-world certifications, and only then permit General Availability.

> This document does **not** invent an existing Phase 18. The current master plan ends at Phase 17. This is a post-Phase-17 gap-closure and release-readiness program built on the Phase 0–17 gates.

---

## 1. Current baseline

At the time this roadmap was created:

- `main` is at `e5231cde6f60dc14248fc7085b09f73540f28b03` (`Release Phase 17 Adyen decline certification UI`).
- PR #88 is merged and the real Adyen S1F4Pro decline scenario was physically exercised; GoSpots received `Refusal: 214 Declined online` for the €1.23 TEST transaction.
- Phase 17 software/CI is substantially complete, but the full commercial acceptance gate still contains real-world provider/hardware/legal/pilot evidence that cannot be replaced by mocks.
- The Phase 17 requirements matrix still needs to be updated to record the completed physical decline evidence and to separate it from the still-open Adyen success/timeout/reconcile/cancel/refund scenarios.
- `main` currently has no GitHub branch protection enabled. Production-readiness work must correct repository governance before GA.
- Draft PR #7 (`Add hourly pricing surcharge for gaming zones`) is still open and non-mergeable. It must be explicitly reconciled: rebase/reimplement if still required by product truth, or close if superseded.

No additional missing feature is assumed merely because this roadmap exists. Missing/partial features must be proven by the audit against the master plan, current code, schema, APIs, UI, tests, production behavior and real provider/hardware evidence.

---

## 2. Final target

GoSpots may leave the readiness program only when all applicable Phase 0–17 gates are re-proven on the final release candidate and all critical product surfaces behave correctly under normal, invalid, concurrent, offline, provider-failure and recovery conditions.

Final status must be one of:

- `GO — GENERAL AVAILABILITY`;
- `LIMITED PRODUCTION ONLY` with explicitly accepted non-critical deferrals;
- `NO-GO` with blocking defects/gaps recorded.

There is no "mostly green" production acceptance for money integrity, tenant isolation, authorization, migrations, payment unknown-state handling, inventory conservation, fiscal/KSeF obligations that are marketed, or silent data-loss conditions.

---

## 3. Gap classification

Every requirement discovered during the audit must receive one state:

| State | Meaning |
| --- | --- |
| `VERIFIED` | Implemented and re-proven on current release candidate. |
| `NEEDS_TEST` | Implementation appears present but current acceptance evidence is insufficient. |
| `PARTIAL` | Some required behavior exists; one or more required paths are missing. |
| `MISSING` | Required behavior does not exist. |
| `BROKEN` | Exists but fails or violates the contract. |
| `DUPLICATED` | More than one authority/state machine exists for one business fact. |
| `LEGACY` | Superseded path remains reachable or creates maintenance/data risk. |
| `EXTERNAL_BLOCKED` | Requires provider, hardware, legal/accounting or real venue evidence. |
| `DEFERRED` | Explicitly excluded from initial commercial release by product decision; must not leak into required workflows. |

Severity is independent of the state:

- `S0`: release blocker — security, tenant escape, data loss/corruption, money/stock double-count, unreconciled provider state, broken migrations/restore, core workflow unusable;
- `S1`: must fix before GA — required product behavior incomplete, significant reliability/UX/operations defect;
- `S2`: non-blocking only with explicit owner approval and documented workaround;
- `S3`: polish/backlog.

---

## 4. Program stages

### R0 — Freeze the release baseline and repository hygiene

Actions:

1. Capture exact `main`, database schema/migration head, production web/API deployment SHAs, provider configuration version and environment inventory.
2. Audit all open PRs/branches and stale experiments. Resolve PR #7 explicitly.
3. Enable production-appropriate GitHub branch protection/rules: PR required, blocking CI, no force push, no direct main mutation, required review where practical.
4. Record a single release-candidate SHA; all later evidence must identify the exact SHA tested.
5. Update Phase 17 evidence to record the completed physical Adyen decline test.

Exit:

- one clean baseline;
- no unexplained open product branch;
- release source is traceable;
- no direct uncontrolled path to production `main`.

### R1 — Build the Phase 0–17 implementation and acceptance matrix

For every phase requirement and every Gate P0–P17:

1. map requirement -> schema/table -> backend service/API -> UI -> permission/capability -> audit/event -> test -> production evidence;
2. classify `VERIFIED / NEEDS_TEST / PARTIAL / MISSING / BROKEN / DUPLICATED / LEGACY / EXTERNAL_BLOCKED / DEFERRED`;
3. create one defect/gap ticket for every non-verified item;
4. prove that one business fact has one canonical authority;
5. explicitly inspect the master-plan technical-debt watchlist: duplicate financial concepts, duplicated venue/branch meaning, raw stock mutation, UI-only permissions, client-trusted tenant IDs, provider logic inside checkout, non-idempotent offline queues, floating-point money, mutable issued financial documents, permanent `UNKNOWN` states, hard-coded Polish fiscal rules in generic billing, silent timezone assumptions and undefined report formulas.

Exit:

- 100% of source requirements mapped;
- zero "unknown" requirement status;
- all gaps have owner, severity, fix path and acceptance test.

### R2 — Platform/integrity re-certification (Phases 0–1)

Audit and test:

- standalone architecture and removal of superseded dependencies;
- login/logout/recovery/session revocation/rate limiting/lockout;
- tenant and venue isolation;
- server-side RBAC and granular permissions;
- subscription/capability resolution;
- canonical money utilities and rounding/allocation property tests;
- idempotency storage/replay/hash mismatch;
- audit log integrity;
- durable event versioning;
- timezone/business-day handling;
- concurrency invariants.

Required adversarial tests:

- IDOR and tenant escape;
- forged tenant/venue IDs;
- permission bypass by direct API call;
- replay same idempotency key with same payload and different payload;
- race same resource/payment/refund action concurrently;
- expired/revoked session behavior.

### R3 — Venue configuration and live operations re-certification (Phases 2–3)

Audit every setup path from empty tenant to usable venue:

- venue profile, legal/tax settings, timezone/business day, operating hours;
- branches, zones, floor, resources and device registry;
- rates: hourly/per-minute/fixed/package/per-person/per-game/free/minimums/rounding/grace/time-of-day/weekend/holiday/member/resource/group;
- immutable applied-rate snapshots;
- resource state, start/pause/resume/move/merge/close;
- waitlist and live floor refresh;
- multi-device conflicts;
- overnight sessions and DST.

Full simulation:

- realistic billiard venue with 8–20 resources;
- multi-hour busy shift;
- simultaneous starts, moves, pauses, extensions and closes;
- no duplicate occupancy and no manual calculation required.

### R4 — Commercial and money authority re-certification (Phases 4–5)

This is a release-critical workstream.

Re-prove:

- GuestCheck/open-check authority;
- orders/modifiers/discounts/comps/voids;
- tax/service charge/tip semantics;
- split checks and split payments;
- mixed tender;
- cash shift/opening float/paid-in/paid-out/count/variance/close;
- card success, decline, timeout/UNKNOWN, duplicate provider event, cancellation and reconciliation;
- refunds/partial refunds/late provider corrections;
- invoice/fiscal document immutability;
- KSeF/fiscal exception visibility;
- settlement/ledger/cash/report reconciliation.

Financial invariants:

- no captured payment can disappear;
- no failed/declined payment can be represented as paid;
- no retry can double-charge or double-refund;
- check due = canonical charge total - settled valid value;
- cash expected = opening + cash inflows - cash outflows;
- refunds and reversals preserve history rather than rewriting it;
- `UNKNOWN` must always have a deterministic reconciliation path.

### R5 — Restaurant, inventory, reservations and customer-value re-certification (Phases 6–9)

Restaurant/bar:

- tables/seats, ordering, modifiers, coursing, send/fire/hold, KDS, kitchen printer routing, void after send, close.

Inventory:

- items/units/conversions/recipes;
- purchase/receive/transfer/sale-consumption/waste/correction/stocktake;
- immutable movements;
- negative-stock policy;
- recipe costing and margin inputs;
- concurrent receiving/consumption/stocktake.

Reservations/events:

- availability/capacity;
- deposits;
- arrival/no-show/cancel;
- waitlist;
- events/group booking;
- overlap/double-book prevention;
- reservation -> operational session/check -> payment traceability.

Customer value:

- customer identity/profile;
- membership;
- loyalty;
- packages/entitlements;
- promotions;
- stored value/gift value;
- no double-spend/retry duplication;
- expiry and correction behavior.

### R6 — Workforce, access and multi-location re-certification (Phases 10–11 and 13)

Re-prove:

- staff assignment and venue scope;
- approvals and manager overrides;
- high-risk action attribution;
- shift/user accountability;
- ticket/QR/RFID/access entitlement;
- occupancy and lockers where enabled;
- entitlement traces back to canonical commercial/customer facts;
- organization vs venue scope;
- cross-location reports/inventory where supported;
- SaaS/admin boundaries;
- public API/webhook isolation and replay safety;
- optional integrations never become dependencies for core venue operation.

### R7 — Offline, Edge and hardware continuity re-certification (Phase 12)

Software fault campaign:

- browser offline/online transitions;
- Edge hard outage;
- API unreachable;
- internet loss with LAN available;
- restart during queued work;
- duplicate replay after reconnect;
- stale-version conflict;
- print queue backlog/retry;
- no silent duplicate financial facts.

Physical campaign for marketed hardware:

- Edge host restart and reconnect;
- receipt/kitchen printing;
- KDS screen routing;
- scanner input;
- Adyen terminal;
- any access/RFID hardware sold as supported.

Every hardware model marketed as supported requires a recorded pass/fail evidence entry.

### R8 — Analytics, reconciliation, automation and grounded AI re-certification (Phases 14–15)

Analytics:

- same business event must reconcile across checkout, ledger, cash, finance reporting and analytics;
- metric formulas and date/time windows are explicit;
- tenant and branch filters are correct;
- realistic scale benchmark;
- no stale/duplicated totals.

Automation/AI:

- safe actions are idempotent;
- unsafe autonomous money/permission/inventory correction remains prohibited;
- schedules, retries and dead letters work;
- rate/cost budgets work;
- external AI failure has deterministic fallback;
- prompt/SQL injection does not execute generated SQL;
- numerical operational claims are grounded in canonical evidence;
- unsupported questions are refused rather than fabricated.

### R9 — Complete UI, API and role-surface sweep

Create an automatically generated inventory of:

- every web route/page;
- every API endpoint;
- every mutation/action/button/form;
- every feature flag/capability;
- every supported role/persona;
- every background job/webhook/queue worker.

For each UI route test:

- happy path;
- empty state;
- loading state;
- invalid input;
- permission denied;
- feature unavailable;
- provider unavailable;
- timeout;
- offline behavior where applicable;
- stale/conflict behavior;
- responsive mobile/tablet/desktop;
- keyboard navigation and accessibility basics;
- localization/time/currency formatting where applicable.

For each API endpoint test:

- valid request;
- schema validation;
- auth required;
- permission denied;
- cross-tenant access denied;
- nonexistent/stale entity;
- idempotency if mutating an external/business fact;
- concurrent duplicate/race where relevant;
- explicit provider/database failure behavior;
- audit/event side effects.

There must be no reachable production UI action without an acceptance test classification.

### R10 — Production hardening campaign (Phase 16)

Security:

- dependency audit with no unresolved critical/high production issue;
- tenant escape/IDOR/permission bypass;
- CSRF/session/cookie/token behavior;
- webhook HMAC/signature validation;
- replay/rate-limit abuse;
- secret/config exposure;
- file/input abuse where relevant;
- public booking/API abuse controls.

Data/DR:

- clean migration on PostgreSQL 17;
- representative historical upgrade;
- backup creation;
- restore into independent database;
- canonical count/invariant comparison;
- documented RPO/RTO evidence;
- rollback/forward-fix procedure.

Performance/SLO:

- realistic seeded dataset;
- mixed authenticated workload;
- p50/p95/p99 latency and error rate;
- checkout/payment/close critical-path latency;
- reservation contention;
- analytics scale;
- queue/backlog behavior;
- memory/CPU/DB saturation evidence;
- alert thresholds and operator runbook.

Privacy/operations:

- GDPR purpose/access/export/deletion/anonymization contracts;
- audit retention;
- support diagnostics without direct database editing;
- runtime logs/metrics/correlation IDs;
- incident/rollback runbook.

### R11 — External certification closure (Phase 17)

Adyen physical/test environment:

- success/capture;
- **decline — already physically demonstrated; record evidence**;
- timeout/`UNKNOWN`;
- `TransactionStatus` recovery;
- cancel/abort + final-state verification;
- referenced full refund;
- referenced partial refund if supported by GoSpots scope;
- duplicate webhook delivery;
- late refund failure/reversal correction;
- final reconciliation against GoSpots check/payment/ledger state.

Polish fiscal/KSeF when marketed:

- supported fiscal printer/provider issue/outage/retry/reconcile;
- KSeF TEST;
- DEMO/pre-production where applicable;
- FA(3) payload;
- KSeF number/UPO;
- duplicate/UNKNOWN/correction paths;
- applicable offline/special-mode behavior;
- accountant/tax/legal sign-off on marketed behavior.

Physical venue drills:

- Edge restart/reconnect;
- KDS + printer routing;
- inventory receive -> sale -> waste -> stocktake;
- full opening/busy shift/day close;
- no shadow POS/spreadsheet for core workflow.

### R12 — Release-candidate whole-product test

On one immutable RC SHA, run the complete blocking campaign:

1. frozen install/generate/lint/typecheck/build;
2. complete API unit/integration/invariant suite;
3. complete web tests;
4. Edge tests/build;
5. clean DB migration;
6. historical upgrade migration;
7. DB schema/invariant assertions;
8. full browser E2E for billiard, restaurant and mixed venue;
9. multi-tenant/security suite;
10. idempotency/concurrency/replay suite;
11. payment/refund/cash/ledger reconciliation;
12. reservation/deposit reconciliation;
13. inventory conservation;
14. stored-value/benefit conservation;
15. Offline Lite + Edge outage/replay;
16. analytics reconciliation and scale;
17. automation/AI safety;
18. dependency/security audit;
19. DR backup/restore;
20. performance/SLO campaign;
21. production builds and release packaging.

Any `S0` or `S1` defect resets the affected certification evidence after the fix. Evidence from an older SHA cannot be reused blindly for changed behavior.

### R13 — Staging dress rehearsal

Use a production-like isolated environment, not live production, for destructive/failure testing.

Rehearse:

- fresh organization onboarding;
- staff/user setup;
- full opening shift;
- busy billiard workload;
- restaurant/KDS workload;
- mixed venue workload;
- reservations/deposits;
- cash/card/refund;
- inventory;
- outage/recovery;
- day close;
- reports/reconciliation;
- backup/restore;
- rollback.

No manual DB corrections are allowed during the dress rehearsal. Any required DB edit means the workflow is not production-ready.

### R14 — Design partner and limited-production canary

Release progression remains:

`Internal -> Design partner -> Limited production -> General Availability`

Design partner acceptance:

- real operator uses GoSpots for a complete operating day;
- support observes but does not replace missing workflow with spreadsheet/manual DB edits;
- all financial totals reconcile;
- all incidents are recorded;
- no S0/S1 defect remains.

Limited production:

- small controlled venue cohort;
- enhanced monitoring;
- rollback/feature-disable path ready;
- daily reconciliation review;
- provider/hardware exceptions tracked;
- defined exit criteria before expansion.

### R15 — Final Go/No-Go and GA release

GA requires:

- Gate P0–P17 matrix fully resolved for marketed scope;
- all S0/S1 defects closed and re-tested;
- explicit disposition for every S2/S3 item;
- final CI green on the exact RC SHA;
- final DB migration/upgrade/restore evidence;
- final security/performance evidence;
- final external certification evidence for marketed providers/hardware/compliance;
- full pilot-day evidence;
- exact source-traceable production deployment;
- production health/log/metric verification after deployment;
- rollback procedure proven and release owner sign-off.

---

## 5. Phase-by-phase re-audit map

| Phase | Domain | Mandatory re-acceptance question |
| ---: | --- | --- |
| 0 | Baseline / standalone reset | Is there one current standalone architecture with no superseded runtime dependency? |
| 1 | Tenancy/auth/permissions/integrity | Can no user cross tenant/venue boundaries or bypass server authority? |
| 2 | Venue setup | Can a new venue reach an operational floor without DB edits? |
| 3 | Live operations | Can a busy gaming floor run for hours without timing/occupancy ambiguity? |
| 4 | Commercial core | Does all venue revenue reach one GuestCheck/settlement/ledger authority? |
| 5 | Money/fiscal | Can no money workflow create a silent unreconciled discrepancy? |
| 6 | Restaurant/bar | Can one complete shift run without a second POS? |
| 7 | Inventory | Is every stock change explained by immutable movement? |
| 8 | Reservations | Can booking/deposit/arrival/cancel be traced without spreadsheet reconciliation? |
| 9 | Customer value | Can financially valuable benefits never double-spend or duplicate on retry? |
| 10 | Workforce | Can the owner identify who performed every high-risk action? |
| 11 | Access | Does every entitlement trace to a valid GoSpots commercial/customer fact? |
| 12 | Offline/Edge | Do certified critical operations survive outage without silent duplication? |
| 13 | Multi-location/integrations | Do integrations extend GoSpots without becoming a core dependency? |
| 14 | Analytics | Does one business event produce the same totals everywhere? |
| 15 | Automation/AI | Is AI never the sole authority for a financial/operational fact? |
| 16 | Production hardening | Can operators diagnose main failures without manual DB surgery? |
| 17 | Pilot/go-live | Can a real venue run a complete day with certified marketed dependencies and no shadow POS? |

---

## 6. Required evidence pack

The readiness program must leave durable evidence, not chat-only conclusions:

- `full-system-requirements-matrix.md` — every Phase 0–17 requirement and current disposition;
- `gap-register.md` — all S0–S3 gaps with owner, fix PR and acceptance evidence;
- `ui-api-surface-matrix.md` — route/endpoint/action coverage;
- `financial-reconciliation-evidence.md`;
- `external-certification-matrix.md`;
- `hardware-certification-matrix.md`;
- `security-performance-dr-evidence.md`;
- `pilot-day-report.md`;
- `go-no-go-checklist.md`.

CI should link the machine-generated evidence/artifacts for the exact release SHA wherever possible.

---

## 7. Execution rules

1. Audit first; do not rewrite mature code merely because a newer roadmap exists.
2. Fix the earliest/most severe broken invariant before cosmetic gaps.
3. One canonical authority per business fact.
4. Every bug fix adds a permanent regression test.
5. Every external call has explicit timeout/unknown/reconciliation behavior where state can become ambiguous.
6. No production claim based solely on mocks when the master plan requires real provider/hardware evidence.
7. No destructive failure drill directly against live production unless explicitly designed as a safe production game-day.
8. Every PR states source requirement, invariant affected, migration impact, tests, rollout, rollback and acceptance proof.
9. Every merged change is re-verified on `main`; production is checked after deployment.
10. Do not declare GA until the final Go/No-Go matrix is complete.

---

## 8. Immediate first execution batch

The first batch after approving this roadmap should be:

1. create the Phase 0–17 full requirements matrix from the master plan and current repository;
2. audit open/stale PRs and resolve PR #7;
3. enable/propose repository branch protection and required CI policy;
4. update Phase 17 evidence for the real Adyen decline result;
5. inventory every web route/API endpoint/background job/feature flag/role;
6. compare those surfaces with tests and produce the first concrete gap register;
7. fix all discovered S0 items before proceeding to broad UX/feature gap work;
8. then execute R2–R15 continuously until Go/No-Go.

This sequence turns the request to "test everything" into an auditable release program: every requirement, surface, invariant and external dependency gets a recorded status and a reproducible acceptance proof before General Availability.

# GoSpots Wave 1/2 — local unpushed checkpoint (2026-10-12)

**Parent:** `57cd0b1cfed036a69641219c1ae56e0ff78d3352` · **branch:** `agent/gospots-payment-integrity-20261009` · **PR:** #103 (draft). This batch is **NOT PUSHED**, not CI verified, and not production deployed.

## T-003 changes

Reservation reminders query the venue's authoritative IANA timezone (using `loadShopVenueTimeContext`) once per distinct shop in each cron phase; calendar date links and the reminder clock use that timezone. Clock labels include a UTC offset to disambiguate DST overlap. No business state transitions or cron locks changed. Added focused tests for cross-midnight, DST repeated hour, host timezone independence, and per-shop lookup memoization. Existing staff/public reservation notification email tests remain preserved. Actual email transport and calendar-client delivery still need a controlled staging test.

PR #95 disposition: retain the concept of explicit timezone conversion, **reject** viewer/device-local authority and lenient DST gap/overlap behavior; the newer `venue-booking-datetime.ts` is venue-authoritative and rejects ambiguous/nonexistent local instants. Do not merge PR #95 blindly. Preserve any non-timezone independent improvements only after separate diff review.

## T-006 changes and rollout

Nested `withTenantRls` reuses an active Prisma transaction **only** for exactly the same shop and privilege mode. It performs no nested `SET LOCAL`. Cross-tenant and privilege-mode transitions reject before executing SQL. This prevents concurrent siblings from observing another tenant/mode inside a shared transaction. Added tests for concurrent nesting, blocked bypass/system/public_insert, missing context, and exception cleanup. Incomplete external request identity cannot be fixed merely by SQL context reset.

**RLS production is unchanged and default OFF.** The existing `app_tenant_rls_ok` SQL function is fail-open if `app.rls_mode` is empty. The separate staging-only fail-closed candidate and verification SQL remain a **proposed migration**, never part of automatic Prisma migrations. Before any enablement: ensure an unprivileged app role cannot opt into `bypass/system`; inventory all cron/outbox/webhook, migrations, anonymous/read-only, SSE, exports, admin operations; use explicit transaction-local context and verify pool turnover; dedicated elevated principals with audit; run disposable PG17 negative/positive matrices and independent review. Fail if mode missing on restricted tables. Never put privileged app claims or user-controlled shop IDs into DB GUCs. Check rollback/incident path and acceptance before a staging soak.

## T-002 evidence preserved

Last published SHA had 521/521 Jest, 24/24 strict browser E2E (no flaky), 28/28 PostgreSQL refund concurrency assertions, 11-table tenant RLS, persisted financial assertions, migrations, and security gates. This batch does **not** modify checkout/payment production code. Software acceptance evidence still needs final reviewer signoff; physical Adyen capture/refund/terminal certification, merchant/payout and bank matching are external T-007 work.

## T-004 read-only identities

Vercel project `gospots`: `prj_PmFKwRunLljNrVI6vfeHFeXFXvqa`. Render workspace `venue flow` (Anas) contains **two** main-following GoSpots services: `gospots-api` (`srv-d87icpt7vvec7393j1r0`, Oregon, https://gospots-api.onrender.com) and `GoSpots` (`srv-d87i0m67r5hc73fl1fpg`, Frankfurt, https://gospots.onrender.com). Neon `Gospots` project `mute-butterfly-69488238`, PG17, primary `br-lucky-wave-aln8lhk8`, endpoint `ep-green-feather-al0r5imu` (eu-central-1). Vercel has `API_PROXY_TARGET`, `NEXT_PUBLIC_API_BASE_URL` and branch/production-scoped `DATABASE_URL` / `DATABASE_URL_UNPOOLED` keys (VALUES NOT READ). **Runtime Render→Neon, frontend→API, and Adyen merchant/webhook identity not yet cryptographically established.** Compare **secret-free connection fingerprints** supplied by infrastructure owners, not secret values. Never substitute Edulytics or Nexosophy services.

## Staged test gate (not yet executed in full repository)

1. Verify a clean checkout at the exact parent and apply `apply_batch.py` (fails closed on mismatched anchors). Review `git diff --check` and `git diff`.
2. Run focused Jest `tenant-rls.util.nesting.spec.ts` and `reservation-reminders.timezone.spec.ts` using repo's pinned toolchain, then web timezone tests.
3. Run API typecheck, changed-file ESLint, 521+ Jest baseline, PG17 migrations + disposable DB assertions, general browser 24+ and strict Phase17 browser 24+ with `--fail-on-flaky-tests`, all security workflows.
4. Keep T-002/T-003/T-006 formally unsigned until exact new-SHA CI and human reviewer acceptance. Do not push until explicitly authorized; no main merge or production deployment.

## Wave 2 external inputs

T-007: authorized Adyen **test** company/merchant account IDs, terminal model and test asset (not API key in chat), webhook receiver route/allowlisting and provider test merchant setup; sanctioned physical capture/decline/timeout/refund and bank/report reconciliation. T-008: Polish accountant and fiscal-device/KSeF integrator signoff, sandbox tax scopes and vendor test credentials provided only through secrets manager, fiscal receipt/correction and KSeF error/queue contract review. Both remain outside software CI certification.

### 2026-10-13 — ACTUAL repository checkout and disposable-DB pre-push verification (supersedes earlier local-blocked statements)
- Isolated Vercel development sandbox `gospots-wave1-20261013` checked out full `EIAS79/GoSpots` at exact parent `57cd0b1cfed036a69641219c1ae56e0ff78d3352`. Clean before applying; 23 engineering plans intact. Exactly 12 intended local paths changed; no push, merge, production deploy or release-marker modification as of this record.
- Actual repository API Jest after test-harness corrections: **113/113 suites, 536/536 tests PASS**. Changed production and new spec ESLint: **PASS**. API production build: **PASS**; `tsc --noEmit -p tsconfig.build.json`: **PASS**. Full `tsc --noEmit -p tsconfig.json` is **NOT GREEN** due to seven existing unrelated Prisma script diagnostics in untouched `prisma/phase9*` / `prisma/phase10*` files. Do not call the entire TypeScript tree clean.
- Disposable LOCAL PostgreSQL **18.6**: fail-closed SQL candidate verified missing-context deny, shop A/B isolation, unprivileged system/bypass denial, rollback/reset. Actual Prisma `withTenantRls` nested transaction integration verified matching context, concurrent cross-tenant/mode rejection before SQL, pool reset and exception rollback. This is NOT 17.x CI validation. RLS production setting unchanged and default off; both candidate SQL documents are **not migrations**.
- T-003, T-006 updated software paths are locally implemented and verified by Jest plus sandbox PostgreSQL, but **NOT exact-new-SHA GitHub CI** and **NOT signed software accepted**. T-002 application code unchanged; previous published SHA provider/refund/28-assertion evidence stands. T-004 GoSpots Render services identified with Vercel/Neon metadata; deployed database and Adyen merchant identities remain unproven without non-secret runtime fingerprint / external identity review. Keep formal ticket acceptance pending.
- Existing 7 nonproduction Prisma TypeScript errors are documented legacy debt, not fixed or suppressed as part of this restricted 12-file batch. No financial transactions, infrastructure config changes or production data access occurred.

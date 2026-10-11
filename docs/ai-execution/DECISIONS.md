# GoSpots — Engineering Decision Log

## 2026-10-09 — D-001: Use verified-provider capture as sole generic card authority
Decision: the generic checkout payment endpoint records non-card tender; a MANUAL_CARD success requires internal captured-provider finalization with verified CAPTURED operation, exact amount/currency, matching shop and settlement. Preserve old stored MANUAL_CARD rows without rewriting them. Do not introduce a manual attestation endpoint in this fix.
Reason: generic caller could previously claim money paid with no provider capture. The existing Adyen checkout legitimately records MANUAL_CARD after capture; blocking its internal path would cause a captured-but-unallocated reconciliation incident.
Status: Implementation pending exact-head focused CI and provider regression. No schema migration proposed.

## 2026-10-09 — D-002: Deployment and data safety
Decision: no main writes, no production payments, no fiscal activity, no destructive database migrations and no Edulytics environment use. Source file `apps/web/vercel.json` disables non-main Git deployments; external Vercel account binding not verified and must be rechecked before production promotion.
Status: Follow release gate and user approval for main merge or deployment.


## 2026-10-10 — W1 checkpoint implementation decisions

D-003: Generic `MANUAL_CARD` HTTP payment creation remains prohibited. The six former browser smoke scenarios used forged card captures; replace only synthetic tender choices with `OTHER` and add an explicit HTTP 403/no-financial-state-mutation test. Real Adyen stays on provider-payment collection/reconciliation.
D-004: Claim `PaymentOperation.checkoutPaymentId` and reset reconciliation/error fields inside the same settlement transaction as the resulting successful Payment; a concurrent second claim must fail.
D-005: Shop-resolved IANA time zone is authoritative for reservation notification bodies, calendar href dates and email display. UTC date instants remain unchanged; DST-overlap output includes both offset labels. Public cancel messages retain original booking end.
D-006: At the generic low-level provider payment entry point, check a linked settlement belongs to the authenticated shop and currency matches before recording any provider operation. Add foreign-tenant and read-only role regressions.
D-007: This checkpoint does NOT certify production. Existing Phase17 production dependency high/critical advisories must be fixed in a separate, reviewed dependency change. PR #95 viewer-timezone work requires separate review. Feature branch Vercel may record CANCELED attempt; production release marker untouched.

## 2026-10-10 — security patch and tenant event decisions

D-008: Apply exact prepared `charCodeAt` control-character scan in `isSafeAppRelativeHref`, replacing lint-prohibited regex without weakening C0/DEL, traversal, protocol-relative, URL-origin and backslash rejection. Add direct unsafe-link regressions.
D-009: Security dependency changes use patched, verified npm versions and lockfile resolution through pinned pnpm 10.12.1: Next.js + eslint-config-next 16.3.8, Sharp 0.35.5, proxy-addr 2.0.8, source-map-js 1.2.2. No audit suppression, no force install. Existing moderate/low advisories are recorded and deferred to separate risk-managed work.
D-010: Provider checkout reconciliation must demonstrate captured finalization, decline/UNKNOWN safety, idempotent replay, amount mismatch, and reconciliation-required recovery; new Jest tests are separate from live Adyen terminal certification.
D-011: Reservation timezone acceptance covers actual staff/public services invoking venue-aware notification href/body and guest email rendering; DST repeated/skipped wall times must remain unambiguous.
D-012: Domain event outbox tenant identity is authoritative in envelope; reject any payload.shopId that contradicts it before enqueue, with positive and negative background boundary tests.
D-013: Local build uses an invalid-example host as API_PROXY_TARGET and dummy localhost DATABASE_URL for build/schema validation only. No external database/network payment actions. Docker absent, so migration and real integration remain blocked to GitHub Actions. Preserve production release marker and PR draft state; new GitHub push requires distinct approval.

## 2026-10-11 — Wave 1 continuation (proposal; unpublished)
- D-014: venue IANA zone, NOT visitor/device local timezone, determines customer/staff booking input. Reject nonexistent and repeated ambiguous DST times absent offset selection. Keep original UTC for unchanged historical edits. Do not cherry-pick PR #95 viewer-time conversion blindly.
- D-015: refund idempotency must also work after operation reaches REFUNDED; same key and reason replay original refund, changed reason fail; provider call must never repeat. Foreign settlement provider payment list responds 404, not silent foreign data.
- D-016: PG17 RLS testing uses seeded disposable DB and an unprivileged role under explicit environment marker. Tenant RLS stays production-default-off until independently reviewed fail-closed design, SQL/worker soak and signed risk decision.
- D-017: 23 original Venue OS plans are supplementary to P0–P17 and R0–R15, not newly 'completed' phases. Documentation commit imported locally only; future authorized checkpoint may integrate. Seven lower-severity production advisories remain separately tracked. No production certification from fake-provider E2E.

## 2026-10-11 — browser gate corrective decisions (not pushed)
D-018: CSRF guard remains mandatory. VenueGate rebind rotates csrf_token after navigation; browser fixture must await response before issuing a new mutation. Negative forged-header E2E (403 CSRF_INVALID, zero device writes) is required. Distinct repeat-run idempotency keys preserve fresh UNKNOWN capture while internal retries still reuse the same key.
D-019: Offline Lite must be validated against production Next build: dev-Turbopack compilation/hydration is not a valid certification of cached production assets. Original IndexedDB refresh and exactly-once assertions remain unchanged; one production-mode E2E PASS, full 24 production campaign pending. Do not infer a database-record-loss bug from the original blank image screen alone.
D-020: Next production `API_PROXY_TARGET` localhost guard stays intact. The temporary loopback gateway for local production testing routes API requests to the disposable localhost API without changing application config. No test gateway artifact is intended for Git commit.
D-021: No wave acceptance on 3/3 E2E06 and 1/1 E2E04 alone; full fresh DB production browser and exact new SHA CI are separate. Do not assert that 22/24 dev-suite failure is the final remote status. RLS default-off posture and seven moderate/low dependency advisories remain explicit open decisions.

## D-022 — 2026-10-11 local Wave1 verification resolved
The required full browser gate is no longer blocked: 24/24 permanent Chromium tests PASS against the same seeded PG17 database and production Next.js build. Separate repeatability: E2E04 1/1 prior + full-suite 1/1, E2E06 3/3 prior + full-suite 1/1. The CSRF fixture waits for venue gate bind completion while forged header still receives 403; no safeguard weakened. Canonical PG assertion keys follow unique per-run E2E06 operation and verify exactly one linked provider transaction. 28 independent connection refund assertions and 11-table tenant RLS assertions pass against same DB. Treat all as LOCAL evidence until exact GitHub SHA CI confirms.
D-023: Do not classify current non-gating ESLint debt as clean, and do not turn off lint or security rules. `.github/workflows/ci.yml` enforces changed API production source lint; full API repo lint debt report uses `continue-on-error`. Manual direct web booking ESLint and API test mock ESLint show preexisting React effect and `any` type debts for separately scoped cleanup. Keep seven lower-severity production advisories as separate follow-up; do not conflate them with zero critical/high current remote gate.
D-024: No ticket ACCEPTED merely because local fake-provider and RLS suites passed. External Adyen hardware/capture/refund, end-to-end outbound booking email/calendar, default-off RLS rollout and worker/export security require distinct evidence and review. Wave2 dependency order remains established; no invented external certification. Exactly 23 original Venue OS plans preserved from docs SHA `0a063496...`, and no production deploy or release-marker change.

## Final checkpoint pre-approval verification (local only; 2026-10-11)
- REQUIRED changed API production-source lint (payment-domain.service.ts and provider-checkout-refund.service.ts) `pnpm ... eslint`: **PASS / exit 0**. Web `tsc --noEmit`: PASS / exit 0. Direct optional/manual whole-file eslint debt remains separately OPEN (test mocks and pre-existing React effect-state patterns); no policy suppressed.
- Confirmed exact local/remote parent `5009e114aa4a408b9488934f611e0e1172425f55`. Exactly **15 tracked modified + 32 new = 47** paths. Exactly **23/23** original Markdown plans, **zero SHA differences and zero extra/duplicate files**. `pnpm-lock.yaml` and `apps/web/.vercel-release` unchanged. `git diff --check` PASS, simple new-code secret-pattern scan zero hits; no claim that scan replaces GitHub SAST.
- Local functional evidence: full production Chromium **24/24 PASS**, canonical PostgreSQL persisted assertions PASS, independent-connection refund **28/28**, 11-table tenant-RLS PASS, API Jest prior **521/521**, web production build/typecheck PASS and 115 migrations PASS. External certification and exact-head GitHub CI still missing. Only request authorization for ONE consolidated development branch push; do not merge, deploy production, or push additional checkpoints.

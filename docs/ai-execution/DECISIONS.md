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

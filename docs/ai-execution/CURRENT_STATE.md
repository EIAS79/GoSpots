# GoSpots — Current Engineering State

Updated: 2026-10-09 (code inspection; exact branch validation pending)
Repository: EIAS79/GoSpots
Main baseline: `b3e444e4deed5b9392c947f7d9b130a118897738`
Working branch: `agent/gospots-payment-integrity-20261009` (verify GitHub ref before resuming)
Wave: W0 baseline + safe W1 financial work
Current ticket: T-002 — manual-card boundary

## Verified from live GitHub
- Root `AGENTS.md` and `docs/ai-execution/` were missing at baseline; existing `apps/web/AGENTS.md` is retained untouched.
- Source includes API, web, Prisma and Edge Hub; main HEAD is the SHA above.
- Generic `POST /checkout/settlements/:id/payments` accepted `MANUAL_CARD` and posted `SUCCESS` without provider capture. Adyen finalization reused that service method.
- Vercel's checked-in `apps/web/vercel.json` sets non-main Git deployments to false and ignores main commits without `.vercel-release` changes. Actual Vercel account/project linkage remains unverified.
- GitHub `main` branch protection is disabled as of baseline check.
- Existing production Render/Neon/Adyen identities are NOT re-verified.

## Current engineering change
- Direct manual-card endpoint/service writes rejected for both owner and cashier.
- Verified-provider internal recording checks a tenant/settlement-bound CAPTURED operation with equal amount and currency before any payment/settlement update.
- Existing valid Adyen CAPTURED finalization is routed through that explicit method.
- Regression tests added for blocked direct calls, missing capture and amount mismatch.

## Proof level
- Phase 4 focused Gate P4 suite, migration assertions and API build passed at first branch SHA ff51896d4eaf700261f703810319662795b54bb5. Full CI reported two controller test failures because a synchronous exception was asserted as an async promise; regression assertion corrected in next branch commit. Final exact-head CI still pending; no local Node 24/pnpm repository install because sandbox cannot clone GitHub (DNS restriction).
- Do NOT call T-002 SOFTWARE_DONE until focused GitHub CI passes on the exact new SHA and integrated provider flow is confirmed.
- Physical capture/refund/fiscal/Edge pilot remains EXTERNAL_BLOCKED; no live payment operations performed.
- No production deploy, main merge, migration or Edulytics environment access authorized/performed.

## October 9 verification / release blocker
- First full API Jest: 480/482 tests passed, exactly two newly added controller assertions failed due to expect(...).rejects used on synchronous throw (not production execution). Corrected test semantics; re-run required.
- Phase 17 security audit detected 2 critical and 4 high production dependency advisories, including Next.js, proxy-addr, sharp and source-map-js; release remains NO-GO pending independent security remediation and re-audit.
- GoSpots Vercel project identified under eias79s-projects; branch Git push registered a CANCELED deployment attempt (no build/READY), proving branch build suppression but not eliminating deployment records.
- This is NOT proof of a certified card capture or general production readiness.


## W1 consolidated checkpoint — 2026-10-10 (commit represented by this file)

Branch: `agent/gospots-payment-integrity-20261009`, draft PR #103.
Parent SHA: `72ee6dc1791d0280426bad98dbdeedeb3d8b74cd`.
New checkpoint commit SHA: see `git rev-parse HEAD` / GitHub PR #103 head (cannot self-reference a SHA in the commit contents).
Current wave: W1; T-002 IMPLEMENTED/CI_PENDING; T-003 IMPLEMENTED/CI_PENDING; T-006 PARTIAL/CI_PENDING.
Remote update is authorized only for this one consolidated checkpoint. Never merge or deploy without separate approval.
Changed sources/tests and exact local evidence in `W1_2026-10-09_CHECKPOINT_NOTES.md`.
Local: archive checksum PASS, synthetic 24-file transform PASS, four time-zone checks PASS under three host zones, proposed TS fragments parse PASS. Complete repo lint, Jest, build, browser E2E: NOT RUN locally.
Earlier SHA: API 104/104 suites, 482/482 tests PASS; Phase 4 PASS; general CI and Phase17 browser E2E FAIL six manual-card test scenarios; Phase17 dependency audit FAIL (two critical, four high, ten moderate, three low).
Status cannot advance to ACCEPTED until exact-new-head green tests. No production Adyen, fiscal or database work performed.
Next: (1) exact-head CI/provider/regression and browser tests, (2) T-003/T-006 deeper matrix, (3) Phase17 dependency remediation.

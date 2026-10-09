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

# W1 checkpoint — GoSpots T-002/T-003/T-006 (2026-10-10)

Repository: `EIAS79/GoSpots` — draft PR #103, branch `agent/gospots-payment-integrity-20261009`.
Expected parent: `72ee6dc1791d0280426bad98dbdeedeb3d8b74cd`.
Current checkpoint commit: use this file's containing Git commit (`git rev-parse HEAD`); its exact SHA is also recorded by GitHub PR #103. A self-referential SHA cannot be embedded in its own commit.

## Scope of the consolidated checkpoint
- **T-002:** Retain generic MANUAL_CARD HTTP 403 and preserve Adyen provider endpoint. Browser fixtures previously posted synthetic card captures; replace with OTHER/CASH fixtures and add explicit HTTP 403 + no-payment-mutation negative. Make CAPTURED operation-to-successful-checkout Payment association and reconciliation reset atomic in the settlement transaction.
- **T-003:** Render staff/public reservation summaries, emails, and session-date links using the venue-resolved IANA timezone, including overlap/gap and UTC-midnight assertions. Public cancellation must display original booked window even when cancellation updates endsAt.
- **T-006:** Reject unscoped foreign-tenant or wrong-currency settlement identifiers at PaymentDomainService.startPayment; add denied-permission, read/write, refund, cancel and reconcile cross-tenant negatives.
- **Security:** Separate Phase 17 dependency remediation is required; this commit deliberately does not change dependency lockfiles.

## Evidence and acceptance
- Previous checkpoint SHA `72ee6dc...`: API 104 suites/482 tests PASS; Phase 4, 3, 7, Edge and standalone validation PASS. General browser E2E and Phase 17 browser tests FAIL (six scenarios each directly called generic MANUAL_CARD); Phase 17 production dependency audit FAIL.
- Before remote update: checkpoint archive SHA-256 verified; synthetic fail-closed 24-file transform smoke PASS; standalone Intl midnight/DST/fallback checks PASS under UTC, Honolulu, Tokyo; TypeScript fragment parsing PASS. These checks do NOT constitute full-repo builds or acceptance.
- After remote push, examine **exact new SHA** GitHub Actions: focused provider-capture/idempotency/negative tests, 482+ API regressions, six browser flows, venue-time DST links/email, tenant-denial tests, TypeScript/lint/web build, Phase 17 audit.
- T-002 = IMPLEMENTED / CI_PENDING (NOT ACCEPTED).
- T-003 = IMPLEMENTED / CI_PENDING (NOT ACCEPTED).
- T-006 = PARTIAL / CI_PENDING (broader RLS, IDOR, tenant background jobs and roles remain).

## External constraints and next three tasks
1. Confirm exact new SHA API Jest, web E2E, provider finalization, timezone, and tenant denial results; fix only if failures are proven; do not weaken verified capture firewall.
2. Complete broader T-006 permission/isolation matrix and T-003 end-to-end booking/email verification; audit PR #95 (browser timezone) separately.
3. Remediate Phase 17 high/critical production dependency findings and verify clean independent security gate; complete operator/physical payment terminal certification later.

Do not touch `apps/web/.vercel-release`, merge into `main`, or deploy. Feature branch pushes may create CANCELED Vercel deployment records. GoSpots production database, payment terminals and fiscal integrations were not used.

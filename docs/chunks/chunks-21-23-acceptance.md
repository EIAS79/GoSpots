# Chunks 21–23 Acceptance — Enterprise Ecosystem

This document records the repository acceptance boundary for Chunks 21–23. The pull request must remain **draft and unmerged** until the exact final head passes CI and review cleanup.

## Shared release rules

- Migrations are additive/expand-only and must deploy cleanly against an empty PostgreSQL database with `prisma migrate deploy`, `migrate status`, and `prisma validate`.
- Existing Shop tenant isolation remains authoritative. New tenant-owned integration and hardware tables use FORCE RLS with the existing tenant policy helper.
- Organization-wide reads are permitted only after verified `OrganizationMembership` checks; the service temporarily enters the existing verified RLS bypass for cross-shop reads and restores tenant mode in `finally`.
- `organizations_v1` and `integrations_v1` remain rollout flags rather than silently becoming production defaults. Hardware continues to use the existing `device_registry` gate.
- Secrets are never returned after initial issuance unless the API explicitly creates a one-time secret/token response. API credentials are stored hash-only; connector and webhook secrets are encrypted at rest.
- Durable work uses idempotency/dedupe keys and explicit retry/dead-letter or retry-budget semantics.
- Exact-head CI is the repository acceptance gate: API tests/build, migration dry-run, web tests/typecheck/build, and Edge tests/build must all succeed.

---

## Chunk 21 — Organization / multi-location

### Implemented

- `Organization`, `OrganizationMembership`, and `OrganizationShop` domain models and migration.
- Organization roles: OWNER, ADMIN, ANALYST, OPERATOR.
- Access modes: ALL_SHOPS and EXPLICIT.
- Create organization from an owned venue.
- Link another venue only when the actor directly owns that target venue.
- Organization venue metadata, shared-catalog inheritance/override foundation, and audited mutation paths.
- Owner-protected organization membership changes, including prevention of removing the final owner.
- Cross-location ledger analytics with explicit-access filtering and no aggregation across unlike currencies.
- Organization list exposes the private `dashboardKey` as `venuePath` when available rather than leaking/relying on the public slug for operational navigation.
- Operator UI under `/dashboard/[venuePath]/organization`, discoverable from Settings.
- Unit/security coverage for unauthorized group analytics, EXPLICIT shop filtering, private dashboard path selection, and audit recording.

### Acceptance evidence

- A non-member cannot read organization analytics.
- EXPLICIT organization users only receive analytics for venues where they also hold direct operational membership.
- Group reads do not permanently weaken the current Shop RLS session.
- Organization mutation roles are enforced server-side; UI availability is not treated as authorization.

---

## Chunk 22 — Integration platform + GoPOS boundary

### Implemented

- Connector installation model with provider registry and capabilities.
- Encrypted connector secrets and health state/error tracking.
- Durable integration jobs with tenant binding, idempotency keys, retries, dead-letter status, correlation IDs, and atomic worker claims.
- Stale PROCESSING job lease recovery so a worker crash does not strand a job indefinitely.
- Integration mappings and external-reference foundation.
- Hash-only scoped API credentials.
- Versioned scoped integration API under `/api/v1/integrations/v1/...`.
- Signed inbound connector webhooks with timestamp replay window, HMAC validation, event-ID replay detection, and payload-hash conflict rejection.
- Signed outbound webhooks with stable event IDs, retry/backoff, and dead-letter behavior. Delivery is intentionally at-least-once; receivers must deduplicate by the supplied event ID.
- Webhook URL baseline blocks non-HTTPS and literal localhost/private/link-local destinations before persistence/delivery.
- Demo connector for deterministic platform testing.
- GoPOS connector boundary that **fails closed** until licensed official API documentation and credentials are supplied. No private GoPOS endpoint or payload contract is guessed.
- Operator UI under `/dashboard/[venuePath]/integrations`, discoverable from Settings, covering installations, health checks, one-time scoped API credentials, signed webhook creation, queue visibility, and retry.
- Tests cover atomic queue claims, loser-worker behavior, tenant-bound installation enqueueing, private webhook target rejection, stale lease recovery, and the fail-closed GoPOS boundary.

### External verification still required

The repository does **not** claim a live GoPOS roundtrip. GoPOS execution remains locked by design until licensed official API access is available and the real adapter can be implemented and reviewed against those official materials.

---

## Chunk 23 — Hardware / printing / customer display / barcode

### Implemented

- Printer device configuration, print routes, durable print jobs, retry budgets, dedupe keys, and fiscal-semantic duplicate protection.
- Signed Edge Hub claim → printing → completion protocol tied to the registered Edge device and Shop.
- Atomic print claiming to prevent two Edge Hubs from winning the same queued job.
- Stale CLAIMED/PRINTING lease recovery; expired work is requeued while budget remains and failed when the retry budget is exhausted.
- Edge Hub cloud print worker integrated into the existing sync loop.
- Edge printer adapter boundary with TCP ESC/POS support plus deterministic in-memory/test execution.
- ESC/POS payload rendering with bounded payload size, printer initialization, optional cut, host/port validation, and fail-closed behavior for unsupported adapters.
- Customer display binding with one-time display token and hash-only persistence, POS pairing, snapshot updates, and public token-authenticated feed.
- Barcode alias upsert/resolve foundation.
- Operator UI under `/dashboard/[venuePath]/hardware`, discoverable from Settings, for printers, routes, failed-job retry, customer-display binding, and barcode aliases.
- API tests cover print claim races, retry/terminal completion semantics, unauthorized completion ownership, and lease recovery.
- Edge tests cover ESC/POS rendering, TCP adapter handoff, unsupported-adapter failure, cloud completion success, and cloud failure reporting.

### External verification still required

Repository tests use deterministic adapters/mocks. They do **not** claim validation against every physical printer model, USB/vendor driver, cash drawer, barcode scanner, or customer-display device. The implemented live printer transport is the TCP ESC/POS foundation; vendor-specific/USB adapters require hardware-specific validation before they can be marked supported.

---

## Final acceptance checklist

Before calling the repository work complete:

1. Confirm the PR is still draft, open, and unmerged.
2. Confirm the exact final head has one completed CI run with all four jobs green:
   - API lint · test · build
   - API migrate dry-run (ephemeral Postgres)
   - Web checkout + offline tests · typecheck · build
   - Edge Hub test · build
3. Confirm there are no unresolved PR review threads or blocking reviews.
4. Keep live GoPOS verification and physical-hardware certification explicitly marked external/unverified until those environments are actually available.
5. Do not merge this PR as part of the acceptance process.

# W2 T-009 — real PG17 pagination and isolated browser panel evidence

**Local test checkpoint only. NOT COMMITTED OR PUSHED.** Date 2026-10-16.
Base: `cffff99d50159402e91df4939f9df29cb47ef1a0`.
Branch: `agent/t009-pg17-browser-local-20261016`.
Worktree: `/vercel/GoSpots-t009-integration-20261016`.

## Real database integration
- Test: `apps/api/prisma/t009-incident-pagination.integration.ts`. Executes the **unchanged** `HardwareService.listPrintIncidents` implementation using PrismaClient against actual PostgreSQL **17.11**.
- Guard: `GOSPOTS_T009_DISPOSABLE_DB=YES`; exactly localhost `127.0.0.1:55447`, database name beginning `gospots_t009_`. No production URL.
- To minimize operations, each disposable database used a local PrintJob-compatible fixture table and enum types. **The complete application migration chain was NOT run by this fixture**; PG17 migrations remain independently certified on the published parent SHA.
- Two shops, 137 uncertain jobs per shop plus ordinary failures/successes; 138 original qualifying jobs in shop A including a pending late-success job. **49/49 assertions PASS** on final run.
- Verified bounded pagination, >100 records, timestamp/id stable order, no duplicates for a stable dataset, valid tenant filter, invalid/malformed/foreign cursor rejection, exclusion filters, payload/fiscal-key omission, redacted stored errors, overlapping status mutations and reads, and late-success disappearance.
- Confirmed expected **non-snapshot** behavior: a previously successful older job becoming uncertain after the cursor passed its key is missed by continuation but reappears on a fresh first-page read. This is not a historical incident ledger.
- Disposable databases `gospots_t009_integration` and `gospots_t009_integration2` were dropped after verification; `pg_database` returned zero `gospots_t009_*` databases. PG17 local server was stopped; port 55447 is no longer accepting connections.

## Dedicated browser acceptance
- Test-only React mount: `apps/web/e2e/fixtures/t009-hardware-mount.tsx`.
- Playwright Chromium suite: `apps/web/e2e/integrity/t009-hardware-incident-panel.spec.ts`. **6/6 PASS**.
- Actual `HardwareWorkspace` component, with locally intercepted API responses: authorized-view fixture, forbidden-response behavior, loading/empty/failure/retry, 137 records and Load more with duplicate suppression, uncertainty and redacted errors, printer-management controls, quarantined retry exclusion and UI refresh after simulated original-Edge late success.
- **Limit:** Browser suite intercepts local API calls. It does not certify live JWT transport, full Next.js tenant gate, real API-to-browser integration, actual printer/KDS output or production runtime identity. Negative JWT/permission behavior is independently exercised in the focused API Jest suites. No print was attempted.

## Focused regression and builds
- Hardware/API Jest: **5 suites, 39/39 PASS**.
- Edge printer and cross-device safety Node tests: **16/16 PASS**.
- API production TypeScript/build: PASS.
- Web TypeScript: PASS.
- Webpack optimized production build: PASS using a command-scoped, nonroutable API proxy placeholder. The ordinary local Turbopack path has a known inherited cross-worktree `node_modules` symlink blocker; not claimed as passed here.
- Default ESLint for all new API and browser test files: PASS. `git diff --check`: PASS.
- This checkpoint is **not GitHub exact-new-SHA certified**, because no commit or push is authorized.

## Future policy-dependent work — not implemented
Incident-read-only RBAC, append-only incident history, operator evidence, supervisor resolution and dual approval, independent physical-output authorization, fiscal receipt copy/reissue procedure, actual hardware/Edge restart drills and owner operational acceptance remain OPEN. All T-002/T-003/T-004/T-006/T-007/T-008/T-009/T-010/T-011 owner signoffs remain unchanged. No product, schema, payment/fiscal, Edge dispatch, or runtime configuration change.

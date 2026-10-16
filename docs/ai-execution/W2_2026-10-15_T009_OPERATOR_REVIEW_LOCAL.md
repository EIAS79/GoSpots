# W2 T-009 — Local operator print-incident inspection checkpoint

Date: 2026-10-15. Local branch: `agent/t009-operator-readiness-local-20261015`.
Published parent: `be7d6f24feb36b6ed6dabddf935efd51511ce392`. NOT COMMITTED OR PUSHED.

## Narrow software delta

- `GET /hardware/print-incidents` requires JWT and existing `shop.manage` permission.
- The API derives venue scope from the authenticated JWT, requires the existing device registry feature, and selects only incident metadata. Printable payload, dedupe and fiscal correlation keys are not returned.
- Only `CLAIMED`, `PRINTING` or legacy `FAILED` jobs with `EDGE_PRINT_OUTCOME_UNKNOWN` or `EDGE_PRINT_LEASE_EXPIRED` errors are shown, oldest-first, with keyset pagination: default 25, maximum 100 records per page, plus a next-page cursor and hasMore.
- The existing hardware workspace displays original Edge, printer, source, claim/printing times and uncertainty reason. No resolution or printer command is exposed by this new endpoint.
- Existing backend claimed-print retry protections, original-Edge late acknowledgment and stale-lease quarantine are unchanged.

## Unresolved engineering and policy decisions

- A durable append-only operator resolution/audit aggregate is absent; late success currently clears the transient uncertainty reason. The current inspection list is not a historical incident ledger.
- Owner must approve role scope, evidence requirements, allowed decision outcomes, dual approval thresholds, retention, and whether/how confirmed-not-printed output can become a distinct authorized job.
- Fiscal/INVOICE output must follow approved fiscal provider and accountant procedure; no generic reprint.
- The active review surface can load all incident pages; a durable historical incident archive and audit records remain follow-up policy/software gaps.
- Read-only inspection is not physical printer, provider, legal, or W2 acceptance. Run device/LAN/Edge outage drills with venue and fiscal owners before signing P12/R7.

## Evidence boundaries

Focused Jest includes controller permission metadata, negative role check, venue-scoped query, no-write inspection and payload-exclusion checks. API production and web typechecking must remain independently logged. Existing exact-head published CI at the parent SHA is historical evidence, not CI certification of this uncommitted delta.

## Local validation results (2026-10-15)

- API focused Jest: 4 suites / 27 tests PASS (includes existing cross-device and recovery tests, plus read-only incidents).
- Edge isolated printing: 16/16 Node tests PASS; no Edge source changes.
- API `tsc --noEmit -p tsconfig.build.json` and `pnpm --filter @gospots/api build`: PASS.
- Web `pnpm --filter @gospots/web typecheck`: PASS.
- Default API lint: controller and new tests PASS; service FAILS on 53 pre-existing Prettier findings, exactly matching the 53 found on the published parent file. No newly introduced formatting or semantic findings; no lint config changes.
- Default web component ESLint: PASS after narrowly restructuring asynchronous initial fetch with cancellation protection; no lint rule disabled.
- Web default Turbopack production build: BLOCKED by inherited cross-worktree node_modules symlink; local Webpack production build PASS using non-routable api.example.invalid command-scoped placeholder. No runtime target was deployed or changed.
- `git diff --check`: PASS. No live printer, fiscal, payment, email, database or deployment operation. No exact-new-SHA GitHub CI because files remain uncommitted.

## Supervisor-required corrections — final local verification

- The list now returns `{ items, hasMore, nextCursor }` with `take` default 25 / maximum 100. A `take + 1` read discovers additional pages. The cursor contains a bounded, validated, shop-bound `(createdAt, id)` key; the query uses shop-scoped keyset predicates with the unique ID as a deterministic tie-breaker.
- The frontend has real load-more navigation and distinct loading/error/empty states; previously loaded incidents remain visible after a failed later-page request. No resolution/reprint control was added.
- Focused Jest pagination simulation covered 137 matching records (including 120 sharing an identical timestamp), four 40-record pages, no duplicates or omissions, invalid/mismatched shop cursors, one record, page bounds, permission denial and read-only selection. This is mocked Prisma query evidence, NOT a live PostgreSQL pagination integration test.
- A successful original Edge callback changes the job to SUCCEEDED and clears the active uncertainty marker; it is correctly omitted from this active list. The PrintJob still retains identity, claim timestamp, original Edge and printedAt, but neither the previous incident reason nor a durable operator decision history exists.
- API full-file default lint has 53 Prettier findings before AND after this patch, confirmed against the parent SHA source. Changed controller and the new spec file have zero default lint findings. No newly introduced API lint violation; fixing unrelated historical service formatting would enlarge this otherwise bounded review.
- Default web file lint: zero findings after replacing the synchronous effect-triggered load callback with an asynchronous, cancellation-aware initial read.
- Web default Turbopack build fails due an inherited worktree node_modules symlink outside Next's filesystem root. The production Webpack build passes using a non-routable, command-only API proxy placeholder. Neither build contacts a real backend or alters deployment configuration.
- External operator audit/resolution policy, physical printer certification, provider evidence, and independent security acceptance remain open. No acceptance status changed.

# W2 T-009 P0 — Local hardware-response security hardening

Date: 2026-10-16. Base development SHA: `2dbe02c2316e69951b1661fff92bbcb7507c7820`.
Local branch: `agent/t009-p0-security-local-20261016`; worktree: `/vercel/GoSpots-t009-p0-20261016`.
**LOCAL ONLY — no commit, push, merge, deployment or external signoff is authorized.**
This is a bounded checkpoint, not an amendment of the completed T-009 certification or an operational acceptance.

## Implemented scope
- Preserve JWT, `SHOP_MANAGE`, authenticated `shopId` filtering, device-registry gating, incident status classification and `(createdAt, id)` keyset pagination.
- `GET /hardware` now uses explicit, minimal Prisma selects for recent PrintJobs, printer configurations, routes and display bindings. The PrintJob select and explicit response mapper exclude `payload`, `dedupeKey`, `fiscalSemanticKey`, creator identity, route linkage and Edge execution fields not needed for the existing hardware workspace. Printer capability JSON and display binding tokens, hashes and snapshots are not returned by the overview.
- The existing workspace continues to receive printer connection information and required recent-job fields; it can display statuses, source references, attempts and approved retry controls.
- Client-facing `lastError` and `lastErrorCode` values are restricted to allowlisted, standardized safe messages and approved reason codes. Unexpected arbitrary error codes and raw provider errors are replaced with `PRINT_ERROR_REVIEW` / generic operator guidance. The printer-configuration error is also sanitized. Persisted database diagnostics and domain retry/print decisions are **not** modified.
- The hardware UI additionally refuses to display arbitrary incident/overview/server-response error text, including older or mismatched backend versions. Its existing uncertainty warning and no-auto-reprint behavior remain.
- Incident results have an explicit metadata-only response mapping as defense in depth, with no writes, payloads, fiscal keys or retry/resolution functions.

## Separate incident-view permission — design only, not enabled
The existing incident `GET` and broad hardware management share `SHOP_MANAGE`. The manager core permission set intentionally excludes it; no current permission or role grant is changed.
Proposal for owner and security review: register `hardware.print_incident.read` as a **read-only** permission, expose only minimized incident metadata, and initially leave all role assignments unchanged. An approved migration would temporarily accept existing `SHOP_MANAGE` **or** the new explicit permission for the incident GET only; keep configuration/retry `SHOP_MANAGE`-gated. Implement a separately approved staff rollout after ownership and negative RBAC testing. This is NOT part of the current code change.
Owner policy decisions: which venue roles may see which IDs/metadata, audit logging for reads, whether staff should see source references or device addresses, and the grant migration/rollback procedure.

## Future audited resolution phase — NOT implemented
Five separate gates must exist: (1) read-only incident viewer; (2) operator-submitted physical evidence with actor, reason and time; (3) independent supervisor decision using append-only incident events and compare-and-set concurrency; (4) a distinct, explicitly authorized physical print action, not requeue of the uncertain original; (5) fiscal/accountant approval and duplicate fiscal receipt safeguards. Preserve original Edge late callbacks and quarantine after restart. Operations, security, printer vendors and fiscal owner must approve evidence standards, separation of duties, concurrency semantics, retention, escalation and rollback **before** implementation.

## Local verification and limitations
- Focused API unit tests exercise overview tenant filters, exact projection and safe output mapping, printer/display projection exclusions, credential/token/URL/PII diagnostics, uncertain/preflight codes, role denial, incident metadata privacy and existing pagination/late-ack/recovery regressions.
- API production TypeScript and build pass; required changed-API semantic lint passes. The historical service default Prettier debt is not an authorized whole-file cleanup.
- Web TypeScript and default component ESLint pass; command-scoped Webpack production build passes. The default local Turbopack build remains blocked by the existing cross-worktree `node_modules` symlink; **this local branch has no GitHub CI**.
- Edge printing safety tests remain unchanged and pass. No live PostgreSQL pagination concurrency or dedicated browser incident-panel test has been run.
- Print retry, Edge claim/completion, stale-lease quarantine, fiscal semantics, migrations, schema, production RLS, provider integrations, config/lockfiles and CI workflows are unchanged.
- Outstanding independent T-002/T-003/T-004/T-006/T-007/T-008/T-009/T-010/T-011 owner acceptance remains OPEN. The prior 13/13 GitHub CI certification applies to the **parent** published SHA, not this uncommitted local delta.

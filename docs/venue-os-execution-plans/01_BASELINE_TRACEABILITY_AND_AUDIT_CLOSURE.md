# 01 — Immutable Baseline, Full-System Inventory and Audit Closure

**Classification:** `CONFIRMED_FINDING` + `CURRENT_PROOF_MISSING` | **Priority:** P0 | **Maps to:** P0–P17, R0/R1/R9/R15.

## Problem and precise observed state

The 2026-10-09 inspection saw GitHub main `b3e444e4deed5b9392c947f7d9b130a118897738`, ~1,441 tracked files in the recursive tree, 115 Prisma migration SQL files, 27 `.prisma` files, ~132 conventionally recognized tests and passing sampled GitHub checks. **Not all files were individually read**; test count is by filename convention. A source tree and green CI are not a full product certification. Main branch protection was not enabled. The R roadmap's twelve exact consolidated acceptance outputs did not exist in the inspected main tree. Historical P3/P10/P16 notes disagree with later completion summaries. Four PRs #7/#92/#95/#100 were open and need diff-based disposition; some may already have equivalent functionality on main.

Vercel: latest production attempt at head was canceled, while previous production deployment was READY; only `render.yaml` differed from prior Ready SHA. This is compatible with a deliberate release gate; **not proof of downtime**. Connected Render workspace lists other projects, not GoSpots; production API SHA, Neon migration state and Adyen webhook target remained unverified. `.pl` domain behavior disagreed with deployment docs. Tracked `apps/api/prisma/dev.db` was not content-inspected and both `pnpm-lock.yaml` and `package-lock.json` were tracked.

## Implementation tasks

### A. Freeze the baseline without causing deploy noise

1. Record main and intended RC SHA, branch protection/rulesets, latest required checks and owners; name a stable RC tag without assuming last successful Vercel build equals main.
2. Establish one matrix of canonical deployed revision by surface: GitHub API/web/Edge code, Vercel active alias→deployment→commit, actual GoSpots Render API→commit, production Neon project/branch/migration head, allowed Adyen merchant environment, terminal and verified webhook host. Read-only first. Record **credential fingerprints/identifiers only, never secrets**.
3. Confirm `apps/web/vercel.json` `.vercel-release` ignore policy. Disable incidental Vercel previews while allowing relevant GitHub unit/DB/security tests; promotion requires explicit review and rollback.
4. Review open PRs by comparing their patches and release proofs against `main`: PR #100 session timing, #95 timezone, #92 Adyen decline evidence, #7 zone add-on. Choose merge/rework/close/superseded with written rationale; no blind merge.
5. Resolve Polish `.pl` host's product contract: independent Polish site vs redirect to `.eu`. Test canonical URL, cookie origin, login callback, payment return and SEO tags accordingly.
6. Inspect tracked development DB for customer PII/secrets using approved restricted access. If sensitive, incident response/secret rotation and appropriate Git-history remediation review; if synthetic, untrack future binary changes and document disposal. Prefer one canonical pnpm lockfile based on executable package-manager config; only remove `package-lock` if no supported consumer needs it.
7. Protect main with PR checks, reviews and no force push; allow documented emergency hotfix path and subsequent audit.

### B. Produce a reproducible evidence graph

For every master P0–P17 atomic requirement, generate ID (`P05-...`) and record `{model, invariant, code_path, HTTP_path, UI_path, mobile/tablet_offline_path, permission, feature_flag, event/audit, test, provider/device_proof, owner, severity, current_status, environment, SHA}`. An unverified item is a gap-register entry, not assumed complete. Inventory **all** controller decorators, DTO validation, Prisma models/migrations/constraints, server queues/cron, events/webhooks, page routes/API proxies, UI handlers, Edge commands/devices, roles and third-party integration points.

Automate extraction only as a starting inventory. Manually link each action to canonical business authority and user role. For every mutation verify tenant source, auth, idempotency, transaction boundaries, concurrency versions, audit record, external side effects and recovery. For read/search/export verify tenant leakage, redaction and consistency. Discover dead routes, LEGACY/DUPLICATED implementations, uncalled code, zombie feature flags and abandoned schema fields.

### C. Reconcile existing plans rather than rewriting history

Use Phase master as requirement definition; R0–R15 as certification process; this new packet as gap deepening. Preserve historical dated acceptance reports; add one living `current-rc-acceptance-status.md` marking historical pass vs revalidated exact RC. Create the twelve R program files (see Plan 18) with links to test logs and signed human evidence.

## Negative/adversarial test requirements

- Verify an API command not visible in UI is still correctly permission-protected.
- Verify an unreferenced route/worker/webhook cannot modify money/tenant state.
- Exercise newest migration on both empty PostgreSQL 17 and an anonymized, production-shaped upgrade copy.
- Confirm web build-ignore not treated as regression, and a real promoted web release corresponds to its intended SHA.
- Restore last-known-good release with no data corruption after schema-compatible rollback; document incompatible migration recovery.

## Exit gate

100% of P0–P17 atomic requirements and runtime surfaces inventoried; no S0/S1 unowned; all risky PRs dispositioned; GoSpots deployment chain verified; branch rules active; 12 R deliverables assigned and created (initially `NEEDS_TEST` is acceptable during work); architecture/domain-authority map signed by tech owner. **Do not claim this gate based on writing planning documents alone.**

## Required artifacts

`baseline-and-environment-inventory.md`, `open-pr-and-branch-disposition.md`, `full-system-requirements-matrix.md`, `gap-register.md`, `ui-api-surface-matrix.md`, `role-permission-capability-matrix.md`, `current-rc-acceptance-status.md`, `domain-authority-and-deprecation-map.md`.

## Source anchors

`apps/web/vercel.json`, `apps/web/next.config.ts`, `.gitignore`, root `package.json`, `apps/api/prisma/`, `docs/program/MASTER_EXECUTION_STATUS.md`, `docs/program/full-system-production-readiness-roadmap.md`, previous audit findings F01/F04/F06–F11.

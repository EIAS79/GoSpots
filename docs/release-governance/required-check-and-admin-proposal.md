# T-001 release governance — LOCAL PROPOSAL ONLY

**Base SHA:** `e79a87b39a974bf98d746716895e255e1f6f202e`.
**State:** uncommitted engineering proposal. No production check, merge rule, release,
signature, deployment or live GitHub setting has been created by these files.

## 1. Evidence contract

- `release-manifest.schema.json` describes a **candidate evidence record**, not
  a signed attestation. The repository/source tree is independently known; all
  environment/deployment/approval/DB/rollback evidence remains `UNVERIFIED` in
  `release-manifest.example.json`, whose decision is explicitly `NO_GO`.
- `validate-release-manifest.mjs --mode shape <file>` checks the JSON Schema
  subset supported by this dependency-free implementation.
- `--mode release` checks consistency and fails closed if required checks,
  approved merge candidate, deployment identities, database compatibility,
  backup/restore, independent reviews, rollback evidence or resolved blockers
  are missing. **It cannot authenticate provider references or signatures**.
  Only separately approved identity attestation and authorized sign-off can
  establish those claims. No automatic GO transition is implied.
- Artifacts are tracked by SHA-256 **when supplied**. Empty `artifacts` means
  no digest attestation and must not be reported as a verified artifact digest.
  Release owner must decide which artifact types are mandatory for each scope.
- A future immutable manifest should be stored outside its own PR with an
  independently generated digest, evidence provenance, signed decision reference,
  repository commit/tree, tested merge SHA, workflow run IDs/attempts/check IDs,
  actual deployment IDs, migration state and previous known-good rollback IDs.
  No signatures are created by this proposal.

Local usage:

```bash
node scripts/release-governance/validate-release-manifest.mjs --mode shape docs/release-governance/release-manifest.example.json
# MUST exit 1: NO_GO with deliberately missing external evidence
node scripts/release-governance/validate-release-manifest.mjs --mode release docs/release-governance/release-manifest.example.json
node --test scripts/release-governance/*.test.mjs
```

## 2. Stable GitHub required-check design (NOT installed)

**Proposed stable context:** `Release Governance / required-evidence`.

**Observed GitHub exact-SHA check-run identity** (certified commit
`e79a87b39a974bf98d746716895e255e1f6f202e`, GitHub API):

| Stable check-run `name` / branch-rule context | Workflow display name / path | Workflow ID | Check App ID |
|---|---|---:|---:|
| `API changed-lint · test · build` | `CI` / `.github/workflows/ci.yml` | 317852730 | 15368 |
| `Edge Hub test · build` | `CI` / `.github/workflows/ci.yml` | 317852730 | 15368 |
| `Phase 17 gate · security · migrations · reconciliation · DR` | `Phase 17 pilot certification and release gate` / `.github/workflows/phase17-validation.yml` | 338007141 | 15368 |
| `Phase 17 gate · full permanent browser release suite` | Same Phase 17 workflow | 338007141 | 15368 |
| `Phase 17 gate · release policy completeness` | Same Phase 17 workflow | 338007141 | 15368 |

These are **different identity layers**: a GitHub required-status context
matches the *job check-run name* and can bind an expected publisher GitHub
App ID; the visible workflow name is not a substitute for the check name.
The trusted publisher must additionally correlate actual check-run ID and
`app.id` to the owning Actions run, its immutable `workflow_id`, workflow
path, `run_attempt`, head SHA and event. The observed GitHub Actions App
ID **15368** is the source of the existing jobs, not the yet-to-be-approved
App for the new stable aggregator context.

**Path applicability is deliberately equal to current source triggers:**
`CI` has unfiltered `pull_request` events, so **both API and Edge jobs are
always applicable**. Phase 17 is path-filtered. The policy mirrors its eight
exact `on.pull_request.paths` entries:
`.github/workflows/phase17-validation.yml`,
`docs/acceptance/phase-17-**`, `docs/program/phase17-**`,
`docs/operations/PHASE17_**`, `apps/web/e2e/**`, `apps/edge/**`,
`apps/api/src/modules/**`, and `apps/api/prisma/**`.
**All three** Phase 17 jobs become required together whenever its workflow is
triggered: `release-integrity`, `pilot-e2e`, and `release-contract`
(the release policy completeness contract). Omitting the third job would allow
a policy-contract failure to pass the future aggregator, so it is included.

Thus an ordinary `apps/web/src/**` edit, an `apps/api/src/common/**` edit,
or `.github/workflows/ci.yml` edit does **not** require an absent Phase 17
check; it still requires both unconditional CI checks, plus the
independent CODEOWNER review for workflow/governance edits.
Other existing validation workflows remain active and unchanged. They are not
silently weakened by this proposed aggregator.

**Intentionally stricter future coverage needs new authorization first.**
Making Phase 17 mandatory on all `apps/web/**`, `apps/api/**`, or
`.github/workflows/**` would require widening the corresponding Phase 17
`pull_request.paths` (and assessing `push.paths`), validating trigger
behavior on actual changes, and only then changing this policy. Otherwise a
branch could be stuck on permanently pending required checks. Likewise the
current `ci.yml` and Phase 17 YAML lack `merge_group` triggers;
`merge_group_enabled` is explicitly **false** and local evaluation fails
closed for queue events. Merge queue must not be activated without approved
`merge_group: checks_requested` triggers and tested group-SHA reporting in
every mandatory workflow.


**Execution principal:** a trusted, separately administered GitHub App/check
publisher with read-only Actions/checks/PR metadata and write-checks permission
scoped to this repository; it emits the required check on the *actual tested
merge candidate* SHA. An ordinary PR workflow checked out from untrusted PR
source is **not** an acceptable sole authority for self-certifying itself.
GitHub administrator must configure the required context with its **expected
source app**. The App implementation, credentials and webhook endpoint are
**not included** here and require separate approval. Alternative: a
GitHub-native protected required-workflow configuration, if available to this
repository's plan, only after verifying check association and trusted workflow
version semantics. Do not invent entitlement.

Evaluation input must come from authenticated GitHub APIs, not PR-controlled
manifest fields. For the future trusted publisher, obtain read-only check-run
records with immutable `check_run.id`, `check_run.app.id` and check suite,
then correlate them to `workflow_run.id`, `workflow_run.workflow_id`,
`workflow_run.path`, `workflow_run.run_attempt`, `workflow_run.head_sha`,
event and repository. Confirm `run_attempt` is the **latest** attempt by
re-fetching runs/checks before publishing the decision; verify the check run
belongs to the exact reviewed head and tested integration candidate.
The local snapshot cannot prove any of these facts: its IDs and review objects
are freely editable test data, not authenticated claims. A JSON field
indicating a source App is not an authentication mechanism. Read PR head and base refs, changed paths (including renamed
files), newest run/check attempts, check producer identities, pending reviews,
and the **exact** GitHub-generated merge candidate. On merge-queue events,
evaluate `merge_group.head_sha` and publish on that SHA instead.
Re-read both refs immediately before publishing PASS; invalidate PASS when
the PR head, base, merge candidate or required workflow definition changes.
Use bounded retries for eventual-consistency errors, but **never pass on API
timeouts, missing metadata or stale snapshots**.

### Governance-test enforcement — currently NOT running in CI

**Current evidence:** `docs/release-governance/**` and
`scripts/release-governance/**` do not match Phase 17's existing event path
filters. The existing always-on `CI` workflow does not execute the local
release-governance validator or its test suites. Therefore the current minimum
policy's API and Edge checks cannot certify this governance implementation;
the **32+ local tests are advisory only** until an approved workflow change.

**Exact minimum future workflow change** (separately authorized; not made here):

1. Add a new **always-reported** `release-governance-tests` job to
   `.github/workflows/ci.yml` under its existing unfiltered
   `pull_request` and `push` events (do **not** add `paths` to CI).
   Give it a stable explicit check-run name, provisionally
   `Release governance · schema · tests · NO_GO`. It must run for *every* PR,
   including governance-only changes.
2. Use trusted checkout/Node 24 steps consistent with existing CI. Execute
   `node --check` for all four governance `.mjs` sources,
   `node --test scripts/release-governance/*.test.mjs`,
   `node scripts/release-governance/validate-release-manifest.mjs --mode shape
   docs/release-governance/release-manifest.example.json`, and
   `--mode release` against the same example while explicitly asserting
   **exit status 1**, `valid: false`, and both `NO_GO` and missing-review
   failures. A validator crash (exit 2), unexpectedly successful release
   verification, absent files, or any test failure must fail the job.
3. Verify the new job actually reports on pull requests, `main` pushes and
   governance-only file changes; obtain its **actual** context, workflow ID,
   App ID and relevant check-run ID from authenticated GitHub metadata.
   Only **after** this verification, amend the protected-base aggregator
   policy to require the new check for every PR. Never list its uncreated name
   as an already-enforced check.
4. Running tests on a PR's own source is **not independent proof** that its
   security policy is trustworthy. The future protected publisher must
   authenticate provenance, enforce independently owned policy versions,
   check reviewer authorization, and reject suspicious changes to governance
   tests or workflow definitions. CODEOWNER/independent review is necessary
   but not sufficient by itself to establish runtime check provenance.

**Optional stricter route** (requires additional separate authorization):
expand the Phase 17 workflow's `pull_request.paths` and applicable
`push.paths` to explicitly include these two governance directories,
verify Phase 17 actually executes, then align the aggregator policy.
Do not activate that broader policy before workflow triggers change.
A dedicated always-run governance CI job is preferred to avoid permanently
pending or silently absent checks.

### Current minimum versus complete production release coverage

The **current local minimum proposal** asks for two unconditional CI jobs
(API lint/Jest/build and Edge test/build) plus all three path-applicable Phase
17 jobs. This is **not comprehensive production-release enforcement**.
For an owner-approved *complete* release policy, the trusted aggregator must
also require the remaining **six** existing CI jobs (API migration dry-run,
T-009 pagination PostgreSQL, T-009 Change A PostgreSQL, API representative
upgrade, Web checks/typecheck/build, and Browser E2E smoke), and, once added
and verified, the new governance-tests job. None of those six is optional
for a full current CI campaign simply because only two were originally
listed in the minimum proposal.

**Financial integrity:** `.github/workflows/phase4-validation.yml`
(`Commercial core · settlement · ledger gate`) and
`.github/workflows/phase3-validation.yml`
(`Live floor · migration · busy-shift gate`) both have unfiltered
`pull_request` triggers. They are suitable candidates for a future
**always-applicable** production aggregate, after verifying provider IDs,
check/run provenance, reviewed merge SHA, and behavior on governance-only
changes. In particular, API+Edge success must **never** be interpreted as
successful settlement/ledger certification.

The release owner must separately inventory the other active path-filtered
gates (Edge hard-outage validation, Phase 7/8/9/10/11/13/14/16 and
standalone-boundary), define exact triggering paths and mandatory
applicability, and establish separate production-evidence requirements.
Treat absence of a **relevant** gate as failure; do not assume every phase
workflow runs on every PR. The separate Phase 3 and Phase 4
`*-production-acceptance.yml` workflows involve runtime requests or manual
triggers and are **not** ordinary PR-only checks; their operational evidence
requires separate authorization and must never be implicitly executed by
this local proposal.

Before activating full production enforcement, verify provider check identities,
real event eligibility, duplicate/rerun handling, merge-candidate SHA,
reviewer independence, and whether release-level external identity/rollback
evidence is available. Do not retrofit broad unconditional requirements for
path-filtered jobs ahead of an always-reported, fail-closed aggregate.

### Required-check evaluation

1. Discover mandatory checks from an **administrator-owned policy** on the
   protected base branch; never load required contexts from the PR being checked.
   `required-check-policy.example.json` is an **illustrative, unapproved**
   policy; confirm names and workflows by provider ID before activation.
2. An always-running core CI job is mandatory for every PR. Conditional
   workflows use trusted changed-path classification; a skipped **inapplicable**
   job is permitted only when the policy explicitly excludes it. A missing,
   skipped or neutral **applicable** required job is a failure.
3. Validate job name, workflow identity, source GitHub App, completion
   status success, workflow run ID, latest run attempt, globally unique check-run
   identity across all contexts, and the exact tested merge candidate SHA.
   Several jobs can share one workflow run ID, but never a check-run ID.
   No stale head-SHA-only result, duplicate or ambiguous source may pass.
4. **Every PR** requires an independent GitHub-authenticated reviewer,
   distinct from the author, with an active, non-dismissed approval of the
   current head SHA. Derive immutable IDs, review submission order, dismissals
   and roles from trusted GitHub API results, rechecking pushes/base changes.
   Per reviewer, later decisive submitted reviews supersede earlier ones:
   a later CHANGES_REQUESTED blocks an earlier APPROVED; a dismissed approval
   cannot count; a later valid current-head APPROVED can resolve a previous
   CHANGES_REQUESTED. Reject unresolved changes-requested decisions from
   qualified reviewers. Comment-only reviews do not supersede a decision.
   The untrusted local synthetic evaluator tests this consistency only.
   Changes to .github/**, payment/checkout code, authentication code,
   Prisma, Edge code, and these governance files additionally require a
   current-head independent qualified CODEOWNER. The explicit proposed local
   path globs are held in sensitive_codeowner_paths; separately approved
   GitHub CODEOWNERS/ruleset enforcement must cover the same scope.
   Local source, reviewer role, timestamp, and review identity assertions
   cannot constitute GitHub authentication or authorize a merge.
5. Fail on missing status, unknown source, API permission error, stale result,
   review dismissal, outdated approval, unevaluated paths, or failed evidence.
   Emit a concise reason without including secrets.
6. The gate must not rely on its own passing context as input. Avoid cyclic
   dependencies on itself. Provider-side merge-queue and branch-protection
   metadata must match the evaluation target.
7. The owner must separately decide how optional workflows (Phase 10/11/etc.)
   become path-applicable. An always-reported, protected aggregate context must
   finish `success` or `failure` after evaluating **all** applicable checks.
   Do not require a path-filtered job as a stand-alone required context without
   an always-reported aggregate decision. A missing applicable check is a
   failure, never a fabricated skip/success.

### Local proof-of-concept (NOT an online check)

`evaluate-required-checks.mjs` evaluates **synthetic caller-supplied JSON**;
it makes no HTTP requests, uses no secrets and publishes no GitHub statuses.
Its App ID, workflow ID, run/check IDs, review identity, provenance strings,
and latest-attempt fields are **untrusted fixture claims**. A local PASS means
only that the fixture is *internally consistent*, not provider-authenticated.
It must never be installed as a required context or used to authorize a merge.
Only a separately approved GitHub App fetching and validating authoritative
provider records can publish the stable required check.

The regression tests freeze the exact observed check-run context names,
workflow IDs/App IDs, compare names against the existing YAML job display
names, compare Phase 17 path filters against actual YAML, and test
inapplicable-path, stale attempts, mismatched provenance and independent
review rejection.

```bash
node --test scripts/release-governance/evaluate-required-checks.test.mjs
# Use ONLY separately prepared synthetic fixtures for the local CLI:
node scripts/release-governance/evaluate-required-checks.mjs synthetic-snapshot.json
```

### Merge queue and rerun compatibility

- `pull_request`: distinguish `pull_request.head.sha` (authored changes)
  from GitHub's synthetic PR merge commit SHA (integration candidate).
- `merge_group`: currently **not enabled** in the policy or either source
  workflow; current local snapshots must fail closed. Only after separate
  workflow authorization, validate the queue's **group HEAD** (potentially
  multiple PRs), not the individual PR head. **Each** constituent PR still
  requires its own authenticated, independent, current-head approval. CI
  workflows must explicitly support `merge_group: checks_requested` before
  merge queue is enabled.
- On any rerun, invalidate previous pass until the **latest attempt** completes;
  re-evaluate checked SHA and base. A newer failed attempt supersedes an
  older success, even under the same run ID.
- If `.github/workflows/**` changes in the PR, do not trust that altered
  workflow's success as independent approval. Verify protected-base evaluator,
  CODEOWNER decision and workflow source. Require explicit administrator
  approval before rollout of any production workflow change.

## 3. Proposed GitHub administrator configuration (NO mutation)

**Target 1:** `main` (default). **Target 2:** agreed integration branch,
currently `agent/gospots-payment-integrity-20261009`. Apply via repository
ruleset or protected branch after verifying account feature availability:

| Setting | Proposed value |
|---|---|
| Require PR | ON, no direct pushes for ordinary contributors |
| Required checks | `Release Governance / required-evidence` pinned to trusted publisher; always-reported core CI as separately validated |
| Require branch up-to-date | ON, or a separately approved merge queue with merge_group checks |
| Merge queue | Optional; activate only after all required workflows emit group-SHA checks |
| Required approvals | At least **1** current-head independent reviewer; **2** for money/security/CI policy if qualified reviewers available |
| CODEOWNER review | ON for `.github/**`, payments, auth, Prisma and Edge paths |


## V6 financial CODEOWNER coverage audit — proposal only

The V5 evaluator permitted general-review-only synthetic snapshots for the
three existing authoritative financial modules:
- apps/api/src/modules/cash/** — cash shifts, movements and handling.
- apps/api/src/modules/finance/** — financial transaction and reporting facts.
- apps/api/src/modules/guest-check/** — guest charges and commercial checks.

V6 makes these three mandatory CODEOWNER-sensitive categories and includes
additional verified existing money-critical source paths:
- apps/api/src/common/money.util.ts and ledger-post.util.ts for arithmetic
  and canonical ledger postings.
- apps/api/src/modules/growth/phase9-** for stored value, membership, loyalty,
  customer-value reconciliation and related guardrails.
- apps/api/src/modules/growth/growth-deposit-** and
  growth-public-deposit.service.ts for deposit intake and reconciliation.
- apps/api/src/modules/growth/reservation-stripe-webhook-routing.interceptor.ts,
  reservation-growth.service.ts, phase8-reservation.service.ts and
  apps/api/src/modules/reservations/** for reservation/deposit flows.
- apps/api/src/modules/growth/growth-pricing.service.ts for charge rules.

Existing V5 coverage already includes checkout/** (settlements, refunds and
allocations), device-payment/** (provider payments), billing/** (billing
reconciliation), and API Prisma migrations. V6 tests prove that a general
review is insufficient for each audited financial path, that a valid synthetic
CODEOWNER approval on the current head passes, and that removing any mandatory
financial pattern fails closed.

LIMITATIONS: These are local, illustrative proposal rules, not actual GitHub
CODEOWNERS enforcement. The snapshot's reviewer role/identity, review history,
changed files and provider facts are all synthetic, not independently attested.
Other business domains require a separate end-to-end policy inventory before
real enforcement. A trusted publisher and actual repository ruleset remain
separate, unauthorised work. No GitHub workflow, CODEOWNERS, protected branch,
environment or live release check is activated by V6.

**V5 local sensitive-path contract (PROPOSAL ONLY):** The administrator-owned
example policy explicitly lists .github/** (including .github/actions/**),
docs/release-governance/**, scripts/release-governance/**, API authentication,
device-payment, billing, checkout, payment module, API Prisma schema/migration
and Edge paths, plus selected web auth/checkout paths. The evaluator rejects
a policy missing any mandatory core category. The CODEOWNER role field in the
synthetic snapshot is not GitHub authorization and is not configured GitHub
branch protection. An administrator must verify actual CODEOWNERS, reviewer
permissions and full sensitive-code coverage before enabling enforcement.

**V5 local review-history contract (PROPOSAL ONLY):** Each unique review ID
requires a unique reviewer identity, unambiguous UTC submission timestamp,
reviewed head SHA, state and reviewer role. Use the last decisive review
(APPROVED, CHANGES_REQUESTED or DISMISSED) for each reviewer in timestamp
order. COMMENTED does not override a decision; DISMISSED clears it.
Unresolved CHANGES_REQUESTED blocks even when another reviewer approved.
A subsequent approval is sufficient only on the current head. Outdated
approvals, duplicate IDs, ambiguous chronology and PR-author self-reviews
fail closed. The future trusted publisher must retrieve authoritative
review history, dismissal and current CODEOWNER qualification from GitHub,
rather than trust these synthetic entries.

**V5 check-run identity contract (PROPOSAL ONLY):** Each distinct supplied
check record must have a globally unique positive check_run_id. Separate
jobs may legitimately share their parent workflow run ID. A duplicate
check-run identity is contradictory provider evidence and must fail closed,
including for non-required checks. A synthetic passing fixture does not
constitute authenticated GitHub check, review or release evidence.

| Stale approvals | Dismiss on new commits; additionally require approval of most recent reviewable push |
| Conversation resolution | ON |
| Force pushes and deletion | DENY for all ordinary contributors |
| Bypass | None for ordinary contributors; preferably none for normal administrators. Separate documented break-glass bypass role, logged, time-bound and post-reviewed, only if required |
| Signed commits / linear history | Owner decision; use only if contributor tooling and chosen merge strategy can satisfy it |
| Enforcement | Active only after testing against a disposable trial branch and confirming required check source identities |

**Critical reviewer dependency:** `.github/CODEOWNERS` currently designates
`@EIAS79`. GitHub cannot count the PR author's own approval as independent
approval. The owner must grant appropriate repository access to at least one
**different qualified reviewer** or team and update CODEOWNERS accordingly
before activating required independent CODEOWNER review. A two-person standard
requires two independently authorized reviewers and sufficient coverage.

**GitHub environment protection:** configure required production reviewers and
branch restrictions, ensure actual deployment jobs reference protected
environments, and assess administrator bypass. Existing Vercel Git integration
may deploy directly after a `main` merge; a GitHub environment gate alone
cannot stop an external Vercel integration unless its actual deployment path is
also governed. Verify Vercel's native deployment checks / deployment
protection separately.

**Existing Vercel marker:** `apps/web/vercel.json` restricts normal Git
deployments to `main` and `ignoreCommand` gates builds on
`apps/web/.vercel-release`. Branch protection must authorize merges and
CODEOWNER review of marker edits. A protected GitHub PR **does not itself
confirm** that a Vercel build was deployed or that the marker is the same as
the artifact's Git SHA. Retain independent post-deployment SHA, aliases and
environment attestation (T-004). Never update the marker under this proposal.

## 4. Owner decisions and release blockers

1. Name an independent CODEOWNER reviewer or team and eligible release owners.
2. Confirm repository ruleset/merge-queue features and branch selection.
3. Confirm check publisher trust model (GitHub App vs approved native gate),
   exact existing job names, required job applicability and expected source App.
   Separately approve the new **always-run governance-tests CI job** and only
   after it exists and passes, add its observed status context to the policy.
   Decide when to advance from the two-job CI minimum to all eight current
   CI jobs, the governance job, and applicable remaining phase workflows.
4. Decide whether an unmodified merge candidate must be tested before GO
   and which external deployment artifacts must have mandatory digest evidence.
5. Authorize future **separate** production/provider identity, database
   migration compatibility, backup/PITR drill and rollback attestations.
6. Keep T-004 runtime identity owner decisions pending and T-009 physical
   owner evidence blocked. No release GO or production parity is claimed.
7. Independently authorize workflow, GitHub settings, CODEOWNERS, Vercel
   deployment, and release marker changes; **none occur in this proposal**.

## 5. Safety and evidence limitations

- No file in `.github/workflows`, `.github/CODEOWNERS`, `apps/web/.vercel-release`
  or production code is changed.
- No real release manifest is signed or produced. Example is `NO_GO`.
  The manifest now requires PR author ID, GitHub review ID, reviewer ID,
  reviewed head SHA, review state and evidence reference; these are still
  unverified until independently checked against GitHub APIs.
- Local validation is a deterministic structural and cross-field consistency
  check, **not evidence authenticity verification**. Provider-backed facts
  require an independently authorized verifier.
- Never paste environment values, API secrets, deployment tokens, database
  connection strings or live provider identities into a public manifest.

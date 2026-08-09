# GoSpots Database Migration Policy

**Chunk:** 00  
**Applies to:** Prisma/PostgreSQL schema and data migrations, especially checkout, settlement, payments, finance, fiscalization and offline synchronization work.  
**Production database:** Neon PostgreSQL.

## 1. Governing rule

Production migrations are a staged compatibility exercise, not a one-step schema replacement.

Default sequence:

```text
expand
  ↓
dual-write
  ↓
backfill
  ↓
verify
  ↓
switch-read
  ↓
contract
```

A stage may be skipped only when it is demonstrably unnecessary. The burden is on the PR to explain why.

## 2. Non-negotiable rules

1. `main` must remain deployable.
2. Never remove the old production read path in the same deployment that first introduces its replacement for a high-risk domain.
3. New required data starts nullable or otherwise backward-compatible unless a safe zero-downtime strategy is proven.
4. Never use a destructive migration as a shortcut for data cleanup.
5. Never modify historical commercial values just to fit a new model.
6. Money-domain writes require explicit duplicate/idempotency analysis.
7. Every shop-scoped table must have tenant isolation, constraints and indexes reviewed.
8. Prisma-generated SQL must be read before production application.
9. A successful migration against an empty database is necessary but not sufficient; compatibility with current production data must also be considered.
10. Production DDL is never executed casually from an interactive session.

## 3. Current Neon baseline

Captured 2026-08-09:

```text
Project: Gospots
Project ID: mute-butterfly-69488238
PostgreSQL: 17
Primary/default branch: production
Production branch ID: br-lucky-wave-aln8lhk8
Region: aws-eu-central-1
```

Vercel-created preview branches exist and are children of production snapshots.

Important finding: the production branch was reported as **not protected** at capture time. Process controls in this document are therefore mandatory even when the platform would technically permit a direct write.

## 4. Stage A — Expand

Add new structures without breaking old application versions.

Typical operations:

- add a new table;
- add a nullable column;
- add a new relation while preserving the old relation;
- add a new enum value when runtime compatibility is understood;
- add indexes needed by the new path;
- add a new event/outbox/idempotency table.

Requirements:

- old application version can still run after migration;
- no existing required field is removed;
- no existing column is repurposed to mean something incompatible;
- foreign-key/index lock impact is reviewed;
- tenant-scoping/index needs are explicit.

For Chunk 02 settlement work, this means adding settlement/snapshot structures while legacy GuestCheck/source billing continues to function.

## 5. Stage B — Dual-write

Where old and new representations must coexist, write both deliberately.

Requirements:

- one operation owns the transaction boundary where possible;
- duplicate revenue/payment/fiscal side effects are explicitly prevented;
- retries are idempotent;
- failure policy states what happens if one representation succeeds and the other fails;
- metrics/logs can detect divergence;
- dual-write is temporary and has an exit condition.

Do not create two independent payment side effects merely because two data models exist.

## 6. Stage C — Backfill

Populate the new representation for historical/current records only when required.

Before backfill:

- define exact eligible rows;
- define deterministic mapping;
- define batch size;
- estimate table/lock load;
- define resume/retry behavior;
- define how already-backfilled rows are recognized;
- define reconciliation query;
- take/identify a recoverable Neon branch/snapshot point.

Backfills should be idempotent where practical. A rerun must not duplicate financial facts.

## 7. Stage D — Verify

No read-path switch before verification.

Verification examples:

- old total == new settlement total for the same eligible check;
- count of migrated records matches expected population;
- no orphan foreign keys;
- no cross-shop relationships;
- all required new columns populated for the switch population;
- ledger revenue reconciles with transaction facts;
- idempotency uniqueness holds;
- expected indexes exist and query plans are acceptable for important paths.

For money-domain migrations, aggregate equality alone is insufficient. Sample individual transactions and edge cases too.

## 8. Stage E — Switch read

Move reads to the new representation behind a controlled rollout.

Preferred controls:

- development first;
- internal/test shop;
- pilot shop;
- production rollout.

Requirements:

- old data remains available for rollback/forward-fix;
- fallback behavior is defined;
- metrics/logs distinguish old and new read paths;
- finance reconciliation is repeated after enabling the new read path.

Do not remove old columns/tables during this stage.

## 9. Stage F — Contract

Remove obsolete data structures only after the replacement has been stable long enough to prove it is authoritative.

Before contract migration:

- no deployed app version reads the old field/table;
- no background job/integration reads it;
- no report/export depends on it;
- rollback strategy no longer requires it;
- historical/audit retention requirements are satisfied;
- production backup/restore point is identified;
- destructive SQL is isolated in its own reviewed migration/PR where practical.

Contract is deliberately delayed for financial/compliance data.

## 10. Required workflow for every migration PR

### 10.1 Before generating SQL

- [ ] State the business/domain change.
- [ ] List affected Prisma models/tables.
- [ ] Identify whether migration is expand, dual-write support, backfill, switch-read support or contract.
- [ ] Identify existing production read/write paths affected.
- [ ] Review shop/tenant isolation.
- [ ] Review expected table size and lock risk.

### 10.2 Generate migration intentionally

Use the repository's established Prisma workflow. Migration name must describe the domain change.

Do not use `db push` as the production schema-change process.

### 10.3 Inspect generated SQL

Explicitly check for:

- `DROP TABLE`;
- `DROP COLUMN`;
- destructive type changes;
- table rewrites;
- unsafe `NOT NULL` additions;
- uniqueness constraints that can fail on existing rows;
- foreign keys requiring full validation/locks;
- missing indexes on new foreign keys/query predicates;
- enum changes and application-version compatibility;
- accidental schema reset/recreate behavior.

Any destructive statement must be justified in the PR. Unexpected destructive SQL blocks deployment.

### 10.4 CI empty-database validation

GitHub Actions must continue to run against ephemeral PostgreSQL:

```bash
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
pnpm exec prisma validate
```

This proves migration history can build a clean database. It does not prove production compatibility.

### 10.5 Preview/branch validation

For production-sensitive migrations:

1. Create or use an isolated Neon branch derived from the intended parent state.
2. Apply the migration there first.
3. Run schema verification.
4. Run targeted application tests/smoke scenarios against the branch.
5. Run reconciliation/backfill verification where relevant.
6. Review the branch/schema delta before production application.

Never point the production application at a temporary migration-test branch as an accidental permanent configuration.

## 11. Production database safety checklist

Before a money-domain production migration:

- [ ] Correct Neon project confirmed: `mute-butterfly-69488238`.
- [ ] Correct target branch confirmed: production `br-lucky-wave-aln8lhk8`.
- [ ] Current commit/PR SHA recorded.
- [ ] Current production migration head recorded from `_prisma_migrations`.
- [ ] Recovery point available: Neon history/branch snapshot or explicit pre-change branch as appropriate.
- [ ] Migration SQL reviewed line-by-line.
- [ ] No unexpected destructive SQL.
- [ ] Lock/table-rewrite risk reviewed.
- [ ] New indexes reviewed.
- [ ] Backfill separated from schema DDL when scale/risk requires it.
- [ ] Previous app version remains compatible for expand migrations.
- [ ] Post-deploy verification queries prepared before applying migration.
- [ ] Finance/settlement reconciliation prepared for money-domain changes.

## 12. Recovery strategy

Prefer forward-fix for additive migrations.

Why:

- rolling application code backward while the database has safely expanded is usually lower risk than trying to reverse DDL immediately;
- reversing financial data migrations can itself create corruption;
- a Neon branch/history recovery point provides an additional recovery option but does not replace a forward-compatible schema design.

For each high-risk migration PR, document one of:

```text
Rollback application only; schema remains backward compatible.
```

or

```text
Forward-fix migration required; exact invariant/repair path documented.
```

A destructive rollback script is not automatically safer than a forward fix.

## 13. Money-domain migration rules

Settlement/payment/fiscal migrations additionally require:

- stable transaction identity;
- explicit idempotency key/uniqueness strategy;
- immutable historical snapshots where history must survive catalog/price changes;
- no authoritative client-only amount calculation;
- currency recorded explicitly where the model can cross currencies;
- reconciliation to existing ledger/finance facts;
- duplicate side-effect prevention for provider/fiscal calls;
- `UNKNOWN`/ambiguous external-provider state handled as reconciliation, not as a blind retry.

## 14. Prisma migration history discipline

- Never edit an already-applied production migration merely to change history.
- Fix forward with a new migration.
- Do not delete migration folders that production has recorded.
- If migration history and production diverge, stop and diagnose before generating more migrations.
- `_prisma_migrations` is read for verification; do not manually rewrite it as a normal repair mechanism.

At Chunk 00 capture, recent production migrations were completed without rollback markers in the inspected history.

## 15. Acceptance evidence for a migration-bearing chunk

The chunk completion report must state:

```text
Migration name:
Migration stage: expand / dual-write / backfill / verify / switch-read / contract
Preview branch tested:
CI migrate-deploy: PASS/FAIL
Prisma validate: PASS/FAIL
Destructive SQL review: PASS/FAIL
Index review: PASS/FAIL
Tenant isolation review: PASS/FAIL
Backfill/reconciliation result:
Production migration head before:
Production migration head after:
Recovery/forward-fix strategy:
```

If these answers are unknown, the migration is not production-ready.

# GoSpots database migration policy

This policy applies to production-facing Prisma/PostgreSQL changes. Financial, settlement, payment, fiscal, inventory and offline-sync migrations require the strictest interpretation of these rules.

## 1. Core rule

Production schema changes are **expand-first**. A deployment that introduces a new read/write path must not simultaneously destroy the old production path it replaces.

Preferred lifecycle:

```text
expand
  -> dual-write / compatibility write (when needed)
  -> backfill
  -> verify
  -> switch-read
  -> observe
  -> contract in a later deployment
```

Not every migration needs all stages. Simple additive nullable columns may only require `expand -> verify -> switch-read`. Destructive or semantic changes must use the full lifecycle.

## 2. Before writing a migration

For every migration:

- identify affected tables/models and tenant scope;
- state whether the change is additive, data-transforming or destructive;
- inspect existing nullability/default/index/unique constraints;
- decide how old application code behaves while the new schema exists;
- decide how new application code behaves before backfill is complete;
- define rollback or forward-fix behavior;
- estimate lock/table-scan/index-build risk for production-sized data.

For money-domain migrations additionally:

- identify authoritative historical money fields;
- define currency behavior;
- ensure no migration recomputes historical financial values from mutable current prices;
- ensure uniqueness/idempotency constraints cannot collapse legitimate historical records;
- ensure tenant (`shopId`) isolation and indexes are explicit.

## 3. Expand

Safe examples:

- add nullable column;
- add table with no existing read dependency;
- add new relation while legacy relation remains valid;
- add non-conflicting enum value after checking application compatibility.

Risky examples requiring deliberate review:

- adding a non-null column without a safe default/backfill path;
- rewriting a high-volume table in one migration;
- adding a unique constraint before duplicate data is verified;
- changing Decimal precision/scale;
- changing currency/money semantics;
- changing enum values consumed by older running application instances.

## 4. Dual-write / compatibility phase

Use dual-write only when an existing field/model remains live while a replacement is introduced.

Rules:

- one service should own the compatibility write where possible;
- the operation should be transactionally consistent when both writes form one business fact;
- do not let UI code choose which store is authoritative;
- instrument mismatches so they can be detected before read switching;
- define exactly when dual-write can be removed.

Dual-write is a migration mechanism, not a permanent architecture.

## 5. Backfill

Backfills must be restartable and idempotent.

Preferred characteristics:

- batched;
- ordered by stable key;
- safe to re-run;
- records progress/metrics;
- does not modify already-correct records unnecessarily;
- runs separately from latency-sensitive request paths when large.

For financial snapshots, backfill must use historically valid source data. If history cannot be reconstructed exactly, do not invent values; mark the limitation and keep legacy read compatibility.

## 6. Verify

Before switching reads, verify:

- row counts/relation counts where applicable;
- null/invalid values;
- duplicate candidates before unique constraints;
- money totals/reconciliation for financial migrations;
- tenant isolation (`shopId`);
- required indexes exist and match major query paths;
- new and legacy representations agree during compatibility phase.

A migration is not considered safe because `prisma migrate deploy` returned success. Data semantics must also be verified.

## 7. Switch-read

The new read path should be feature-flagged when the domain is large or commercially sensitive.

For Checkout V2 and later financial domains:

- legacy behavior remains available with the feature flag disabled;
- pilot/test shop is enabled first;
- compare finance/settlement outcomes before broader rollout;
- rollback should normally mean disabling the feature/read path, not reversing a destructive schema migration.

## 8. Contract

Dropping old columns/tables/constraints is a separate deployment after:

- all application instances no longer read/write them;
- backfill/reconciliation is complete;
- feature rollback no longer requires them;
- observability period is complete;
- a production backup/snapshot path is confirmed.

Never combine the first production switch to a new money path with deletion of the old path.

## 9. Required CI migration gate

Every migration PR must pass on disposable PostgreSQL:

```bash
pnpm install --frozen-lockfile
pnpm --filter @gospots/api exec prisma generate
pnpm --filter @gospots/api exec prisma migrate deploy
pnpm --filter @gospots/api exec prisma migrate status
pnpm --filter @gospots/api exec prisma validate
```

The repository CI already performs the empty-database deploy/status/validate path. Migration-sensitive work should add targeted data-upgrade tests when an empty database is insufficient to prove safety.

## 10. SQL review checklist

Before production deployment inspect generated SQL for:

- `DROP TABLE` / `DROP COLUMN`;
- table-wide `UPDATE` without batching strategy;
- `ALTER COLUMN ... SET NOT NULL` before data proof;
- implicit casts or type rewrites;
- Decimal precision/scale changes;
- unique constraints/indexes that can fail on current data;
- foreign keys with unintended cascade behavior;
- indexes missing on new tenant/time/status query paths;
- long-lock operations.

Any destructive SQL requires an explicit reason and staged rollout. Money-domain migrations should default to no destructive SQL in the first deployment.

## 11. Production database safety

Before a high-risk migration:

1. confirm Neon backup/restore or branch/snapshot strategy available for the production database;
2. capture the application commit and current migration status;
3. preview generated SQL;
4. run the migration against a production-like disposable database/branch;
5. run reconciliation/verification queries;
6. deploy application compatibility code before or with the additive schema as designed;
7. monitor errors, latency and financial reconciliation after deployment.

Do not use `prisma migrate reset` against production.

Do not use `prisma db push` as the production migration mechanism for normal application evolution. Production uses committed migrations and `prisma migrate deploy`.

## 12. Rollback philosophy

Database rollback is usually a **forward-fix plus feature rollback**, because reversing a migration can itself destroy data.

Preferred recovery order:

1. disable the new feature/read path;
2. keep additive schema in place;
3. correct code or data with an idempotent forward fix;
4. only restore/revert database state when the incident explicitly requires it and a verified recovery point exists.

## 13. PR migration note template

```text
Migration name:
Models/tables affected:
Classification: additive / data transform / destructive
Tenant impact:
Money/currency impact:
Expand step:
Dual-write step:
Backfill step:
Verification:
Read switch / feature flag:
Contract step (later PR/deploy):
Rollback / forward-fix:
Production snapshot/branch plan:
SQL reviewed: yes/no
```

Chunk 01+ work that changes the database must include this information in the PR when material.

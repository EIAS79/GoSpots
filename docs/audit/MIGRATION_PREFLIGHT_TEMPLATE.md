# Migration pre-flight template (copy per wave)

**How to use:** Copy this file to `MIGRATION_PREFLIGHT_<WAVE>.md` (or append a dated section) before merging any new `apps/api/prisma/migrations/**` folders. Keep [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md) as the historical Friday eight-folder pass.

**Rules:** [`GO_SPOTS_MIGRATION_SAFETY.md`](./GO_SPOTS_MIGRATION_SAFETY.md) · Deploy: [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md)  
**Never:** `prisma migrate reset` / `db push --force-reset` on Neon or shared DBs.  
**Never:** point agent/CI `migrate deploy` at production Neon secrets.

---

## Wave metadata

| Field | Value |
|-------|--------|
| Wave / date | YYYY-MM-DD |
| Author | |
| Folders in this wave (timestamp order) | `20YYMMDDHHMMSS_name`, … |
| `prisma validate` | PASS / FAIL |
| CI `api-migrate` (ephemeral Postgres) | PASS / FAIL / n/a |
| Schema ↔ SQL drift | None / describe |
| Live Neon deploy this review | **Not run** / OPERATOR scheduled |

---

## Per-folder verdict table

| # | Migration folder | Verdict (PASS / WARN / FAIL) | One-line reason |
|---|------------------|------------------------------|-----------------|
| 1 | | | |

**Overall:** _N_ PASS / _M_ WARN / _K_ FAIL — apply only if **0 FAIL**.

---

## Criterion checklist (each folder)

Copy one block per folder:

### `20YYMMDDHHMMSS_short_name` — PASS | WARN | FAIL

**SQL summary:** (ADD COLUMN / CREATE TABLE / ALTER TYPE / DROP / index / extension)

| Criterion | PASS | WARN | FAIL |
|-----------|------|------|------|
| Matches `schema.prisma` | Yes | — | Drift |
| Expand-only (ADD / CREATE) | Yes | — | — |
| Rewrite / lock risk | — | Document off-peak window | Huge ALTER with no note |
| DROP / data loss | — | Soak design + inventory SQL linked | DROP without inventory |
| Extension deps (`pgcrypto`, `btree_gist`, …) | Documented | Neon support uncertain | Unknown |

**Ops / soak gates:**  
**Rollback note:** forward-fix / PITR (never reset)

---

## WARN class (lock / backfill)

List every WARN folder and the operator action:

| Migration | Why WARN | Operator note |
|-----------|----------|---------------|
| | | |

---

## Post-deploy verification

After OPERATOR `migrate deploy` on the target DB:

```bash
cd apps/api
pnpm run verify:migrations
# optional spot checks (read-only SQL probes):
pnpm run verify:migrations -- --spot-checks
```

Expect: disk folders ⊆ applied `_prisma_migrations`; exit **0**. Exit **1** on pending/missing; **2** on connection/script error.

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Author | | |
| Reviewer | | |

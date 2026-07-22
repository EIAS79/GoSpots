# Locora — Migration safety procedures

**Date:** 2026-07-21 (design) · **Phase 1 CI:** 2026-07-21 (Lane **KKKKK**) · **Phase 2–3:** 2026-07-21 (Lane **CCCCCC**)  
**Status:** Design + **Phase 1 CI dry-run** + **Phase 2 preflight template** + **Phase 3 `verify:migrations`** shipped. No Neon migrate from agents. Bible **#9 DONE**.  
**Bible:** P0 **#9** — database migrations need stronger safety procedures.  
**Ship timing:** Friday operator applies pending folders via `migrate deploy` only ([`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md), [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md)); then `pnpm run verify:migrations`. **Never** point CI or agents at Neon for deploy.

**Related (do not conflate):**

| Doc | Role |
|-----|------|
| [`GO_SPOTS_MIGRATION_PLAN.md`](./GO_SPOTS_MIGRATION_PLAN.md) | *Which* candidate migrations (M1–M7) and expand→contract sketches |
| [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md) | One-time pass/warn for the **current eight** pending folders |
| [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) | Friday operator apply + smoke |
| [`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) | Neon PITR / branch restore (#24) |
| This doc | *How* every future migration is authored, reviewed, CI-checked, applied, and rolled back |

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Through Friday submit** | Freeze **new** migration folders. Operator runs `pnpm --filter @gospots/api migrate:deploy` once against Neon (**never reset**). Review preflight **6 PASS / 2 WARN**. |
| **Friday post-deploy** | Smoke checklist; optional SQL spot-checks from money / guest preflight notes. Confirm `_prisma_migrations` has all eight. |
| **CI (Phase 1 — shipped)** | Job `api-migrate` in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml): `postgres:16` service + `migrate deploy` + `migrate status` + `validate` — **local CI URL only**, never Neon secrets. |
| **After Friday (Phase B)** | Codify PR checklist + expand/contract gates in this doc (already below); optional shadow-diff / `migrate diff` against a branch. |

---

## What exists today

| Piece | Status |
|-------|--------|
| Rule: `migrate deploy` only; never `migrate reset` / `db push` on Neon | Documented (checklist, preflight, overnight, remaining Friday) |
| Eight pending migrations on disk | Preflight reviewed — **6 PASS / 2 WARN** (money ALTER lock; guest `pgcrypto` + index) |
| Schema ↔ SQL alignment check | Done for current wave (`MIGRATION_PREFLIGHT.md`) |
| CI (`.github/workflows/ci.yml`) | `prisma generate` + API lint/build/Jest + web typecheck + **`api-migrate` ephemeral Postgres dry-run** (Lane KKKKK) |
| Local Docker Postgres | Available for manual `migrate deploy` / `migrate dev` |
| Rollback story | Neon PITR / branch restore stub (#24) — retention TBD by operator |
| Candidate migration playbook | Expand → dual-write → backfill → contract in `GO_SPOTS_MIGRATION_PLAN.md` §3 |

### Honest gap (bible #9 residual — operator / process)

1. ~~**No automated proof** that pending SQL applies cleanly on a fresh Postgres (CI dry-run missing).~~ **Shipped** — `api-migrate` job (empty DB → all folders).  
2. ~~**No durable PR gate** beyond “human read preflight”.~~ **Shipped** — Phase 2 template [`MIGRATION_PREFLIGHT_TEMPLATE.md`](./MIGRATION_PREFLIGHT_TEMPLATE.md).  
3. **WARN migrations** (money type change; guest hash backfill) rely on operator lock awareness — not encoded as a machine check (accepted).  
4. ~~**Post-deploy verification** is manual smoke only.~~ **Shipped** — `pnpm run verify:migrations` (+ optional `--spot-checks`).  
5. **OPERATOR:** Neon `migrate deploy` of pending folders + run verify on deploy host (never from accidental workstation prod `.env` deploy).

---

## Goal (post-submit)

1. Every new migration folder is **expand-safe by default** (or has an explicit WARN + lock window).  
2. PR CI proves `migrate deploy` succeeds on **ephemeral** Postgres (empty → all migrations). ✅ Phase 1  
3. Contract / DROP migrations require a written soak gate + inventory query (same pattern as guest-token / CSV cutover designs).  
4. Production apply stays **operator-owned**; agents never point workstation `.env` at Neon for deploy.  
5. Rollback = **forward fix** or **PITR** — never reset.

**Non-goals for v1 safety process:**

- Auto-migrate Neon from GitHub Actions on merge (too risky; keep human deploy)  
- Squashing / rewriting already-applied migration history  
- Replacing Prisma Migrate with a custom runner  
- Running `migrate reset` “to fix CI” against any shared DB

---

## Safety rules (always)

### Authoring

| Rule | Detail |
|------|--------|
| **Expand first** | Prefer `ADD COLUMN` / new tables / new indexes. Avoid `DROP COLUMN` / `NOT NULL` without default until backfill + soak. |
| **No reset** | Forbidden on Neon / shared staging: `prisma migrate reset`, `db push --force-reset`, drop-and-recreate. |
| **Idempotent-ish SQL** | Prisma folders run once; for raw expands prefer `IF NOT EXISTS` where Prisma allows; never hand-edit applied folders. |
| **One concern per folder** | Do not mix money ALTER + guest backfill + DROP in one timestamp. |
| **Lock awareness** | `ALTER TYPE`, full-table rewrites, large unique indexes → document as **WARN** in preflight; prefer off-peak; estimate table size. |
| **Hot-table defer** | Exclusion constraints, CSV DROP, guest plaintext DROP, pack `tier` DROP → only after inventory = 0 and dedicated design gates. |

### Review (PR)

Checklist before merge of any `apps/api/prisma/migrations/**` change:

- [ ] New folder timestamp ordered after latest on `main`  
- [ ] `schema.prisma` matches SQL (no orphan models / missing columns)  
- [ ] `prisma validate` PASS  
- [ ] CI `api-migrate` green (ephemeral deploy)  
- [ ] Explicit expand vs contract callout in PR body  
- [ ] If contract/DROP: link to soak design + inventory SQL; **do not** merge DROP without soak evidence  
- [ ] Rollback note: PITR window / forward-fix path (not “reset”)

### Apply (production)

1. Confirm migration set matches preflight / deploy checklist.  
2. Confirm Neon PITR retention is acceptable for the change blast radius (#24).  
3. `pnpm --filter @gospots/api migrate:deploy` from **host/CI deploy role** with prod `DATABASE_URL` — not from a random laptop `.env` that might be Neon.  
4. Confirm `_prisma_migrations` rows; hit `/api/v1/ready`.  
5. Run smoke ([`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md)).

---

## Phased plan

### Phase 0 — Friday operator (no new code)

Already specified; do not expand scope:

- Apply eight folders; smoke; acknowledge WARN locks.  
- Fill PITR TBD fields when convenient (#24).

### Phase 1 — CI migrate dry-run ✅ shipped (Lane KKKKK)

**Scope:** GitHub Actions job `api-migrate` with **Postgres service** (`postgres:16`), ephemeral volume, secrets = local CI URL only.

| Step | Command / check |
|------|-----------------|
| Install | `pnpm install --frozen-lockfile` |
| Generate | `prisma generate` |
| Deploy | `prisma migrate deploy` against empty CI DB |
| Status | `prisma migrate status` → no pending |
| Validate | `prisma validate` |

**Pass criteria:** Job green on every PR / push (always with API CI; separate job so lint/test stays independent).  
**Fail criteria:** Any migration SQL error, drift, or pending after deploy.

**Explicit non-goals for Phase 1:**

- No seed data required  
- No concurrency / e2e against that DB  
- **Never** use Neon credentials in Actions secrets for this job

Optional later: `prisma migrate diff` from schema → empty DB vs migration history (catch “schema edited without folder”).

### Phase 2 — Durable preflight template ✅ shipped (Lane **CCCCCC**)

Copy-paste template: [`MIGRATION_PREFLIGHT_TEMPLATE.md`](./MIGRATION_PREFLIGHT_TEMPLATE.md). Keep Friday `MIGRATION_PREFLIGHT.md` as historical record; new waves copy the template (or append a dated section).

| Criterion | PASS | WARN | FAIL |
|-----------|------|------|------|
| Matches `schema.prisma` | Yes | — | Drift |
| Expand-only (ADD / CREATE) | Yes | — | — |
| Rewrite / lock risk | — | Document window | Untyped huge ALTER without note |
| DROP / data loss | — | Only with soak link | DROP without inventory |
| Extension deps (`pgcrypto`, `btree_gist`) | Documented | Neon supports? | Unknown |

### Phase 3 — Post-deploy verification script ✅ shipped (Lane **CCCCCC**)

Read-only ops command (never writes / never deploy):

```bash
cd apps/api
pnpm run verify:migrations
pnpm run verify:migrations -- --spot-checks
```

- Compares on-disk `prisma/migrations/*` folders to `_prisma_migrations`
- Optional `--spot-checks`: money NULL probe (fail) + guest plaintext-without-hash count (informational during dual-read)
- Exit **0** ok · **1** pending/failing spot · **2** connection/script error

Helpers: `verify-migrations.util.ts` (+ unit specs). **Not** a CI write path; OPERATOR runs after Neon `migrate deploy`.

### Phase 4 — Contract migrations (ongoing, per feature design)

Each DROP / stop-dual-write follows its feature design (guest token, CSV, pack tier, etc.):

1. Inventory = 0  
2. App no longer reads dropped columns  
3. Contract migration folder  
4. CI dry-run still PASS  
5. Operator deploy + soak

This doc does **not** authorize those DROPs; it only requires the gate.

---

## WARN class (current eight — operator reminder)

| Migration | Why WARN | Operator note |
|-----------|----------|---------------|
| `20260720230000_money_decimal_core` | In-place `ALTER … TYPE DECIMAL` | May lock busy money tables; apply off-peak if venue live |
| `20260720250000_guest_token_hash_expiry` | `pgcrypto` + hash backfill + indexes | Confirm extension; watch index build time |

Expand-only folders (`BillingWebhookEvent`, timezone, permissions rows, session family, idempotency receipts, mail outbox) are **PASS** — still require ordered deploy.

---

## Rollback

| Situation | Action |
|-----------|--------|
| Deploy failed mid-migrate | Fix forward if Prisma recorded partial; else Neon branch/PITR — **never reset** |
| Bad data after expand | Forward app fix or compensating migration; keep expand columns |
| Bad contract/DROP | PITR before DROP time; do not re-add columns via reset |
| App incompatible with DB | Roll **app** back to prior deploy that matches applied migrations |

Document restore steps in [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md); confirm retention before relying on it.

---

## Files (Phase 1+)

| Path | Role |
|------|------|
| `docs/audit/GO_SPOTS_MIGRATION_SAFETY.md` | This design + Phase 1–3 status |
| `.github/workflows/ci.yml` | Job `api-migrate` — Postgres service + `migrate deploy` (Phase 1 ✅) |
| `docs/audit/MIGRATION_PREFLIGHT.md` | Friday historical eight-folder pass |
| `docs/audit/MIGRATION_PREFLIGHT_TEMPLATE.md` | Phase 2 copy-paste template per wave ✅ |
| `apps/api/scripts/verify-migrations.ts` | Phase 3 read-only checks ✅ |
| `apps/api/src/common/verify-migrations.util.ts` | Diff + spot-eval helpers (+spec) ✅ |

**Do not touch for safety lanes:** `schema.prisma`, migration SQL, `main.ts`, finance/auth/reservations services, Neon deploy.

---

## Non-goals (Friday / agents)

- Running `migrate deploy` against Neon from an agent  
- New migration folders  
- Money wire / exclusion DDL / guest DROP / ledger  
- Changing CI to fail on web eslint / `next build` (separate residual)

---

## Next

1. Friday: operator Neon deploy + smoke (existing checklist).  
2. ~~Post-Friday: Phase 1 CI Postgres + `migrate deploy` job.~~ **Done (KKKKK).**  
3. ~~Phase 2 preflight template + Phase 3 verify script.~~ **Done (CCCCCC).**  
4. Keep feature DROPs behind their own designs + inventory gates.  
5. After Neon deploy: `pnpm run verify:migrations` (+ optional `--spot-checks`).

*Parent bible **#9 DONE** (Phase 1 CI + Phase 2 template + Phase 3 verify). OPERATOR residual: live Neon `migrate deploy` + run verify on deploy host.*

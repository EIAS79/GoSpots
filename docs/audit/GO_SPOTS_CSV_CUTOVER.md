# Locora — Permissions / add-ons CSV column cutover

**Date:** 2026-07-20 (design) · **Updated:** 2026-07-22 (operator checklist lane **CSV16-residual-docs**)  
**Status:** **DONE** (ship bar) — rows SoT + stop dual-write + DROP migration **on disk**.  
**Bible:** P1 **#13 / §16** — CSV permissions / add-ons; migration plan **M7**; expand `20260720240000_*`; contract `20260721090000_drop_membership_permissions_subscription_addons_csv`.  
**Ship timing:** App cutover shipped (Lane **IIIIII**). **OPERATOR:** Neon `migrate deploy` for expand + DROP (no workstation Neon).  
**Canonical operator path:** expand migrate → inventory → app cutover live → contract DROP → post-DROP verification.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Relational join tables + CSV backfill expand | **DONE** | Migration `20260720240000_membership_permissions_subscription_addons` on disk |
| Rows-primary reads (`permissionRows` / `addOnRows` SoT) | **DONE** | `resolvePermissionSet` / `resolveAddOnIds`; Lane **IIIIII** |
| Mutations write join rows only (CSV parse input, not persisted) | **DONE** | `replaceMembershipPermissionRows` / `replaceSubscriptionAddOnRows` |
| JWT / `/me` / staff list emit **computed** CSV strings | **DONE** | `permissionsToEffectiveCsv` / `resolveAddOnsCsv` |
| Web `plan.ts` / `venue-packs.ts` rows-primary parity | **DONE** | Arrays / `addOnRows` accepted |
| Contract DROP migration on disk | **DONE** | `20260721090000_drop_membership_permissions_subscription_addons_csv` |
| Operator Neon expand + DROP deploy | **OPERATOR** | [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) records **18/18 applied 2026-07-21** — re-verify if your env diverges |
| Post-DROP entitlement smoke | **OPERATOR** | Gates 4–5 below |
| Optional API arrays-only response polish | **RESIDUAL** (optional app lane) | Frontend already accepts arrays; not a ship blocker |
| `Subscription.pendingAddOns` stays CSV | **BY DESIGN** | No relational twin; out of scope for §16 |

**Unlike §11 guest tokens / §13 dashboard key / §15 pack tier:** the contract DROP migration **is on disk** today — operator work is deploy ordering + verification, not authoring a future migration lane.

---

## Operator cutover checklist (expand → DROP)

Use after Lane **IIIIII** app cutover is live. **Do not skip gates** — DROP is irreversible without PITR. **Do not combine** with §15 optional `Subscription.tier` DROP in the same migration ([`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md)).

### Gate 0 — App cutover shipped (rows SoT)

- [ ] Lane **IIIIII** deployed: Prisma schema has **no** `Membership.permissions` / `Subscription.addOns` fields; app never SELECTs or UPDATEs those columns.
- [ ] Jest entitlements + staff + auth + billing (+ related) green at ship time (**80+** cases).
- [ ] Smoke: staff permissions and paid-shop module gates match pre-cutover expectations.

### Gate 1 — Expand migration applied

- [ ] `20260720240000_membership_permissions_subscription_addons` applied on Neon (`MembershipPermission` + `SubscriptionAddOn` tables + CSV→row backfill).
- [ ] `pnpm run verify:migrations` (optional, on deploy host) shows expand folder applied.

### Gate 2 — Inventory (read-only SQL)

Memberships with **no permission rows** (expect **0** for entitled staff after backfill):

```sql
SELECT COUNT(*) FROM "Membership" m
WHERE NOT EXISTS (
  SELECT 1 FROM "MembershipPermission" mp WHERE mp."membershipId" = m."id"
);
```

Active/trial subscriptions with **no add-on rows** and empty legacy CSV (paid rows should have rows or explicit empty `[]`):

```sql
SELECT COUNT(*) FROM "Subscription" s
WHERE s."status" IN ('ACTIVE', 'TRIAL')
  AND NOT EXISTS (SELECT 1 FROM "SubscriptionAddOn" sa WHERE sa."subscriptionId" = s."id")
  AND COALESCE(NULLIF(TRIM(s."addOns"), ''), '') = '';
```

Record counts. Non-zero empty-permission memberships or unexplained empty-add-on paid rows → investigate before DROP (may indicate backfill gap or pack-tier synthesis path — see [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md) Gate 2).

**Pre-DROP only** — confirm CSV columns still exist (skip after Gate 4):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('Membership', 'Subscription')
  AND column_name IN ('permissions', 'addOns');
```

Expect **2 rows** before DROP; **0 rows** after.

### Gate 3 — Pre-DROP app gate (hard requirement)

Live API release must **never** SELECT `Membership.permissions` or `Subscription.addOns`. This is the WARN gate in [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md) §15.

- [ ] Deployed API build matches post-**IIIIII** schema (no Prisma fields for dropped columns).
- [ ] No rollback plan that reintroduces an older API expecting CSV columns on disk.
- [ ] [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) migration #15 preflight acknowledged.

### Gate 4 — Contract DROP (operator)

**Preconditions:** Gates 0–3 satisfied; Gate 2 inventory reviewed.

Migration folder (already on disk):

```sql
-- 20260721090000_drop_membership_permissions_subscription_addons_csv
ALTER TABLE "Membership" DROP COLUMN IF EXISTS "permissions";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "addOns";
-- pendingAddOns intentionally retained
```

Deploy during a controlled window (deploy host — not a casual workstation):

```bash
pnpm --filter @gospots/api migrate:deploy
```

- [ ] `20260721090000_drop_membership_permissions_subscription_addons_csv` applied (folder #15 in [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) 18-folder batch).
- [ ] Gate 2 column-exists query returns **0 rows** for `permissions` / `addOns`.
- [ ] `_prisma_migrations` lists the DROP folder as applied.

**Rollback:** Neon PITR / branch only after DROP — CSV values cannot be reconstructed from join rows alone if rows were incomplete. **Forbidden:** `prisma migrate reset`.

### Gate 5 — Post-DROP verification

- [ ] Staff login + venue bind; permission-gated routes match pre-DROP behavior.
- [ ] Owner billing / Lemon webhook trial apply still writes `SubscriptionAddOn` rows + derived tier ([`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md)).
- [ ] `/auth/me` and staff list still expose computed permission/add-on CSV strings (wire compat — not DB columns).
- [ ] Pack module resolution for a spot-check paid shop unchanged.
- [ ] No Prisma/query errors referencing dropped column names in API logs.

### Gate 6 — Soak (recommended ≥ 7 days)

- [ ] No “permissions disappeared” or “module gate wrong” support tickets after DROP.
- [ ] Staff create/update and billing paths continue writing join rows only.
- [ ] §15 pack-tier backfill (if scheduled) confirms add-on rows authoritative — Gate 3 in [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md).

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Shipped** | Rows SoT; row-only writes; computed CSV on wire; DROP migration on disk. |
| **Operator now** | Confirm Gates 0–5 for your Neon project ([`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) marks **18/18 applied 2026-07-21**). |
| **Still open (optional)** | API arrays-only polish; `pendingAddOns` relational twin (explicitly out of scope). |

**Out of scope:** `Subscription.pendingAddOns` stays CSV-only. Pack vs tier collapse is separate ([`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md)).

---

## What shipped (Lane IIIIII)

### Schema

| Surface | SoT | Notes |
|---------|-----|-------|
| Staff permissions | `MembershipPermission` | CSV `Membership.permissions` **DROPPED** (migration on disk) |
| Subscription add-ons | `SubscriptionAddOn` | CSV `Subscription.addOns` **DROPPED** |
| Pending plan add-ons | `pendingAddOns` CSV | Unchanged |

### Reads

- `resolvePermissionSet` / `resolveAddOnIds`: when `permissionRows` / `addOnRows` is provided (including `[]`), rows are SoT; CSV args are fallback only for callers that never loaded rows (tests / helpers).
- JWT / `/me` / staff list emit **computed** CSV strings via `permissionsToEffectiveCsv` / `resolveAddOnsCsv`.

### Writes

- `replaceMembershipPermissionRows` / `replaceSubscriptionAddOnRows` (aliases `sync*`) replace join rows from token/id arrays (CSV string parse-only).
- Auth signup/venue create, staff create/update, billing webhook, dashboard pack apply, pack-tier backfill — **no CSV column writes**.

### Web

- `plan.ts` / `venue-packs.ts` already accept arrays/`addOnRows`; rows-primary resolve mirrored.

---

## Verify (code)

- jest venue-entitlements + pack-tier-backfill + venue-context + staff + auth.activate + billing (+ related) **80** PASS  
- `nest build` PASS  

---

## Related docs

- Expand SQL: `apps/api/prisma/migrations/20260720240000_membership_permissions_subscription_addons/migration.sql`  
- Contract: `apps/api/prisma/migrations/20260721090000_drop_membership_permissions_subscription_addons_csv/migration.sql`  
- Playbook: `GO_SPOTS_MIGRATION_PLAN.md` §M7  
- Pack tier (depends on §16 add-on rows): [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md)  
- Deploy batch: [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) · [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md)

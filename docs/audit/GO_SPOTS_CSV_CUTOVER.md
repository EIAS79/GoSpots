# Locora — Permissions / add-ons CSV column cutover

**Date:** 2026-07-20 (design) · **Updated:** 2026-07-21 (Lane IIIIII — DONE)  
**Status:** **DONE** — rows SoT + stop dual-write + DROP migration on disk.  
**Audit:** P1 §2.13 — CSV permissions / add-ons; migration plan **M7**; expand `20260720240000_*`; contract `20260721090000_drop_membership_permissions_subscription_addons_csv`.  
**Ship timing:** App cutover shipped. **OPERATOR:** Neon `migrate deploy` for DROP (no workstation Neon).  

---

## Recommendation (operator)

| When | Action |
|------|--------|
| **App deploy** | Rows-primary reads + row-only writes (no CSV columns in Prisma). |
| **Neon** | Deploy `20260721090000_*` after app that never SELECTs CSV columns is live. |
| **Residual** | `pendingAddOns` stays CSV; optional API array polish. |

**Out of scope:** `Subscription.pendingAddOns` stays CSV-only. Pack vs tier collapse is separate (`GO_SPOTS_PACK_TIER.md`).

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

## Contract migration (on disk)

```sql
-- 20260721090000_drop_membership_permissions_subscription_addons_csv
ALTER TABLE "Membership" DROP COLUMN IF EXISTS "permissions";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "addOns";
-- pendingAddOns intentionally retained
```

**Rollback:** Forward-fix / Neon PITR. **Forbidden:** `prisma migrate reset`.

---

## Verify

- jest venue-entitlements + pack-tier-backfill + venue-context + staff + auth.activate + billing (+ related) **80** PASS  
- `nest build` PASS  
- OPERATOR: Neon migrate DROP  

---

## Related docs

- Expand SQL: `apps/api/prisma/migrations/20260720240000_membership_permissions_subscription_addons/migration.sql`  
- Contract: `apps/api/prisma/migrations/20260721090000_drop_membership_permissions_subscription_addons_csv/migration.sql`  
- Playbook: `GO_SPOTS_MIGRATION_PLAN.md` §M7  

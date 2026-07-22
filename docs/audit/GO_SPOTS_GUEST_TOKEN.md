# Locora — Guest token dual-read cutover

**Date:** 2026-07-22 (operator checklist lane **GUEST11-plaintext-docs**)  
**Status:** Hash + expiry + revoke + clear CLI **shipped** (bible **#17 / §11** ship bar). Dual-read stop, contract DROP, and statusPath mail remain **operator / future app lane** — **no DROP migration folder on disk**.  
**Bible:** P1 **#17** / **§11** — guest-management tokens need explicit expiry and revocation.  
**Canonical operator path:** Clear leftover plaintext → soak → hash-only app deploy → contract DROP (future migration lane).

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Hash-at-rest + expiry + revoke on new issues | **DONE** | `guest-token.util.ts`; migration `20260720250000_guest_token_hash_expiry` |
| New writes persist hash only (`guestToken = null`) | **DONE** | `guestTokenPersistFields` |
| Dual-read lookup (hash OR legacy plaintext) | **DONE** (intentional window) | `guestTokenLookupWhere` |
| Post-verify plaintext clear CLI | **DONE** | `pnpm run clear:guest-plaintext`; `guest-plaintext-clear.util.ts` |
| Operator runs clear after smoke | **OPERATOR** | [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) smoke #3 + post-verify |
| Stop dual-read (hash-only lookup) | **RESIDUAL** (app lane) | Not deployed; Phase 1 below |
| DROP `guestToken` columns | **RESIDUAL** (operator + migration lane) | **No migration on disk** — illustrative SQL only |
| Status-update email `statusPath` for hash-only rows | **RESIDUAL** (optional product) | Phase 3 below; document-omit first |

---

## Operator cutover checklist (Clear → DROP)

Use this after Neon has applied `20260720250000_guest_token_hash_expiry` and production smoke #3 passes. **Do not skip gates** — DROP is irreversible without PITR.

### Gate 0 — Expand migration applied

- [ ] `20260720250000_guest_token_hash_expiry` applied on Neon (pgcrypto backfill + hash indexes).
- [ ] Smoke #3: new booking status link works (hash path); at least one known legacy plaintext link still resolves (dual-read OK during window).

### Gate 1 — Inventory (read-only SQL)

Run on production (or staging mirror). All **plaintext-without-hash** counts must be **0** (backfill complete):

```sql
SELECT COUNT(*) FROM "Reservation" WHERE "guestToken" IS NOT NULL AND "guestTokenHash" IS NULL;
SELECT COUNT(*) FROM "EventRequest" WHERE "guestToken" IS NOT NULL AND "guestTokenHash" IS NULL;
SELECT COUNT(*) FROM "GuestChat" WHERE "guestToken" IS NOT NULL AND "guestTokenHash" IS NULL;
```

Record **plaintext+hash** counts (clear targets — may be > 0 until Gate 2):

```sql
SELECT COUNT(*) FROM "Reservation" WHERE "guestToken" IS NOT NULL AND "guestTokenHash" IS NOT NULL;
SELECT COUNT(*) FROM "EventRequest" WHERE "guestToken" IS NOT NULL AND "guestTokenHash" IS NOT NULL;
SELECT COUNT(*) FROM "GuestChat" WHERE "guestToken" IS NOT NULL AND "guestTokenHash" IS NOT NULL;
```

### Gate 2 — Clear leftover plaintext (operator CLI)

From `apps/api` against the target database:

```bash
# Default dry-run — JSON counts only, no writes
pnpm run clear:guest-plaintext -- --dry-run

# Apply only when dry-run counts look expected (nulls guestToken where hash exists)
pnpm run clear:guest-plaintext -- --apply
```

**Safe by design:** never touches plaintext-only rows (no hash); does **not** drop columns or change lookup code.

- [ ] Dry-run reviewed (`counted.total` acceptable).
- [ ] `--apply` run.
- [ ] Re-run inventory: all three **plaintext+hash** counts → **0**.
- [ ] Spot-check: guest who only has the **create** email link can still open status (lookup uses hash of presented token).

### Gate 3 — Soak (recommended ≥ 7 days)

- [ ] No unexpected “status link broken” support tickets after clear.
- [ ] Cancel / NO_SHOW still revokes tokens; expired tokens rejected.
- [ ] Document dual-read as closed **only after** Gate 4 app deploy — until then legacy plaintext URLs may still match if any plaintext-only row existed (should be 0 post-backfill).

### Gate 4 — Stop dual-read (future **app** lane; not in repo yet)

Deploy an API release that narrows `guestTokenLookupWhere` to **hash-only** (no `OR guestToken`). Jest dual-read specs flip accordingly.

- [ ] App deployed; smoke #3 re-run with hash links only.
- [ ] Confirm no production dependency on DB plaintext column for lookup.

### Gate 5 — Contract DROP (future **migration** lane; **not on disk**)

**Preconditions:** Gate 4 live; Gate 2 counts = 0; optional Gate 3 soak complete.

There is **no** `drop_guest_token_plaintext` migration folder in `apps/api/prisma/migrations/` today. When a dedicated lane adds one, it should drop `guestToken` on all three models only after Gate 4:

```sql
-- Illustrative only — do not apply manually without a reviewed Prisma migration
ALTER TABLE "Reservation" DROP COLUMN "guestToken";
ALTER TABLE "EventRequest" DROP COLUMN "guestToken";
ALTER TABLE "GuestChat" DROP COLUMN "guestToken";
```

- [ ] Migration authored + reviewed (Prisma schema removes `guestToken` from Reservation / EventRequest / GuestChat).
- [ ] Neon `migrate deploy` during maintenance window.
- [ ] Post-DROP: `pnpm run clear:guest-plaintext` should report `counted.total = 0` (tool becomes no-op).

**Rollback:** forward-fix only after DROP — raw tokens cannot be reconstructed. Prefer Neon PITR / branch if premature. **Forbidden:** `prisma migrate reset`.

### Gate 6 — Status email residual (optional; does not block DROP)

Hash-only rows omit `statusPath` in status/cancel mails (guest keeps create-email link). See Phase 3 below. Ship DROP with **Option A — document omit** unless product adds resend/rotate.

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Through Friday Neon deploy** | Keep dual-read (`guestTokenHash` OR legacy `guestToken`). New writes stay hash-only. Document dual-read as known limitation. |
| **Post-deploy smoke** | Prove hash status links work; legacy plaintext links still resolve ([`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) smoke #3). |
| **Verification window** | Run `pnpm run clear:guest-plaintext` dry-run → `--apply` (Lane PP). Confirm leftover plaintext+hash count → **0**. Do **not** DROP columns yet. |
| **After confidence** | Stop dual-read lookups → hash-only verify → contract migration drops `guestToken` on Reservation / EventRequest / GuestChat. Optionally fix status-update email `statusPath` residual (Phase B). |
| **Before Friday** | **No cutover code**, no DROP migration folder. |

**Why defer:** DROP is irreversible without PITR. Dual-read still protects old emailed / bookmarked status URLs until operators clear and soak. Hash path already closes “plaintext at rest forever” for **new** issues.

---

## What exists today

### Models (three token namespaces)

| Surface | Columns | TTL helper |
|---------|---------|------------|
| `Reservation` | `guestToken?`, `guestTokenHash?` (unique), `guestTokenExpiresAt`, `guestTokenRevokedAt` | `GUEST_TOKEN_DEFAULT_TTL_MS` (30d) |
| `EventRequest` | same | same (30d) |
| `GuestChat` | same | `GUEST_CHAT_TOKEN_TTL_MS` (7d) |

Expand migration on disk: `20260720250000_guest_token_hash_expiry` (pgcrypto backfill hashes + expiry; **keeps** plaintext).

### Helpers (`guest-token.util.ts`)

| Helper | Behavior |
|--------|----------|
| `issueGuestToken` / `guestTokenPersistFields` | Persist **hash + expiry only**; `guestToken = null` |
| `guestTokenLookupWhere` | `shopId` + `OR: [{ guestTokenHash }, { guestToken }]` |
| `verifyPresentedGuestToken` | Timing-safe compare when both sides present |
| `assertGuestTokenActive` | Expiry + revoke refuse reuse |
| `guestTokenRevokeFields` | Set `guestTokenRevokedAt`; clear plaintext |

### Clear CLI (Lane PP)

- `guest-plaintext-clear.util` + `pnpm run clear:guest-plaintext`
- Dry-run by default; `--apply` nulls `guestToken` **only** where `guestTokenHash` is set
- Never touches plaintext-only rows (no hash yet — should be rare after backfill)
- Documented under [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) post-verify

### Accepted Friday residual

1. Dual-read still resolves legacy plaintext until clear + soak.  
2. Status-change / cancel emails set `statusPath` **only when** `row.guestToken` plaintext is still present — hash-only rows cannot re-derive raw; guest keeps the **create** email link ([`reservations.service`](../../apps/api/src/modules/reservations/reservations.service.ts) comments ~1336–1343).  
3. Staff serializers already avoid leaking hash/plaintext (`hasGuestLink` style).

---

## Problem (bible #17 residual)

Deep audit required expiry + revocation + no long-lived plaintext. Shipped expand closes create/validate/revoke. Remaining risks:

1. **Legacy plaintext column** still exists and is readable via dual-read until cleared and dropped.  
2. **Operator must run clear** after migrate — not automatic.  
3. **Status-update emails** omit status URL for hash-only rows (guest relies on original link).  
4. **Three namespaces** (reservation / event / chat) must cut over together so lookup helpers stay consistent.

---

## Goal (post-submit)

1. DB has **no** guest plaintext columns.  
2. Lookups are **hash-only** (no `OR guestToken`).  
3. Guests still reach status/cancel/chat via the raw token they were emailed once.  
4. Optional: status-update mails either omit link deliberately (documented) **or** use a non-secret deep link that still requires the raw token from the guest’s prior email (no re-issue without rotate).

**Non-goals for cutover v1:**

- Re-issuing / rotating guest tokens from staff UI (separate product)  
- Unifying the three namespaces into one GuestCheck token ([`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md))  
- Changing public status URL shape (`/venue/{slug}/…-status/{token}`)  
- Touching hot `reservations.service` rewrite beyond lookup helper narrowing

---

## Phased plan

### Phase 0 — Inventory (read-only; can start after Neon migrate)

Pass criteria:

| Check | Pass when |
|-------|-----------|
| Hash coverage | Count of rows with non-null plaintext and **null** hash → **0** (backfill complete) |
| Leftover plaintext+hash | After clear `--apply`, count → **0** |
| Smoke | New book → hash link works; one known legacy plaintext link still works **until** clear (then expect 404/invalid) |
| Revoke | Cancel / NO_SHOW refuses reuse |

Suggested counts (illustrative):

```sql
-- Should be 0 after expand backfill
SELECT COUNT(*) FROM "Reservation" WHERE "guestToken" IS NOT NULL AND "guestTokenHash" IS NULL;
SELECT COUNT(*) FROM "EventRequest" WHERE "guestToken" IS NOT NULL AND "guestTokenHash" IS NULL;
SELECT COUNT(*) FROM "GuestChat" WHERE "guestToken" IS NOT NULL AND "guestTokenHash" IS NULL;

-- Leftover plaintext with hash (clear target)
SELECT COUNT(*) FROM "Reservation" WHERE "guestToken" IS NOT NULL AND "guestTokenHash" IS NOT NULL;
-- …same for EventRequest, GuestChat
```

Prefer **≥ 7 days** after clear with no “old link broke unexpectedly” tickets from guests who only had create-email links (those should still work via hash).

### Phase 1 — Stop dual-read (app only; no DROP)

| Change | Detail |
|--------|--------|
| `guestTokenLookupWhere` | Hash-only: `{ shopId, guestTokenHash: hash }` |
| Specs | Drop / flip dual-read cases that assert plaintext OR; keep revoke/expiry |
| Clear CLI | Keep as no-op safety (counts stay 0) or retire after DROP |
| Deploy | One app release that never matches on plaintext |

**Gate:** Phase 0 counts green; no support need for pre-hash plaintext-only URLs.

### Phase 2 — Contract DROP (migration after Phase 1 live)

**No migration folder on disk today.** See **Gate 5** in the operator checklist above. When a lane adds `drop_guest_token_plaintext`, use:

```sql
-- 20YYMMDDHHMMSS_drop_guest_token_plaintext
-- Preconditions: app hash-only lookup deployed; leftover plaintext counts = 0.

ALTER TABLE "Reservation" DROP COLUMN "guestToken";
ALTER TABLE "EventRequest" DROP COLUMN "guestToken";
ALTER TABLE "GuestChat" DROP COLUMN "guestToken";
```

Prisma: remove `guestToken` from the three models; keep hash / expiry / revoke.

**Rollback:** Forward-fix only after DROP (restore column + re-backfill impossible without raw tokens). Prefer Neon PITR / branch if premature. **Forbidden:** `prisma migrate reset`.

### Phase 3 — Status email `statusPath` residual (optional, can parallel Phase 1)

| Option | Pros | Cons |
|--------|------|------|
| **A — Document omit** (status quo for hash-only) | Zero secret risk; guest keeps create link | Update/cancel mail lacks deep link |
| **B — Staff “resend status link”** | Explicit re-issue new raw + rotate hash | Needs UI + revoke old; touches reservations/mail |
| **C — Opaque booking id + email proof** | No token in update mail | New authz model; larger scope |

**Recommendation:** Ship cutover with **Option A** documented in guest mail copy (“use the link from your booking confirmation”). Defer B/C to a dedicated product lane — do **not** block DROP on B.

---

## Explicit deferral

| Item | Timing |
|------|--------|
| Operator clear CLI run | After Friday migrate + smoke #3 |
| Stop dual-read (Phase 1) | After verification confidence |
| DROP `guestToken` columns (Phase 2) | After Phase 1 app deploy |
| StatusPath re-issue / rotate UI | Separate post-submit product lane |
| Unified GuestCheck token | [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md) |
| Any cutover code / DROP migration this week | **Do not start** |

---

## Related docs

- Expand SQL: `apps/api/prisma/migrations/20260720250000_guest_token_hash_expiry/migration.sql`  
- Util + clear: `apps/api/src/common/guest-token.util.ts`, `guest-plaintext-clear.util.ts`  
- Operator: [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) post-verify; [`REMAINING_P0_FRIDAY.md`](./REMAINING_P0_FRIDAY.md)  
- Migration playbook: [`GO_SPOTS_MIGRATION_PLAN.md`](./GO_SPOTS_MIGRATION_PLAN.md) guest-token notes  
- Wave notes: [`GO_SPOTS_IMPLEMENTATION_REPORT.md`](./GO_SPOTS_IMPLEMENTATION_REPORT.md) guest-token sections  
- CSV cutover pattern (parallel dual-read → DROP): [`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md)

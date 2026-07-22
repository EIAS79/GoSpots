# Locora — Guest token dual-read cutover (design only)

**Date:** 2026-07-21  
**Status:** Expand + clear tooling **shipped** — bible **#17 DONE** (Lane **DDDDDD**). Dual-read stop / DROP plaintext / statusPath mail residual remain operator/post-verification (no apps cutover code before clear soak).  
**Bible:** P1 **#17** — guest-management tokens need explicit expiry and revocation (hash-at-rest shipped; plaintext dual-read residual).  
**Ship timing:** Hash + expiry + revoke + clear CLI **already shipped**. **Stop dual-read / DROP plaintext / statusPath mail fix defer until after Friday submit + verification window.**

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

Illustrative — **do not add this folder before Phase 1 is live in prod.**

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

# GoSpots / Locora — Migration Plan (Phase 1)

**Rule:** Never recommend `prisma migrate reset` for production or shared Neon. Use expand → backfill → contract. Always `prisma migrate deploy`.

Schema today: PostgreSQL, Prisma 6, migrations under `apps/api/prisma/migrations/`.  
**Money (wave 2):** core commercial columns are `Decimal(19,4)` via `20260720230000_money_decimal_core`. `billingDiscountPercent` remains Float (percent, not money).  
**Guest tokens (wave 2):** hash + expiry expand via `20260720250000_guest_token_hash_expiry` (dual-read plaintext until contract).  
**Webhook receipts (wave 1):** `BillingWebhookEvent` via `20260720210000_billing_webhook_events`.

---

## 1. Candidate migrations (only where audit CONFIRMED need)

### M1 — Money columns (CONFIRMED — **core cutover shipped wave 2**)

**Why:** Commercial amounts were `Float` (`MenuItem.price`, rates, orders, transactions, play, losses, reservation billing).

**Shipped approach:** In-place `ALTER COLUMN … TYPE DECIMAL(19,4) USING ROUND((col)::numeric, 4)` (preserves values; no silent truncate beyond 4dp).

**Columns converted:**

| Table | Columns |
|-------|---------|
| MenuItem | price |
| ResourceRate | price |
| Resource | hourlyRate |
| Reservation | billedAmount, billingBaseAmount |
| PlaySession | amount |
| ShopOrder | total, reservationFee |
| ShopOrderLine | unitPrice |
| Transaction | amount |
| TransactionLineItem | unitPrice, total |
| ShopLoss | amount |

**Not converted:** `billingDiscountPercent` (percent). Ratings remain Int.

**API serialization:** numbers via `serializeMoney` / `toMoneyNumber` (compat). String form available as `serializeMoneyString`.

**Validation (operator, after migrate deploy):**

```sql
-- Spot-check: no NULL surprises on required money cols; sample precision
SELECT COUNT(*) FILTER (WHERE price IS NULL) AS null_prices FROM "MenuItem";
SELECT COUNT(*) FILTER (WHERE amount IS NULL) AS null_tx FROM "Transaction";
SELECT id, price::text FROM "MenuItem" ORDER BY "updatedAt" DESC LIMIT 20;
SELECT id, amount::text, total::text FROM "TransactionLineItem" ORDER BY id DESC LIMIT 20;
```

**Still later:** M6 currency stamps; ledger (M3); any remaining app paths not yet using `money.util`.

**Rollback:** reverse type to `double precision` or Neon PITR — **never reset**.

---

### M2 — Billing webhook receipts (CONFIRMED — **shipped wave 1**)

```prisma
model BillingWebhookEvent {
  id           String   @id @default(cuid())
  provider     String   // "lemon_squeezy"
  eventId      String   // Lemon event id or hash(payload meta)
  eventName    String
  shopId       String?
  payloadHash  String?
  processedAt  DateTime @default(now())
  @@unique([provider, eventId])
  @@index([shopId, processedAt])
}
```

**Migration:** `20260720210000_billing_webhook_events`  
**Backfill:** None required (empty table).  

**Compatibility:** Handler: insert receipt first (or upsert); on unique conflict return `{ ok: true, duplicate: true }` without re-applying side effects.  

**Rollback:** Stop writing table; drop model later if abandoned.

---

### M3 — Financial ledger (CONFIRMED needed for long-term; can stage)

**Why:** Fragmented `Transaction` / `ShopOrder` / `PlaySession` / `Reservation.billedAmount`.

**Candidate:**

```prisma
model LedgerEntry {
  id            String   @id @default(cuid())
  shopId        String
  currency      String
  amountMinor   Int      // or Decimal — match M1 Decimal(19,4)
  kind          String   // SALE, REFUND, ADJUSTMENT, …
  sourceType    String   // SHOP_ORDER, TRANSACTION, PLAY_SESSION, RESERVATION, …
  sourceId      String
  occurredAt    DateTime
  createdAt     DateTime @default(now())
  @@unique([shopId, sourceType, sourceId, kind]) // idempotent post
  @@index([shopId, occurredAt])
}
```

**Backfill:** Script posting historical completed orders, SALE transactions, paid play (no reservation), billed reservations — **one post per source**, never sum duplicates.  

**Compatibility:** Analytics dual-read: prefer ledger if shop has any entries after cutover date; else legacy aggregate.  

**Rollback:** Feature-flag ledger reads off; keep legacy writers.

**Deferred to wave 3+** — money type decided and core columns converted.

---

### M4 — Guest token hashes + expiry (CONFIRMED — **expand shipped wave 2**)

**Models:** `Reservation`, `EventRequest`, `GuestChat`.

**Shipped expand (`20260720250000_guest_token_hash_expiry`):**

- `guestTokenHash String? @unique`
- `guestTokenExpiresAt DateTime?`
- `guestTokenRevokedAt DateTime?`
- `GuestChat.guestToken` made nullable
- Backfill: `encode(digest(guestToken, 'sha256'), 'hex')` via pgcrypto; expiry = endsAt/preferredEnds/createdAt + TTL

**App behavior:**

- New writes: hash only (plaintext null); raw returned once in API/email
- Dual-read: `guestTokenHash` OR legacy `guestToken`
- Timing-safe hash compare; reject expired/revoked
- Revoke on cancel / chat end

**Contract (later):**

- Null out remaining plaintext after dual-read window verified
- Drop `guestToken` column

**Breakage note:** Email/SMS links with old tokens keep working during dual-read window.

---

### M5 — Shop timezone (CONFIRMED needed)

```prisma
// on Shop
timezone String @default("UTC") // IANA
```

**Backfill:** Map from existing `locale` using current `localeToTz` table; default UTC.  

**Compatibility:** App prefers `shop.timezone` over locale map.  

**Rollback:** Ignore column; fall back to locale map.

---

### M6 — Currency stamp on monetary rows (PARTIALLY needed)

Add `currency String` (ISO 4217) to `Transaction`, `ShopOrder`, `PlaySession`, `ShopLoss`, and reservation billing fields group.

**Backfill:** `SET currency = Shop.currency` via join.  

**Compatibility:** Reports group by currency.  

**Depends on:** Prefer after M1 (M1 core done).

---

### M7 — Permissions / add-ons tables (CONFIRMED eventual; not blocking P0)

```prisma
model MembershipPermission {
  membershipId String
  permission   String
  @@id([membershipId, permission])
}
model SubscriptionAddOn {
  subscriptionId String
  addOnId        String
  @@id([subscriptionId, addOnId])
}
```

**Backfill:** Parse CSV → rows. Dual-read CSV until contract.  

**Defer** until after P0 integrity (per fix plan).

---

### M8 — Webhook / money: areas that do **NOT** need migration yet

| Area | Verdict | Evidence |
|------|---------|----------|
| CSRF tokens | No schema | Cookie/SameSite policy |
| 2FA | No schema until product | Absent today |
| Owner session list | **No migration** | `AuthSession` already exists |
| Dashboard key | **No migration** | `dashboardKey` already on `Shop` |
| Dual pack/tier | **No immediate migration** | Keep `tier` derived; drop later |
| Dining vs seating unify | **Product first** | Don’t migrate until model chosen |
| Unified guest check | New tables later | Not started |
| Realtime | No schema | Absent |
| Image storage | **No migration** | `StoredImage` works; policy only |
| Stock columns | **No migration for types** | Int stock OK; fix transactions in app |
| Overlap exclusion constraint | **Optional Postgres DDL** | Can be raw SQL migration without Prisma model |

---

## 2. Optional raw SQL: booking exclusion (Phase D)

If using Postgres ranges:

```sql
-- Illustrative only; refine active status filter
-- CREATE EXTENSION IF NOT EXISTS btree_gist;
-- ALTER TABLE "Reservation" ADD EXCLUDE USING gist (
--   "resourceId" WITH =,
--   tstzrange("startsAt", "endsAt", '[)') WITH &&
-- ) WHERE ("resourceId" IS NOT NULL AND "status" IN ('PENDING','CONFIRMED','CHECKED_IN'));
```

**Risk:** Fails if existing overlapping rows exist — **must** clean data first.  

**Rollback:** `DROP INDEX` / drop constraint.  

**Never reset DB to “fix” overlaps.**

---

## 3. Backfill / compatibility playbook

1. Deploy expand migration (`migrate deploy`)  
2. Deploy app dual-write / dual-read  
3. Run backfill job (idempotent, batched, logged) on Neon  
4. Verify row counts + checksum samples  
5. Deploy read-prefer-new  
6. Stop dual-write  
7. Contract migration drops old columns  

Document backfill commands in `docs/` when implemented — not in this phase.

---

## 4. Rollback notes (production)

- Prefer **forward fixes** over reset  
- Keep previous Render deploy + prior migration reversible only if contract not applied  
- Neon PITR / branch restore for disaster — ops Phase H  
- **Forbidden:** `prisma migrate reset`, `db push --force-reset`, dropping prod data to “re-seed”

---

## 5. Local / CI databases

- Local: `docker-compose.yml` Postgres 16  
- CI: ephemeral Postgres service; apply migrations fresh per job  
- Do not point CI at production Neon  
- Ignore/remove reliance on `apps/api/prisma/dev.db` for Postgres workflows

---

## 6. Suggested migration order

1. M2 Webhook receipts — **done (wave 1)**  
2. M5 Timezone (small) — still open  
3. M1 Money core cutover — **done (wave 2)**  
4. M6 Currency stamps — next money wave  
5. M4 Guest token hash expand — **done (wave 2)**; contract later  
6. M3 Ledger (wave 3+)  
7. Exclusion constraint (after overlap cleanup)  
8. M7 Permissions tables (architecture phase)  

---

*Aligned with `GO_SPOTS_DEEP_AUDIT.md` and `GO_SPOTS_FIX_PLAN.md`.*

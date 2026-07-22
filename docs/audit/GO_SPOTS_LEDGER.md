# Unified financial ledger

**Date:** 2026-07-20 (design) / 2026-07-21 (Phase 1–2 code)  
**Status:** **DONE** for Phase 1–2 ship bar — `LedgerEntry` + dual-write (`LEDGER_DUAL_WRITE` default off). Analytics still interim contract until Phase 4.  
**Related:** Deep audit §2.2; **`GO_SPOTS_FINANCE_CONTRACT.md`** (binding interim reporting); `GO_SPOTS_MIGRATION_PLAN.md` M3; `GO_SPOTS_MONEY_DECISION.md`; `GO_SPOTS_CURRENCY_STAMPS.md`; `GO_SPOTS_UNIFIED_TICKET.md` (settle-root adjacency).  
**Lane:** **LEDGER6-ledger-dual-write**.

---

## 1. Why the interim finance contract exists

Before Friday, revenue KPIs, `/finance/analytics`, CSV export, and top-items rollups must stay **correct under ops discipline** without a schema rewrite of money posting.

The interim contract (`GO_SPOTS_FINANCE_CONTRACT.md`) does that by:

1. Defining **four mutually exclusive revenue channels** (menu orders, quick sales, play/tables, dining/other reservations).
2. Requiring every surface to use the same aggregator (`sumRevenueChannels` in `finance-analytics.util.ts`).
3. Encoding anti-double-count rules in **query filters** (e.g. linked `PlaySession` excluded when `reservationId` is set; SALE-only for `Transaction`; losses only in profit).

That is a **reporting contract**, not a ledger. It accepts known gaps:

| Gap | Why interim accepts it |
|-----|------------------------|
| No FK between `ShopOrder` ↔ `Transaction` / `Reservation` | Staff double-entry across channels cannot be auto-deduped |
| No per-row currency stamp (yet) | Shop-level currency assumed; M6 stamps are post-Friday design |
| Refunds not netted into gross KPI | SALE-only gross; REFUND stays out of channel sum |
| Completing a kitchen ticket does not post a `Transaction` | Two menu paths stay separate channels by policy |

**Ship decision:** keep the interim contract through Friday Neon deploy + submit notes. The long-term fix is an append-only `LedgerEntry` (this doc + migration plan M3). **Do not implement ledger posting, dual-write, or analytics cutover before Friday.**

---

## 2. As-is money stores (what the ledger replaces for *reporting*)

Operational rows remain. The ledger becomes the **single posting target for “this money event counted once.”** Source tables keep lifecycle, stock, kitchen, and floor semantics.

| Source | Role today | Interim channel | Ledger should post when |
|--------|------------|-----------------|-------------------------|
| `ShopOrder` (`COMPLETED`, not archived) | Kitchen / menu ticket | `revenueMenuOrders` | Status → `COMPLETED` (amount = `total`, includes embedded `reservationFee`) |
| `Transaction` (`kind = SALE`) | Quick sale POS | `revenueQuickSales` | SALE create (amount = `amount`) |
| `Reservation` (`billedAmount` set, `resourceId != null`) | Booked play bill | `revenuePlaySessions` | Mark play billing paid |
| `PlaySession` walk-in paid (`reservationId = null`, completed) | Floor walk-in bill | `revenuePlaySessions` | Paid complete (not when linked to reservation) |
| `Reservation` (`billedAmount` set, `resourceId = null`) | Dining / other bill | `revenueReservations` | Mark billed paid |
| `Transaction` (`REFUND`) | Refund of quick sale | *(excluded from gross)* | Optional `REFUND` entry (net reports later) |
| `Transaction` (`EXPENSE` / `ADJUSTMENT`) | Non-revenue cash movements | *(not in gross)* | Optional non-revenue kinds |
| `ShopLoss` | Shrink / spoilage | Profit only (`revenue − losses`) | Optional `LOSS` kind or keep loss table + subtract |

**Hard exclusivity (must survive cutover):**

1. Linked play (`PlaySession.reservationId` set) → **never** post play amount; payment lives on `Reservation.billedAmount` only.
2. Completing `ShopOrder` → **never** also invent a SALE `Transaction` for the same ticket (no auto-bridge until unified ticket settle-root).
3. `ShopOrder.reservationFee` → menu channel only; do not also post the same fee as reservation billing.
4. One source event → **at most one** revenue `LedgerEntry` (idempotent unique key).

---

## 3. Target model: `LedgerEntry`

Align with M3 sketch, money decision (Decimal, not rushed minor units), and currency-stamps requirement (**`currency` from day one**).

```prisma
model LedgerEntry {
  id          String   @id @default(cuid())
  shopId      String
  shop        Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)

  /// ISO 4217; stamped at post time (never infer later from Shop.currency alone)
  currency    String
  /// Signed commercial amount; Decimal(19,4) — match M1 / money.util
  amount      Decimal  @db.Decimal(19, 4)

  kind        LedgerKind
  channel     LedgerChannel?  // set for revenue kinds; null for LOSS/EXPENSE/etc.
  sourceType  LedgerSourceType
  sourceId    String

  /// Business time for windowing (maps interim timestamps)
  occurredAt  DateTime
  createdAt   DateTime @default(now())
  createdById String?

  /// Optional correlation (unified ticket / guest check later)
  guestCheckId String?

  @@unique([shopId, sourceType, sourceId, kind]) // idempotent post
  @@index([shopId, occurredAt])
  @@index([shopId, channel, occurredAt])
  @@index([shopId, sourceType, sourceId])
}

enum LedgerKind {
  SALE
  REFUND
  EXPENSE
  ADJUSTMENT
  LOSS
}

enum LedgerChannel {
  MENU_ORDERS
  QUICK_SALES
  PLAY_SESSIONS
  RESERVATIONS
}

enum LedgerSourceType {
  SHOP_ORDER
  TRANSACTION
  PLAY_SESSION
  RESERVATION
  SHOP_LOSS
}
```

### 3.1 Field rules

| Field | Rule |
|-------|------|
| `amount` | Positive for SALE/LOSS/EXPENSE magnitude as today; REFUND stored **positive** with `kind = REFUND` (sign applied in net views). Prefer Decimal arithmetic in posters; avoid IEEE float until `serializeMoney` at API edge. |
| `currency` | Required. Prefer row stamp from M6 when present; else `Shop.currency` at post time. Never change after insert (append-only). |
| `channel` | Required for gross-revenue kinds that feed KPIs; maps 1:1 to interim API fields (`revenueMenuOrders` ↔ `MENU_ORDERS`, etc.). |
| `occurredAt` | Same stamps as interim contract: order `completedAt`; tx `createdAt`; reservation `billedAt`; walk-in play `completedAt` (fallback `updatedAt`). |
| Unique key | Re-post / retry / dual-write replay must no-op on conflict (`P2002` / upsert ignore). |

### 3.2 What is *not* in v1

- Full double-entry (debit/credit accounts) — single economic event row is enough for venue KPIs.
- Line-item ledger rows — top-items stay on `ShopOrderLine` / `TransactionLineItem` until a later phase.
- Automatic merge of duplicate staff entry across channels — still ops + future `GuestCheck` settle-root (`GO_SPOTS_UNIFIED_TICKET.md`).
- Replacing `Transaction` / `ShopOrder` / play billing UX — sources remain systems of record for ops.

---

## 4. Source → ledger mapping (migration rules)

Backfill and live post must use **one post per source**, never “sum then post.”

| `sourceType` | Eligibility (same as interim) | `kind` | `channel` | `amount` | `occurredAt` |
|--------------|-------------------------------|--------|-----------|----------|--------------|
| `SHOP_ORDER` | `status = COMPLETED`, `archivedAt = null` | `SALE` | `MENU_ORDERS` | `total` | `completedAt` |
| `TRANSACTION` | `kind = SALE` | `SALE` | `QUICK_SALES` | `amount` | `createdAt` |
| `TRANSACTION` | `kind = REFUND` | `REFUND` | `QUICK_SALES` or null | `amount` | `createdAt` |
| `TRANSACTION` | `EXPENSE` / `ADJUSTMENT` | matching | null | `amount` | `createdAt` |
| `RESERVATION` | `billedAmount` set, `resourceId != null` | `SALE` | `PLAY_SESSIONS` | `billedAmount` | `billedAt` |
| `RESERVATION` | `billedAmount` set, `resourceId = null` | `SALE` | `RESERVATIONS` | `billedAmount` | `billedAt` |
| `PLAY_SESSION` | paid walk-in: `reservationId = null`, completed, not canceled/archived | `SALE` | `PLAY_SESSIONS` | `amount` | `completedAt` (fallback `updatedAt`) |
| `PLAY_SESSION` | `reservationId != null` | **skip** | — | — | — |
| `SHOP_LOSS` | all (if posting losses) | `LOSS` | null | `amount` | `occurredAt` |

**Gross revenue for a window (ledger era)** =

```
sum(amount) where kind = SALE
  and channel in (MENU_ORDERS, QUICK_SALES, PLAY_SESSIONS, RESERVATIONS)
  and occurredAt in window
```

This must numerically match `sumRevenueChannels` for the same shop/window on fixtures that obey exclusivity (no cross-channel duplicate staff entry).

**Profit (ledger era):** gross − `LOSS` (and optionally EXPENSE, product decision — today only `ShopLoss` hits profit).

---

## 5. Dual-write phases (post-Friday only)

Do **not** open these phases before Friday submit. Order is deliberate: expand → write → backfill → dual-read → prefer ledger → (optional) stop legacy aggregate.

### Phase 0 — Design freeze (this doc)

- Binding interim contract remains for all shipping surfaces.
- Hot file `finance.service.ts` / analytics util stay on channel sum.
- Exit: this doc + board complete; no Prisma model.

### Phase 1 — Expand (DDL only)

- Add `LedgerEntry` (+ enums) migration. **No app writers yet.**
- Prefer after or alongside M6 currency stamps so backfill can copy `currency` from stamped sources.
- No `migrate reset`.

### Phase 2 — Live dual-write (feature-flagged)

- On each interim posting event, in the **same DB transaction** as the source mutation (or immediately after with idempotent unique):
  - order complete → post `SHOP_ORDER`
  - quick SALE/REFUND create → post `TRANSACTION`
  - reservation mark paid → post `RESERVATION`
  - walk-in play mark paid → post `PLAY_SESSION` (skip if `reservationId` set)
  - optional: `ShopLoss` create → post `SHOP_LOSS`
- Analytics **still read legacy** channel sum.
- Flag: `LEDGER_DUAL_WRITE=1` (default off until soak).

### Phase 3 — Historical backfill

- Script: for each shop, scan eligible sources older than dual-write start; insert missing ledger rows (`skipDuplicates` / catch unique).
- Never double-post linked play + billed reservation.
- Verify: per shop, per day, ledger gross ≈ interim `sumRevenueChannels` (tolerance = known ops duplicates only; log diffs).

### Phase 4 — Dual-read analytics

- `buildFinanceAnalytics` / `computeRevenueSince`: if shop has any ledger row with `occurredAt >= cutover` (or shop flag `ledgerReadsAt`), **prefer ledger sum by channel**; else legacy.
- CSV + dashboard KPIs must share the same prefer path (do not re-sum overlapping client fields — same rule as interim contract).
- Flag: `LEDGER_READS=1` per env or per-shop column.

### Phase 5 — Ledger-primary + legacy freeze

- New money events must post ledger; legacy aggregates become fallback for pre-cutover windows only.
- Update / supersede `GO_SPOTS_FINANCE_CONTRACT.md`: “revenue = ledger SALE by channel” becomes binding; four channels remain as **ledger channel enum**, not four independent tables.
- Rollback: turn off `LEDGER_READS`; keep dual-write or pause writers; never delete ledger rows in rollback (append-only).

### Phase 6 — Adjacency (separate lanes)

- **Unified ticket settle-root** (`GO_SPOTS_UNIFIED_TICKET.md`): one settle posts one (or atomically several channel) ledger rows — must not break exclusivity.
- **Currency stamps (M6):** stamps feed `LedgerEntry.currency`; after ledger-primary, stamps on sources are still useful for ops display.
- Top-items: remain menu-line aggregates until optional `LedgerLine` exists.

---

## 6. Compatibility with the interim contract

Until Phase 5, **`GO_SPOTS_FINANCE_CONTRACT.md` remains the binding reporting contract.**

When cutting over:

| Interim rule | Ledger equivalent |
|--------------|-------------------|
| Four exclusive channels | `LedgerChannel` enum; one SALE post per source |
| Linked play excluded | No `PLAY_SESSION` post when `reservationId` set |
| Order complete ≠ Transaction | Separate `sourceType`s; no auto duplicate post |
| Do not client-sum channels on top of total | Same: expose channel fields + `summary.revenue` from one aggregator |
| Refunds out of gross KPI | `kind = SALE` only for gross; REFUND separate |
| Losses only in profit | `kind = LOSS` or keep `ShopLoss` subtract |

Any change to posting that collapses channels (e.g. single settle root) requires an **explicit** finance-contract revision in the same PR as the code.

---

## 7. Risks and exit criteria

| Risk | Mitigation |
|------|------------|
| Dual-write misses a path | Checklist of all pay/complete entry points; integration tests per source |
| Backfill ≠ live for edge statuses | Mirror interim filters exactly; golden fixtures from `finance-analytics.util.spec` |
| Float math drift | Post with `toPrismaDecimal` / Decimal add; compare with `roundMoney` tolerance |
| Hot-file collisions | Own `finance.service.ts` + analytics util only under coordination board; no parallel ledger lanes |
| Premature Friday work | **Hard stop:** no model, migration, or writer before submit |

**Phase 4/5 exit criteria (post-ship):**

1. Integration: complete order counted once; walk-in vs billed reservation; SALE vs order exclusivity.
2. Daily close totals match fixtures under both read modes during dual-read soak.
3. Idempotent re-post does not inflate revenue.
4. Implementation report + finance contract updated; this doc marked superseded or “shipped.”

---

## 8. Ship bar vs residual (Phase 1–2 DONE)

**Shipped (LEDGER6):**
- `LedgerEntry` + enums in `schema.prisma` + migration `20260721100000_ledger_entry` on disk (RLS).
- Dual-write helpers + hooks behind `LEDGER_DUAL_WRITE` (default off).
- Interim four-channel analytics contract unchanged (`GO_SPOTS_FINANCE_CONTRACT.md`).

**Still residual (not this ship bar):**
- Phase 3 historical backfill script.
- Phase 4+ `LEDGER_READS` analytics prefer-ledger cutover.
- Neon `migrate deploy` + live `LEDGER_DUAL_WRITE=on` soak (**OPERATOR**).

**Operator note:** until Neon migrate + flag soak, production still runs interim channel-sum only.
)
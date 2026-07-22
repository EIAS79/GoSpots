# Finance reporting contract (interim — no full ledger)

**Date:** 2026-07-20  
**Status:** Binding for dashboard KPIs, `/finance/analytics`, CSV export, and top-items rollups.  
**Not in scope:** append-only `LedgerEntry` rewrite (post-ship).

---

## Single source of truth for “revenue”

Gross **venue revenue** for a time window is the sum of **four mutually exclusive channels**. Every surface that shows a total must use the same aggregator (`sumRevenueChannels` in `finance-analytics.util.ts`).

| Channel | API field(s) | Authoritative rows | Timestamp for window |
|---------|--------------|--------------------|----------------------|
| Menu orders | `revenueMenuOrders` | `ShopOrder` with `status = COMPLETED`, `archivedAt = null` | `completedAt` |
| Quick sales | `revenueQuickSales` | `Transaction` with `kind = SALE` | `createdAt` |
| Play / tables | `revenuePlaySessions` | (1) `Reservation` with `billedAmount` set **and** `resourceId != null`; (2) **walk-in** `PlaySession` that is paid (`status = COMPLETED` **or** `completedAt` set) **and** `reservationId = null`, not canceled/archived | (1) `billedAt`; (2) `completedAt` (fallback `updatedAt` if completed without stamp) |
| Dining / other reservations | `revenueReservations` | `Reservation` with `billedAmount` set **and** `resourceId = null` | `billedAt` |

**Total revenue** = menu + quick + play + reservations.

| Surface | Reads |
|---------|--------|
| Dashboard KPIs (`revenueToday` / `revenueWeek`) | `computeRevenueSince` → same channel sum |
| Finance reports / charts / daily close | `buildFinanceAnalytics` → same channel sum + day buckets |
| CSV export | `summary.revenue` and per-channel fields from analytics (do **not** re-sum overlapping client fields) |
| Finance overview cards | Channel fields from analytics; week total from dashboard KPI (same math) |

---

## What must NOT be summed together

1. **Linked play + billed resource reservation** — If `PlaySession.reservationId` is set, that session’s `amount` is **never** included in revenue. Payment for booked play is `Reservation.billedAmount` only (Game billing → mark paid).
2. **Shop order completion ≠ Transaction** — Completing a kitchen ticket does **not** create a `Transaction`. Do not also record the same menu sale as a quick `SALE` (no link/dedupe exists yet).
3. **Do not add channel totals on the client on top of `summary.revenue`** — Channels already partition the total.
4. **Do not mix losses into revenue** — `ShopLoss` is subtracted only for profit (`revenue − losses`).
5. **Refunds** — `Transaction` `REFUND` is excluded from revenue (SALE-only). Not netted into the gross KPI in this interim contract.
6. **`ShopOrder.reservationFee`** — Embedded in `ShopOrder.total` (menu channel). It is **not** also written to `Reservation.billedAmount`. Do not bill the same table fee on both paths.

---

## Top items

`aggregateTopItems` merges **menu** sources only (quick-sale lines + completed order lines). It is a popularity/mix report across the two menu channels — not a second revenue total. Same operational rule: do not record the same sale on both paths.

---

## Known gaps (accepted until ledger)

- No FK between `ShopOrder` and `Reservation` / `Transaction` — duplicate staff entry across channels cannot be auto-deduped.
- No currency stamp per row — shop-level currency assumed → **M6 stamps shipped** (row stamp + shop fallback; KPIs in shop currency; `revenueByCurrency` for mixed eras). See [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md).
- Full ledger + single posting target remains the long-term fix (`GO_SPOTS_MIGRATION_PLAN.md` M3).

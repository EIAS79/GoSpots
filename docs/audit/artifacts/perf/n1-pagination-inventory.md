# §35 Phase 0 — N+1 / unbounded `findMany` / pagination inventory

**Date:** 2026-07-22  
**Lane:** `PERF35-phase0-inventory`  
**Method:** Static grep of `apps/api/src/**/*.ts` for `findMany(`; manual read of hotspot services (finance, reservations schedule, notifications, shop orders, menu, gallery). **No live DB.**  
**Scope:** Staff/public read paths called out in [`GO_SPOTS_PERF.md`](../../GO_SPOTS_PERF.md) Phase 0. **No code changes.**

---

## Summary

| Metric | Count |
|--------|------:|
| Hotspot rows inventoried | 24 |
| **HIGH** pagination / fetch risk | **0** (was 6; play billing + schedule day queries **PARTIAL** Lanes **PERF35-play-billing-page** / **PERF35-schedule-take**; notification badges + tab-read **FIXED** Lane **PERF35-notif-badges**; dashboard analytics **PARTIAL FIXED** Lane **PERF35-dashboard-analytics**) |
| **MED** | 7 |
| **LOW** (bounded or small cardinality) | 9 |
| Prisma N+1 loops (query-per-row in app code) | 0 in sampled hotspots |
| Deep `include` fan-out (single query, wide rows) | 5 |

**HIGH risk definition here:** unbounded or whole-table `findMany` on shop-scoped tables that grow with venue lifetime, **or** API exposes pagination but loads all rows into memory first.

---

## Pagination / unbounded `findMany` inventory

| Route / service method | File (approx.) | `take` / cursor | Risk | N+1? | Suggested fix |
|------------------------|----------------|-----------------|------|------|---------------|
| `GET /finance/play-billing` → `PlayBillingService.listPlayBilling` | `play-billing.service.ts` ~394–428 | **`take` per source** (max 500) + tab/date SQL push-down; default 30-day window; merged sort + in-memory slice; summary counts via `count()` | **PARTIAL FIXED** (Lane **PERF35-play-billing-page**) | No (bounded queries + map) | ~~Push `take`/`skip`~~ **DONE** — residual: merged two-source pagination cap at 500/source; summary money within fetched window; walk-in duration edge cases |
| `GET /reservations/schedule` → `ReservationsScheduleService.buildScheduleForShop` | `reservations-schedule.service.ts` ~180–220 | **`take: 2000`** on day reservations + walk-ins; warn if cap hit; **`SCHEDULE_CATEGORY_SELECT`** trimmed tree | **PARTIAL FIXED** (Lanes **PERF35-schedule-take** + **PERF35-schedule-select**) | No | ~~`select` trim on category tree~~ **DONE** — residual: day cap may truncate busy venues |
| `GET /public/venues/:slug/gaming\|dining/schedule` → same `buildScheduleForShop` | `public.controller.ts` → schedule service | **`take: 2000`** + **`SCHEDULE_CATEGORY_SELECT`** (shared builder) | **PARTIAL FIXED** | No | Same as staff schedule — take + select trim **DONE** |
| `GET /dashboard/overview` → `buildFinanceAnalytics` | `finance-analytics.util.ts` ~259–566, `dashboard.service.ts` ~145 | **`take: 5000`** (`FINANCE_ANALYTICS_ROW_TAKE`) on revenue source rows, orders, events, reservations, ledger, losses, payment breakdown, top-item order lines; `Logger.warn` + `summary.analyticsTruncated` when cap hit | **PARTIAL FIXED** (Lane **PERF35-dashboard-analytics**) | No (parallel batch) | ~~Cap analytics window rows per query~~ **DONE** — residual: SQL day-bucket aggregation; `orderCount`/`transactionCount` still use `count()` where applicable |
| `GET /notifications/reservation-badges` → `NotificationsService.reservationBadges` | `notifications.service.ts` ~196–202 | **No** (3× `count`) | **FIXED** | No | ~~`groupBy` + `where section=reservation AND readAt IS NULL`~~ **DONE** (Lane **PERF35-notif-badges**): `reservationNotificationTabWhere` + parallel `count` |
| `POST /notifications/reservation-tab-read` → `markReservationTabRead` | `notifications.service.ts` ~228–234 | **No** | **FIXED** | No | ~~Filter tab in SQL + `updateMany`~~ **DONE** (Lane **PERF35-notif-badges**): tab predicates in SQL + `updateMany` (no prefetch) |
| `GET /menu` (staff) → `MenuService.getFullMenu` | `menu.service.ts` ~61–76 | **`take`** on sections (**200**), tags (**200**), items (**2000**); `Logger.warn` if cap hit | **FIXED** | No (`tags.tag` nested include) | ~~Default `take` on items or paginate sections~~ **DONE** (Lane **PERF35-menu-take**); residual: cursor pagination / `select` trim if shops exceed caps |
| `GET /gallery` → `GalleryService.list` | `gallery.service.ts` ~46–58 | **`take: 200`** (`GALLERY_LIST_TAKE`); `Logger.warn` if cap hit | **FIXED** | No | ~~Add `take` cap~~ **DONE** (Lane **PERF35-gallery-take**); residual: cursor pagination if shops exceed 200 photos |
| `GET /reservations` → `ReservationsStaffService.list` | `reservations-staff.service.ts` ~160–169 | `take: 500` fixed | **MED** | No (`resource.category` include) | Require `from`/`to` or lower cap; cursor pagination for exports |
| `GET /notifications/export.csv` → `exportCsv` | `notifications.service.ts` ~369–373 | `take: 10_000` | **MED** | No | Acceptable export cap; document max; stream CSV for larger exports |
| `GET /audit/export.csv` → `AuditService.exportCsv` | `audit.service.ts` ~166–170 | `take: 10_000` | **MED** | No | Same as notifications export |
| `finance-analytics` → `loadLedgerSaleRows` | `finance-analytics.util.ts` ~92–105 | **`take: 5000`** when `LEDGER_READS=on` | **PARTIAL FIXED** (Lane **PERF35-dashboard-analytics**) | No | Residual: date-bucket SQL aggregation; index on `(shopId, occurredAt)` already expected |
| `finance-analytics` → `aggregateTopItems` order lines | `finance-analytics.util.ts` ~444–460 | **`take: 5000`** on `shopOrderLine.findMany` | **PARTIAL FIXED** (Lane **PERF35-dashboard-analytics**) | No | Residual: push aggregation to SQL (`groupBy` like tx lines) |
| `GET /dashboard/overview` → venue view events | `dashboard.service.ts` ~154–157 | **No** (7-day window) | **MED** | No | `groupBy` date trunc or count-only query |
| `GET /finance/transactions` → `FinanceTransactionService.listTransactions` | `finance-transaction.service.ts` ~57–65 | `take` default **40** (query param) | **LOW** | No (`lines` include) | Optional cursor; keep cap |
| `GET /finance/shop-orders` → `ShopOrderService.listShopOrders` | `shop-order.service.ts` ~212–260 | `take` default **80** | **LOW** | No (`lines` include) | Optional cursor |
| `GET /finance/play-sessions` → `PlaySessionService.listPlaySessions` | `play-session.service.ts` ~100–105 | `take` default **80** | **LOW** | No | Optional cursor |
| `GET /notifications` → `NotificationsService.list` | `notifications.service.ts` ~82–92 | `take` min(q, **200**); `skip` | **LOW** | No | Consider cursor instead of offset at high skip |
| `GET /guest-checks` → `GuestCheckService.list` | `guest-check.service.ts` ~181–186 | `take: 100` | **LOW** | No | OK for open tabs |
| `GET /audit` → `AuditService.list` | `audit.service.ts` ~137–147 | `take` max **500**; `skip` | **LOW** | No | OK |
| `GET /notifications/recent` | `notifications.service.ts` ~165–174 | `take: 10` | **LOW** | No | OK |
| `HoursService.getSchedule` | `hours.service.ts` ~62–66 | Small per-shop rows | **LOW** | No | OK |
| Bulk archive/unarchive shop orders | `shop-order.service.ts` ~268–294 | Bounded by `dto.ids` | **LOW** | No | OK |
| `FinanceTransactionService.createTransaction` stock loop | `finance-transaction.service.ts` ~87–118 | Per-line queries in loop | **MED** | **Yes** (per menu line) | Batch stock fetch or single transaction with locked rows (write path; Phase 3) |

---

## Deep `include` (not N+1, but wide rows)

| Location | Pattern | Risk |
|----------|---------|------|
| Schedule categories | `resourceCategory.findMany` + trimmed `SCHEDULE_CATEGORY_SELECT` (resources/section/tableGroup/gamingSections fields only) | **LOW** — one query; wide columns dropped (Lane **PERF35-schedule-select**) |
| Play billing reservations | `resource.category.rates` full tree | **MED** — rates rarely needed for every list row |
| Menu full load | `menuItem` + `tags.tag` | **MED** — bounded by `MENU_*_TAKE` (Lane **PERF35-menu-take**); `select` trim **residual** |
| Shop order list | `lines` on each order | **LOW** at `take` 80 |

---

## EXPLAIN candidates (top 5 staff reads)

Live `EXPLAIN (ANALYZE, BUFFERS)` **not run** — needs operator on seeded shop (Render/Neon or local Docker).

| Priority | Route | Expected shape (from indexes) | Operator action |
|----------|-------|------------------------------|-----------------|
| 1 | `GET /reservations/schedule?date=` | Index scan on `Reservation(shopId, startsAt)` + filter `resourceId IN (...)` | **needs operator EXPLAIN** |
| 2 | `GET /finance/play-billing` | Reservation list by `shopId` + `startsAt` range; walk-in by `shopId` + `startedAt` | **needs operator EXPLAIN** |
| 3 | `GET /finance/transactions` | Index scan `Transaction(shopId, createdAt DESC)` + nested `lines` | **needs operator EXPLAIN** |
| 4 | `GET /notifications?take=50` | Index scan `Notification(shopId, createdAt DESC)` | **needs operator EXPLAIN** |
| 5 | `GET /finance/shop-orders` | Index scan `ShopOrder(shopId, status, createdAt)` | **needs operator EXPLAIN** |

**Suggested SQL template (operator):**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT ... -- mirror Prisma where from artifact row
```

Store redacted plans alongside this file when captured (`explain-schedule.txt`, etc.).

---

## Grep notes

- Command pattern: `findMany(` under `apps/api/src/modules/{finance,reservations,notifications,menu,gallery,shop,dashboard}`.
- Scripts/utils (`ledger-backfill.util.ts`, `legacy-uploads.util.ts`, GDPR processors) contain unbounded scans **by design** for batch jobs — out of scope for staff read hot paths.
- Hot services (`finance.service.ts`, `reservations.service.ts`, `auth.service.ts`) were **not edited**; inventory reads extracted domain services only.

---

## Phase 3 fix priority (from this artifact)

1. ~~**Play billing** — DB-level pagination (highest lifetime row growth).~~ **PARTIAL FIXED** (Lane **PERF35-play-billing-page** — bounded `take` + date window + tab SQL; merged-source cap documented).  
2. ~~**Schedule** — payload trim + optional row caps on busy days.~~ **PARTIAL** (Lane **PERF35-schedule-take** — `take: 2000` + warn on reservation/walk-in queries; category `include` trim **residual**).  
3. ~~**Dashboard analytics** — aggregate in SQL, not Node loops over full tables.~~ **PARTIAL FIXED** (Lane **PERF35-dashboard-analytics** — `FINANCE_ANALYTICS_ROW_TAKE` 5000 + warn + `summary.analyticsTruncated`; residual: SQL day-bucket aggregation).  
4. ~~**Notification badge/tab reads**~~ — **FIXED** (Lane **PERF35-notif-badges**): SQL tab filters + `count` / `updateMany`.  
5. ~~**Gallery list**~~ — **FIXED** (Lane **PERF35-gallery-take** — `take: 200` + warn). **Menu** — default caps for staff POS paths **residual**.

---

## References

- [`GO_SPOTS_PERF.md`](../../GO_SPOTS_PERF.md) — Phase 0 exit + Phases 1–4  
- [`GO_SPOTS_DEEP_AUDIT.md`](../../GO_SPOTS_DEEP_AUDIT.md) — §35 issue sheet  
- `schema.prisma` — `(shopId, startsAt)`, `(shopId, createdAt)` list indexes

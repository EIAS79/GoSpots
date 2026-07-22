# GoSpots / Locora — Currency / FX safety (Bible §20 / #20)

**Date:** 2026-07-20 (design) / 2026-07-21 (Lanes D, CC, MM, YYYYY) / 2026-07-22 (residual docs **FX20-residual-docs**)  
**Status:** **Bible §20 / #20 PARTIAL** — preview + confirm apply, atomic catalog reprice, and M6 row stamps **shipped on disk**. Nullable stamp contract, operator Neon deploy, pre-stamp backfill honesty limits, and optional FX “report currency” conversion remain **explicitly deferred**.  
**Operator:** Neon `migrate deploy` for stamp migration (never from workstation prod `.env`).  
**Depends on:** M1 money `Decimal(19,4)` (`20260720230000_money_decimal_core`).  
**Related:** `GO_SPOTS_MONEY_DECISION.md`, `GO_SPOTS_MIGRATION_PLAN.md` §M6, `GO_SPOTS_FINANCE_CONTRACT.md`, audit P1 §2.17.  
**Lanes:** **D-fx-reprice-atomic**, **CC-currency-preview**, **MM-currency-preview-ui**, **YYYYY-currency-done**, **FX20-residual-docs** (operator gates).

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Atomic all-or-nothing catalog FX reprice | **DONE** | Lane D — `$transaction` over menu, rates, offeringConfig, hourlyRate |
| Preview before apply (no writes) | **DONE** | `POST /shop/currency/preview`; settings modal (Lane CC/MM) |
| Apply requires explicit confirm | **DONE** | `PATCH /shop/settings` with `currency` + `confirm: true` |
| Historical money rows never rewritten on flip | **DONE** | reprice touches catalog only; finance rows keep amounts + stamp |
| M6 stamp migration on disk | **DONE** | `20260721040000_currency_stamp_monetary_rows` |
| Dual-write stamps on finance creates / mark-paid | **DONE** | `loadShopCurrency` + row `currency` on Transaction/ShopOrder/PlaySession/ShopLoss/Reservation |
| Dual-read effective currency | **DONE** | `currency-stamp.util.ts` — `effectiveMoneyCurrency(row ?? shop ?? EUR)` |
| Analytics group by currency | **DONE** | `sumRevenueChannelsByCurrency`, `summary.revenueByCurrency`; headline KPIs stay shop-currency |
| Conversion history API + settings UI | **DONE** | `GET /shop/currency/history`; audit `venue.currency.change` |
| Optional idempotency on currency apply | **DONE** (§7 adjacency) | Lane TTTT — `SHOP_CURRENCY_APPLY`; preview unwrapped |
| Neon migrate deploy (stamp DDL + backfill) | **OPERATOR** | Gates 0–2 below — same wave as other `20260721*` migrations |
| Nullable `currency` columns + null fallback reads | **RESIDUAL** | Expand-first contract; optional NOT NULL tighten after soak (Phase E) |
| Pre-stamp backfill uses **current** `Shop.currency` | **RESIDUAL** (accepted) | Shops that flipped currency **before** stamps may mis-label old rows — no time-travel fix on disk |
| FX conversion to single “report currency” in UI | **RESIDUAL** | Design explicitly out of M6 MVP; mixed eras show `revenueByCurrency` buckets only |
| Ledger `currency` from day one | **RESIDUAL** (§5) | `LedgerEntry` ships with currency; cutover is ledger operator soak — [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) |
| Line-item row stamps (`ShopOrderLine`, `TransactionLineItem`) | **RESIDUAL** (deferred) | Parent stamp + join is enough for v1; see table below |

**§20 classification:** **PARTIAL** — money-change safety ship bar met; operator migrate + contract tighten + optional FX display documented here, not hidden.

---

## Operator checklist (Gates 0–4)

| Gate | Action | Pass criteria |
|------|--------|---------------|
| **0** | Confirm stamp migration in pending set | `20260721040000_currency_stamp_monetary_rows` listed in `migrate status` / preflight |
| **1** | Neon `migrate deploy` (operator host) | Five tables have nullable `currency`; backfill SQL in migration applied |
| **2** | Smoke currency change | Preview → confirm → apply; catalog repriced; prior sale amount unchanged; new sale gets new stamp |
| **3** | Analytics spot-check | Mixed-era window shows `revenueByCurrency`; headline KPI matches shop currency only |
| **4** | Optional contract tighten | `COUNT(*) FILTER (WHERE currency IS NULL) = 0` on stamped tables → consider NOT NULL migration (**future app lane**) |

SQL spot-checks (post Gate 1):

```sql
SELECT currency, COUNT(*) FROM "Transaction" GROUP BY 1;
SELECT currency, COUNT(*) FROM "ShopOrder" GROUP BY 1;
SELECT COUNT(*) FILTER (WHERE "billedAmount" IS NOT NULL AND currency IS NULL) AS unstamped_billed
FROM "Reservation";
```

---

## Recommendation (operator / ship timing)

**M6 shipped (Lane YYYYY).** Operator follow **Gates 0–4** above; optional Phases 2–3 deferred.

| When | Action |
|------|--------|
| **Before Friday Neon deploy** | Design only (this doc). Freeze new migrations. Do not add `currency` columns, Prisma schema edits, or a seventh migration folder. |
| **Friday** | Deploy the six pending migrations already on disk; smoke with shop-level currency as today. |
| **After Friday (next money wave)** | Expand migration + dual-write/read + backfill + analytics grouping — follow the sketch below. |

**Why after:** Friday’s gate is apply-and-smoke of a frozen migration set (`REMAINING_P0_FRIDAY.md`). M6 is audit **P1**, not a submit blocker. Adding another DDL wave before Neon deploy risks lock contention on the same money tables M1 just alters, complicates preflight, and breaks the “six migrations” operator checklist.

Atomic FX catalog reprice (Lane D) is independent of row stamps and may already be done; stamps solve **historical** multi-currency report correctness after a shop currency change.

---

## Problem (today)

- Commercial amounts live on many tables as `Decimal(19,4)` with **no per-row ISO 4217 code**.
- `Shop.currency` is the only venue money unit; finance analytics assume “everything is shop currency” (`GO_SPOTS_FINANCE_CONTRACT.md` known gap).
- Changing shop currency **reprices the live catalog** (menu, rates, offeringConfig, hourlyRate) and leaves historical `ShopOrder` / `Transaction` / `PlaySession` / `ShopLoss` / billed `Reservation` amounts **numerically unchanged** but **semantically orphaned** (same number, different unit after shop flip).
- Without stamps, post-change revenue sums silently mix eras.

`Subscription.billingCurrency` already exists for MoR checkout — **out of scope** for venue ops stamps (different product surface).

---

## Which tables need currency stamps

### Stamp (required) — monetary **facts** / ledger-ish rows

These are the finance channel sources and loss side. Stamp the **parent / header** row that owns the commercial total.

| Table | Money columns (already Decimal) | Proposed column | Notes |
|-------|----------------------------------|-----------------|-------|
| `Transaction` | `amount` | `currency String` | Quick sales / refunds / expenses. Lines inherit parent. |
| `ShopOrder` | `total`, `reservationFee` | `currency String` | Completed menu channel. Lines inherit parent. |
| `PlaySession` | `amount` | `currency String` | Walk-in play revenue (when counted). |
| `ShopLoss` | `amount` | `currency String` | Profit subtraction only. |
| `Reservation` | `billedAmount`, `billingBaseAmount` | `currency String` | One stamp for the billing group when amounts are set. |

**ISO 4217:** store uppercase codes (`EUR`, `USD`, …) consistent with `Shop.currency` / `locale-currency` validation.

**Nullability (expand):** Prefer `currency String?` initially so expand DDL is non-blocking; backfill then tighten to `NOT NULL` with default only if product requires it. Do **not** use `@default("EUR")` on historical rows without backfill — that would lie about pre-EUR venues.

### Stamp optional / deferred — line children

| Table | Verdict |
|-------|---------|
| `ShopOrderLine` | **Do not stamp in M6.** Inherit `ShopOrder.currency`. |
| `TransactionLineItem` | **Do not stamp in M6.** Inherit `Transaction.currency`. |

Rationale: lines never outlive a currency change independently; parent stamp + join is enough for reports and CSV. Avoids double backfill and drift.

### Do **not** stamp (catalog / live prices)

These always track **current** `Shop.currency` after reprice; stamping them adds noise and must be updated on every FX flip.

| Table / field | Verdict |
|---------------|---------|
| `MenuItem.price` | No — catalog; reprice job owns unit. |
| `ResourceRate.price` | No |
| `Resource.hourlyRate` | No |
| `ResourceCategory.offeringConfig` JSON prices | No — still JSON numbers; rounded on write. |
| `Shop.currency` | Already the venue “now” unit — keep. |
| `Subscription.billingCurrency` | Leave alone (SaaS billing, not venue POS). |
| `billingDiscountPercent` | Percent, not money — no currency. |

### Future (M3 ledger)

When `LedgerEntry` lands, it **must** include `currency` from day one (`GO_SPOTS_MIGRATION_PLAN.md` M3 sketch). M6 stamps on legacy tables remain the dual-read source until ledger cutover.

---

## Expanded migration sketch (post-Friday)

**Folder name (illustrative only — do not create before Friday):**  
`2026XXXXXXXX_currency_stamp_monetary_rows`

### Phase A — Expand (DDL only)

```sql
-- Illustrative; Prisma migrate will emit equivalent.
ALTER TABLE "Transaction"  ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "ShopOrder"    ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "PlaySession"  ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "ShopLoss"     ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "Reservation"  ADD COLUMN IF NOT EXISTS "currency" TEXT;

CREATE INDEX IF NOT EXISTS "Transaction_shopId_currency_createdAt_idx"
  ON "Transaction" ("shopId", "currency", "createdAt");
CREATE INDEX IF NOT EXISTS "ShopOrder_shopId_currency_createdAt_idx"
  ON "ShopOrder" ("shopId", "currency", "createdAt");
-- Optional: PlaySession / ShopLoss / Reservation indexes if analytics filter often by currency.
```

Prisma:

```prisma
// on Transaction, ShopOrder, PlaySession, ShopLoss, Reservation
currency String?  // ISO 4217; null = pre-stamp / dual-read fallback to Shop.currency
```

**No** `NOT NULL` and **no** drop of shop-level currency in this migration.

### Phase B — Backfill (SQL job, idempotent)

```sql
-- Pattern for each stamped table (Transaction example):
UPDATE "Transaction" t
SET "currency" = s."currency"
FROM "Shop" s
WHERE t."shopId" = s."id"
  AND t."currency" IS NULL;

-- Same for ShopOrder, PlaySession, ShopLoss.
-- Reservation: prefer only rows that ever had money, or stamp all — product choice:
UPDATE "Reservation" r
SET "currency" = s."currency"
FROM "Shop" s
WHERE r."shopId" = s."id"
  AND r."currency" IS NULL
  AND (r."billedAmount" IS NOT NULL OR r."billingBaseAmount" IS NOT NULL);
```

**Honest limit:** Backfill uses **current** `Shop.currency`. Shops that already changed currency before stamps will mis-label pre-change history. Accept for v1; optional later: operator CSV override or “currency changed at” audit if ever logged.

Run batched if row counts are large; log `UPDATE … RETURNING` counts.

### Phase C — App dual-write (same deploy wave as expand or immediately after)

On every create/update that sets money on stamped tables:

- Set `currency` from `shop.currency` at write time (uppercase).
- Reservation billing mark-paid: stamp when first setting `billedAmount` / `billedAt` if null.
- Do **not** rewrite historical row currency when shop currency changes.
- Catalog reprice continues to ignore these tables (already true).

### Phase D — Dual-read / reports

| Reader | Behavior |
|--------|----------|
| Finance analytics / KPI / CSV | Prefer `row.currency`; if null, fall back to `Shop.currency` (compat). |
| Totals | **Group by currency** within a shop window; never sum EUR+USD into one number without conversion. |
| UI | Show currency code next to amounts when shop has >1 distinct stamped currency in range, or always show code for clarity. |
| FX display (optional) | Convert to “report currency” only with explicit rate + label — out of M6 MVP. |

Contract update (when coding): extend `GO_SPOTS_FINANCE_CONTRACT.md` — “shop-level currency assumed” → “row stamp with shop fallback.”

### Phase E — Contract (later)

After dual-read verified in prod:

1. Confirm `COUNT(*) FILTER (WHERE currency IS NULL) = 0` on stamped tables (or only on rows with money for Reservation).
2. Optional: `ALTER COLUMN … SET NOT NULL` + app remove null fallback.
3. Do **not** remove `Shop.currency` — still required for catalog and new writes.

**Rollback:** Stop writing column; ignore in reads; drop column in a forward migration if abandoned. **Never** `migrate reset`.

---

## Dual-read plan (summary)

```
Write path (new):
  amount + currency := Shop.currency

Read path (analytics):
  effectiveCurrency := row.currency ?? Shop.currency
  aggregate: GROUP BY effectiveCurrency (or filter single currency)

Shop currency change:
  1. Atomic catalog reprice (already)
  2. UPDATE Shop.currency
  3. Historical stamped rows unchanged
  4. New sales get new currency
```

**Tests (when implementing — not this lane):**

- Create sale in EUR → stamp `EUR`; change shop to USD + reprice; old sale still `EUR`; new sale `USD`.
- Analytics for mixed window returns per-currency buckets (or refuses single total).
- Null currency rows still appear under shop fallback during dual-read window.
- Backfill idempotent (second run updates 0 rows).

---

## What NOT to do before Friday Neon deploy of the existing 6 migrations

> **Historical (pre–Lane YYYYY):** M6 shipped after the Friday six. Do not revert stamps or re-bundle into the old six-migration gate.

1. ~~**Do not** create any new folder under `apps/api/prisma/migrations/` for M6.~~ — **shipped** `20260721040000_currency_stamp_monetary_rows`
2. **Do not** edit `schema.prisma` to add `currency` on monetary models.
3. **Do not** run `prisma migrate dev` / `db push` aimed at Neon for currency work.
4. **Do not** bundle M6 into the Friday six (`webhook`, `timezone`, `money_decimal`, `permissions`, `guest_token`, `auth_session_family`).
5. **Do not** change finance aggregators to require stamps yet — would break until backfill exists.
6. **Do not** stamp catalog tables or line items in a rushed half-migration.
7. **Do not** `prisma migrate reset` or rewrite M1 Float→Decimal as part of stamps.
8. **Do not** treat M6 as a Friday P0 submit blocker (`REMAINING_P0_FRIDAY.md` — nice-if-time / post-submit).

---

## Suggested post-Friday implementation order

1. Neon six deployed + smoke green.
2. Expand migration (nullable `currency` on five tables) + indexes.
3. Deploy app dual-write.
4. Backfill SQL on Neon (batched).
5. Dual-read analytics (group by currency).
6. Verify null counts; optional NOT NULL contract.
7. Update finance contract + implementation report.

---

## Verify (when coded — n/a for this design lane)

```bash
cd apps/api
npx tsc -p tsconfig.build.json --noEmit
npx nest build
npx jest --no-coverage   # finance + shop reprice + new stamp specs
```

Operator SQL spot-checks after backfill:

```sql
SELECT currency, COUNT(*) FROM "Transaction" GROUP BY 1;
SELECT currency, COUNT(*) FROM "ShopOrder" GROUP BY 1;
SELECT COUNT(*) FILTER (WHERE "billedAmount" IS NOT NULL AND currency IS NULL) AS unstamped_billed
FROM "Reservation";
```

---

## Future phases (residual — not on disk)

### Phase 1 — Operator deploy + smoke (**OPERATOR**)

| Step | Action |
|------|--------|
| 1 | Neon `migrate deploy` includes stamp migration |
| 2 | Gates 0–4 checklist above |
| 3 | Document in submit notes: stamps live; nullable contract; optional FX display deferred |

### Phase 2 — Contract tighten (optional app lane)

| Step | Action |
|------|--------|
| 1 | Verify null counts on stamped tables (SQL above) |
| 2 | Optional migration: `ALTER COLUMN currency SET NOT NULL` |
| 3 | Remove null fallback in reads once soak clean |

### Phase 3 — Report-currency FX display (optional product lane)

| Step | Action |
|------|--------|
| 1 | Analytics UI: convert mixed-era buckets to shop currency with explicit rate + label |
| 2 | Never silently sum EUR+USD into one headline total |
| 3 | CSV export documents conversion rate when used |

**Out of scope:** line-item stamps; rewriting pre-stamp history for shops that flipped before M6; removing `Shop.currency`.

---

## Related

- Interim finance reporting — [`GO_SPOTS_FINANCE_CONTRACT.md`](./GO_SPOTS_FINANCE_CONTRACT.md)
- Bible §20 tracker — [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) §20
- Ship log — [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) #20 (Lane YYYYY)
- Ledger currency (§5) — [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md)
- Operator deploy — [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md), [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md)

---

*Aligned with `GO_SPOTS_MIGRATION_PLAN.md` M6, `GO_SPOTS_MONEY_DECISION.md`, audit §2.17 / §20. Residual docs lane **FX20-residual-docs**.*

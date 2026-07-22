# GoSpots / Locora — Money type decision (Phase A → schema wiring)

**Date:** 2026-07-20  
**Status:** Decision recorded; **schema Float→`Decimal(19,4)` migration in progress**; app helpers wired for typecheck/build green.

## Choice

**Primary path: Prisma `Decimal(19, 4)`** for stored commercial amounts, with shared `money.util` for boundary conversion and display rounding.

| Option | Verdict |
|--------|---------|
| **A. `Decimal(19, 4)`** | **Chosen** — Prisma-native, human-readable in SQL/admin, matches migration plan Option A |
| **B. Integer minor units (`Int`/`BigInt`)** | Deferred alternative — exact integer math, but larger app surface (every write/read convert) and FX awkwardness |

## Why Decimal over rushing minor units

- Existing schema was all `Float`; expand→dual-write→backfill→contract is planned in `GO_SPOTS_MIGRATION_PLAN.md` (M1). This wave converted confirmed commercial columns directly with `USING ROUND(...::numeric, 4)` (no reset).
- Decimal keeps values inspectable in Neon/Prisma Studio without cent conversion tables.
- App discipline: convert at calculation / JSON boundaries via `toMoneyNumber`; prefer `toPrismaDecimal` on writes; use `roundMoney` / `addMoney` / `lineTotal` on numbers.

## Shipped in this money wave

1. Decision doc (this file).
2. `apps/api/src/common/money.util.ts` — **not scaffold-only**:
   - `toMoneyNumber` / `toPrismaDecimal` / `serializeMoney` / `serializeMoneyOrNull`
   - `roundMoney` / `addMoney` / `lineTotal` / `convertMoney` / `parseMoneyString` / `applyDiscountPercent`
3. Migration `20260720230000_money_decimal_core` — MenuItem, ResourceRate, Resource.hourlyRate, Reservation billing amounts, PlaySession.amount, ShopOrder totals/fees, ShopOrderLine.unitPrice, Transaction (+ line items), ShopLoss.
4. Call sites updated so `tsc -p tsconfig.build.json --noEmit` and `nest build` exit 0.

## Remaining money gaps (honest)

1. **JSON `offeringConfig` prices** still JSON numbers (not Decimal columns) — **rounded on write** via `normalizeOfferingConfigPrices`; FX reprice uses shared `mapOfferingConfigPrices`.
2. **`billingDiscountPercent`** remains Float (percent, not money) by design.
3. **No dual-write / parallel column period** — this wave contracted Float→Decimal in-place with CAST; rollback requires a reverse migration, not “drop unused Decimal.”
4. **Ledger (`LedgerEntry`)** not started — must stay Decimal-consistent when added.
5. **API responses** on hot DTOs use `serializeMoney` → JS `number` (rounded); Prisma Decimal raw `.toJSON()` strings avoided on those paths. Full string/Decimal wire format not adopted.
6. Intermediate math still uses JS `number` after `toMoneyNumber` (acceptable for display/ops; ledger should use Decimal arithmetic later).
7. Finance reporting aggregates still convert via `toMoneyNumber` (not a full serialize rewrite).

## Rollback

- Prefer a new reverse migration restoring Float only if production data integrity requires it.
- Do **not** `migrate reset`.

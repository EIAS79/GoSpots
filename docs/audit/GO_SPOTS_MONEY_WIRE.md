# Locora — Decimal money wire format (Bible §4 / legacy #1)

**Date:** 2026-07-21 (wire ship) / 2026-07-22 (residual docs **MONEY4-residual-docs**)  
**Status:** **DONE (ship bar met)** — persisted commercial amounts are `Decimal(19,4)`; API money fields emit 4dp decimal **strings**; web dual-reads string|number. **Explicit accepted residuals** remain (intermediate `toMoneyNumber` math; numeric form/PATCH inputs) — **not** operator blockers.  
**Bible:** §4 P0 monetary correctness — **DONE** with documented residuals. Ledger (#6 / §5) and currency stamps (#20 / §20) are **separate** tracks.  
**Lanes:** **XXXXX-money-wire-done** (code), **MONEY4-residual-docs** (honest shipped vs residual).

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Postgres commercial columns `Decimal(19,4)` | **DONE** | Migration `20260720230000_money_decimal_core`; `toPrismaDecimal` on writes |
| Core money wire = 4dp **strings** (not JSON numbers) | **DONE** | `serializeMoney` / `serializeMoneyOrNull` on finance DTOs, analytics KPIs, menu/resources/public prices, play-billing, sales-by-item |
| `offeringConfig` price keys as 4dp strings | **DONE** | `normalizeOfferingConfigPrices`; validators accept number\|string |
| Web dual-read at boundaries | **DONE** | `coerceMoney` / `parseMoneyString`; `MoneyWire` types; formatters coerce at display/arithmetic edges |
| FX catalog reprice uses shared money helpers | **DONE** | Lane D — atomic `$transaction` reprice (adjacent §20) |
| Unit + integration specs | **DONE** | `money.util.spec`, offering-config, play-billing, analytics, reprice — **53** PASS at ship |
| Intermediate service math via `toMoneyNumber` → JS `number` | **RESIDUAL** (accepted) | Ops/UI arithmetic only; amounts round-trip through Decimal at persistence; **do not remove** without characterization — ledger paths must stay Decimal end-to-end ([`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md)) |
| Money **request** bodies / PATCH fields still primarily JSON numbers from forms | **RESIDUAL** (accepted) | Validators coerce; string wire on **responses** is the ship bar; string **inputs** optional future lane (Phase 2 below) |
| Unified ledger posting / analytics cutover | **NOT §4** | §5 — [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) (flags default off) |
| Per-row currency stamps / FX safety | **NOT §4** | §20 — [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md) |

**§4 classification:** **DONE** — original P0 “float storage” finding is **ALREADY FIXED**. Residuals above are **depth items**, not submit blockers. Saying “§4 complete with zero follow-ups” would be **dishonest**; saying “§4 ship bar met, residuals documented” is accurate.

---

## Canonical JSON shape (shipped)

Money fields serialize as **decimal strings**, not JSON numbers:

```json
{
  "amount": "128.4500",
  "unitPrice": "12.5000",
  "total": "37.5000",
  "billedAmount": null
}
```

| Rule | Detail |
|------|--------|
| Type | JSON string, never JSON number on core money DTO fields |
| Scale | **4** fractional digits (`serializeMoney` → `serializeMoneyString`) |
| Null | `null` unchanged for optional amounts |
| Sign | Leading `-` for credits/refunds |
| Parsing | Web `coerceMoney` / `parseMoneyString` — reject non-finite, empty, locale commas, >19 digit mantissa |
| Percent fields | `billingDiscountPercent` stays **number** (not money) |
| FX rates | Stay `number` (not money) |

### Helpers

| Helper | Output | Used on |
|--------|--------|---------|
| `serializeMoney` | 4dp **string** | Finance DTOs, menu/resource prices, play billing, analytics KPIs, guest/public prices |
| `serializeMoneyOrNull` | `string \| null` | Nullable billing fields |
| `serializeMoneyString` | same as serializeMoney | Alias implementation |
| Web `coerceMoney` | number | Dual-read at display / arithmetic boundaries |

### Storage

| Layer | Behavior |
|-------|----------|
| Postgres | Commercial amounts `Decimal(19,4)` — migration `20260720230000_money_decimal_core` |
| Writes | `toPrismaDecimal` on Prisma create/update |
| JSON blobs | `offeringConfig` prices → **4dp strings** via `normalizeOfferingConfigPrices` |

---

## Accepted residuals (detail)

### 1. Intermediate `toMoneyNumber` (accepted)

- **What:** Some service-layer totals, UI-facing rollups, and legacy helpers still convert Prisma `Decimal` → JS `number` for arithmetic before re-serializing or persisting.
- **Risk:** Bounded by 4dp scale and Decimal round-trip at write boundaries; not the historic “float column” P0.
- **Rule:** Ledger posting (`ledger-post.util.ts`) and new money-critical paths should prefer Decimal/string end-to-end — see §5 checklist.
- **Future lane (optional):** Characterize hot paths → replace intermediates where audit finds drift risk; **not scheduled**.

### 2. Numeric form / PATCH inputs (accepted)

- **What:** Dashboard and staff forms still submit amounts as JSON numbers; API DTO validators coerce to Decimal.
- **Risk:** Low for 4dp ops amounts; wire **responses** already string-safe for clients.
- **Future lane (optional):** Phase 2 — accept string money on PATCH/create DTOs + form `inputMode="decimal"` string bind; dual-read number\|string on ingress (mirror web egress).

---

## Phased plan (optional depth — not operator gates)

| Phase | Scope | Status |
|-------|--------|--------|
| **0 — Storage** | `Decimal(19,4)` columns | **Done** (`20260720230000_*`) |
| **1 — Wire egress** | API serialize 4dp strings + web dual-read | **Done** (Lane XXXXX) |
| **2 — Wire ingress** | String money on request DTOs + forms | **Residual** (optional future app lane) |
| **3 — Service math** | Reduce `toMoneyNumber` in characterized hot paths | **Residual** (optional future app lane) |

No Neon flag, migrate deploy, or production soak is required for §4 residuals — unlike §5 ledger or §6 RLS.

---

## Verification

| Check | Result |
|-------|--------|
| Unit | `money.util.spec.ts` + `offering-config.util.spec.ts` — serialize/parse + string offering prices |
| API | `nest build` PASS; play-billing / analytics / reprice specs PASS |
| Web | typecheck after `MoneyWire` + coerce at critical paths |

---

## Related docs (scope boundaries)

| Topic | Doc | Bible |
|-------|-----|-------|
| Ledger posting + analytics cutover | [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) | §5 |
| Currency stamps + FX flip safety | [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md) | §20 |
| Interim revenue channels (pre-ledger-primary) | [`GO_SPOTS_FINANCE_CONTRACT.md`](./GO_SPOTS_FINANCE_CONTRACT.md) | §5 adjacency |
| Deep audit issue sheet | [`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md) §4 | — |

---

*Lane XXXXX — string wire live. Lane MONEY4-residual-docs — honest §4 residual board complete.*

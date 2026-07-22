# Locora — Decimal money wire format

**Date:** 2026-07-21  
**Status:** **Shipped** — API money fields emit 4dp decimal **strings**; web dual-reads string|number.  
**Bible:** P0 **#1** — DONE (ledger #6 separate).  

---

## Canonical JSON shape

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

### Out of scope (residuals)

- Intermediate service math still `toMoneyNumber` (ops OK; ledger #6 should stay Decimal).
- Money **request** bodies still primarily JS numbers from forms.
- Ledger posting (#6).

---

## Verification

| Check | Result |
|-------|--------|
| Unit | `money.util.spec.ts` + `offering-config.util.spec.ts` — serialize/parse + string offering prices |
| API | `nest build` PASS; play-billing / analytics / reprice specs PASS |
| Web | typecheck after `MoneyWire` + coerce at critical paths |

---

## Related docs

- [`GO_SPOTS_MONEY_DECISION.md`](./GO_SPOTS_MONEY_DECISION.md) — Decimal column choice (shipped)
- [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) — ledger amounts must stay Decimal end-to-end (#6)
- [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md) — historical row currency metadata (#20)

---

*Lane XXXXX — string wire live. Lane BBB design superseded.*

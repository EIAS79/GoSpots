from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise RuntimeError(
            f"{path}: expected {expected} exact matches, found {count}: {old[:120]!r}"
        )
    write(path, text.replace(old, new, expected))


def sub(path: str, pattern: str, repl: str, expected: int = 1, flags: int = 0) -> None:
    text = read(path)
    new_text, count = re.subn(pattern, repl, text, count=expected, flags=flags)
    if count != expected:
        raise RuntimeError(
            f"{path}: expected {expected} regex matches, found {count}: {pattern!r}"
        )
    write(path, new_text)


def replace_region(
    path: str,
    start_marker: str,
    end_marker: str,
    old: str,
    new: str,
    expected: int = 1,
) -> None:
    text = read(path)
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    region = text[start:end]
    count = region.count(old)
    if count != expected:
        raise RuntimeError(
            f"{path}: region {start_marker!r} expected {expected} matches, found {count}: {old[:120]!r}"
        )
    region = region.replace(old, new, expected)
    write(path, text[:start] + region + text[end:])


# ---------------------------------------------------------------------------
# Database + API model
# ---------------------------------------------------------------------------
replace(
    "apps/api/prisma/schema.prisma",
    "  isVip                Boolean          @default(false)\n  seatsPerRow          Int              @default(6)",
    "  isVip                Boolean          @default(false)\n  hourlyPriceAddon     Decimal          @default(0) @db.Decimal(19, 4)\n  seatsPerRow          Int              @default(6)",
)
write(
    "apps/api/prisma/migrations/20260809094000_gaming_section_hourly_price_addon/migration.sql",
    "-- Per-zone hourly surcharge added on top of the configured gaming rate.\n"
    'ALTER TABLE "GamingSection"\n'
    'ADD COLUMN "hourlyPriceAddon" DECIMAL(19,4) NOT NULL DEFAULT 0;\n',
)

sub(
    "apps/api/src/modules/resources/dto/resources.dto.ts",
    r"(  @IsOptional\(\)\n  @IsBoolean\(\)\n  isVip\?: boolean;\n)",
    r"\1\n  @IsOptional()\n  @IsNumber(FINITE_MONEY)\n  @Min(0)\n  hourlyPriceAddon?: number;\n",
    expected=2,
)

replace(
    "apps/api/src/modules/resources/resources.service.ts",
    "            isVip: s.isVip,\n            seatsPerRow: s.seatsPerRow,",
    "            isVip: s.isVip,\n            hourlyPriceAddon: serializeMoney(s.hourlyPriceAddon),\n            seatsPerRow: s.seatsPerRow,",
)
replace(
    "apps/api/src/modules/resources/resources.service.ts",
    "        isVip: s.isVip,\n        seatsPerRow: s.seatsPerRow,",
    "        isVip: s.isVip,\n        hourlyPriceAddon: serializeMoney(s.hourlyPriceAddon),\n        seatsPerRow: s.seatsPerRow,",
)
replace(
    "apps/api/src/modules/resources/resources.service.ts",
    "        isVip: dto.isVip ?? false,\n        seatsPerRow: dto.seatsPerRow ?? (isDining ? 4 : 6),",
    "        isVip: dto.isVip ?? false,\n        hourlyPriceAddon: isDining ? 0 : (dto.hourlyPriceAddon ?? 0),\n        seatsPerRow: dto.seatsPerRow ?? (isDining ? 4 : 6),",
)
replace(
    "apps/api/src/modules/resources/resources.service.ts",
    "        ...(dto.isVip != null && { isVip: dto.isVip }),\n        ...(dto.seatsPerRow != null && { seatsPerRow: dto.seatsPerRow }),",
    "        ...(dto.isVip != null && { isVip: dto.isVip }),\n        ...(existing.category.type !== 'DINING' &&\n          dto.hourlyPriceAddon != null && {\n            hourlyPriceAddon: dto.hourlyPriceAddon,\n          }),\n        ...(dto.seatsPerRow != null && { seatsPerRow: dto.seatsPerRow }),",
)

# Schedule response exposes the add-on for both staff and public booking flows.
replace(
    "apps/api/src/modules/reservations/reservations-schedule.service.ts",
    "import { PrismaService } from '../../prisma/prisma.service';",
    "import { PrismaService } from '../../prisma/prisma.service';\nimport { serializeMoney } from '../../common/money.util';",
)
sub(
    "apps/api/src/modules/reservations/reservations-schedule.service.ts",
    r"(\s+isVip: true,\n)(\s+seatsPerRow: true,)",
    r"\1\2\n              hourlyPriceAddon: true,",
    expected=2,
)
replace(
    "apps/api/src/modules/reservations/reservations-schedule.service.ts",
    "            isVip: s.isVip,\n            seatsPerRow: s.seatsPerRow,",
    "            isVip: s.isVip,\n            hourlyPriceAddon: serializeMoney(s.hourlyPriceAddon),\n            seatsPerRow: s.seatsPerRow,",
)
replace(
    "apps/api/src/modules/reservations/reservations-schedule.service.ts",
    "                    isVip: unit.section.isVip,\n                    seatsPerRow: unit.section.seatsPerRow,",
    "                    isVip: unit.section.isVip,\n                    hourlyPriceAddon: serializeMoney(\n                      unit.section.hourlyPriceAddon,\n                    ),\n                    seatsPerRow: unit.section.seatsPerRow,",
)

# ---------------------------------------------------------------------------
# Authoritative billing calculation for reservation-backed play sessions
# ---------------------------------------------------------------------------
replace(
    "apps/api/src/common/play-billing.util.ts",
    "export function applyBillingDiscount(\n  baseAmount: number,\n  discountPercent: number,\n): number {\n  return applyDiscountPercent(baseAmount, discountPercent);\n}\n",
    "export function applyBillingDiscount(\n  baseAmount: number,\n  discountPercent: number,\n): number {\n  return applyDiscountPercent(baseAmount, discountPercent);\n}\n\n/** Add a zone surcharge once per booked unit, pro-rated by billed duration. */\nexport function applyHourlyZoneAddon(\n  result: PlayBillingComputeResult,\n  hourlyPriceAddon: number,\n): PlayBillingComputeResult {\n  const rate = Number.isFinite(hourlyPriceAddon)\n    ? Math.max(0, hourlyPriceAddon)\n    : 0;\n  if (rate <= 0) return result;\n\n  const addonAmount = roundMoney(rate * (result.durationMinutes / 60));\n  if (addonAmount <= 0) return result;\n\n  return {\n    ...result,\n    amount: roundMoney(result.amount + addonAmount),\n    rateLabel: `${result.rateLabel} + zone add-on`,\n    breakdown: `${result.breakdown} · zone +${rate.toFixed(2)}/h`,\n  };\n}\n",
)

billing_path = "apps/api/src/modules/finance/play-billing.service.ts"
replace(
    billing_path,
    "  applyBillingDiscount,\n  classifyPlayBillingRow,",
    "  applyBillingDiscount,\n  applyHourlyZoneAddon,\n  classifyPlayBillingRow,",
)
replace_region(
    billing_path,
    "  private mapPlayBillingRow(",
    "  /** Shared with play-session pay mapping",
    "        hourlyRate: MoneyInput;\n        category: {",
    "        hourlyRate: MoneyInput;\n        section: { hourlyPriceAddon: MoneyInput } | null;\n        category: {",
)
replace_region(
    billing_path,
    "  private mapPlayBillingRow(",
    "  /** Shared with play-session pay mapping",
    "    const computed = bowlingMode\n      ? computeBowlingBillingAmount(",
    "    const baseComputed = bowlingMode\n      ? computeBowlingBillingAmount(",
)
replace_region(
    billing_path,
    "  private mapPlayBillingRow(",
    "  /** Shared with play-session pay mapping",
    "          now,\n        });\n    const discountPercent = row.billingDiscountPercent ?? 0;\n    const rateAmount = computed.amount;",
    "          now,\n        });\n    const computed = applyHourlyZoneAddon(\n      baseComputed,\n      toMoneyNumber(row.resource.section?.hourlyPriceAddon ?? 0),\n    );\n    const discountPercent = row.billingDiscountPercent ?? 0;\n    const rateAmount = computed.amount;",
)
replace_region(
    billing_path,
    "  private playBillingReservationListInclude()",
    "  private mergePlayBillingItems(",
    "        include: {\n          category: {",
    "        include: {\n          section: { select: { hourlyPriceAddon: true } },\n          category: {",
)
replace_region(
    billing_path,
    "  private playBillingInclude()",
    "  private async loadPlayBillingReservation(",
    "        include: {\n          category: { include: { rates: { orderBy: { sortOrder: 'asc' } } } },",
    "        include: {\n          section: { select: { hourlyPriceAddon: true } },\n          category: { include: { rates: { orderBy: { sortOrder: 'asc' } } } },",
)

# ---------------------------------------------------------------------------
# Front-end wire types + shared pricing helper
# ---------------------------------------------------------------------------
replace(
    "apps/web/src/lib/gaming-layout-client.ts",
    'import type { ResourceType } from "./resource-types";',
    'import type { ResourceType } from "./resource-types";\nimport type { MoneyWire } from "./money";',
)
sub(
    "apps/web/src/lib/gaming-layout-client.ts",
    r"(  isVip: boolean;\n)",
    r"\1  hourlyPriceAddon: MoneyWire;\n",
    expected=2,
)
sub(
    "apps/web/src/lib/gaming-layout-client.ts",
    r"(  isVip\?: boolean;\n)",
    r"\1  hourlyPriceAddon?: number;\n",
    expected=2,
)

replace(
    "apps/web/src/lib/resources-client.ts",
    "  categoryId: string | null;\n};",
    "  categoryId: string | null;\n  sectionId: string | null;\n  section: {\n    id: string;\n    name: string;\n    floor: number;\n    isVip: boolean;\n    hourlyPriceAddon: MoneyWire;\n  } | null;\n};",
)

replace(
    "apps/web/src/lib/reservations-client.ts",
    'import type { ResourceStatus, ResourceType } from "./resource-types";',
    'import type { ResourceStatus, ResourceType } from "./resource-types";\nimport type { MoneyWire } from "./money";',
)
sub(
    "apps/web/src/lib/reservations-client.ts",
    r"(    isVip: boolean;\n)(    seatsPerRow: number;)",
    r"\1    hourlyPriceAddon: MoneyWire;\n\2",
)
sub(
    "apps/web/src/lib/reservations-client.ts",
    r"(  isVip: boolean;\n)(  seatsPerRow: number;)",
    r"\1  hourlyPriceAddon: MoneyWire;\n\2",
)

write(
    "apps/web/src/lib/zone-pricing.ts",
    '''import { coerceMoney, type MoneyWire } from "./money";\n\n/** Hourly zone surcharge, pro-rated by the actual selected/billed duration. */\nexport function zoneHourlyAddonAmount(\n  hourlyPriceAddon: MoneyWire | null | undefined,\n  durationMinutes: number,\n): number {\n  const rate = Math.max(0, coerceMoney(hourlyPriceAddon ?? 0));\n  const minutes = Math.max(0, durationMinutes);\n  return Math.round(rate * (minutes / 60) * 100) / 100;\n}\n\nexport function applyZoneHourlyAddon(\n  basePrice: number | null,\n  hourlyPriceAddon: MoneyWire | null | undefined,\n  durationMinutes: number,\n): number | null {\n  if (basePrice == null) return null;\n  const addon = zoneHourlyAddonAmount(hourlyPriceAddon, durationMinutes);\n  return Math.round((basePrice + addon) * 100) / 100;\n}\n''',
)

# ---------------------------------------------------------------------------
# Gaming zone editor UI
# ---------------------------------------------------------------------------
editor = "apps/web/src/components/gaming/gaming-layout-editor.tsx"
replace(
    editor,
    "  isVip: boolean;\n  seatsPerRow: string;",
    "  isVip: boolean;\n  hourlyPriceAddon: string;\n  seatsPerRow: string;",
)
replace(
    editor,
    '  isVip: false,\n  seatsPerRow: "6",',
    '  isVip: false,\n  hourlyPriceAddon: "0",\n  seatsPerRow: "6",',
)
replace(
    editor,
    "      isVip: section.isVip,\n      seatsPerRow: String(section.seatsPerRow),",
    "      isVip: section.isVip,\n      hourlyPriceAddon: String(section.hourlyPriceAddon ?? 0),\n      seatsPerRow: String(section.seatsPerRow),",
)
replace(
    editor,
    "        isVip: addDraft.isVip,\n        seatsPerRow: Number(addDraft.seatsPerRow) || 6,",
    "        isVip: addDraft.isVip,\n        ...(!isDining && {\n          hourlyPriceAddon: Math.max(0, Number(addDraft.hourlyPriceAddon) || 0),\n        }),\n        seatsPerRow: Number(addDraft.seatsPerRow) || 6,",
)
replace(
    editor,
    "        isVip: editDraft.isVip,\n        seatsPerRow: Number(editDraft.seatsPerRow) || 6,",
    "        isVip: editDraft.isVip,\n        ...(!isDining && {\n          hourlyPriceAddon: Math.max(0, Number(editDraft.hourlyPriceAddon) || 0),\n        }),\n        seatsPerRow: Number(editDraft.seatsPerRow) || 6,",
)
sub(
    editor,
    r"(                            showTableCapacity=\{isDining\}\n)",
    r'\1                            showHourlyPriceAddon={!isDining}\n                            currency={vs?.currency ?? "EUR"}\n                            locale={vs?.locale ?? "en"}\n',
)
sub(
    editor,
    r"(                      showTableCapacity=\{isDining\}\n)",
    r'\1                      showHourlyPriceAddon={!isDining}\n                      currency={vs?.currency ?? "EUR"}\n                      locale={vs?.locale ?? "en"}\n',
)
replace(
    editor,
    "  showTableCapacity,\n  onChange,",
    "  showTableCapacity,\n  showHourlyPriceAddon,\n  currency,\n  locale,\n  onChange,",
)
replace(
    editor,
    "  showTableCapacity?: boolean;\n  onChange: (d: SectionDraft) => void;",
    "  showTableCapacity?: boolean;\n  showHourlyPriceAddon?: boolean;\n  currency: string;\n  locale: string;\n  onChange: (d: SectionDraft) => void;",
)
replace(
    editor,
    "  const countLabel = unitLabels.createCountLabel;\n\n  return (",
    '  const countLabel = unitLabels.createCountLabel;\n  const polish = locale.toLowerCase().startsWith("pl");\n  const addonLabel = polish ? "Dopłata za godzinę" : "Hourly zone add-on";\n  const addonHint = polish\n    ? "Dodawana do podstawowej stawki za każdą godzinę w tej strefie."\n    : "Added on top of the base gaming rate for each hour in this zone.";\n\n  return (',
)
replace(
    editor,
    '      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">',
    '''      {showHourlyPriceAddon ? (\n        <label className="block">\n          <span className="text-[10px] uppercase tracking-wide text-zinc-500">\n            {addonLabel} ({currency})\n          </span>\n          <input\n            type="number"\n            min={0}\n            step="0.01"\n            inputMode="decimal"\n            value={draft.hourlyPriceAddon}\n            onChange={(e) =>\n              onChange({ ...draft, hourlyPriceAddon: e.target.value })\n            }\n            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"\n          />\n          <span className="mt-1 block text-[10px] text-zinc-600">\n            {addonHint}\n          </span>\n        </label>\n      ) : null}\n      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">''',
)

# ---------------------------------------------------------------------------
# Public + staff booking estimate previews
# ---------------------------------------------------------------------------
public_dialog = "apps/web/src/components/venues/public/public-gaming-booking-dialog.tsx"
replace(
    public_dialog,
    'import type { ScheduleCategory, ScheduleUnit } from "@/lib/reservations-client";',
    'import type { ScheduleCategory, ScheduleUnit } from "@/lib/reservations-client";\nimport { applyZoneHourlyAddon } from "@/lib/zone-pricing";',
)
replace(
    public_dialog,
    "  function applyStartTime(next: string) {",
    "  const estimatedPriceWithZoneAddon = useMemo(\n    () =>\n      applyZoneHourlyAddon(\n        estimatedPrice,\n        unit.section?.hourlyPriceAddon,\n        estimatedDurationMinutes,\n      ),\n    [estimatedPrice, unit.section?.hourlyPriceAddon, estimatedDurationMinutes],\n  );\n\n  function applyStartTime(next: string) {",
)
replace(public_dialog, "{estimatedPrice != null ? (", "{estimatedPriceWithZoneAddon != null ? (")
replace(
    public_dialog,
    "price: formatEstPrice(estimatedPrice),",
    "price: formatEstPrice(estimatedPriceWithZoneAddon),",
)

staff_dialog = "apps/web/src/components/reservations/reservation-dialog.tsx"
replace(
    staff_dialog,
    'import type { ResourceCatalog } from "@/lib/resources-client";',
    'import type { ResourceCatalog } from "@/lib/resources-client";\nimport { applyZoneHourlyAddon } from "@/lib/zone-pricing";',
)
replace(
    staff_dialog,
    "  const overlapHint = useMemo(() => {",
    "  const estimatedPriceWithZoneAddon = useMemo(\n    () =>\n      applyZoneHourlyAddon(\n        estimatedPrice,\n        selected?.section?.hourlyPriceAddon,\n        estimatedDurationMinutes,\n      ),\n    [estimatedPrice, selected?.section?.hourlyPriceAddon, estimatedDurationMinutes],\n  );\n\n  const overlapHint = useMemo(() => {",
)
replace(staff_dialog, "{estimatedPrice != null ? (", "{estimatedPriceWithZoneAddon != null ? (")
replace(
    staff_dialog,
    "amount: formatMoney(estimatedPrice),",
    "amount: formatMoney(estimatedPriceWithZoneAddon),",
)

# ---------------------------------------------------------------------------
# Walk-in suggestions: calculate base price from configured rates/hourly rate,
# then apply the zone add-on. A manually typed amount remains an explicit final
# override and is intentionally not altered.
# ---------------------------------------------------------------------------
walkin = "apps/web/src/components/finance/game-billing-panel.tsx"
replace(
    walkin,
    "  buildBowlingNotes,\n  suggestBowlingWalkInAmount,",
    "  buildBowlingNotes,\n  estimateTimedRatesPrice,\n  suggestBowlingWalkInAmount,",
)
replace(
    walkin,
    'import type { MessageKey } from "@/lib/i18n";',
    'import type { MessageKey } from "@/lib/i18n";\nimport { coerceMoney } from "@/lib/money";\nimport { applyZoneHourlyAddon } from "@/lib/zone-pricing";',
)
replace(
    walkin,
    "          rates: c.rates,\n        })),",
    "          rates: c.rates,\n          hourlyRate: r.hourlyRate,\n          section: r.section,\n        })),",
)
replace(
    walkin,
    "    const suggested = wiIsBowling && wiSelectedMode\n      ? suggestBowlingWalkInAmount(\n          wiSelectedMode,\n          players,\n          duration,\n        )\n      : null;\n    if (suggested != null) {\n      setWiAmount(String(suggested));\n    }",
    "    const baseSuggested = wiIsBowling && wiSelectedMode\n      ? suggestBowlingWalkInAmount(\n          wiSelectedMode,\n          players,\n          duration,\n        )\n      : wiSelectedUnit.rates.length > 0\n        ? estimateTimedRatesPrice(wiSelectedUnit.rates, duration)\n        : coerceMoney(wiSelectedUnit.hourlyRate) > 0\n          ? Math.round(\n              coerceMoney(wiSelectedUnit.hourlyRate) * (duration / 60) * 100,\n            ) / 100\n          : null;\n    const suggested = applyZoneHourlyAddon(\n      baseSuggested,\n      wiSelectedUnit.section?.hourlyPriceAddon,\n      duration,\n    );\n    if (suggested != null) {\n      setWiAmount(String(suggested));\n    }",
)
replace(
    walkin,
    "      if (!wiAmount.trim() && wiIsBowling && wiSelectedMode) {\n        const suggested = suggestBowlingWalkInAmount(\n          wiSelectedMode,\n          players,\n          durationMinutes,\n        );\n        if (suggested != null) amount = suggested;\n      }",
    "      if (!wiAmount.trim() && wiSelectedUnit) {\n        const baseSuggested = wiIsBowling && wiSelectedMode\n          ? suggestBowlingWalkInAmount(\n              wiSelectedMode,\n              players,\n              durationMinutes,\n            )\n          : wiSelectedUnit.rates.length > 0\n            ? estimateTimedRatesPrice(wiSelectedUnit.rates, durationMinutes)\n            : coerceMoney(wiSelectedUnit.hourlyRate) > 0\n              ? Math.round(\n                  coerceMoney(wiSelectedUnit.hourlyRate) *\n                    (durationMinutes / 60) *\n                    100,\n                ) / 100\n              : null;\n        const suggested = applyZoneHourlyAddon(\n          baseSuggested,\n          wiSelectedUnit.section?.hourlyPriceAddon,\n          durationMinutes,\n        );\n        if (suggested != null) amount = suggested;\n      }",
)

print("Zone hourly price add-on implementation applied successfully.")

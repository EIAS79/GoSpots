import { addMinutesToTime } from "./booking-time";
import type { BookingMode, ResourceRate } from "./resources-client";
import type { ResourceType } from "./resource-types";
import { listBowlingModes, resolveBowlingMode, type BowlingCategoryRate } from "./bowling-modes";

export type BowlingOfferingConfig = {
  defaultGames: number;
  pricePerGame: number | null;
  pricePerPerson: number | null;
  minPlayers: number;
  maxPlayers: number;
  minutesPerGame: number | null;
};

export type BowlingChargeMode = Exclude<BookingMode, "MIXED">;

const GAMES_NOTE_RE = /(\d+)\s*games?\b/i;

export function parseBowlingConfig(
  raw: Record<string, unknown> | null | undefined,
  slotMinutes = 60,
): BowlingOfferingConfig {
  const n = (key: string, fallback: number) => {
    const v = raw?.[key];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const price = (key: string) => {
    const v = raw?.[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    defaultGames: n("defaultGames", 1),
    pricePerGame: price("pricePerGame"),
    pricePerPerson: price("pricePerPerson"),
    minPlayers: n("minPlayers", 1),
    maxPlayers: n("maxPlayers", 6),
    minutesPerGame: price("minutesPerGame") ?? slotMinutes,
  };
}

export function formatBookingModeLabel(mode: BookingMode): string {
  switch (mode) {
    case "GAME":
      return "By game";
    case "PERSON":
      return "Per person";
    case "MIXED":
      return "Flexible";
    default:
      return "By time slot";
  }
}

export function parseGamesFromNotes(notes?: string | null): number | null {
  if (!notes) return null;
  const m = notes.match(GAMES_NOTE_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseBowlingChargeFromNotes(
  notes?: string | null,
): BowlingChargeMode | null {
  if (!notes) return null;
  if (/per person/i.test(notes)) return "PERSON";
  if (/\[Bowling · \d+ game/i.test(notes) || GAMES_NOTE_RE.test(notes)) {
    return "GAME";
  }
  if (/time slot/i.test(notes)) return "TIME";
  return null;
}

export function resolveBowlingChargeMode(
  bookingMode: BookingMode | null | undefined,
  notes?: string | null,
): BowlingChargeMode {
  if (bookingMode === "MIXED") {
    return parseBowlingChargeFromNotes(notes) ?? "TIME";
  }
  return (bookingMode ?? "TIME") as BowlingChargeMode;
}

/**
 * Polish-style booking: PC/PS and billiard are per station/table + time.
 * Bowling per-person pricing only when the lane is charged per player.
 */
export function bookingCollectsPartySize(
  type: ResourceType,
  opts?: {
    bookingMode?: BookingMode | null;
    notes?: string | null;
    offeringConfig?: Record<string, unknown> | null;
    categoryRates?: BowlingCategoryRate[];
    slotMinutes?: number;
  },
): boolean {
  if (type !== "BOWLING") return false;
  const modes = listBowlingModes(
    opts?.offeringConfig,
    opts?.bookingMode,
    opts?.categoryRates ?? [],
    opts?.slotMinutes ?? 60,
  );
  const mode = resolveBowlingMode(modes, opts?.notes);
  if (mode) return mode.chargeType === "PERSON";
  return resolveBowlingChargeMode(opts?.bookingMode, opts?.notes) === "PERSON";
}

export function effectiveBillingPartySize(
  type: ResourceType,
  partySize: number,
  opts?: {
    bookingMode?: BookingMode | null;
    notes?: string | null;
    offeringConfig?: Record<string, unknown> | null;
    categoryRates?: BowlingCategoryRate[];
    slotMinutes?: number;
  },
): number {
  return bookingCollectsPartySize(type, opts)
    ? Math.max(1, partySize)
    : 1;
}

export function buildBowlingNotes(
  baseNotes: string,
  mode: { id: string; chargeType: BowlingChargeMode },
  gameCount: number,
): string {
  const stripped = baseNotes
    .replace(/^\[Bowling[^\]]*\]\s*/i, "")
    .replace(GAMES_NOTE_RE, "")
    .trim();
  const typeLabel =
    mode.chargeType === "GAME"
      ? `${gameCount} game${gameCount === 1 ? "" : "s"}`
      : mode.chargeType === "PERSON"
        ? "per person"
        : "time slot";
  const prefix = `[Bowling · mode:${mode.id} · ${typeLabel}]`;
  return stripped ? `${prefix} ${stripped}` : prefix;
}

export function estimateBowlingEndTime(
  startTime: string,
  chargeMode: BowlingChargeMode,
  gameCount: number,
  config: BowlingOfferingConfig,
  slotMinutes: number,
): string {
  if (chargeMode === "GAME") {
    const perGame = config.minutesPerGame ?? slotMinutes;
    return addMinutesToTime(startTime, gameCount * perGame);
  }
  return addMinutesToTime(startTime, slotMinutes);
}

export function estimateBowlingPrice(
  chargeMode: BowlingChargeMode,
  gameCount: number,
  partySize: number,
  config: BowlingOfferingConfig,
  durationMinutes?: number,
  slotMinutes = 60,
): number | null {
  if (chargeMode === "GAME" && config.pricePerGame != null) {
    return config.pricePerGame * gameCount;
  }
  if (chargeMode === "PERSON" && config.pricePerPerson != null) {
    const blockMin = Math.max(15, slotMinutes);
    const blocks =
      durationMinutes != null && durationMinutes > 0
        ? Math.ceil(durationMinutes / blockMin)
        : 1;
    return config.pricePerPerson * partySize * blocks;
  }
  return null;
}

/** Estimate price from timed rate tiers (PC, billiard, lane rental, etc.). */
export function estimateTimedRatesPrice(
  rates: { label: string; durationMinutes: number | null; price: number }[],
  durationMinutes: number,
): number | null {
  if (rates.length === 0 || durationMinutes <= 0) return null;
  const blockRates = rates.filter(
    (r) => r.durationMinutes != null && r.durationMinutes > 0,
  );
  if (blockRates.length === 0) return null;
  let best: number | null = null;
  for (const rate of blockRates) {
    const blocks = Math.ceil(durationMinutes / rate.durationMinutes!);
    const amount = blocks * rate.price;
    if (best === null || amount < best) best = amount;
  }
  return best;
}

/** Suggested walk-in charge from a configured bowling mode. */
export function suggestBowlingWalkInAmount(
  mode: {
    chargeType: BowlingChargeMode;
    pricePerPerson: number | null;
    pricePerGame: number | null;
    slotMinutes: number;
    rates: { label: string; durationMinutes: number | null; price: number }[];
  },
  playerCount: number,
  durationMinutes: number,
  gameCount = 1,
): number | null {
  if (mode.chargeType === "PERSON" && mode.pricePerPerson != null) {
    const blockMin = Math.max(15, mode.slotMinutes);
    const blocks = Math.max(1, Math.ceil(durationMinutes / blockMin));
    return mode.pricePerPerson * Math.max(1, playerCount) * blocks;
  }
  if (mode.chargeType === "GAME" && mode.pricePerGame != null) {
    return mode.pricePerGame * Math.max(1, gameCount);
  }
  if (mode.chargeType === "TIME") {
    return estimateTimedRatesPrice(mode.rates, durationMinutes);
  }
  return null;
}

export function parseBowlingNotesSummary(notes?: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/^\[Bowling · mode:[^·]+ · ([^\]]+)\]/i);
  return m?.[1]?.trim() ?? null;
}

import type { BookingMode } from "./resources-client";
import type { BowlingChargeMode, BowlingOfferingConfig } from "./bowling-booking";
import {
  parseBowlingChargeFromNotes,
  parseGamesFromNotes,
} from "./bowling-booking";

export type BowlingModeRate = {
  label: string;
  durationMinutes: number | null;
  price: number;
};

export type BowlingCategoryRate = BowlingModeRate;

export type BowlingModeDefinition = {
  id: string;
  name: string;
  chargeType: BowlingChargeMode;
  slotMinutes: number;
  pricePerPerson: number | null;
  pricePerGame: number | null;
  defaultGames: number;
  minutesPerGame: number | null;
  minPlayers: number;
  maxPlayers: number;
  rates: BowlingModeRate[];
};

const MODE_ID_RE = /mode:([a-zA-Z0-9_-]+)/i;

export function newBowlingModeId() {
  return `bm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultBowlingModeName(chargeType: BowlingChargeMode) {
  switch (chargeType) {
    case "PERSON":
      return "Per person";
    case "GAME":
      return "By game";
    default:
      return "Lane · time slot";
  }
}

export function createBowlingMode(
  chargeType: BowlingChargeMode,
  slotMinutes = 60,
): BowlingModeDefinition {
  return {
    id: newBowlingModeId(),
    name: defaultBowlingModeName(chargeType),
    chargeType,
    slotMinutes,
    pricePerPerson: chargeType === "PERSON" ? null : null,
    pricePerGame: chargeType === "GAME" ? null : null,
    defaultGames: 1,
    minutesPerGame: slotMinutes,
    minPlayers: 1,
    maxPlayers: 6,
    rates:
      chargeType === "TIME"
        ? [{ label: "Per hour", durationMinutes: slotMinutes, price: 0 }]
        : [],
  };
}

function parseModeRate(raw: unknown): BowlingModeRate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label : "Rate";
  const durationMinutes =
    typeof o.durationMinutes === "number" && Number.isFinite(o.durationMinutes)
      ? o.durationMinutes
      : null;
  const price =
    typeof o.price === "number" && Number.isFinite(o.price) ? o.price : 0;
  return { label, durationMinutes, price };
}

function parseStoredMode(
  raw: unknown,
  fallbackSlotMinutes: number,
): BowlingModeDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : newBowlingModeId();
  const chargeType = o.chargeType ?? o.type;
  if (chargeType !== "TIME" && chargeType !== "GAME" && chargeType !== "PERSON") {
    return null;
  }
  const n = (key: string, fb: number) => {
    const v = o[key];
    return typeof v === "number" && Number.isFinite(v) ? v : fb;
  };
  const price = (key: string) => {
    const v = o[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const ratesRaw = Array.isArray(o.rates) ? o.rates : [];
  const rates = ratesRaw
    .map(parseModeRate)
    .filter((r): r is BowlingModeRate => r != null);
  return {
    id,
    name:
      typeof o.name === "string" && o.name.trim()
        ? o.name.trim()
        : defaultBowlingModeName(chargeType as BowlingChargeMode),
    chargeType: chargeType as BowlingChargeMode,
    slotMinutes: n("slotMinutes", fallbackSlotMinutes),
    pricePerPerson: price("pricePerPerson"),
    pricePerGame: price("pricePerGame"),
    defaultGames: n("defaultGames", 1),
    minutesPerGame: price("minutesPerGame") ?? fallbackSlotMinutes,
    minPlayers: n("minPlayers", 1),
    maxPlayers: n("maxPlayers", 6),
    rates,
  };
}

/** Modes configured in Gaming setup (migrates legacy single-mode config). */
export function listBowlingModes(
  offeringConfig: Record<string, unknown> | null | undefined,
  categoryBookingMode: BookingMode | null | undefined,
  categoryRates: BowlingCategoryRate[] = [],
  slotMinutes = 60,
): BowlingModeDefinition[] {
  const stored = offeringConfig?.bowlingModes;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored
      .map((m) => parseStoredMode(m, slotMinutes))
      .filter((m): m is BowlingModeDefinition => m != null);
  }

  const legacy = offeringConfig ?? {};
  const n = (key: string, fb: number) => {
    const v = legacy[key];
    return typeof v === "number" && Number.isFinite(v) ? v : fb;
  };
  const price = (key: string) => {
    const v = legacy[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  const rates: BowlingModeRate[] = categoryRates.map((r) => ({
    label: r.label,
    durationMinutes: r.durationMinutes,
    price: r.price,
  }));

  const mode = categoryBookingMode ?? "TIME";
  if (mode === "MIXED") {
    const modes: BowlingModeDefinition[] = [];
    modes.push({
      id: "legacy-time",
      name: "Lane · time slot",
      chargeType: "TIME",
      slotMinutes,
      pricePerPerson: null,
      pricePerGame: null,
      defaultGames: 1,
      minutesPerGame: slotMinutes,
      minPlayers: 1,
      maxPlayers: 6,
      rates: rates.length
        ? rates
        : [{ label: "Per hour", durationMinutes: slotMinutes, price: 0 }],
    });
    if (price("pricePerPerson") != null) {
      modes.push({
        id: "legacy-person",
        name: "Per person",
        chargeType: "PERSON",
        slotMinutes,
        pricePerPerson: price("pricePerPerson"),
        pricePerGame: null,
        defaultGames: 1,
        minutesPerGame: slotMinutes,
        minPlayers: n("minPlayers", 1),
        maxPlayers: n("maxPlayers", 6),
        rates: [],
      });
    }
    if (price("pricePerGame") != null) {
      modes.push({
        id: "legacy-game",
        name: "By game",
        chargeType: "GAME",
        slotMinutes,
        pricePerPerson: null,
        pricePerGame: price("pricePerGame"),
        defaultGames: n("defaultGames", 1),
        minutesPerGame: price("minutesPerGame") ?? slotMinutes,
        minPlayers: 1,
        maxPlayers: 6,
        rates: [],
      });
    }
    return modes.length ? modes : [createBowlingMode("TIME", slotMinutes)];
  }

  return [
    {
      id: `legacy-${mode.toLowerCase()}`,
      name: defaultBowlingModeName(mode as BowlingChargeMode),
      chargeType: mode as BowlingChargeMode,
      slotMinutes,
      pricePerPerson: price("pricePerPerson"),
      pricePerGame: price("pricePerGame"),
      defaultGames: n("defaultGames", 1),
      minutesPerGame: price("minutesPerGame") ?? slotMinutes,
      minPlayers: n("minPlayers", 1),
      maxPlayers: n("maxPlayers", 6),
      rates:
        mode === "TIME"
          ? rates.length
            ? rates
            : [{ label: "Per hour", durationMinutes: slotMinutes, price: 0 }]
          : [],
    },
  ];
}

export function parseBowlingModeIdFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(MODE_ID_RE);
  return m?.[1] ?? null;
}

export function resolveBowlingMode(
  modes: BowlingModeDefinition[],
  notes?: string | null,
): BowlingModeDefinition | null {
  if (modes.length === 0) return null;
  const id = parseBowlingModeIdFromNotes(notes);
  if (id) {
    const found = modes.find((m) => m.id === id);
    if (found) return found;
  }
  const charge = parseBowlingChargeFromNotes(notes);
  if (charge) {
    const byType = modes.find((m) => m.chargeType === charge);
    if (byType) return byType;
  }
  return modes[0];
}

export function modeToOfferingConfig(mode: BowlingModeDefinition): BowlingOfferingConfig {
  return {
    defaultGames: mode.defaultGames,
    pricePerGame: mode.pricePerGame,
    pricePerPerson: mode.pricePerPerson,
    minPlayers: mode.minPlayers,
    maxPlayers: mode.maxPlayers,
    minutesPerGame: mode.minutesPerGame,
  };
}

export function serializeBowlingModes(
  modes: BowlingModeDefinition[],
): Record<string, unknown> {
  return {
    bowlingModes: modes.map((m) => ({
      id: m.id,
      name: m.name,
      chargeType: m.chargeType,
      slotMinutes: m.slotMinutes,
      pricePerPerson: m.pricePerPerson,
      pricePerGame: m.pricePerGame,
      defaultGames: m.defaultGames,
      minutesPerGame: m.minutesPerGame,
      minPlayers: m.minPlayers,
      maxPlayers: m.maxPlayers,
      rates: m.rates,
    })),
  };
}

export function inferBookingModeFromModes(
  modes: BowlingModeDefinition[],
): BookingMode {
  if (modes.length === 0) return "TIME";
  if (modes.length === 1) return modes[0].chargeType;
  return "MIXED";
}

export function gamesFromNotesOrMode(
  notes: string | null | undefined,
  mode: BowlingModeDefinition,
): number {
  return parseGamesFromNotes(notes) ?? mode.defaultGames;
}

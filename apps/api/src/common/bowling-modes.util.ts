import type { BookingMode, ResourceType } from '@prisma/client';

export type BowlingChargeMode = Exclude<BookingMode, 'MIXED'>;

export type BowlingModeRate = {
  label: string;
  durationMinutes: number | null;
  price: number;
};

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

const GAMES_NOTE_RE = /(\d+)\s*games?\b/i;
const MODE_ID_RE = /mode:([a-zA-Z0-9_-]+)/i;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function parseGamesFromNotes(notes?: string | null): number | null {
  if (!notes) return null;
  const m = notes.match(GAMES_NOTE_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function estimateTimedRatesPrice(
  rates: BowlingModeRate[],
  durationMinutes: number,
): { amount: number; label: string } | null {
  if (rates.length === 0 || durationMinutes <= 0) return null;
  const blockRates = rates.filter(
    (r) => r.durationMinutes != null && r.durationMinutes > 0,
  );
  if (blockRates.length === 0) return null;
  let best: { amount: number; label: string } | null = null;
  for (const rate of blockRates) {
    const blocks = Math.ceil(durationMinutes / rate.durationMinutes!);
    const amount = roundMoney(blocks * rate.price);
    if (!best || amount < best.amount) {
      best = { amount, label: rate.label };
    }
  }
  return best;
}

export type BowlingBillingComputeResult = {
  amount: number;
  durationMinutes: number;
  rateLabel: string;
  breakdown: string;
};

/** Reservation / play billing amount from the bowling mode encoded in notes. */
export function computeBowlingBillingAmount(
  mode: BowlingModeDefinition,
  notes: string | null | undefined,
  durationMinutes: number,
  partySize: number,
): BowlingBillingComputeResult {
  const duration = Math.max(1, durationMinutes);
  const party = Math.max(1, partySize);

  if (mode.chargeType === 'PERSON' && mode.pricePerPerson != null) {
    const blockMin = Math.max(15, mode.slotMinutes);
    const blocks = Math.ceil(duration / blockMin);
    const amount = roundMoney(mode.pricePerPerson * party * blocks);
    return {
      amount,
      durationMinutes: duration,
      rateLabel: `${mode.pricePerPerson}/person`,
      breakdown: `${duration} min · ${mode.name} · ${party} guest${party > 1 ? 's' : ''} · ${blocks}× ${blockMin} min`,
    };
  }

  if (mode.chargeType === 'GAME' && mode.pricePerGame != null) {
    const gameCount = Math.max(1, parseGamesFromNotes(notes) ?? mode.defaultGames);
    const amount = roundMoney(mode.pricePerGame * gameCount);
    return {
      amount,
      durationMinutes: duration,
      rateLabel: `${mode.pricePerGame}/game`,
      breakdown: `${duration} min · ${mode.name} · ${gameCount} game${gameCount > 1 ? 's' : ''}`,
    };
  }

  if (mode.chargeType === 'TIME') {
    const timed = estimateTimedRatesPrice(mode.rates, duration);
    if (timed) {
      const blocks = Math.ceil(
        duration /
          (mode.rates.find((r) => r.label === timed.label)?.durationMinutes ??
            mode.slotMinutes),
      );
      return {
        amount: timed.amount,
        durationMinutes: duration,
        rateLabel: timed.label,
        breakdown: `${duration} min · ${mode.name} · lane rental · ${blocks}× ${timed.label}`,
      };
    }
  }

  return {
    amount: 0,
    durationMinutes: duration,
    rateLabel: 'No rate configured',
    breakdown: `Add rates for "${mode.name}" in Gaming setup`,
  };
}

function parseBowlingChargeFromNotes(
  notes?: string | null,
): BowlingChargeMode | null {
  if (!notes) return null;
  if (/per person/i.test(notes)) return 'PERSON';
  if (/\[Bowling · \d+ game/i.test(notes) || GAMES_NOTE_RE.test(notes)) {
    return 'GAME';
  }
  if (/time slot/i.test(notes)) return 'TIME';
  return null;
}

function parseStoredMode(
  raw: unknown,
  fallbackSlotMinutes: number,
): BowlingModeDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const chargeType = o.chargeType ?? o.type;
  if (chargeType !== 'TIME' && chargeType !== 'GAME' && chargeType !== 'PERSON') {
    return null;
  }
  const n = (key: string, fb: number) => {
    const v = o[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fb;
  };
  const price = (key: string) => {
    const v = o[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const ratesRaw = Array.isArray(o.rates) ? o.rates : [];
  const rates: BowlingModeRate[] = [];
  for (const r of ratesRaw) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Record<string, unknown>;
    rates.push({
      label: typeof row.label === 'string' ? row.label : 'Rate',
      durationMinutes:
        typeof row.durationMinutes === 'number' ? row.durationMinutes : null,
      price: typeof row.price === 'number' ? row.price : 0,
    });
  }
  return {
    id: typeof o.id === 'string' ? o.id : `bm_${Date.now()}`,
    name: typeof o.name === 'string' ? o.name : String(chargeType),
    chargeType: chargeType as BowlingChargeMode,
    slotMinutes: n('slotMinutes', fallbackSlotMinutes),
    pricePerPerson: price('pricePerPerson'),
    pricePerGame: price('pricePerGame'),
    defaultGames: n('defaultGames', 1),
    minutesPerGame: price('minutesPerGame') ?? fallbackSlotMinutes,
    minPlayers: n('minPlayers', 1),
    maxPlayers: n('maxPlayers', 6),
    rates,
  };
}

export function listBowlingModes(
  offeringConfig: Record<string, unknown> | null | undefined,
  categoryBookingMode: BookingMode | null | undefined,
  categoryRates: { label: string; durationMinutes: number | null; price: number }[] = [],
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
    return typeof v === 'number' && Number.isFinite(v) ? v : fb;
  };
  const price = (key: string) => {
    const v = legacy[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const rates: BowlingModeRate[] = categoryRates.map((r) => ({
    label: r.label,
    durationMinutes: r.durationMinutes,
    price: r.price,
  }));
  const mode = categoryBookingMode ?? 'TIME';
  return [
    {
      id: `legacy-${String(mode).toLowerCase()}`,
      name: String(mode),
      chargeType: (mode === 'MIXED' ? 'TIME' : mode) as BowlingChargeMode,
      slotMinutes,
      pricePerPerson: price('pricePerPerson'),
      pricePerGame: price('pricePerGame'),
      defaultGames: n('defaultGames', 1),
      minutesPerGame: price('minutesPerGame') ?? slotMinutes,
      minPlayers: n('minPlayers', 1),
      maxPlayers: n('maxPlayers', 6),
      rates:
        rates.length > 0
          ? rates
          : [{ label: 'Per hour', durationMinutes: slotMinutes, price: 0 }],
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

export function bookingCollectsPartySizeFromContext(
  type: ResourceType,
  opts: {
    bookingMode?: BookingMode | null;
    notes?: string | null;
    offeringConfig?: unknown;
    categoryRates?: { label: string; durationMinutes: number | null; price: number }[];
    slotMinutes?: number;
  },
): boolean {
  if (type !== 'BOWLING') return false;
  const modes = listBowlingModes(
    opts.offeringConfig as Record<string, unknown> | null | undefined,
    opts.bookingMode,
    opts.categoryRates ?? [],
    opts.slotMinutes ?? 60,
  );
  const mode = resolveBowlingMode(modes, opts.notes);
  return mode?.chargeType === 'PERSON';
}

export function effectiveBillingPartySizeFromContext(
  type: ResourceType,
  partySize: number,
  opts: {
    bookingMode?: BookingMode | null;
    notes?: string | null;
    offeringConfig?: unknown;
    categoryRates?: { label: string; durationMinutes: number | null; price: number }[];
    slotMinutes?: number;
  },
): number {
  return bookingCollectsPartySizeFromContext(type, opts)
    ? Math.max(1, partySize)
    : 1;
}

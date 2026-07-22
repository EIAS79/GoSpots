import { ValidateBy, type ValidationOptions } from 'class-validator';
import {
  serializeMoneyString,
  toMoneyNumber,
  type MoneyInput,
} from './money.util';

/** Current offeringConfig JSON contract version (Phase 0 stamp). */
export const OFFERING_CONFIG_SCHEMA_VERSION = 1 as const;

/** Supported `schemaVersion` integers on write validation. */
export const OFFERING_CONFIG_SUPPORTED_VERSIONS = new Set<number>([
  OFFERING_CONFIG_SCHEMA_VERSION,
]);

/** Money scalar on offeringConfig (legacy number or 4dp string). */
export type OfferingMoneyV1 = number | string | null | undefined;

/** Nested bowling mode rate (Phase 0). */
export type BowlingModeRateV1 = {
  label?: string;
  durationMinutes?: number | null;
  price: number | string;
};

/** Bowling mode overlay (Phase 0). */
export type BowlingModeV1 = {
  id?: string;
  name?: string;
  chargeType: 'TIME' | 'GAME' | 'PERSON';
  slotMinutes?: number;
  pricePerPerson?: OfferingMoneyV1;
  pricePerGame?: OfferingMoneyV1;
  defaultGames?: number;
  minutesPerGame?: number | null;
  minPlayers?: number;
  maxPlayers?: number;
  rates?: BowlingModeRateV1[];
};

/**
 * Canonical offeringConfig shape after Phase 0 stamp.
 * Behavioral overlay only — relational `ResourceRate` remains money catalog.
 */
export type OfferingConfigV1 = {
  schemaVersion: typeof OFFERING_CONFIG_SCHEMA_VERSION;
  noShowMinutes?: number;
  pricePerPerson?: OfferingMoneyV1;
  pricePerGame?: OfferingMoneyV1;
  pricePerHour?: OfferingMoneyV1;
  price?: OfferingMoneyV1;
  hourlyRate?: OfferingMoneyV1;
  basePrice?: OfferingMoneyV1;
  bowlingModes?: BowlingModeV1[];
  defaultGames?: number;
  minPlayers?: number;
  maxPlayers?: number;
  minutesPerGame?: number | null;
  slotMinutes?: number;
  [key: string]: unknown;
};

/** Known money keys walked by shop FX reprice / normalize. */
export const OFFERING_PRICE_KEYS = [
  'pricePerPerson',
  'pricePerGame',
  'pricePerHour',
  'price',
  'hourlyRate',
  'basePrice',
] as const;

const OFFERING_PRICE_KEY_SET = new Set<string>(OFFERING_PRICE_KEYS);

function isMoneyScalar(value: unknown): value is number | string {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    try {
      toMoneyNumber(value);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Deep-map known price fields inside `ResourceCategory.offeringConfig` JSON.
 * Accepts legacy JSON numbers or decimal strings; returns the original reference
 * when nothing changed.
 */
export function mapOfferingConfigPrices(
  config: unknown,
  map: (n: number | string) => number | string,
): unknown {
  if (config == null || typeof config !== 'object') return config;
  let changed = false;

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((v) => walk(v));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (OFFERING_PRICE_KEY_SET.has(k) && isMoneyScalar(v)) {
          out[k] = map(v);
          if (out[k] !== v) changed = true;
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    return value;
  };

  const next = walk(config);
  return changed ? next : config;
}

/**
 * Normalize known offeringConfig price fields to Decimal-safe 4dp strings
 * (call after DTO validation on write; also safe on read for API emit).
 */
export function normalizeOfferingConfigPrices(config: unknown): unknown {
  return mapOfferingConfigPrices(config, (n) =>
    serializeMoneyString(n as MoneyInput),
  );
}

/**
 * Inject `schemaVersion: 1` when absent (expand-only; no DDL).
 * Leaves an explicit unsupported version untouched so validation can reject it.
 */
export function stampOfferingConfigSchemaVersion(config: unknown): unknown {
  if (config == null || !isPlainObject(config)) return config;
  if ('schemaVersion' in config && config.schemaVersion != null) {
    return config;
  }
  return {
    ...config,
    schemaVersion: OFFERING_CONFIG_SCHEMA_VERSION,
  };
}

/**
 * Persist / emit prep: stamp schemaVersion then normalize money keys to 4dp strings.
 * Use on category create/update and API category serialize.
 */
export function prepareOfferingConfigForWrite(config: unknown): unknown {
  if (config == null) return config;
  return normalizeOfferingConfigPrices(stampOfferingConfigSchemaVersion(config));
}

const BOWLING_CHARGE_TYPES = new Set(['TIME', 'GAME', 'PERSON']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Finite non-negative money (number or decimal string). Null allowed when `allowNull`. */
export function isNonNegativeMoney(
  value: unknown,
  allowNull = false,
): boolean {
  if (value === null) return allowNull;
  if (!isMoneyScalar(value)) return false;
  try {
    return toMoneyNumber(value) >= 0;
  } catch {
    return false;
  }
}

function validatePriceFields(
  obj: Record<string, unknown>,
  path: string,
): string | null {
  for (const key of OFFERING_PRICE_KEYS) {
    if (!(key in obj)) continue;
    if (!isNonNegativeMoney(obj[key], true)) {
      return `${path}.${key} must be a finite non-negative number/string or null`;
    }
  }
  return null;
}

function validateBowlingModeRate(
  raw: unknown,
  path: string,
): string | null {
  if (!isPlainObject(raw)) {
    return `${path} must be an object`;
  }
  if ('label' in raw && typeof raw.label !== 'string') {
    return `${path}.label must be a string`;
  }
  if ('durationMinutes' in raw && raw.durationMinutes != null) {
    if (
      typeof raw.durationMinutes !== 'number' ||
      !Number.isFinite(raw.durationMinutes) ||
      raw.durationMinutes <= 0
    ) {
      return `${path}.durationMinutes must be a finite positive number or null`;
    }
  }
  if (!('price' in raw)) {
    return `${path}.price is required`;
  }
  if (!isNonNegativeMoney(raw.price, false)) {
    return `${path}.price must be a finite non-negative number or decimal string`;
  }
  return validatePriceFields(raw, path);
}

function validateBowlingMode(raw: unknown, path: string): string | null {
  if (!isPlainObject(raw)) {
    return `${path} must be an object`;
  }
  const chargeType = raw.chargeType ?? raw.type;
  if (
    typeof chargeType !== 'string' ||
    !BOWLING_CHARGE_TYPES.has(chargeType)
  ) {
    return `${path}.chargeType must be TIME, GAME, or PERSON`;
  }
  if ('id' in raw && typeof raw.id !== 'string') {
    return `${path}.id must be a string`;
  }
  if ('name' in raw && typeof raw.name !== 'string') {
    return `${path}.name must be a string`;
  }

  for (const key of [
    'slotMinutes',
    'defaultGames',
    'minPlayers',
    'maxPlayers',
    'minutesPerGame',
  ] as const) {
    if (!(key in raw) || raw[key] == null) continue;
    const v = raw[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      return `${path}.${key} must be a finite non-negative number or null`;
    }
  }

  const priceErr = validatePriceFields(raw, path);
  if (priceErr) return priceErr;

  if ('rates' in raw) {
    if (!Array.isArray(raw.rates)) {
      return `${path}.rates must be an array`;
    }
    for (let i = 0; i < raw.rates.length; i++) {
      const rateErr = validateBowlingModeRate(raw.rates[i], `${path}.rates[${i}]`);
      if (rateErr) return rateErr;
    }
  }

  return null;
}

/**
 * Returns `null` when valid, otherwise a human-readable error.
 * `null`/`undefined` config is valid (optional field); callers use `@IsOptional`.
 */
export function validateOfferingConfig(value: unknown): string | null {
  if (value == null) return null;
  if (!isPlainObject(value)) {
    return 'offeringConfig must be a plain object';
  }

  if ('schemaVersion' in value && value.schemaVersion != null) {
    const v = value.schemaVersion;
    if (
      typeof v !== 'number' ||
      !Number.isInteger(v) ||
      !OFFERING_CONFIG_SUPPORTED_VERSIONS.has(v)
    ) {
      const supported = [...OFFERING_CONFIG_SUPPORTED_VERSIONS]
        .sort((a, b) => a - b)
        .join(', ');
      return `offeringConfig.schemaVersion must be a supported integer (${supported})`;
    }
  }

  const topPriceErr = validatePriceFields(value, 'offeringConfig');
  if (topPriceErr) return topPriceErr;

  if ('noShowMinutes' in value && value.noShowMinutes != null) {
    const n = value.noShowMinutes;
    if (
      typeof n !== 'number' ||
      !Number.isFinite(n) ||
      !Number.isInteger(n) ||
      n < 5 ||
      n > 180
    ) {
      return 'offeringConfig.noShowMinutes must be an integer between 5 and 180';
    }
  }

  if ('bowlingModes' in value && value.bowlingModes != null) {
    if (!Array.isArray(value.bowlingModes)) {
      return 'offeringConfig.bowlingModes must be an array';
    }
    for (let i = 0; i < value.bowlingModes.length; i++) {
      const modeErr = validateBowlingMode(
        value.bowlingModes[i],
        `offeringConfig.bowlingModes[${i}]`,
      );
      if (modeErr) return modeErr;
    }
  }

  // Legacy single-mode counters at top level (pre-bowlingModes).
  for (const key of [
    'defaultGames',
    'minPlayers',
    'maxPlayers',
    'minutesPerGame',
    'slotMinutes',
  ] as const) {
    if (!(key in value) || value[key] == null) continue;
    const v = value[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      return `offeringConfig.${key} must be a finite non-negative number or null`;
    }
  }

  return null;
}

export function isValidOfferingConfig(value: unknown): boolean {
  return validateOfferingConfig(value) === null;
}

/** class-validator decorator for create/update category DTOs. */
export function IsOfferingConfig(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isOfferingConfig',
      validator: {
        validate: (value: unknown) => isValidOfferingConfig(value),
        defaultMessage: (args) =>
          validateOfferingConfig(args?.value) ?? 'offeringConfig is invalid',
      },
    },
    validationOptions,
  );
}

export type OfferingConfigInventorySample = {
  id: string;
  shopId: string;
  error: string;
};

export type OfferingConfigInventory = {
  totalCategories: number;
  withConfig: number;
  valid: number;
  invalid: number;
  missingSchemaVersion: number;
  schemaVersion1: number;
  otherSchemaVersion: number;
  samples: OfferingConfigInventorySample[];
};

type OfferingConfigInventoryClient = {
  resourceCategory: {
    findMany: (args: {
      select: { id: true; shopId: true; offeringConfig: true };
    }) => Promise<
      Array<{ id: string; shopId: string; offeringConfig: unknown }>
    >;
  };
};

const INVENTORY_SAMPLE_CAP = 20;

/** Read-only scan of ResourceCategory.offeringConfig validity + version coverage. */
export async function inventoryOfferingConfigs(
  prisma: OfferingConfigInventoryClient,
): Promise<OfferingConfigInventory> {
  const rows = await prisma.resourceCategory.findMany({
    select: { id: true, shopId: true, offeringConfig: true },
  });

  const out: OfferingConfigInventory = {
    totalCategories: rows.length,
    withConfig: 0,
    valid: 0,
    invalid: 0,
    missingSchemaVersion: 0,
    schemaVersion1: 0,
    otherSchemaVersion: 0,
    samples: [],
  };

  for (const row of rows) {
    const cfg = row.offeringConfig;
    if (cfg == null) continue;
    out.withConfig += 1;

    if (isPlainObject(cfg)) {
      if (!('schemaVersion' in cfg) || cfg.schemaVersion == null) {
        out.missingSchemaVersion += 1;
      } else if (cfg.schemaVersion === OFFERING_CONFIG_SCHEMA_VERSION) {
        out.schemaVersion1 += 1;
      } else {
        out.otherSchemaVersion += 1;
      }
    }

    const err = validateOfferingConfig(cfg);
    if (err) {
      out.invalid += 1;
      if (out.samples.length < INVENTORY_SAMPLE_CAP) {
        out.samples.push({ id: row.id, shopId: row.shopId, error: err });
      }
    } else {
      out.valid += 1;
    }
  }

  return out;
}

import { Prisma } from '@prisma/client';

/**
 * Shared money helpers for Prisma `Decimal(19,4)` commercial amounts.
 * Convert at calculation / JSON boundaries; prefer `toPrismaDecimal` on writes.
 * API wire: fixed-scale decimal **strings** via `serializeMoney` (see GO_SPOTS_MONEY_WIRE.md).
 */

/** Values Prisma may return or accept for Decimal money columns. */
export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

/** Canonical JSON money wire (4 fractional digits). */
export type MoneyWire = string;

function isPrismaDecimal(value: unknown): value is Prisma.Decimal {
  return Prisma.Decimal.isDecimal(value);
}

/**
 * Decimal | number | string | null/undefined → finite number.
 * Uses `.toNumber()` for Prisma.Decimal. Nullish → 0.
 */
export function toMoneyNumber(value: MoneyInput): number {
  if (value == null) return 0;
  if (isPrismaDecimal(value)) {
    const n = value.toNumber();
    if (!Number.isFinite(n)) {
      throw new TypeError('toMoneyNumber: non-finite Decimal');
    }
    return n;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('toMoneyNumber: non-finite number');
    }
    return value;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`toMoneyNumber: invalid money string: ${value}`);
  }
  return n;
}

/** Build a Prisma.Decimal for money column writes (nullish → 0). */
export function toPrismaDecimal(value: MoneyInput): Prisma.Decimal {
  if (isPrismaDecimal(value)) return value;
  if (value == null) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

/**
 * Canonical API money wire: fixed-scale decimal string (default 4 dp).
 * Prefer Prisma.Decimal / string paths; avoids IEEE float on the JSON boundary.
 */
export function serializeMoneyString(
  value: MoneyInput,
  decimals = 4,
): MoneyWire {
  if (value == null) return (0).toFixed(decimals);
  if (isPrismaDecimal(value)) {
    if (!value.isFinite()) {
      throw new TypeError('serializeMoneyString: non-finite Decimal');
    }
    return value.toFixed(decimals);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('serializeMoneyString: non-finite number');
  }
  const d = toPrismaDecimal(value);
  if (!d.isFinite()) {
    throw new TypeError('serializeMoneyString: non-finite Decimal');
  }
  return d.toFixed(decimals);
}

/** @see serializeMoneyString — primary response serializer for commercial amounts. */
export function serializeMoney(value: MoneyInput): MoneyWire {
  return serializeMoneyString(value);
}

/** Like serializeMoney, but preserves null. */
export function serializeMoneyOrNull(value: MoneyInput): MoneyWire | null {
  if (value == null) return null;
  return serializeMoney(value);
}

/** Round half-away-from-zero to `decimals` places (default 2 for currency display). */
export function roundMoney(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    throw new TypeError('roundMoney expects a finite number');
  }
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

/** Add amounts with fixed-scale rounding (mitigates 0.1 + 0.2 style drift for display/sum). */
export function addMoney(...parts: MoneyInput[]): number {
  return roundMoney(parts.reduce<number>((s, n) => s + toMoneyNumber(n), 0));
}

/** Multiply quantity × unit price with money rounding. */
export function lineTotal(quantity: number, unitPrice: MoneyInput): number {
  return roundMoney(quantity * toMoneyNumber(unitPrice));
}

/** Apply a discount percent (0–100) to a base amount. */
export function applyDiscountPercent(
  baseAmount: MoneyInput,
  discountPercent: number,
): number {
  const pct = Math.min(100, Math.max(0, discountPercent));
  return roundMoney(toMoneyNumber(baseAmount) * (1 - pct / 100));
}

/**
 * Convert using FX rate, then round to money scale.
 * Rate must be finite and > 0 (guards missing / divide-by-zero leftovers).
 */
export function convertMoney(
  amount: MoneyInput,
  rate: number,
  decimals = 2,
): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new TypeError('convertMoney: rate must be a finite number > 0');
  }
  const product = toPrismaDecimal(amount).mul(new Prisma.Decimal(rate));
  return roundMoney(product.toNumber(), decimals);
}

/**
 * Cross rate via Decimal division: 1 unit of `from` = result units of `to`,
 * given pivot table values (1 pivot = fromPivot of from, 1 pivot = toPivot of to).
 */
export function fxCrossRate(toPivot: number, fromPivot: number): number {
  if (!Number.isFinite(fromPivot) || fromPivot <= 0) {
    throw new TypeError('fxCrossRate: fromPivot must be a finite number > 0');
  }
  if (!Number.isFinite(toPivot) || toPivot <= 0) {
    throw new TypeError('fxCrossRate: toPivot must be a finite number > 0');
  }
  return new Prisma.Decimal(toPivot).div(fromPivot).toNumber();
}

/**
 * Parse a decimal string safely for display / dual-read.
 * Rejects empty, non-finite, locale commas, and oversized mantissas (>19 digits).
 */
export function parseMoneyString(raw: string): number {
  const s = raw.trim();
  if (!s || /[,\s]/.test(s)) {
    throw new TypeError(`Invalid money string: ${raw}`);
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new TypeError(`Invalid money string: ${raw}`);
  }
  const digits = s.replace(/^-/, '').replace('.', '');
  if (digits.length > 19) {
    throw new TypeError(`Invalid money string: ${raw}`);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new TypeError(`Invalid money string: ${raw}`);
  }
  return roundMoney(n);
}

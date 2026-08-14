import { Prisma } from '@prisma/client';

/**
 * Shared money helpers for Prisma `Decimal(19,4)` commercial amounts.
 *
 * Canonical venue-money representation is Prisma Decimal + explicit ISO currency.
 * Authoritative calculations should use the exact Decimal helpers below. The
 * number-returning helpers are retained for legacy/display compatibility only.
 */

/** Values Prisma may return or accept for Decimal money columns. */
export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

/** Canonical JSON money wire (4 fractional digits). */
export type MoneyWire = string;

export type Money = Readonly<{
  amount: Prisma.Decimal;
  currency: string;
}>;

function isPrismaDecimal(value: unknown): value is Prisma.Decimal {
  return Prisma.Decimal.isDecimal(value);
}

export function normalizeMoneyCurrency(currency: string): string {
  const normalized = String(currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new TypeError(`Invalid ISO 4217 currency: ${currency}`);
  }
  return normalized;
}

export function makeMoney(amount: MoneyInput, currency: string): Money {
  return {
    amount: toPrismaDecimal(amount),
    currency: normalizeMoneyCurrency(currency),
  };
}

/** Exact Decimal addition; never converts through IEEE-754 number arithmetic. */
export function sumMoneyDecimal(...parts: MoneyInput[]): Prisma.Decimal {
  return parts.reduce<Prisma.Decimal>(
    (sum, part) => sum.add(toPrismaDecimal(part)),
    new Prisma.Decimal(0),
  );
}

/** Exact Decimal multiplication for quantity × unit price. */
export function lineTotalDecimal(
  quantity: number,
  unitPrice: MoneyInput,
): Prisma.Decimal {
  if (!Number.isInteger(quantity)) {
    throw new TypeError('lineTotalDecimal quantity must be an integer');
  }
  return toPrismaDecimal(unitPrice).mul(quantity);
}

/** Explicit HALF_UP rounding for currency/tax boundaries. */
export function roundMoneyDecimal(
  value: MoneyInput,
  decimals = 2,
): Prisma.Decimal {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) {
    throw new TypeError('roundMoneyDecimal decimals must be an integer from 0 to 4');
  }
  return toPrismaDecimal(value).toDecimalPlaces(
    decimals,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

export function isMoneyZero(value: MoneyInput): boolean {
  return toPrismaDecimal(value).isZero();
}

export function addCanonicalMoney(...values: Money[]): Money {
  if (values.length === 0) {
    throw new TypeError('addCanonicalMoney requires at least one Money value');
  }
  const currency = normalizeMoneyCurrency(values[0].currency);
  for (const value of values) {
    if (normalizeMoneyCurrency(value.currency) !== currency) {
      throw new TypeError('Cannot add money values with different currencies');
    }
  }
  return {
    currency,
    amount: sumMoneyDecimal(...values.map((value) => value.amount)),
  };
}

export function assertSameMoneyCurrency(...values: Money[]): string {
  if (!values.length) throw new TypeError('At least one money value is required');
  const currency = normalizeMoneyCurrency(values[0].currency);
  if (values.some((value) => normalizeMoneyCurrency(value.currency) !== currency)) {
    throw new TypeError('Money currency mismatch');
  }
  return currency;
}

export function subtractCanonicalMoney(minuend: Money, subtrahend: Money): Money {
  return {
    currency: assertSameMoneyCurrency(minuend, subtrahend),
    amount: minuend.amount.sub(subtrahend.amount),
  };
}

export function percentageMoneyDecimal(
  base: MoneyInput,
  percentage: MoneyInput,
  decimals = 2,
): Prisma.Decimal {
  const pct = toPrismaDecimal(percentage);
  if (pct.isNegative()) throw new RangeError('Percentage cannot be negative');
  return roundMoneyDecimal(toPrismaDecimal(base).mul(pct).div(100), decimals);
}

export function discountMoneyDecimal(
  base: MoneyInput,
  percentage: MoneyInput,
  decimals = 2,
): Prisma.Decimal {
  const pct = toPrismaDecimal(percentage);
  if (pct.isNegative() || pct.greaterThan(100)) {
    throw new RangeError('Discount percentage must be between 0 and 100');
  }
  return roundMoneyDecimal(
    toPrismaDecimal(base).sub(toPrismaDecimal(base).mul(pct).div(100)),
    decimals,
  );
}

/** Tax portion contained in a tax-inclusive gross amount. */
export function taxFromGrossDecimal(
  gross: MoneyInput,
  taxPercentage: MoneyInput,
  decimals = 2,
): Prisma.Decimal {
  const rate = toPrismaDecimal(taxPercentage);
  if (rate.isNegative()) throw new RangeError('Tax percentage cannot be negative');
  const grossDecimal = toPrismaDecimal(gross);
  return roundMoneyDecimal(
    grossDecimal.sub(grossDecimal.div(new Prisma.Decimal(1).add(rate.div(100)))),
    decimals,
  );
}

function moneyMinorUnits(value: MoneyInput, decimals: number): bigint {
  const rounded = roundMoneyDecimal(value, decimals);
  return BigInt(rounded.mul(new Prisma.Decimal(10).pow(decimals)).toFixed(0));
}

function minorUnitsToMoney(value: bigint, decimals: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toString()).div(new Prisma.Decimal(10).pow(decimals));
}

/** Equal deterministic allocation with residual minor units assigned by index. */
export function allocateMoneyDecimal(
  total: MoneyInput,
  count: number,
  decimals = 2,
): Prisma.Decimal[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError('Allocation count must be a positive integer');
  }
  const totalMinor = moneyMinorUnits(total, decimals);
  const divisor = BigInt(count);
  const base = totalMinor / divisor;
  let residual = totalMinor - base * divisor;
  return Array.from({ length: count }, () => {
    const step = residual > 0n ? 1n : residual < 0n ? -1n : 0n;
    residual -= step;
    return minorUnitsToMoney(base + step, decimals);
  });
}

/** Weighted split with largest-remainder residual allocation and stable index tie-breaks. */
export function splitMoneyByWeightsDecimal(
  total: MoneyInput,
  weights: MoneyInput[],
  decimals = 2,
): Prisma.Decimal[] {
  if (!weights.length) throw new RangeError('At least one split weight is required');
  const normalized = weights.map((weight) => toPrismaDecimal(weight));
  if (normalized.some((weight) => weight.isNegative())) {
    throw new RangeError('Split weights cannot be negative');
  }
  const weightTotal = sumMoneyDecimal(...normalized);
  if (weightTotal.isZero()) throw new RangeError('Split weights must include a positive value');

  const signedMinor = moneyMinorUnits(total, decimals);
  const negative = signedMinor < 0n;
  const absoluteMinor = negative ? -signedMinor : signedMinor;
  const provisional = normalized.map((weight, index) => {
    const raw = new Prisma.Decimal(absoluteMinor.toString()).mul(weight).div(weightTotal);
    const units = BigInt(raw.floor().toFixed(0));
    return { index, units, fraction: raw.sub(units.toString()) };
  });
  let residual = absoluteMinor - provisional.reduce((sum, item) => sum + item.units, 0n);
  const residualOrder = [...provisional].sort(
    (a, b) => b.fraction.comparedTo(a.fraction) || a.index - b.index,
  );
  for (const item of residualOrder) {
    if (residual === 0n) break;
    provisional[item.index].units += 1n;
    residual -= 1n;
  }
  return provisional.map((item) =>
    minorUnitsToMoney(negative ? -item.units : item.units, decimals),
  );
}

export function formatCanonicalMoney(
  money: Money,
  locale = 'en',
  decimals = 2,
): string {
  const currency = normalizeMoneyCurrency(money.currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(roundMoneyDecimal(money.amount, decimals).toFixed(decimals)));
}

/**
 * Decimal | number | string | null/undefined → finite number.
 * Legacy/display boundary helper. Do not use for authoritative calculations.
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
  const decimal = new Prisma.Decimal(value);
  if (!decimal.isFinite()) {
    throw new TypeError('toPrismaDecimal: non-finite money value');
  }
  return decimal;
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

/** Legacy/display-only number rounding. */
export function roundMoney(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    throw new TypeError('roundMoney expects a finite number');
  }
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

/** Legacy/display-only number sum. Prefer sumMoneyDecimal for authoritative money. */
export function addMoney(...parts: MoneyInput[]): number {
  return roundMoney(parts.reduce<number>((s, n) => s + toMoneyNumber(n), 0));
}

/** Legacy/display-only number line total. Prefer lineTotalDecimal. */
export function lineTotal(quantity: number, unitPrice: MoneyInput): number {
  return roundMoney(quantity * toMoneyNumber(unitPrice));
}

/** Apply a discount percent (0–100) to a base amount. Legacy number API. */
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

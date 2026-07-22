/**
 * Dual-read money helpers for API decimal-string wire.
 * Prefer coerceMoney at client boundaries; formatMoney accepts string | number.
 */

/** Canonical API money field (4dp decimal string). Legacy number still accepted. */
export type MoneyWire = string | number;

export function parseMoneyString(raw: string): number {
  const s = raw.trim();
  if (!s || /[,\s]/.test(s)) {
    throw new TypeError(`Invalid money string: ${raw}`);
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new TypeError(`Invalid money string: ${raw}`);
  }
  const digits = s.replace(/^-/, "").replace(".", "");
  if (digits.length > 19) {
    throw new TypeError(`Invalid money string: ${raw}`);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new TypeError(`Invalid money string: ${raw}`);
  }
  return n;
}

/** Accept legacy JSON number or canonical decimal string → finite number. */
export function coerceMoney(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("coerceMoney: non-finite number");
    }
    return value;
  }
  if (typeof value === "string") {
    return parseMoneyString(value);
  }
  if (value == null) return 0;
  throw new TypeError(`coerceMoney: unexpected type ${typeof value}`);
}

/** Like coerceMoney but preserves null. */
export function coerceMoneyOrNull(value: unknown): number | null {
  if (value == null) return null;
  return coerceMoney(value);
}

export function roundMoney(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    throw new TypeError("roundMoney expects a finite number");
  }
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

export function addMoney(...parts: MoneyWire[]): number {
  return roundMoney(parts.reduce<number>((s, n) => s + coerceMoney(n), 0));
}

export function lineTotal(quantity: number, unitPrice: MoneyWire): number {
  return roundMoney(quantity * coerceMoney(unitPrice));
}

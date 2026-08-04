import { applyDiscountPercent, roundMoney } from './money.util';

export type PlayBillingRate = {
  label: string;
  durationMinutes: number | null;
  price: number;
};

export type PlayBillingComputeInput = {
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  hourlyRate: number;
  slotMinutes: number;
  categoryRates: PlayBillingRate[];
  /** Bill elapsed time up to now (in-progress). */
  useElapsed?: boolean;
  now?: Date;
};

export type PlayBillingComputeResult = {
  amount: number;
  durationMinutes: number;
  rateLabel: string;
  breakdown: string;
};

/** Apply discount % to the base charge (not a flat override). */
export function applyBillingDiscount(
  baseAmount: number,
  discountPercent: number,
): number {
  return applyDiscountPercent(baseAmount, discountPercent);
}

/**
 * Price from Gaming setup: category rates pro-rated by actual duration
 * (e.g. 60 min @ $30 → 30 min = $15), picking the cheapest applicable rate.
 * Falls back to unit hourlyRate × hours when no block rates exist.
 */
export function computePlayBillingAmount(
  input: PlayBillingComputeInput,
): PlayBillingComputeResult {
  const now = input.now ?? new Date();
  const effectiveEnd = input.useElapsed
    ? new Date(Math.min(now.getTime(), input.endsAt.getTime()))
    : input.endsAt;
  const ms = effectiveEnd.getTime() - input.startsAt.getTime();
  const durationMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const party = Math.max(1, input.partySize);

  const blockRates = input.categoryRates.filter(
    (r) => r.durationMinutes != null && r.durationMinutes > 0,
  );

  if (blockRates.length > 0) {
    let best: { amount: number; label: string; breakdown: string } | null =
      null;
    for (const rate of blockRates) {
      const blockMin = rate.durationMinutes!;
      // Pro-rate: half of a 60-min@$30 block → $15 (not a full ceil block).
      const amount = roundMoney(
        rate.price * (durationMinutes / blockMin) * party,
      );
      const breakdown = `${durationMinutes} min · ${rate.label} (${blockMin} min @ ${rate.price}) · ${party} guest${party > 1 ? 's' : ''}`;
      if (!best || amount < best.amount) {
        best = { amount, label: rate.label, breakdown };
      }
    }
    if (best) {
      return {
        amount: best.amount,
        durationMinutes,
        rateLabel: best.label,
        breakdown: best.breakdown,
      };
    }
  }

  if (input.hourlyRate > 0) {
    const hours = durationMinutes / 60;
    const amount = roundMoney(input.hourlyRate * hours * party);
    return {
      amount,
      durationMinutes,
      rateLabel: `${input.hourlyRate}/hr`,
      breakdown: `${durationMinutes} min @ ${input.hourlyRate}/hr · ${party} guest${party > 1 ? 's' : ''}`,
    };
  }

  return {
    amount: 0,
    durationMinutes,
    rateLabel: 'No rate configured',
    breakdown: 'Add rates under Gaming setup',
  };
}

export type PlayBillingBucket = 'in_progress' | 'awaiting_payment' | 'paid';

export function classifyPlayBillingRow(
  status: string,
  billedAt: Date | null,
  startsAt: Date,
  endsAt: Date,
  now: Date,
): PlayBillingBucket | null {
  if (status === 'CANCELED' || status === 'NO_SHOW') return null;
  if (startsAt > now) return null;

  const active = startsAt <= now && endsAt > now;
  if (active) return 'in_progress';

  if (billedAt) return 'paid';
  if (status === 'COMPLETED' || endsAt <= now) return 'awaiting_payment';
  return null;
}

export function classifyWalkInBillingRow(
  status: string,
  completedAt: Date | null,
  startedAt: Date,
  endedAt: Date | null,
  durationMinutes: number | null,
  now: Date,
): PlayBillingBucket | null {
  if (status === 'CANCELED') return null;

  const effectiveEnd =
    endedAt ??
    (durationMinutes != null && durationMinutes > 0
      ? new Date(startedAt.getTime() + durationMinutes * 60_000)
      : null);

  const paid = status === 'COMPLETED' || completedAt != null;

  if (status === 'ACTIVE') {
    if (!effectiveEnd || effectiveEnd > now) return 'in_progress';
    return paid ? 'paid' : 'awaiting_payment';
  }

  if (paid) return 'paid';
  return 'awaiting_payment';
}

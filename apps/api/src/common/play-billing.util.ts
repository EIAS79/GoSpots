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

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/** Apply discount % to the base charge (not a flat override). */
export function applyBillingDiscount(
  baseAmount: number,
  discountPercent: number,
): number {
  const pct = Math.min(100, Math.max(0, discountPercent));
  return roundMoney(baseAmount * (1 - pct / 100));
}

/**
 * Price from Gaming setup: category rate blocks (e.g. 60 min @ $40) or unit hourlyRate.
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
      const blocks = Math.ceil(durationMinutes / blockMin);
      const amount = roundMoney(blocks * rate.price * party);
      const breakdown = `${durationMinutes} min · ${blocks}× ${rate.label} · ${party} guest${party > 1 ? 's' : ''}`;
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

  const slot = Math.max(15, input.slotMinutes || 60);
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

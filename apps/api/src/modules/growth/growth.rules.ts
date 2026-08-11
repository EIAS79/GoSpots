import { BadRequestException } from '@nestjs/common';

export type PromotionForQuote = {
  id: string;
  name: string;
  kind: string;
  valueBps: number | null;
  amountMinor: number | null;
  priority: number;
  stackable: boolean;
  exclusiveGroup: string | null;
  minSubtotalMinor: number;
};

export type AppliedPromotion = {
  id: string;
  name: string;
  discountMinor: number;
};

export type PricingQuote = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  tipMinor: number;
  totalMinor: number;
  appliedPromotions: AppliedPromotion[];
};

export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export function computePricingQuote(input: {
  subtotalMinor: number;
  taxMinor?: number;
  tipMinor?: number;
  tipBps?: number;
  promotions: PromotionForQuote[];
}): PricingQuote {
  if (!Number.isInteger(input.subtotalMinor) || input.subtotalMinor < 0) {
    throw new BadRequestException('subtotalMinor must be a non-negative integer.');
  }
  const taxMinor = Math.max(0, Math.trunc(input.taxMinor ?? 0));
  const sorted = [...input.promotions].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const usedGroups = new Set<string>();
  const appliedPromotions: AppliedPromotion[] = [];
  let discountMinor = 0;
  let exclusiveApplied = false;

  for (const rule of sorted) {
    if (exclusiveApplied || input.subtotalMinor < rule.minSubtotalMinor) continue;
    if (rule.exclusiveGroup && usedGroups.has(rule.exclusiveGroup)) continue;
    const remaining = Math.max(0, input.subtotalMinor - discountMinor);
    if (remaining === 0) break;
    let discount = 0;
    if (rule.kind === 'PERCENT') {
      const bps = Math.max(0, Math.min(10_000, rule.valueBps ?? 0));
      discount = Math.round((remaining * bps) / 10_000);
    } else if (rule.kind === 'FIXED') {
      discount = Math.max(0, rule.amountMinor ?? 0);
    } else {
      continue;
    }
    discount = Math.min(remaining, discount);
    if (discount === 0) continue;
    appliedPromotions.push({ id: rule.id, name: rule.name, discountMinor: discount });
    discountMinor += discount;
    if (rule.exclusiveGroup) usedGroups.add(rule.exclusiveGroup);
    if (!rule.stackable) exclusiveApplied = true;
  }

  const netBeforeTax = Math.max(0, input.subtotalMinor - discountMinor);
  const explicitTip = input.tipMinor == null ? null : Math.max(0, Math.trunc(input.tipMinor));
  const tipBps = Math.max(0, Math.min(10_000, Math.trunc(input.tipBps ?? 0)));
  const tipMinor = explicitTip ?? Math.round((netBeforeTax * tipBps) / 10_000);
  return {
    subtotalMinor: input.subtotalMinor,
    discountMinor,
    taxMinor,
    tipMinor,
    totalMinor: netBeforeTax + taxMinor + tipMinor,
    appliedPromotions,
  };
}

export function signedLedgerAmount(type: string, amount: number, negativeTypes: string[]) {
  if (!Number.isInteger(amount) || amount === 0) throw new BadRequestException('Ledger amount must be a non-zero integer.');
  if (type === 'REVERSAL' || type === 'ADJUST') return amount;
  return negativeTypes.includes(type) ? -Math.abs(amount) : Math.abs(amount);
}

export function projectSignedBalance(rows: { amountMinor: number }[]) {
  return rows.reduce((sum, row) => sum + row.amountMinor, 0);
}

export function projectPointsBalance(rows: { points: number }[]) {
  return rows.reduce((sum, row) => sum + row.points, 0);
}

export function clipSeconds(start: Date, end: Date, from: Date, to: Date) {
  const clippedStart = Math.max(start.getTime(), from.getTime());
  const clippedEnd = Math.min(end.getTime(), to.getTime());
  return Math.max(0, Math.floor((clippedEnd - clippedStart) / 1000));
}

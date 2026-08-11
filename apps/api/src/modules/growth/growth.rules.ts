import { BadRequestException } from '@nestjs/common';

export type RuleConditionInput = {
  kind: string;
  operator?: string;
  value: unknown;
};

export type RuleBenefitInput = {
  kind: string;
  value: unknown;
};

export type PricingContext = {
  at?: Date;
  resourceId?: string;
  resourceCategoryId?: string;
  itemIds?: string[];
  itemCategoryIds?: string[];
  customerId?: string;
  isMember?: boolean;
  sessionMinutes?: number;
  partySize?: number;
  bookingChannel?: string;
  promotionCodes?: string[];
};

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
  code?: string | null;
  conditions?: RuleConditionInput[];
  benefits?: RuleBenefitInput[];
};

export type AppliedPromotion = {
  id: string;
  name: string;
  discountMinor: number;
  benefitKind: string;
  explanation: string;
  conditionSnapshot: RuleConditionInput[];
  benefitSnapshot: RuleBenefitInput;
};

export type PricingQuote = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  tipMinor: number;
  totalMinor: number;
  appliedPromotions: AppliedPromotion[];
};

export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
) {
  return aStart < bEnd && bStart < aEnd;
}

export function conditionMatches(
  condition: RuleConditionInput,
  context: PricingContext,
  subtotalMinor: number,
): boolean {
  const operator = condition.operator ?? 'EQ';
  const actual = conditionActual(condition.kind, context, subtotalMinor);
  const expected = condition.value;

  if (condition.kind === 'TIME_WINDOW') {
    if (!context.at || !isRecord(expected)) return false;
    const minute = context.at.getHours() * 60 + context.at.getMinutes();
    const from = clockMinute(expected.from);
    const to = clockMinute(expected.to);
    if (from == null || to == null) return false;
    return from <= to ? minute >= from && minute < to : minute >= from || minute < to;
  }

  if (condition.kind === 'DAY_OF_WEEK') {
    if (!context.at) return false;
    const day = context.at.getDay();
    return compareValue(day, expected, operator);
  }

  if (Array.isArray(actual) && operator === 'IN') {
    const expectedValues = toArray(expected);
    return actual.some((value) => expectedValues.some((candidate) => same(value, candidate)));
  }
  return compareValue(actual, expected, operator);
}

export function promotionMatches(
  promotion: PromotionForQuote,
  context: PricingContext,
  subtotalMinor: number,
) {
  if (subtotalMinor < promotion.minSubtotalMinor) return false;
  return (promotion.conditions ?? []).every((condition) =>
    conditionMatches(condition, context, subtotalMinor),
  );
}

export function computePricingQuote(input: {
  subtotalMinor: number;
  taxMinor?: number;
  tipMinor?: number;
  tipBps?: number;
  promotions: PromotionForQuote[];
  context?: PricingContext;
}): PricingQuote {
  if (!Number.isInteger(input.subtotalMinor) || input.subtotalMinor < 0) {
    throw new BadRequestException('subtotalMinor must be a non-negative integer.');
  }
  const taxMinor = Math.max(0, Math.trunc(input.taxMinor ?? 0));
  const context = input.context ?? {};
  const sorted = [...input.promotions].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  );
  const usedGroups = new Set<string>();
  const appliedPromotions: AppliedPromotion[] = [];
  let discountMinor = 0;
  let exclusiveApplied = false;

  for (const rule of sorted) {
    if (exclusiveApplied || !promotionMatches(rule, context, input.subtotalMinor)) {
      continue;
    }
    if (rule.exclusiveGroup && usedGroups.has(rule.exclusiveGroup)) continue;
    const remaining = Math.max(0, input.subtotalMinor - discountMinor);
    if (remaining === 0) break;

    const benefits =
      rule.benefits?.length
        ? rule.benefits
        : [legacyBenefit(rule)];
    let ruleDiscount = 0;
    let winningBenefit = benefits[0]!;
    for (const benefit of benefits) {
      const discount = computeBenefitDiscount(
        benefit,
        rule,
        remaining,
        input.subtotalMinor,
        context,
      );
      if (discount > ruleDiscount) {
        ruleDiscount = discount;
        winningBenefit = benefit;
      }
    }
    const discount = Math.min(remaining, Math.max(0, ruleDiscount));
    if (discount === 0) continue;

    appliedPromotions.push({
      id: rule.id,
      name: rule.name,
      discountMinor: discount,
      benefitKind: winningBenefit.kind,
      explanation: explainBenefit(rule.name, winningBenefit, discount),
      conditionSnapshot: [...(rule.conditions ?? [])],
      benefitSnapshot: winningBenefit,
    });
    discountMinor += discount;
    if (rule.exclusiveGroup) usedGroups.add(rule.exclusiveGroup);
    if (!rule.stackable) exclusiveApplied = true;
  }

  const netBeforeTax = Math.max(0, input.subtotalMinor - discountMinor);
  const explicitTip =
    input.tipMinor == null ? null : Math.max(0, Math.trunc(input.tipMinor));
  const tipBps = Math.max(
    0,
    Math.min(10_000, Math.trunc(input.tipBps ?? 0)),
  );
  const tipMinor =
    explicitTip ?? Math.round((netBeforeTax * tipBps) / 10_000);
  return {
    subtotalMinor: input.subtotalMinor,
    discountMinor,
    taxMinor,
    tipMinor,
    totalMinor: netBeforeTax + taxMinor + tipMinor,
    appliedPromotions,
  };
}

function legacyBenefit(rule: PromotionForQuote): RuleBenefitInput {
  if (rule.kind === 'PERCENT') {
    return { kind: 'PERCENT', value: { valueBps: rule.valueBps ?? 0 } };
  }
  if (rule.kind === 'FIXED_PRICE') {
    return { kind: 'FIXED_PRICE', value: { priceMinor: rule.amountMinor ?? 0 } };
  }
  return { kind: rule.kind, value: { amountMinor: rule.amountMinor ?? 0 } };
}

function computeBenefitDiscount(
  benefit: RuleBenefitInput,
  rule: PromotionForQuote,
  remaining: number,
  subtotalMinor: number,
  context: PricingContext,
) {
  const value = isRecord(benefit.value) ? benefit.value : { amountMinor: benefit.value };
  switch (benefit.kind) {
    case 'PERCENT': {
      const bps = numeric(value.valueBps ?? rule.valueBps ?? 0);
      return Math.round((remaining * Math.max(0, Math.min(10_000, bps))) / 10_000);
    }
    case 'FIXED':
      return Math.max(0, numeric(value.amountMinor ?? rule.amountMinor ?? 0));
    case 'FIXED_PRICE': {
      const target = Math.max(0, numeric(value.priceMinor ?? rule.amountMinor ?? subtotalMinor));
      return Math.max(0, remaining - target);
    }
    case 'FREE_MINUTES': {
      const freeMinutes = Math.max(0, numeric(value.minutes ?? 0));
      const sessionMinutes = Math.max(0, context.sessionMinutes ?? 0);
      const minuteValueMinor = Math.max(0, numeric(value.minuteValueMinor ?? 0));
      return Math.min(freeMinutes, sessionMinutes) * minuteValueMinor;
    }
    case 'BUNDLE':
      return Math.max(0, numeric(value.discountMinor ?? value.amountMinor ?? 0));
    case 'BOGO':
      return Math.max(0, numeric(value.freeItemValueMinor ?? value.discountMinor ?? 0));
    default:
      return 0;
  }
}

function explainBenefit(name: string, benefit: RuleBenefitInput, discountMinor: number) {
  switch (benefit.kind) {
    case 'PERCENT':
      return `${name}: percentage discount applied (${discountMinor} minor units).`;
    case 'FIXED':
      return `${name}: fixed discount applied (${discountMinor} minor units).`;
    case 'FIXED_PRICE':
      return `${name}: fixed-price benefit reduced the price by ${discountMinor} minor units.`;
    case 'FREE_MINUTES':
      return `${name}: free activity minutes reduced the price by ${discountMinor} minor units.`;
    case 'BUNDLE':
      return `${name}: bundle benefit reduced the price by ${discountMinor} minor units.`;
    case 'BOGO':
      return `${name}: buy-one-get-one benefit reduced the price by ${discountMinor} minor units.`;
    default:
      return `${name}: promotion reduced the price by ${discountMinor} minor units.`;
  }
}

function conditionActual(
  kind: string,
  context: PricingContext,
  subtotalMinor: number,
): unknown {
  switch (kind) {
    case 'RESOURCE':
      return context.resourceId;
    case 'RESOURCE_CATEGORY':
      return context.resourceCategoryId;
    case 'ITEM':
      return context.itemIds ?? [];
    case 'ITEM_CATEGORY':
      return context.itemCategoryIds ?? [];
    case 'MEMBER':
      return context.isMember ?? false;
    case 'CUSTOMER':
      return context.customerId;
    case 'SESSION_LENGTH':
      return context.sessionMinutes ?? 0;
    case 'PARTY_SIZE':
      return context.partySize ?? 0;
    case 'SPEND':
      return subtotalMinor;
    case 'CODE':
      return context.promotionCodes ?? [];
    case 'BOOKING_CHANNEL':
      return context.bookingChannel;
    default:
      return undefined;
  }
}

function compareValue(actual: unknown, expected: unknown, operator: string) {
  switch (operator) {
    case 'IN':
      return toArray(expected).some((candidate) => same(actual, candidate));
    case 'GTE':
      return numeric(actual) >= numeric(expected);
    case 'LTE':
      return numeric(actual) <= numeric(expected);
    case 'BETWEEN': {
      const [min, max] = toArray(expected);
      return min != null && max != null && numeric(actual) >= numeric(min) && numeric(actual) <= numeric(max);
    }
    case 'EQ':
    default:
      return same(actual, expected);
  }
}

function same(a: unknown, b: unknown) {
  return String(a ?? '').toUpperCase() === String(b ?? '').toUpperCase();
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function numeric(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clockMinute(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function signedLedgerAmount(
  type: string,
  amount: number,
  negativeTypes: string[],
) {
  if (!Number.isInteger(amount) || amount === 0) {
    throw new BadRequestException('Ledger amount must be a non-zero integer.');
  }
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

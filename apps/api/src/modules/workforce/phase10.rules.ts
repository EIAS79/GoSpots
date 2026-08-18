export const PHASE10_ACTION_KINDS = [
  'SALE',
  'LARGE_DISCOUNT',
  'REFUND',
  'VOID_AFTER_SEND',
  'INVENTORY_CORRECTION',
  'INVENTORY_WRITE_OFF',
  'CASH_PAYOUT',
  'CASH_VARIANCE',
  'COMP',
  'MANUAL_TIME_EDIT',
  'PRICE_OVERRIDE',
  'CANCELLATION_FEE_WAIVER',
  'MANAGER_OVERRIDE',
] as const;

export type Phase10ActionKind = (typeof PHASE10_ACTION_KINDS)[number];

const ACTION_SET = new Set<string>(PHASE10_ACTION_KINDS);

export const HIGH_RISK_ACTION_KINDS = new Set<Phase10ActionKind>([
  'LARGE_DISCOUNT',
  'REFUND',
  'VOID_AFTER_SEND',
  'INVENTORY_CORRECTION',
  'INVENTORY_WRITE_OFF',
  'CASH_PAYOUT',
  'CASH_VARIANCE',
  'COMP',
  'MANUAL_TIME_EDIT',
  'PRICE_OVERRIDE',
  'CANCELLATION_FEE_WAIVER',
  'MANAGER_OVERRIDE',
]);

export function assertPhase10ActionKind(value: string): Phase10ActionKind {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!ACTION_SET.has(normalized)) {
    throw new Error(`Unsupported staff action kind: ${value}`);
  }
  return normalized as Phase10ActionKind;
}

export function assertOperatorPinFormat(pin: string): string {
  const normalized = String(pin ?? '').trim();
  if (!/^\d{4,8}$/.test(normalized)) {
    throw new Error('Operator PIN must contain 4 to 8 digits.');
  }
  return normalized;
}

export type AccountableActionClassification = {
  actionKind: Phase10ActionKind;
  amountMinor?: number;
  sourceType: string;
} | null;

type BodyLike = Record<string, unknown> | null | undefined;

function numeric(body: BodyLike, keys: string[]): number | undefined {
  if (!body) return undefined;
  for (const key of keys) {
    const raw = body[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return Math.max(0, Math.trunc(Math.abs(raw)));
    }
    if (typeof raw === 'string' && raw.trim() !== '') {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.max(0, Math.trunc(Math.abs(n)));
    }
  }
  return undefined;
}

function text(body: BodyLike, keys: string[]): string {
  if (!body) return '';
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string') return value.trim().toUpperCase();
  }
  return '';
}

function truthy(body: BodyLike, keys: string[]): boolean {
  if (!body) return false;
  return keys.some((key) => {
    const value = body[key];
    return value === true || value === 'true' || value === 1 || value === '1';
  });
}

function matches(path: string, pattern: RegExp): boolean {
  return pattern.test(path);
}

/**
 * Route/body classifier used by the global accountability interceptor.
 * It deliberately recognizes canonical successful mutation routes instead of
 * broadly classifying every POST under a domain. This avoids recording previews,
 * drafts or setup operations as employee financial actions.
 */
export function classifyAccountableAction(
  method: string,
  url: string,
  body?: BodyLike,
): AccountableActionClassification {
  const verb = String(method ?? '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(verb)) return null;
  const path = String(url ?? '').toLowerCase().split('?')[0];
  const amountMinor = numeric(body, [
    'amountMinor',
    'refundAmountMinor',
    'discountAmountMinor',
    'varianceMinor',
    'totalMinor',
  ]);

  if (
    verb === 'POST' &&
    path.includes('/workforce/adjustments/') &&
    path.endsWith('/decision') &&
    body?.approve === true
  ) {
    return { actionKind: 'MANUAL_TIME_EDIT', sourceType: 'time-adjustment' };
  }

  if (path.includes('refund')) {
    return { actionKind: 'REFUND', amountMinor, sourceType: 'refund' };
  }

  // These restaurant cancellation routes can cancel active production work.
  // When an owner enables VOID_AFTER_SEND, the boundary is intentionally
  // conservative rather than allowing a sent ticket to bypass approval.
  if (
    (verb === 'DELETE' && matches(path, /\/ordering\/orders\/[^/]+$/)) ||
    (verb === 'POST' &&
      matches(path, /\/ordering\/orders\/[^/]+\/lines\/[^/]+\/cancel$/))
  ) {
    return { actionKind: 'VOID_AFTER_SEND', amountMinor, sourceType: 'order' };
  }
  if (path.includes('void') && (path.includes('order') || path.includes('kitchen'))) {
    return { actionKind: 'VOID_AFTER_SEND', amountMinor, sourceType: 'order' };
  }

  if (path.includes('/inventory-v2/')) {
    if (
      verb === 'POST' &&
      (matches(path, /\/inventory-v2\/waste(?:-with-approval)?$/) ||
        path.includes('/write-off'))
    ) {
      return {
        actionKind: 'INVENTORY_WRITE_OFF',
        amountMinor,
        sourceType: 'inventory',
      };
    }
    if (
      (verb === 'POST' && matches(path, /\/inventory-v2\/stocktakes$/)) ||
      path.endsWith('/approve') ||
      path.endsWith('/complete-with-approval') ||
      path.endsWith('/reverse') ||
      path.includes('/correction')
    ) {
      return {
        actionKind: 'INVENTORY_CORRECTION',
        amountMinor,
        sourceType: 'inventory',
      };
    }
  } else if (path.includes('inventory')) {
    const movement = text(body, ['type', 'reason', 'movementType']);
    if (
      movement.includes('WRITE') ||
      movement.includes('WASTE') ||
      movement.includes('LOSS')
    ) {
      return {
        actionKind: 'INVENTORY_WRITE_OFF',
        amountMinor,
        sourceType: 'inventory',
      };
    }
    if (
      movement.includes('CORRECTION') ||
      movement.includes('ADJUST') ||
      path.includes('correction')
    ) {
      return {
        actionKind: 'INVENTORY_CORRECTION',
        amountMinor,
        sourceType: 'inventory',
      };
    }
  }

  if (path.includes('/cash/')) {
    const movement = text(body, ['type', 'movementType']);
    if (
      movement.includes('PAID_OUT') ||
      movement.includes('PAYOUT') ||
      movement.includes('PAY_OUT')
    ) {
      return { actionKind: 'CASH_PAYOUT', amountMinor, sourceType: 'cash' };
    }
    if (path.includes('variance') || body?.varianceMinor != null) {
      return { actionKind: 'CASH_VARIANCE', amountMinor, sourceType: 'cash' };
    }
  }

  if (truthy(body, ['comp', 'isComp', 'complimentary'])) {
    return { actionKind: 'COMP', amountMinor, sourceType: 'commercial' };
  }
  if (
    truthy(body, ['priceOverride', 'overridePrice', 'manualPrice']) ||
    path.includes('price-override')
  ) {
    return { actionKind: 'PRICE_OVERRIDE', amountMinor, sourceType: 'commercial' };
  }
  if (
    truthy(body, ['waiveCancellationFee', 'feeWaived']) ||
    path.includes('fee-waiver')
  ) {
    return {
      actionKind: 'CANCELLATION_FEE_WAIVER',
      amountMinor,
      sourceType: 'reservation',
    };
  }
  if (
    body?.discountAmountMinor != null ||
    body?.discountPercent != null ||
    path.includes('discount')
  ) {
    return {
      actionKind: 'LARGE_DISCOUNT',
      amountMinor,
      sourceType: 'commercial',
    };
  }
  if (truthy(body, ['managerOverride']) || path.includes('manager-override')) {
    return { actionKind: 'MANAGER_OVERRIDE', amountMinor, sourceType: 'override' };
  }

  // A SALE fact is emitted only when the canonical settlement payment mutation
  // succeeds. Previewing a check or creating a settlement is not a completed sale.
  if (
    verb === 'POST' &&
    matches(path, /\/checkout\/settlements\/[^/]+\/payments$/)
  ) {
    return { actionKind: 'SALE', amountMinor, sourceType: 'sale' };
  }

  return null;
}

export type SuspicionRule = {
  amountThresholdMinor?: number | null;
  repeatCountThreshold: number;
  afterHoursStartHour?: number | null;
  afterHoursEndHour?: number | null;
};

export function isAfterHours(
  hour: number,
  start?: number | null,
  end?: number | null,
): boolean {
  if (start == null || end == null) return false;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function computeSuspiciousReasons(input: {
  amountMinor?: number;
  recentSameActorCount: number;
  localHour: number;
  rule: SuspicionRule;
  managerOverride?: boolean;
}): string[] {
  const reasons: string[] = [];
  if (
    input.rule.amountThresholdMinor != null &&
    input.amountMinor != null &&
    input.amountMinor >= input.rule.amountThresholdMinor
  ) {
    reasons.push('AMOUNT_THRESHOLD');
  }
  if (input.recentSameActorCount + 1 >= input.rule.repeatCountThreshold) {
    reasons.push('REPEAT_THRESHOLD');
  }
  if (
    isAfterHours(
      input.localHour,
      input.rule.afterHoursStartHour,
      input.rule.afterHoursEndHour,
    )
  ) {
    reasons.push('AFTER_HOURS');
  }
  if (input.managerOverride) reasons.push('MANAGER_OVERRIDE');
  return reasons;
}

export function scheduleStatus(input: {
  scheduledStart?: Date | null;
  actualStart: Date;
  lateGraceMinutes: number;
}): { lateBySeconds: number; late: boolean } {
  if (!input.scheduledStart) return { lateBySeconds: 0, late: false };
  const graceMs = Math.max(0, input.lateGraceMinutes) * 60_000;
  const lateMs = input.actualStart.getTime() - input.scheduledStart.getTime() - graceMs;
  const lateBySeconds = Math.max(0, Math.floor(lateMs / 1000));
  return { lateBySeconds, late: lateBySeconds > 0 };
}

export function overtimeSeconds(workedSeconds: number, thresholdSeconds: number): number {
  return Math.max(
    0,
    Math.trunc(workedSeconds) - Math.max(0, Math.trunc(thresholdSeconds)),
  );
}

export function breakCompliance(input: {
  workedSeconds: number;
  unpaidBreakSeconds: number;
  minimumBreakAfterSeconds: number;
  minimumBreakSeconds: number;
}): { required: boolean; compliant: boolean; missingSeconds: number } {
  const required = input.workedSeconds >= input.minimumBreakAfterSeconds;
  if (!required) return { required: false, compliant: true, missingSeconds: 0 };
  const missingSeconds = Math.max(0, input.minimumBreakSeconds - input.unpaidBreakSeconds);
  return {
    required: true,
    compliant: missingSeconds === 0,
    missingSeconds,
  };
}

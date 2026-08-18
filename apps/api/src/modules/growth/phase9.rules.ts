export type MembershipState = 'ACTIVE' | 'EXPIRED' | 'PAUSED' | 'CANCELLED';

export function effectiveMembershipState(
  status: string,
  expiresAt: Date | null | undefined,
  at = new Date(),
): MembershipState {
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'PAUSED') return 'PAUSED';
  if (expiresAt && expiresAt.getTime() <= at.getTime()) return 'EXPIRED';
  return status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';
}

export function signedLoyaltyPoints(type: string, points: number): number {
  const value = requirePositiveInteger(points, 'points');
  switch (type) {
    case 'EARN':
    case 'ADJUST':
      return value;
    case 'REDEEM':
    case 'EXPIRE':
    case 'REVERSAL':
      return -value;
    default:
      throw new Error(`Unsupported loyalty entry type: ${type}`);
  }
}

export function signedStoredValueAmount(type: string, amountMinor: number): number {
  const value = requirePositiveInteger(amountMinor, 'amountMinor');
  switch (type) {
    case 'LOAD':
    case 'REFUND':
    case 'ADJUST':
      return value;
    case 'REDEEM':
    case 'REVERSAL':
      return -value;
    default:
      throw new Error(`Unsupported stored-value entry type: ${type}`);
  }
}

export function signedBenefitUnits(type: string, units: number): number {
  const value = requirePositiveInteger(units, 'units');
  switch (type) {
    case 'GRANT':
    case 'LOAD':
    case 'REFUND':
    case 'ADJUST':
      return value;
    case 'CONSUME':
    case 'REVERSAL':
      return -value;
    default:
      throw new Error(`Unsupported benefit ledger type: ${type}`);
  }
}

export function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive safe integer`);
  }
  return value;
}

export function accountExpired(
  expiresAt: Date | null | undefined,
  at = new Date(),
): boolean {
  return Boolean(expiresAt && expiresAt.getTime() <= at.getTime());
}

export type PromotionUsageInput = {
  firstVisitOnly?: boolean;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  totalLimit?: number | null;
  perCustomerLimit?: number | null;
};

export type PromotionUsageFacts = {
  customerVisitCount: number;
  quantity: number;
  totalRedemptions: number;
  customerRedemptions: number;
  hasCustomer: boolean;
};

export function promotionUsageEligible(
  policy: PromotionUsageInput | null | undefined,
  facts: PromotionUsageFacts,
): { eligible: boolean; reason: string } {
  if (!policy) return { eligible: true, reason: 'NO_USAGE_POLICY' };
  if (policy.firstVisitOnly && (!facts.hasCustomer || facts.customerVisitCount > 0)) {
    return { eligible: false, reason: 'FIRST_VISIT_REQUIRED' };
  }
  if (policy.minQuantity != null && facts.quantity < policy.minQuantity) {
    return { eligible: false, reason: 'MIN_QUANTITY_NOT_MET' };
  }
  if (policy.maxQuantity != null && facts.quantity > policy.maxQuantity) {
    return { eligible: false, reason: 'MAX_QUANTITY_EXCEEDED' };
  }
  if (policy.totalLimit != null && facts.totalRedemptions >= policy.totalLimit) {
    return { eligible: false, reason: 'TOTAL_USAGE_LIMIT_REACHED' };
  }
  if (
    policy.perCustomerLimit != null &&
    (!facts.hasCustomer || facts.customerRedemptions >= policy.perCustomerLimit)
  ) {
    return { eligible: false, reason: 'CUSTOMER_USAGE_LIMIT_REACHED' };
  }
  return { eligible: true, reason: 'ELIGIBLE' };
}

const PRODUCT_CONDITIONS = new Set(['ITEM', 'ITEM_CATEGORY']);
const RESOURCE_CONDITIONS = new Set(['RESOURCE', 'RESOURCE_CATEGORY']);

export function promotionDomain(conditionKinds: string[]): 'GENERAL' | 'PRODUCT' | 'RESOURCE' {
  const hasProduct = conditionKinds.some((kind) => PRODUCT_CONDITIONS.has(kind));
  const hasResource = conditionKinds.some((kind) => RESOURCE_CONDITIONS.has(kind));
  if (hasProduct && hasResource) {
    throw new Error(
      'A promotion cannot mix timed-resource pricing and product targeting in one rule',
    );
  }
  if (hasProduct) return 'PRODUCT';
  if (hasResource) return 'RESOURCE';
  return 'GENERAL';
}

import {
  accountExpired,
  effectiveMembershipState,
  promotionDomain,
  promotionUsageEligible,
  signedBenefitUnits,
  signedLoyaltyPoints,
  signedStoredValueAmount,
} from './phase9.rules';

describe('Phase 9 customer value rules', () => {
  it('treats membership expiry as authoritative even when persisted status is ACTIVE', () => {
    expect(
      effectiveMembershipState('ACTIVE', new Date('2026-08-17T00:00:00Z'), new Date('2026-08-18T00:00:00Z')),
    ).toBe('EXPIRED');
    expect(
      effectiveMembershipState('ACTIVE', new Date('2026-08-19T00:00:00Z'), new Date('2026-08-18T00:00:00Z')),
    ).toBe('ACTIVE');
  });

  it('projects loyalty, stored value and package benefits with explicit signed deltas', () => {
    expect(signedLoyaltyPoints('EARN', 10)).toBe(10);
    expect(signedLoyaltyPoints('REDEEM', 10)).toBe(-10);
    expect(signedStoredValueAmount('LOAD', 1500)).toBe(1500);
    expect(signedStoredValueAmount('REDEEM', 1500)).toBe(-1500);
    expect(signedBenefitUnits('LOAD', 5)).toBe(5);
    expect(signedBenefitUnits('CONSUME', 2)).toBe(-2);
  });

  it('rejects zero and unsafe ledger mutations', () => {
    expect(() => signedLoyaltyPoints('EARN', 0)).toThrow();
    expect(() => signedStoredValueAmount('LOAD', Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(() => signedBenefitUnits('CONSUME', -2)).toThrow();
  });

  it('enforces deterministic promotion first-visit, quantity and usage limits', () => {
    const policy = {
      firstVisitOnly: true,
      minQuantity: 2,
      maxQuantity: 5,
      totalLimit: 10,
      perCustomerLimit: 1,
    };
    expect(
      promotionUsageEligible(policy, {
        customerVisitCount: 0,
        quantity: 2,
        totalRedemptions: 0,
        customerRedemptions: 0,
        hasCustomer: true,
      }),
    ).toEqual({ eligible: true, reason: 'ELIGIBLE' });
    expect(
      promotionUsageEligible(policy, {
        customerVisitCount: 1,
        quantity: 2,
        totalRedemptions: 0,
        customerRedemptions: 0,
        hasCustomer: true,
      }).reason,
    ).toBe('FIRST_VISIT_REQUIRED');
    expect(
      promotionUsageEligible({ totalLimit: 1 }, {
        customerVisitCount: 0,
        quantity: 1,
        totalRedemptions: 1,
        customerRedemptions: 0,
        hasCustomer: false,
      }).reason,
    ).toBe('TOTAL_USAGE_LIMIT_REACHED');
  });

  it('keeps resource rate promotions separate from product promotions', () => {
    expect(promotionDomain(['ITEM'])).toBe('PRODUCT');
    expect(promotionDomain(['RESOURCE'])).toBe('RESOURCE');
    expect(promotionDomain(['MEMBER'])).toBe('GENERAL');
    expect(() => promotionDomain(['ITEM', 'RESOURCE'])).toThrow(
      /cannot mix timed-resource pricing and product targeting/i,
    );
  });

  it('evaluates stored-value expiry at the operation time', () => {
    expect(
      accountExpired(new Date('2026-08-17T00:00:00Z'), new Date('2026-08-18T00:00:00Z')),
    ).toBe(true);
    expect(accountExpired(null, new Date('2026-08-18T00:00:00Z'))).toBe(false);
  });
});

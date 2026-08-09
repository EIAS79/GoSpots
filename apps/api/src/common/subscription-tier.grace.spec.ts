import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import {
  resolveSubscriptionAccess,
  TRIAL_GRACE_PERIOD_DAYS,
} from './subscription-tier';

function trialRow(trialEndsAt: Date) {
  return {
    tier: SubscriptionTier.PRO,
    status: SubscriptionStatus.TRIAL,
    trialEndsAt,
    packId: 'gaming',
    addOns: 'gaming_suite,team_accounts',
  };
}

describe('subscription trial grace lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps selected modules active during the 90-day trial', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T00:00:00.000Z'));
    const access = resolveSubscriptionAccess(
      trialRow(new Date('2026-08-10T00:00:00.000Z')),
    );

    expect(access.trialActive).toBe(true);
    expect(access.trialGraceActive).toBe(false);
    expect(access.trialLocked).toBe(false);
    expect(access.enabledModules.size).toBeGreaterThan(0);
  });

  it('keeps modules active for seven days after the trial ends', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-11T00:00:00.000Z'));
    const access = resolveSubscriptionAccess(
      trialRow(new Date('2026-08-10T00:00:00.000Z')),
    );

    expect(TRIAL_GRACE_PERIOD_DAYS).toBe(7);
    expect(access.trialActive).toBe(false);
    expect(access.trialExpired).toBe(true);
    expect(access.trialGraceActive).toBe(true);
    expect(access.trialLocked).toBe(false);
    expect(access.enabledModules.size).toBeGreaterThan(0);
  });

  it('locks paid modules after trial plus grace without mutating stored plan data', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-18T00:00:01.000Z'));
    const row = trialRow(new Date('2026-08-10T00:00:00.000Z'));
    const access = resolveSubscriptionAccess(row);

    expect(access.trialActive).toBe(false);
    expect(access.trialGraceActive).toBe(false);
    expect(access.trialLocked).toBe(true);
    expect(access.enabledModules.size).toBe(0);
    expect(access.effectiveTier).toBe(SubscriptionTier.FREE);
    // Resolver is non-destructive: source subscription still holds its chosen plan.
    expect(row.packId).toBe('gaming');
    expect(row.addOns).toBe('gaming_suite,team_accounts');
  });
});

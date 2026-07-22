import { ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { ApiDomainErrorCode } from './api-error.codes';
import {
  assertMultiVenueEntitlement,
  assertStaffSeatCapacity,
  getVenueEntitlements,
  hasFeature,
} from './venue-entitlements';
import {
  assertKnownPermissions,
  hasPermission,
  hasPermissionFromSources,
  parsePermissions,
  permissionsToEffectiveCsv,
  resolvePermissionSet,
} from './permissions';
import {
  legacyAddOnsFromTier,
  parseAddOns,
  resolveAddOnIds,
  resolveAddOnsCsv,
  serializeAddOns,
} from './venue-packs';
import {
  resolveEnabledModules,
  resolveStaffSeatLimit,
  resolveSubscriptionAccess,
} from './subscription-tier';

function expectSubscriptionRequired(err: unknown) {
  expect(err).toBeInstanceOf(ForbiddenException);
  expect((err as ForbiddenException).getResponse()).toMatchObject({
    code: ApiDomainErrorCode.SUBSCRIPTION_REQUIRED,
  });
}

function sub(partial: {
  tier?: SubscriptionTier;
  status?: SubscriptionStatus;
  trialEndsAt?: Date | null;
  packId?: string | null;
  addOns?: string | null;
  addOnRows?: { addOnId: string }[];
  staffSeatQuantity?: number;
}) {
  return {
    tier: partial.tier ?? SubscriptionTier.STARTER,
    status: partial.status ?? SubscriptionStatus.ACTIVE,
    trialEndsAt: partial.trialEndsAt ?? null,
    packId: partial.packId !== undefined ? partial.packId : 'gaming',
    addOns: partial.addOns ?? '',
    addOnRows: partial.addOnRows,
    staffSeatQuantity: partial.staffSeatQuantity ?? 0,
  };
}

describe('getVenueEntitlements / hasFeature', () => {
  it('unlocks pack modules from add-ons CSV', () => {
    const e = getVenueEntitlements(
      sub({ addOns: 'gaming_suite,menu_orders', status: SubscriptionStatus.ACTIVE }),
    );
    expect(hasFeature(e, 'resource')).toBe(true);
    expect(hasFeature(e, 'menu')).toBe(true);
    expect(hasFeature(e, 'hours')).toBe(true); // core
    expect(hasFeature(e, 'messaging')).toBe(false);
  });

  it('rows-primary add-ons ignore CSV when rows provided', () => {
    const e = getVenueEntitlements(
      sub({
        addOns: 'gaming_suite',
        addOnRows: [{ addOnId: 'guest_chat' }, { addOnId: 'gaming_suite' }],
      }),
    );
    expect(hasFeature(e, 'resource')).toBe(true);
    expect(hasFeature(e, 'messaging')).toBe(true);
    expect(parseAddOns(e.effectiveAddOns).sort()).toEqual(
      ['gaming_suite', 'guest_chat'].sort(),
    );
  });

  it('locks modules when subscription past_due', () => {
    const e = getVenueEntitlements(
      sub({
        addOns: 'gaming_suite,team_accounts',
        status: SubscriptionStatus.PAST_DUE,
        staffSeatQuantity: 5,
      }),
    );
    expect(hasFeature(e, 'resource')).toBe(false);
    expect(e.staffSeatLimit).toBe(0);
  });

  it('trial seat limit when team_accounts enabled', () => {
    const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const e = getVenueEntitlements(
      sub({
        status: SubscriptionStatus.TRIAL,
        trialEndsAt: ends,
        addOns: 'team_accounts',
        staffSeatQuantity: 99,
      }),
    );
    expect(hasFeature(e, 'roles')).toBe(true);
    expect(e.staffSeatLimit).toBe(3);
    expect(resolveStaffSeatLimit(sub({
      status: SubscriptionStatus.TRIAL,
      trialEndsAt: ends,
      addOns: 'team_accounts',
      staffSeatQuantity: 99,
    }))).toBe(3);
  });

  it('paid seat limit uses purchased quantity', () => {
    const e = getVenueEntitlements(
      sub({
        addOns: 'team_accounts',
        staffSeatQuantity: 7,
        status: SubscriptionStatus.ACTIVE,
      }),
    );
    expect(e.staffSeatLimit).toBe(7);
  });
});

describe('assertMultiVenueEntitlement', () => {
  it('allows first venue without multi_shop', () => {
    expect(() =>
      assertMultiVenueEntitlement(
        [sub({ addOns: 'gaming_suite', status: SubscriptionStatus.ACTIVE })],
        0,
        1,
      ),
    ).not.toThrow();
  });

  it('allows additional venues during active trial', () => {
    const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(() =>
      assertMultiVenueEntitlement(
        [
          sub({
            status: SubscriptionStatus.TRIAL,
            trialEndsAt: ends,
            addOns: 'gaming_suite',
          }),
        ],
        1,
        1,
      ),
    ).not.toThrow();
  });

  it('403 for second venue without multi_shop after trial', () => {
    try {
      assertMultiVenueEntitlement(
        [sub({ addOns: 'gaming_suite', status: SubscriptionStatus.ACTIVE })],
        1,
        1,
      );
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectSubscriptionRequired(err);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        details: { feature: 'multi_shop' },
      });
    }
  });

  it('allows second venue when multi_shop unlocked (ENTERPRISE legacy)', () => {
    expect(() =>
      assertMultiVenueEntitlement(
        [
          sub({
            tier: SubscriptionTier.ENTERPRISE,
            packId: 'gaming',
            addOns: '',
            status: SubscriptionStatus.ACTIVE,
          }),
        ],
        1,
        1,
      ),
    ).not.toThrow();
  });

  it('allows second venue for pack-less ENTERPRISE via legacyModules', () => {
    expect(() =>
      assertMultiVenueEntitlement(
        [
          sub({
            tier: SubscriptionTier.ENTERPRISE,
            packId: null,
            addOns: '',
            status: SubscriptionStatus.ACTIVE,
          }),
        ],
        1,
        1,
      ),
    ).not.toThrow();
  });
});

describe('assertStaffSeatCapacity', () => {
  it('403 when team_accounts / roles missing', () => {
    const e = getVenueEntitlements(
      sub({ addOns: 'gaming_suite', staffSeatQuantity: 5 }),
    );
    try {
      assertStaffSeatCapacity(e, 0);
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectSubscriptionRequired(err);
      const body = (err as ForbiddenException).getResponse() as {
        message: string;
      };
      expect(body.message).toMatch(/Team accounts/i);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        details: { feature: 'roles' },
      });
    }
  });

  it('403 when no seats purchased', () => {
    const e = getVenueEntitlements(
      sub({
        addOns: 'team_accounts',
        staffSeatQuantity: 0,
        status: SubscriptionStatus.ACTIVE,
      }),
    );
    try {
      assertStaffSeatCapacity(e, 0);
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectSubscriptionRequired(err);
      const body = (err as ForbiddenException).getResponse() as {
        message: string;
      };
      expect(body.message).toMatch(/No employee seats/i);
    }
  });

  it('403 when used >= limit', () => {
    const e = getVenueEntitlements(
      sub({
        addOns: 'team_accounts',
        staffSeatQuantity: 2,
        status: SubscriptionStatus.ACTIVE,
      }),
    );
    try {
      assertStaffSeatCapacity(e, 2);
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectSubscriptionRequired(err);
      const body = (err as ForbiddenException).getResponse() as {
        message: string;
      };
      expect(body.message).toMatch(/Employee limit reached \(2\/2\)/);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        details: { feature: 'roles', staffSeatLimit: 2, usedSeats: 2 },
      });
    }
  });

  it('allows create when under seat cap', () => {
    const e = getVenueEntitlements(
      sub({
        addOns: 'team_accounts',
        staffSeatQuantity: 3,
        status: SubscriptionStatus.ACTIVE,
      }),
    );
    expect(() => assertStaffSeatCapacity(e, 2)).not.toThrow();
  });
});

describe('legacy tier → add-ons compatibility (pack-only authz)', () => {
  it('maps STANDARD+ empty addOns via effectiveAddOns (no belt union)', () => {
    const modules = resolveEnabledModules(
      sub({
        tier: SubscriptionTier.PRO,
        packId: 'gaming',
        addOns: '',
      }),
    );
    expect(modules.has('roles')).toBe(true);
    expect(modules.has('memberships')).toBe(true);
    expect(modules.has('menu')).toBe(true);
    expect(modules.has('bar')).toBe(true);
    expect(modules.has('messaging')).toBe(true);
    // Pack-only: no FEATURE_MATRIX union — multi_shop stays off for PRO
    expect(modules.has('multi_shop')).toBe(false);
  });

  it('ENTERPRISE billed tier preserves multi_shop catalog gap', () => {
    const modules = resolveEnabledModules(
      sub({
        tier: SubscriptionTier.ENTERPRISE,
        packId: 'gaming',
        addOns: '',
      }),
    );
    expect(modules.has('multi_shop')).toBe(true);
    expect(modules.has('integrations')).toBe(true);
  });

  it('STANDARD empty pack unlocks bar via menu_orders synthesis', () => {
    const modules = resolveEnabledModules(
      sub({
        tier: SubscriptionTier.STANDARD,
        packId: 'gaming',
        addOns: '',
      }),
    );
    expect(modules.has('bar')).toBe(true);
    expect(modules.has('reports')).toBe(true);
    expect(modules.has('roles')).toBe(false);
  });

  it('does not invent add-ons for intentional empty STARTER pack', () => {
    const access = resolveSubscriptionAccess(
      sub({
        tier: SubscriptionTier.STARTER,
        packId: 'gaming',
        addOns: '',
      }),
    );
    // CORE only — hours/gallery/notes
    expect(access.enabledModules.has('hours')).toBe(true);
    expect(access.enabledModules.has('menu')).toBe(false);
    expect(access.enabledModules.has('roles')).toBe(false);
    expect(access.enabledModules.has('bar')).toBe(false);
  });

  it('legacyAddOnsFromTier covers PRO without marketing', () => {
    const ids = legacyAddOnsFromTier('PRO');
    expect(ids).toContain('team_accounts');
    expect(ids).not.toContain('venue_presence');
  });

  it('pack-less rows still use legacyModulesFromTier', () => {
    const modules = resolveEnabledModules(
      sub({
        tier: SubscriptionTier.PRO,
        packId: null,
        addOns: '',
      }),
    );
    expect(modules.has('roles')).toBe(true);
    expect(modules.has('bar')).toBe(true);
  });
});

describe('permission dual-read / validation', () => {
  it('hasPermission CSV wildcard', () => {
    expect(hasPermission('*', 'menu.read')).toBe(true);
    expect(hasPermission('menu.read,hours.write', 'hours.write')).toBe(true);
    expect(hasPermission('menu.read', 'hours.write')).toBe(false);
  });

  it('rows-primary permissions: ignores CSV when rows provided', () => {
    expect(
      hasPermissionFromSources(
        {
          permissionsCsv: 'menu.read',
          permissionRows: [{ permission: 'reservation.write' }],
        },
        'reservation.write',
      ),
    ).toBe(true);
    expect(
      hasPermissionFromSources(
        {
          permissionsCsv: 'menu.read',
          permissionRows: [{ permission: 'reservation.write' }],
        },
        'menu.read',
      ),
    ).toBe(false);
    const csv = permissionsToEffectiveCsv({
      permissionRows: [
        { permission: 'menu.read' },
        { permission: 'menu.write' },
      ],
    });
    expect(resolvePermissionSet({ permissionsCsv: csv }).has('menu.write')).toBe(
      true,
    );
  });

  it('empty permission rows are SoT (no CSV fallback)', () => {
    expect(
      resolvePermissionSet({
        permissionsCsv: 'menu.read',
        permissionRows: [],
      }).size,
    ).toBe(0);
  });

  it('rejects unknown permission keys', () => {
    expect(() => assertKnownPermissions(['menu.read', 'nope.fake'])).toThrow(
      /Unknown permission/,
    );
    expect(assertKnownPermissions(['menu.read', '*'])).toEqual([
      'menu.read',
      '*',
    ]);
  });
});

describe('add-on rows-primary helpers', () => {
  it('uses rows when provided; drops unknown ids; CSV fallback when rows omitted', () => {
    expect(
      resolveAddOnIds({
        addOns: 'gaming_suite,not_real',
        addOnRows: [{ addOnId: 'ops_alerts' }, { addOnId: 'bogus' }],
      }).sort(),
    ).toEqual(['ops_alerts']);
    expect(
      resolveAddOnsCsv({
        addOns: serializeAddOns(['menu_orders']),
      }),
    ).toContain('menu_orders');
    expect(
      resolveAddOnIds({
        addOns: 'gaming_suite',
        addOnRows: [],
      }),
    ).toEqual([]);
  });
});

/** Mirrors /me membership mapping: effective CSV strings only (no raw row arrays). */
describe('/me-style permission + add-on rows-primary payloads', () => {
  it('emits permissions CSV from MembershipPermission rows', () => {
    const permissions = permissionsToEffectiveCsv({
      permissionRows: [{ permission: 'hours.write' }, { permission: 'menu.read' }],
    });
    expect(parsePermissions(permissions).has('hours.write')).toBe(true);
    expect(parsePermissions(permissions).has('menu.read')).toBe(true);
  });

  it('emits addOns CSV from SubscriptionAddOn rows', () => {
    const addOns = resolveAddOnsCsv({
      addOnRows: [{ addOnId: 'gaming_suite' }, { addOnId: 'guest_chat' }],
    });
    expect(parseAddOns(addOns).sort()).toEqual(
      ['gaming_suite', 'guest_chat'].sort(),
    );
  });
});

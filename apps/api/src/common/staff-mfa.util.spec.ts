import { ShopRole } from '@prisma/client';
import {
  hasStaffMfaEligibleMembership,
  isStaffMfaEligibleMembershipRole,
  isStaffMfaOptInEnabled,
  isUserMfaLoginEligible,
  resolveStaffMfaApiAccess,
} from './staff-mfa.util';
describe('staff-mfa.util', () => {
  const prev = process.env.STAFF_MFA_OPT_IN;

  afterEach(() => {
    if (prev === undefined) delete process.env.STAFF_MFA_OPT_IN;
    else process.env.STAFF_MFA_OPT_IN = prev;
  });

  describe('isStaffMfaOptInEnabled', () => {
    it('defaults off when unset', () => {
      delete process.env.STAFF_MFA_OPT_IN;
      expect(isStaffMfaOptInEnabled()).toBe(false);
    });

    it('accepts on/true/1', () => {
      process.env.STAFF_MFA_OPT_IN = 'on';
      expect(isStaffMfaOptInEnabled()).toBe(true);
      process.env.STAFF_MFA_OPT_IN = 'TRUE';
      expect(isStaffMfaOptInEnabled()).toBe(true);
      process.env.STAFF_MFA_OPT_IN = '1';
      expect(isStaffMfaOptInEnabled()).toBe(true);
    });
  });

  describe('isStaffMfaEligibleMembershipRole', () => {
    it('allows MANAGER and membership OWNER', () => {
      expect(isStaffMfaEligibleMembershipRole(ShopRole.MANAGER)).toBe(true);
      expect(isStaffMfaEligibleMembershipRole(ShopRole.OWNER)).toBe(true);
    });

    it('blocks plain STAFF in Phase 1', () => {
      expect(isStaffMfaEligibleMembershipRole(ShopRole.STAFF)).toBe(false);
    });
  });

  describe('isUserMfaLoginEligible', () => {
    it('requires totpEnabled and eligible staff role when flag on', () => {
      expect(
        isUserMfaLoginEligible({
          accountType: 'VENUE_OWNER',
          totpEnabled: true,
        }),
      ).toBe(true);
      expect(
        isUserMfaLoginEligible({
          accountType: 'VENUE_STAFF',
          totpEnabled: true,
          staffMfaOptIn: true,
          staffMembershipRoles: [ShopRole.MANAGER],
        }),
      ).toBe(true);
      expect(
        isUserMfaLoginEligible({
          accountType: 'VENUE_STAFF',
          totpEnabled: true,
          staffMfaOptIn: false,
          staffMembershipRoles: [ShopRole.MANAGER],
        }),
      ).toBe(false);
      expect(
        isUserMfaLoginEligible({
          accountType: 'VENUE_STAFF',
          totpEnabled: true,
          staffMfaOptIn: true,
          staffMembershipRoles: [ShopRole.STAFF],
        }),
      ).toBe(false);
    });
  });

  describe('resolveStaffMfaApiAccess', () => {
    it('distinguishes owner-only vs role ineligible for staff', () => {
      expect(
        resolveStaffMfaApiAccess({
          accountType: 'VENUE_STAFF',
          membershipRoles: [ShopRole.MANAGER],
          staffMfaOptIn: false,
        }),
      ).toEqual({ allowed: false, reason: 'owner_only' });
      expect(
        resolveStaffMfaApiAccess({
          accountType: 'VENUE_STAFF',
          membershipRoles: [ShopRole.STAFF],
          staffMfaOptIn: true,
        }),
      ).toEqual({ allowed: false, reason: 'role_ineligible' });
      expect(
        resolveStaffMfaApiAccess({
          accountType: 'VENUE_STAFF',
          membershipRoles: [ShopRole.MANAGER],
          staffMfaOptIn: true,
        }),
      ).toEqual({ allowed: true });
    });
  });

  describe('hasStaffMfaEligibleMembership', () => {
    it('returns true when any membership role is elevated', () => {
      expect(
        hasStaffMfaEligibleMembership([ShopRole.STAFF, ShopRole.MANAGER]),
      ).toBe(true);
      expect(hasStaffMfaEligibleMembership([ShopRole.STAFF])).toBe(false);
    });
  });
});

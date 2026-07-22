import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthLogoutService } from './auth-logout.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthRefreshService } from './auth-refresh.service';
import { AuthSessionService } from './auth-session.service';
import { AuthService } from './auth.service';

/**
 * Bible §14 Phase 4–6 PREP: characterization tests for staff forgot-password
 * (`requestStaffPasswordReset`) on AuthService. Implementation lives on
 * AuthPasswordService; AuthService facade-delegates. Locks wire BEFORE any
 * further auth split. CSRF/cookies are controller concerns — not exercised here.
 */

describe('AuthService staff forgot-password characterization (Phase 4–6 prep)', () => {
  const audit = {} as never;

  type OptionalAuthDeps = {
    sessions?: AuthSessionService;
    refreshSvc?: AuthRefreshService;
    logoutSvc?: AuthLogoutService;
    passwordSvc?: AuthPasswordService;
  };

  function makeService(
    prisma: Record<string, unknown>,
    notificationsOverrides?: { recordTeamEvent?: jest.Mock },
    deps?: OptionalAuthDeps,
  ) {
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('access.jwt'),
    } as unknown as JwtService;
    const config = {
      get: (key: string, fallback?: string) => {
        if (key === 'WEB_APP_URL') return 'https://app.example.com';
        return fallback;
      },
      getOrThrow: (key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        throw new Error(`missing ${key}`);
      },
    } as unknown as ConfigService;
    const mail = { send: jest.fn().mockResolvedValue(undefined) };
    const notifications = {
      recordTeamEvent:
        notificationsOverrides?.recordTeamEvent ??
        jest.fn().mockResolvedValue(undefined),
    };
    const svc = new AuthService(
      prisma as never,
      jwt,
      config,
      notifications as never,
      audit,
      mail as never,
      deps?.sessions,
      deps?.refreshSvc,
      deps?.logoutSvc,
      deps?.passwordSvc,
    );
    return { svc, mail, notifications };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestStaffPasswordReset', () => {
    const generic = {
      ok: true,
      message:
        'If that matches a staff account, your venue owner was notified. They will send you a new password setup link (WhatsApp, SMS, etc.).',
    };

    it('flags membership and notifies owner when staff login + shop name match', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        id: 'u_staff',
        email: 'anna@arcade.locora',
        accountType: 'VENUE_STAFF',
        passwordSetAt: new Date('2026-01-01'),
        name: 'Anna',
        staffHandle: null,
        memberships: [
          {
            id: 'mem_1',
            shopId: 'shop_1',
            shop: {
              id: 'shop_1',
              name: 'Arcade',
              displayName: null,
              owner: { name: 'Owner Name', email: 'owner@example.com' },
            },
          },
        ],
      });
      const membershipUpdate = jest.fn().mockResolvedValue({});
      const recordTeamEvent = jest.fn().mockResolvedValue(undefined);

      const { svc, notifications } = makeService(
        {
          user: { findUnique },
          membership: { update: membershipUpdate },
        },
        { recordTeamEvent },
      );

      const result = await svc.requestStaffPasswordReset({
        venueName: 'Arcade',
        loginId: 'anna@arcade.locora',
      });

      expect(result).toEqual(generic);
      expect(findUnique).toHaveBeenCalledWith({
        where: { email: 'anna@arcade.locora' },
        include: expect.objectContaining({
          memberships: expect.objectContaining({
            where: expect.objectContaining({
              isActive: true,
              role: { in: ['STAFF', 'MANAGER'] },
            }),
          }),
        }),
      });
      expect(membershipUpdate).toHaveBeenCalledWith({
        where: { id: 'mem_1' },
        data: { passwordResetRequestedAt: expect.any(Date) },
      });
      expect(notifications.recordTeamEvent).toHaveBeenCalledWith(
        'shop_1',
        expect.objectContaining({
          title: 'Staff forgot password',
          href: '/staff',
          dedupeKey: 'staff_pw_reset_mem_1',
        }),
      );
    });

    it('matches venue via owner display name (case-insensitive)', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        id: 'u_staff',
        email: 'bob@bowling.locora',
        accountType: 'VENUE_STAFF',
        passwordSetAt: new Date('2026-01-01'),
        name: 'Bob',
        staffHandle: null,
        memberships: [
          {
            id: 'mem_2',
            shopId: 'shop_2',
            shop: {
              id: 'shop_2',
              name: 'Lanes Co',
              displayName: null,
              owner: { name: 'Strike Zone', email: 'owner@bowling.com' },
            },
          },
        ],
      });
      const membershipUpdate = jest.fn().mockResolvedValue({});
      const recordTeamEvent = jest.fn().mockResolvedValue(undefined);

      const { svc, notifications } = makeService(
        {
          user: { findUnique },
          membership: { update: membershipUpdate },
        },
        { recordTeamEvent },
      );

      const result = await svc.requestStaffPasswordReset({
        venueName: 'STRIKE ZONE',
        loginId: 'bob@bowling.locora',
      });

      expect(result).toEqual(generic);
      expect(membershipUpdate).toHaveBeenCalledWith({
        where: { id: 'mem_2' },
        data: { passwordResetRequestedAt: expect.any(Date) },
      });
      expect(notifications.recordTeamEvent).toHaveBeenCalledWith(
        'shop_2',
        expect.objectContaining({
          dedupeKey: 'staff_pw_reset_mem_2',
        }),
      );
    });

    it('returns generic without DB lookup for non-staff login ids (no enumeration)', async () => {
      const findUnique = jest.fn();
      const membershipUpdate = jest.fn();
      const recordTeamEvent = jest.fn();

      const { svc, notifications } = makeService(
        {
          user: { findUnique },
          membership: { update: membershipUpdate },
        },
        { recordTeamEvent },
      );

      const result = await svc.requestStaffPasswordReset({
        venueName: 'Arcade',
        loginId: 'owner@example.com',
      });

      expect(result).toEqual(generic);
      expect(findUnique).not.toHaveBeenCalled();
      expect(membershipUpdate).not.toHaveBeenCalled();
      expect(notifications.recordTeamEvent).not.toHaveBeenCalled();
    });

    it('returns generic when venue name does not match any membership', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        id: 'u_staff',
        email: 'anna@arcade.locora',
        accountType: 'VENUE_STAFF',
        passwordSetAt: new Date('2026-01-01'),
        name: 'Anna',
        staffHandle: null,
        memberships: [
          {
            id: 'mem_1',
            shopId: 'shop_1',
            shop: {
              id: 'shop_1',
              name: 'Arcade',
              displayName: null,
              owner: { name: 'Owner Name', email: 'owner@example.com' },
            },
          },
        ],
      });
      const membershipUpdate = jest.fn();
      const recordTeamEvent = jest.fn();

      const { svc, notifications } = makeService(
        {
          user: { findUnique },
          membership: { update: membershipUpdate },
        },
        { recordTeamEvent },
      );

      const result = await svc.requestStaffPasswordReset({
        venueName: 'Wrong Venue',
        loginId: 'anna@arcade.locora',
      });

      expect(result).toEqual(generic);
      expect(membershipUpdate).not.toHaveBeenCalled();
      expect(notifications.recordTeamEvent).not.toHaveBeenCalled();
    });

    it('returns generic when staff has not set a password yet', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        id: 'u_staff',
        email: 'anna@arcade.locora',
        accountType: 'VENUE_STAFF',
        passwordSetAt: null,
        name: 'Anna',
        staffHandle: null,
        memberships: [],
      });
      const membershipUpdate = jest.fn();
      const recordTeamEvent = jest.fn();

      const { svc, notifications } = makeService(
        {
          user: { findUnique },
          membership: { update: membershipUpdate },
        },
        { recordTeamEvent },
      );

      const result = await svc.requestStaffPasswordReset({
        venueName: 'Arcade',
        loginId: 'anna@arcade.locora',
      });

      expect(result).toEqual(generic);
      expect(membershipUpdate).not.toHaveBeenCalled();
      expect(notifications.recordTeamEvent).not.toHaveBeenCalled();
    });
  });
});

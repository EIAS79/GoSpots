import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  SubscriptionStatus,
  SubscriptionTier,
  UserAccountType,
} from '@prisma/client';
import { AuthService } from './auth.service';
import { hashToken } from '../../common/security/token';

describe('AuthService password-reset + staff-activate tokens', () => {
  const strongPassword = 'SecurePass1x';

  function makeService(prisma: Record<string, unknown>) {
    return new AuthService(
      prisma as never,
      { sign: jest.fn().mockReturnValue('jwt') } as unknown as JwtService,
      { get: jest.fn() } as unknown as ConfigService,
      {
        recordTeamEvent: jest.fn(),
        recordSignIn: jest.fn(),
      } as never,
      { record: jest.fn() } as never,
      { send: jest.fn() } as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resetOwnerPassword', () => {
    it('consumes hash+expiry and refuses reuse (updateMany count 0)', async () => {
      const raw = 'owner-reset-raw-token-value-aaaaaaaa';
      const tokenHash = hashToken(raw);
      const user = {
        id: 'u_owner',
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
        accountType: 'VENUE_OWNER',
      };

      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(null);
      const updateMany = jest
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      const sessionUpdateMany = jest.fn().mockResolvedValue({ count: 0 });

      const tx = {
        user: { findFirst, updateMany },
        authSession: { updateMany: sessionUpdateMany },
      };
      const prisma = {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      };

      const svc = makeService(prisma);

      await expect(
        svc.resetOwnerPassword({ token: raw, password: strongPassword }),
      ).resolves.toEqual({ ok: true });

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'u_owner',
            passwordResetTokenHash: tokenHash,
          }),
          data: expect.objectContaining({
            passwordResetTokenHash: null,
            passwordResetExpiresAt: null,
          }),
        }),
      );

      await expect(
        svc.resetOwnerPassword({ token: raw, password: strongPassword }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects expired reset tokens', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const tx = {
        user: { findFirst, updateMany: jest.fn() },
        authSession: { updateMany: jest.fn() },
      };
      const prisma = {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      };
      const svc = makeService(prisma);

      await expect(
        svc.resetOwnerPassword({
          token: 'any-token',
          password: strongPassword,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('activateStaffInvite', () => {
    it('clears invite hash+expiry and refuses reuse', async () => {
      const raw = 'staff-invite-raw-token-value-bbbbbbbb';
      const tokenHash = hashToken(raw);
      const membership = {
        id: 'm_1',
        userId: 'u_staff',
        shopId: 's_1',
        permissions: 'reservation.read',
        user: {
          id: 'u_staff',
          email: 'alex@venue.gospots',
          name: 'Alex',
          accountType: UserAccountType.VENUE_STAFF,
          passwordSetAt: null,
        },
      };

      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(membership)
        .mockResolvedValueOnce(null);
      const userUpdateMany = jest
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      const membershipUpdateMany = jest
        .fn()
        .mockResolvedValueOnce({ count: 1 });
      const sessionUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
      const shopFindUnique = jest.fn().mockResolvedValue({
        id: 's_1',
        subscription: {
          tier: SubscriptionTier.STARTER,
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          packId: 'gaming',
          addOns: 'team_accounts',
          staffSeatQuantity: 5,
          addOnRows: [{ addOnId: 'team_accounts' }],
        },
      });
      const membershipCount = jest.fn().mockResolvedValue(1);

      const tx = {
        membership: {
          findFirst,
          updateMany: membershipUpdateMany,
          count: membershipCount,
        },
        user: { updateMany: userUpdateMany },
        shop: { findUnique: shopFindUnique },
        authSession: { updateMany: sessionUpdateMany },
        membershipPermission: {
          deleteMany: jest.fn().mockResolvedValue({}),
          createMany: jest.fn().mockResolvedValue({}),
        },
      };
      const prisma = {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      };

      const svc = makeService(prisma);
      // issueTokens is private-ish via return; stub by letting it run if deps exist,
      // or spy — mock jwt already returns 'jwt'.
      jest.spyOn(svc as never, 'issueTokens' as never).mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
      } as never);

      await expect(
        svc.activateStaffInvite(raw, strongPassword),
      ).resolves.toEqual({ accessToken: 'a', refreshToken: 'r' });

      expect(membershipUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'm_1',
            inviteTokenHash: tokenHash,
          }),
          data: expect.objectContaining({
            inviteTokenHash: null,
            inviteExpiresAt: null,
          }),
        }),
      );

      await expect(
        svc.activateStaffInvite(raw, strongPassword),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

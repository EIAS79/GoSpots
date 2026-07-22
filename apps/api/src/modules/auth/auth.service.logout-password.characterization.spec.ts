import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hashToken } from '../../common/security/token';
import { AuthService } from './auth.service';

/**
 * Bible §14 Phase 4–6 PREP: characterization tests for AuthService.logout and
 * owner password-reset paths (request/consume + session revoke on owner reset).
 * Logout is tiny (~7 lines) so it shares this file with owner reset wiring.
 * Staff forgot-password → `auth.service.staff-password.characterization.spec.ts`.
 * CSRF/cookies are controller concerns — not exercised here.
 */

describe('AuthService logout + password-reset characterization (Phase 4–6 prep)', () => {
  const audit = {} as never;
  const strongPassword = 'SecurePass1x';

  function makeService(
    prisma: Record<string, unknown>,
    configOverrides?: Partial<ConfigService>,
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
      ...configOverrides,
    } as unknown as ConfigService;
    const mail = { send: jest.fn().mockResolvedValue(undefined) };
    const notifications = {
      recordTeamEvent: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new AuthService(
      prisma as never,
      jwt,
      config,
      notifications as never,
      audit,
      mail as never,
    );
    return { svc, mail };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logout', () => {
    it('revokes the active session matching the refresh token hash', async () => {
      const raw = 'logout-refresh-raw-token-value';
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { svc } = makeService({
        authSession: { updateMany },
      });

      await svc.logout(raw);

      expect(updateMany).toHaveBeenCalledWith({
        where: { refreshTokenHash: hashToken(raw), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('no-ops when refresh token is missing (no session mutation)', async () => {
      const updateMany = jest.fn();

      const { svc } = makeService({
        authSession: { updateMany },
      });

      await svc.logout(undefined);
      await svc.logout('');

      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('resetOwnerPassword', () => {
    it('consumes reset token, clears lockout fields, and revokes all user sessions', async () => {
      const raw = 'owner-reset-raw-token-value-aaaaaaaa';
      const tokenHash = hashToken(raw);
      const user = {
        id: 'u_owner',
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
        accountType: 'VENUE_OWNER',
      };

      const findFirst = jest.fn().mockResolvedValue(user);
      const userUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const sessionUpdateMany = jest.fn().mockResolvedValue({ count: 2 });

      const tx = {
        user: { findFirst, updateMany: userUpdateMany },
        authSession: { updateMany: sessionUpdateMany },
      };
      const prisma = {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      };

      const { svc } = makeService(prisma);

      await expect(
        svc.resetOwnerPassword({ token: raw, password: strongPassword }),
      ).resolves.toEqual({ ok: true });

      expect(userUpdateMany).toHaveBeenCalledWith({
        where: {
          id: 'u_owner',
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: { gt: expect.any(Date) },
        },
        data: expect.objectContaining({
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          failedLogins: 0,
          lockedUntil: null,
          passwordHash: expect.any(String),
        }),
      });
      expect(sessionUpdateMany).toHaveBeenCalledWith({
        where: { userId: 'u_owner', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects invalid or expired tokens without revoking sessions', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const userUpdateMany = jest.fn();
      const sessionUpdateMany = jest.fn();

      const tx = {
        user: { findFirst, updateMany: userUpdateMany },
        authSession: { updateMany: sessionUpdateMany },
      };
      const prisma = {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      };

      const { svc } = makeService(prisma);

      await expect(
        svc.resetOwnerPassword({
          token: 'stale-reset-token',
          password: strongPassword,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(userUpdateMany).not.toHaveBeenCalled();
      expect(sessionUpdateMany).not.toHaveBeenCalled();
    });

    it('rejects weak passwords before opening a transaction', async () => {
      const prisma = {
        $transaction: jest.fn(),
      };

      const { svc } = makeService(prisma);

      await expect(
        svc.resetOwnerPassword({ token: 'any-token', password: 'short' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('requestOwnerPasswordReset', () => {
    const generic = {
      ok: true,
      message:
        'If that email belongs to a venue owner account, we sent a reset link. Staff cannot reset passwords here — ask your owner.',
    };

    it('returns generic message and sends mail when a venue owner exists', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        id: 'u_owner',
        accountType: 'VENUE_OWNER',
      });
      const update = jest.fn().mockResolvedValue({});

      const { svc, mail } = makeService({
        user: { findUnique, update },
      });

      const result = await svc.requestOwnerPasswordReset({
        email: 'owner@example.com',
      });

      expect(result).toEqual(generic);
      expect(update).toHaveBeenCalledWith({
        where: { id: 'u_owner' },
        data: {
          passwordResetTokenHash: expect.any(String),
          passwordResetExpiresAt: expect.any(Date),
        },
      });
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          subject: 'Reset your Locora owner password',
          required: true,
        }),
      );
    });

    it('returns generic without mail for staff-style login ids (no enumeration)', async () => {
      const findUnique = jest.fn();
      const update = jest.fn();

      const { svc, mail } = makeService({
        user: { findUnique, update },
      });

      const result = await svc.requestOwnerPasswordReset({
        email: 'alice@arcade.locora',
      });

      expect(result).toEqual(generic);
      expect(findUnique).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });
  });
});

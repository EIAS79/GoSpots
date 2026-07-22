import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserAccountType } from '@prisma/client';
import { hashPassword } from '../../common/security/password';
import { hashToken } from '../../common/security/token';
import {
  encryptTotpSecret,
  generateTotpCode,
  generateTotpSecret,
} from '../../common/mfa-totp.util';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
} from '../../common/mfa-recovery.util';
import { MFA_CHALLENGE_PURPOSE } from '../../common/mfa-challenge.util';
import { AuthService } from './auth.service';

describe('AuthService owner MFA', () => {
  const keySource = { mfaTotpEncryptionKey: 'b'.repeat(64) };
  const notifications = {
    recordSignIn: jest.fn(),
    recordTeamEvent: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const mail = { send: jest.fn() };

  function makeService(prisma: Record<string, unknown>, jwtExtra?: Partial<JwtService>) {
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('mfa.challenge.jwt'),
      verifyAsync: jest.fn(),
      ...jwtExtra,
    } as unknown as JwtService;
    const config = {
      get: (key: string, fallback?: string) => {
        if (key === 'MFA_TOTP_ENCRYPTION_KEY') return keySource.mfaTotpEncryptionKey;
        if (key === 'JWT_ACCESS_TTL') return '900';
        if (key === 'JWT_REFRESH_TTL') return '604800';
        return fallback;
      },
      getOrThrow: (key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret-min-32-chars!!';
        throw new Error(`missing ${key}`);
      },
    } as unknown as ConfigService;
    return {
      svc: new AuthService(
        prisma as never,
        jwt,
        config,
        notifications as never,
        audit as never,
        mail as never,
      ),
      jwt,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('login with totpEnabled returns mfaToken and does not issue refresh', async () => {
    const password = 'SecurePass1x';
    const passwordHash = await hashPassword(password);
    const user = {
      id: 'u1',
      email: 'owner@example.com',
      passwordHash,
      accountType: UserAccountType.VENUE_OWNER,
      lockedUntil: null,
      failedLogins: 0,
      totpEnabled: true,
      passwordSetAt: new Date(),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn(),
      },
      membership: { findFirst: jest.fn() },
      authSession: { findMany: jest.fn(), create: jest.fn() },
    };
    const { svc, jwt } = makeService(prisma);

    const result = await svc.login(
      { login: user.email, password, accountType: 'VENUE_OWNER' },
      '127.0.0.1',
      'jest',
    );

    expect(result).toEqual({
      mfaRequired: true,
      mfaToken: 'mfa.challenge.jwt',
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'u1',
        purpose: MFA_CHALLENGE_PURPOSE,
      }),
      expect.any(Object),
    );
    expect(prisma.authSession.create).not.toHaveBeenCalled();
    expect(notifications.recordSignIn).not.toHaveBeenCalled();
  });

  it('confirmMfaTotp rejects bad code and enables only after success', async () => {
    const secret = generateTotpSecret();
    const totpSecretEnc = encryptTotpSecret(secret, keySource);
    const userFind = jest
      .fn()
      .mockResolvedValue({
        id: 'u1',
        accountType: UserAccountType.VENUE_OWNER,
        totpEnabled: false,
        totpSecretEnc,
      });
    const deleteMany = jest.fn();
    const createMany = jest.fn();
    const userUpdate = jest.fn();
    const prisma = {
      user: { findUnique: userFind, update: userUpdate },
      mfaRecoveryCode: { deleteMany, createMany },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          mfaRecoveryCode: { deleteMany, createMany },
          user: { update: userUpdate },
        }),
      ),
    };
    const { svc } = makeService(prisma);

    await expect(
      svc.confirmMfaTotp('u1', { code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const code = generateTotpCode(secret);
    const out = await svc.confirmMfaTotp('u1', { code });
    expect(out.recoveryCodes).toHaveLength(10);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ totpEnabled: true }),
    });
    expect(createMany).toHaveBeenCalled();
  });

  it('recovery code is single-use; reuse fails', async () => {
    const secret = generateTotpSecret();
    const totpSecretEnc = encryptTotpSecret(secret, keySource);
    const [code] = generateRecoveryCodes(1);
    const codeHash = hashRecoveryCode(code);
    const row = { id: 'rc1', codeHash, usedAt: null as Date | null };

    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ ...row }])
      .mockResolvedValueOnce([{ ...row, usedAt: new Date() }]);
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          accountType: UserAccountType.VENUE_OWNER,
          totpEnabled: true,
          totpSecretEnc,
          lockedUntil: null,
          failedLogins: 0,
        }),
        update: jest.fn(),
      },
      mfaRecoveryCode: { findMany, updateMany },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ shopId: 's1', role: 'OWNER' }),
      },
      authSession: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'sess1',
          familyId: 'fam1',
        }),
        updateMany: jest.fn(),
      },
    };
    const { svc, jwt } = makeService(prisma);
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 'u1',
      purpose: MFA_CHALLENGE_PURPOSE,
    });
    // issueTokens path: second findUnique for full user
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'u1',
        accountType: UserAccountType.VENUE_OWNER,
        totpEnabled: true,
        totpSecretEnc,
        lockedUntil: null,
        failedLogins: 0,
      })
      .mockResolvedValueOnce({
        id: 'u1',
        email: 'owner@example.com',
        name: 'Owner',
        accountType: UserAccountType.VENUE_OWNER,
      })
      .mockResolvedValueOnce({
        id: 'u1',
        email: 'owner@example.com',
        name: 'Owner',
        systemRole: 'USER',
        accountType: UserAccountType.VENUE_OWNER,
        memberships: [],
      });

    const first = await svc.verifyMfaLogin({
      mfaToken: 'tok',
      recoveryCode: code,
    });
    expect(first.accessToken).toBeDefined();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'rc1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });

    // Reset for reuse attempt
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountType: UserAccountType.VENUE_OWNER,
      totpEnabled: true,
      totpSecretEnc,
      lockedUntil: null,
      failedLogins: 0,
    });
    await expect(
      svc.verifyMfaLogin({ mfaToken: 'tok', recoveryCode: code }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('staff cannot enroll MFA', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u_staff',
          email: 'anna@shop.gospots',
          accountType: UserAccountType.VENUE_STAFF,
          totpEnabled: false,
          passwordHash: 'x',
        }),
      },
    };
    const { svc } = makeService(prisma);
    await expect(
      svc.beginMfaTotp('u_staff', { password: 'SecurePass1x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('disable clears secret and recovery codes', async () => {
    const password = 'SecurePass1x';
    const passwordHash = await hashPassword(password);
    const secret = generateTotpSecret();
    const totpSecretEnc = encryptTotpSecret(secret, keySource);
    const deleteMany = jest.fn();
    const userUpdate = jest.fn();
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'u1',
            accountType: UserAccountType.VENUE_OWNER,
            totpEnabled: true,
            totpSecretEnc,
          })
          .mockResolvedValueOnce({ passwordHash }),
        update: userUpdate,
      },
      mfaRecoveryCode: { deleteMany, findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          mfaRecoveryCode: { deleteMany },
          user: { update: userUpdate },
        }),
      ),
    };
    const { svc } = makeService(prisma);
    const code = generateTotpCode(secret);
    await expect(
      svc.disableMfaTotp('u1', { password, code }),
    ).resolves.toEqual({ ok: true });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        totpEnabled: false,
        totpSecretEnc: null,
        totpVerifiedAt: null,
      },
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('password reset does not clear totpEnabled', async () => {
    const raw = 'owner-reset-raw-token-value-bbbbbbbb';
    const tokenHash = hashToken(raw);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest.fn().mockResolvedValue({
      id: 'u_owner',
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
      accountType: 'VENUE_OWNER',
      totpEnabled: true,
    });
    const tx = {
      user: { findFirst, updateMany },
      authSession: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const { svc } = makeService(prisma);
    await svc.resetOwnerPassword({ token: raw, password: 'SecurePass1x' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          totpEnabled: expect.anything(),
          totpSecretEnc: expect.anything(),
        }),
      }),
    );
  });

  it('confirm enroll rejects when MFA already enabled', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          accountType: UserAccountType.VENUE_OWNER,
          totpEnabled: true,
          totpSecretEnc: 'v1:x',
        }),
      },
    };
    const { svc } = makeService(prisma);
    await expect(
      svc.confirmMfaTotp('u1', { code: '123456' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('MFA verify failure bumps failedLogins / lockout', async () => {
    const secret = generateTotpSecret();
    const totpSecretEnc = encryptTotpSecret(secret, keySource);
    const userUpdate = jest.fn();
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          accountType: UserAccountType.VENUE_OWNER,
          totpEnabled: true,
          totpSecretEnc,
          lockedUntil: null,
          failedLogins: 4,
        }),
        update: userUpdate,
      },
      mfaRecoveryCode: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const { svc, jwt } = makeService(prisma);
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 'u1',
      purpose: MFA_CHALLENGE_PURPOSE,
    });

    await expect(
      svc.verifyMfaLogin({ mfaToken: 'tok', code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        failedLogins: 5,
        lockedUntil: expect.any(Date),
      },
    });
  });
});

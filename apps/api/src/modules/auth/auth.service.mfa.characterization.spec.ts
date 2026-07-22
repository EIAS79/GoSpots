import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserAccountType, ShopRole } from '@prisma/client';
import {
  MFA_CHALLENGE_PURPOSE,
  MFA_CHALLENGE_TTL_SEC,
} from '../../common/mfa-challenge.util';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import {
  encryptTotpSecret,
  generateTotpCode,
  generateTotpSecret,
} from '../../common/mfa-totp.util';
import { hashPassword } from '../../common/security/password';
import { AuthLogoutService } from './auth-logout.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthRefreshService } from './auth-refresh.service';
import { AuthSessionService } from './auth-session.service';
import { AuthService } from './auth.service';

/**
 * Bible §14 Phase 4–6 PREP: characterization tests for owner MFA methods
 * still on AuthService (status, enroll, confirm, disable, recovery regen,
 * login challenge, verify). Locks service-layer wire BEFORE any MFA extract.
 * CSRF/cookies are controller concerns — not exercised here.
 */

describe('AuthService owner MFA characterization (Phase 4–6 prep)', () => {
  const keySource = { mfaTotpEncryptionKey: 'b'.repeat(64) };
  const staffMfaPrev = process.env.STAFF_MFA_OPT_IN;
  const notifications = {
    recordSignIn: jest.fn(),
    recordTeamEvent: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const mail = { send: jest.fn() };

  type OptionalAuthDeps = {
    sessions?: AuthSessionService;
    refreshSvc?: AuthRefreshService;
    logoutSvc?: AuthLogoutService;
    passwordSvc?: AuthPasswordService;
  };

  function makeService(
    prisma: Record<string, unknown>,
    jwtExtra?: Partial<JwtService>,
    deps?: OptionalAuthDeps,
  ) {
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('access.jwt'),
      verifyAsync: jest.fn(),
      ...jwtExtra,
    } as unknown as JwtService;
    const config = {
      get: (key: string, fallback?: string) => {
        if (key === 'MFA_TOTP_ENCRYPTION_KEY') return keySource.mfaTotpEncryptionKey;
        if (key === 'STAFF_MFA_OPT_IN') return process.env.STAFF_MFA_OPT_IN;
        if (key === 'JWT_ACCESS_TTL') return '900';
        if (key === 'JWT_REFRESH_TTL') return '604800';
        return fallback;
      },
      getOrThrow: (key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret-min-32-chars!!';
        throw new Error(`missing ${key}`);
      },
    } as unknown as ConfigService;
    const svc = new AuthService(
      prisma as never,
      jwt,
      config,
      notifications as never,
      audit as never,
      mail as never,
      deps?.sessions,
      deps?.refreshSvc,
      deps?.logoutSvc,
      deps?.passwordSvc,
    );
    return { svc, jwt };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STAFF_MFA_OPT_IN;
  });

  afterAll(() => {
    if (staffMfaPrev === undefined) delete process.env.STAFF_MFA_OPT_IN;
    else process.env.STAFF_MFA_OPT_IN = staffMfaPrev;
  });

  describe('getMfaStatus', () => {
    it('returns totpEnabled and counts unused recovery codes for owners', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        accountType: UserAccountType.VENUE_OWNER,
        totpEnabled: true,
      });
      const count = jest.fn().mockResolvedValue(7);

      const { svc } = makeService({
        user: { findUnique },
        mfaRecoveryCode: { count },
      });

      await expect(svc.getMfaStatus('u1')).resolves.toEqual({
        totpEnabled: true,
        recoveryCodesRemaining: 7,
      });

      expect(count).toHaveBeenCalledWith({
        where: { userId: 'u1', usedAt: null },
      });
    });
  });

  describe('beginMfaTotp', () => {
    it('verifies password, stores encrypted secret, and returns enrollment material', async () => {
      const password = 'SecurePass1x';
      const passwordHash = await hashPassword(password);
      const userUpdate = jest.fn();
      const owner = {
        id: 'u1',
        email: 'owner@example.com',
        accountType: UserAccountType.VENUE_OWNER,
        totpEnabled: false,
        passwordHash,
      };
      const findUnique = jest.fn().mockResolvedValue(owner);

      const { svc } = makeService({
        user: { findUnique, update: userUpdate },
      });

      const out = await svc.beginMfaTotp('u1', { password });

      expect(out.secret).toMatch(/^[A-Z2-7]+=*$/);
      expect(out.otpauthUri).toContain('otpauth://totp/Locora%3Aowner%40example.com');
      expect(out.otpauthUri).toContain(`secret=${out.secret.replace(/=+$/g, '').toUpperCase()}`);
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          totpSecretEnc: expect.any(String),
          totpVerifiedAt: null,
        },
      });
    });
  });

  describe('login MFA challenge', () => {
    it('returns mfaRequired without issuing sessions when owner has TOTP enabled', async () => {
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
      const authSessionCreate = jest.fn();
      const { svc, jwt } = makeService({
        user: {
          findUnique: jest.fn().mockResolvedValue(user),
          update: jest.fn(),
        },
        membership: { findFirst: jest.fn() },
        authSession: { findMany: jest.fn(), create: authSessionCreate },
      });
      (jwt.signAsync as jest.Mock).mockResolvedValue('mfa.challenge.jwt');

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
          acct: UserAccountType.VENUE_OWNER,
        }),
        expect.objectContaining({
          secret: 'test-access-secret-min-32-chars!!',
          expiresIn: MFA_CHALLENGE_TTL_SEC,
        }),
      );
      expect(authSessionCreate).not.toHaveBeenCalled();
      expect(notifications.recordSignIn).not.toHaveBeenCalled();
    });
  });

  describe('confirmMfaTotp', () => {
    it('rejects confirm when enrollment secret was never stored', async () => {
      const { svc } = makeService({
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'u1',
            accountType: UserAccountType.VENUE_OWNER,
            totpEnabled: false,
            totpSecretEnc: null,
          }),
        },
      });

      await expect(
        svc.confirmMfaTotp('u1', { code: '123456' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('regenerateMfaRecoveryCodes', () => {
    it('replaces recovery codes after password and TOTP verification', async () => {
      const password = 'SecurePass1x';
      const passwordHash = await hashPassword(password);
      const secret = generateTotpSecret();
      const totpSecretEnc = encryptTotpSecret(secret, keySource);
      const deleteMany = jest.fn();
      const createMany = jest.fn();
      const findUnique = jest
        .fn()
        .mockResolvedValueOnce({
          id: 'u1',
          accountType: UserAccountType.VENUE_OWNER,
          totpEnabled: true,
          totpSecretEnc,
        })
        .mockResolvedValue({ passwordHash });

      const { svc } = makeService({
        user: { findUnique },
        mfaRecoveryCode: { deleteMany, findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
          fn({
            mfaRecoveryCode: { deleteMany, createMany },
          }),
        ),
      });

      const code = generateTotpCode(secret);
      const out = await svc.regenerateMfaRecoveryCodes('u1', { password, code });

      expect(out.recoveryCodes).toHaveLength(10);
      expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      expect(createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: 'u1',
            codeHash: expect.any(String),
          }),
        ]),
      });
    });
  });

  describe('verifyMfaLogin', () => {
    it('accepts valid TOTP, clears lockout counters, and issues tokens', async () => {
      const secret = generateTotpSecret();
      const totpSecretEnc = encryptTotpSecret(secret, keySource);
      const userUpdate = jest.fn();
      const authSessionCreate = jest.fn().mockResolvedValue({
        id: 'sess1',
        familyId: 'fam1',
      });

      const prisma = {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'u1',
              accountType: UserAccountType.VENUE_OWNER,
              totpEnabled: true,
              totpSecretEnc,
              lockedUntil: null,
              failedLogins: 2,
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
            }),
          update: userUpdate,
        },
        membership: {
          findFirst: jest.fn().mockResolvedValue({ shopId: 's1', role: 'OWNER' }),
        },
        authSession: {
          findMany: jest.fn().mockResolvedValue([]),
          create: authSessionCreate,
          updateMany: jest.fn(),
        },
        mfaRecoveryCode: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const { svc, jwt } = makeService(prisma);
      (jwt.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'u1',
        purpose: MFA_CHALLENGE_PURPOSE,
      });

      const code = generateTotpCode(secret);
      const tokens = await svc.verifyMfaLogin(
        { mfaToken: 'challenge.jwt', code },
        '127.0.0.1',
        'jest',
      );

      expect(tokens.accessToken).toBe('access.jwt');
      expect(tokens.refreshToken).toEqual(expect.any(String));
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { failedLogins: 0, lockedUntil: null },
      });
      expect(authSessionCreate).toHaveBeenCalled();
      expect(notifications.recordSignIn).toHaveBeenCalled();
    });

    it('rejects invalid challenge JWT without mutating user or sessions', async () => {
      const userUpdate = jest.fn();
      const authSessionCreate = jest.fn();
      const { svc, jwt } = makeService({
        user: { findUnique: jest.fn(), update: userUpdate },
        authSession: { create: authSessionCreate },
      });
      (jwt.verifyAsync as jest.Mock).mockRejectedValue(new Error('bad jwt'));

      await expect(
        svc.verifyMfaLogin({ mfaToken: 'bad', code: '123456' }),
      ).rejects.toMatchObject({
        response: { code: ApiDomainErrorCode.MFA_REQUIRED },
      });

      expect(userUpdate).not.toHaveBeenCalled();
      expect(authSessionCreate).not.toHaveBeenCalled();
    });
  });

  describe('staff MFA guards (Phase 1)', () => {
    it('blocks plain STAFF enroll when flag is on', async () => {
      process.env.STAFF_MFA_OPT_IN = 'on';
      const { svc } = makeService({
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'u1',
            email: 'floor@shop.locora',
            accountType: UserAccountType.VENUE_STAFF,
            totpEnabled: false,
            passwordHash: 'x',
            name: 'Floor',
            staffHandle: null,
            memberships: [{ role: ShopRole.STAFF, shopId: 's1' }],
          }),
        },
      });

      await expect(
        svc.getMfaStatus('u1'),
      ).rejects.toThrow('Two-factor authentication is not available for your role.');
    });

    it('allows manager status when flag is on', async () => {
      process.env.STAFF_MFA_OPT_IN = 'on';
      const findUnique = jest
        .fn()
        .mockResolvedValueOnce({
          accountType: UserAccountType.VENUE_STAFF,
          totpEnabled: true,
        })
        .mockResolvedValueOnce({
          accountType: UserAccountType.VENUE_STAFF,
          email: 'manager@shop.locora',
          name: 'Manager',
          staffHandle: null,
          memberships: [{ role: ShopRole.MANAGER, shopId: 's1' }],
        });
      const count = jest.fn().mockResolvedValue(4);
      const { svc } = makeService({
        user: { findUnique },
        mfaRecoveryCode: { count },
      });

      await expect(svc.getMfaStatus('u1')).resolves.toEqual({
        totpEnabled: true,
        recoveryCodesRemaining: 4,
      });
    });
  });

  describe('disableMfaTotp', () => {
    it('clears TOTP fields and recovery codes after password + code verification', async () => {
      const password = 'SecurePass1x';
      const passwordHash = await hashPassword(password);
      const secret = generateTotpSecret();
      const totpSecretEnc = encryptTotpSecret(secret, keySource);
      const deleteMany = jest.fn();
      const userUpdate = jest.fn();
      const findUnique = jest
        .fn()
        .mockResolvedValueOnce({
          id: 'u1',
          accountType: UserAccountType.VENUE_OWNER,
          totpEnabled: true,
          totpSecretEnc,
        })
        .mockResolvedValue({ passwordHash });

      const { svc } = makeService({
        user: { findUnique, update: userUpdate },
        mfaRecoveryCode: { deleteMany, findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
          fn({
            mfaRecoveryCode: { deleteMany },
            user: { update: userUpdate },
          }),
        ),
      });

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
  });
});

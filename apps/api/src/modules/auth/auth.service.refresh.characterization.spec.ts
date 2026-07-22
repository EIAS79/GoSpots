import { UnauthorizedException } from '@nestjs/common';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserAccountType } from '@prisma/client';
import { hashToken } from '../../common/security/token';
import { AuthService } from './auth.service';

/**
 * Bible §14 / legacy #11 Phase 3 PREP: characterization tests for
 * AuthService.refresh (and its rotate → issueTokens wire). These lock
 * current service-layer behavior BEFORE any potential extraction.
 * CSRF/cookies are controller concerns — not exercised here.
 */

describe('AuthService refresh characterization (Phase 3 prep)', () => {
  const notifications = {} as never;
  const audit = {} as never;
  const mail = {} as never;

  const ownerUser = {
    id: 'user_1',
    email: 'owner@example.com',
    name: 'Owner',
    systemRole: 'USER',
    accountType: UserAccountType.VENUE_OWNER,
    memberships: [],
  };

  function makeService(
    prisma: Record<string, unknown>,
    jwtOverrides?: Partial<JwtService>,
  ) {
    const signAsync = jest.fn().mockResolvedValue('access.jwt');
    const jwt = {
      signAsync,
      ...jwtOverrides,
    } as unknown as JwtService;
    const config = {
      get: (key: string, fallback?: string) => {
        if (key === 'JWT_ACCESS_TTL') return '900';
        if (key === 'JWT_REFRESH_TTL') return '604800';
        return fallback;
      },
      getOrThrow: (key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        throw new Error(`missing ${key}`);
      },
    } as unknown as ConfigService;
    const svc = new AuthService(
      prisma as never,
      jwt,
      config,
      notifications,
      audit,
      mail,
    );
    return { svc, signAsync };
  }

  function activeSession(raw: string, overrides: Record<string, unknown> = {}) {
    return {
      id: 'sess_1',
      userId: 'user_1',
      familyId: 'fam_1',
      refreshTokenHash: hashToken(raw),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('refresh happy path', () => {
    it('claims old session, issues same family, and returns full token bundle wire', async () => {
      const raw = 'old-refresh-raw-token';
      const session = activeSession(raw);
      const findUnique = jest.fn().mockResolvedValue(session);
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const userFindUnique = jest.fn().mockResolvedValue(ownerUser);
      const create = jest.fn().mockImplementation(async ({ data }) => ({
        id: 'sess_2',
        ...data,
      }));

      const { svc, signAsync } = makeService({
        authSession: { findUnique, updateMany, create },
        user: { findUnique: userFindUnique },
      });

      const result = await svc.refresh(raw, '127.0.0.1', 'jest-agent');

      expect(findUnique).toHaveBeenCalledWith({
        where: { refreshTokenHash: hashToken(raw) },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'sess_1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_1',
          familyId: 'fam_1',
          refreshTokenHash: expect.any(String),
          userAgent: 'jest-agent',
          ipAddress: '127.0.0.1',
        }),
      });
      expect(signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user_1', email: 'owner@example.com' }),
        expect.objectContaining({
          secret: 'test-access-secret',
          expiresIn: 900,
        }),
      );
      expect(result.accessToken).toBe('access.jwt');
      expect(result.accessExpiresIn).toBe(900);
      expect(result.refreshExpiresIn).toBe(604800);
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.refreshToken).not.toBe(raw);
      expect(result.user).toEqual({
        id: 'user_1',
        email: 'owner@example.com',
        name: 'Owner',
        systemRole: 'USER',
      });
      expect(result).toHaveProperty('venuePath');
    });

    it('succeeds with token-only input (no ip/ua — CSRF/cookies not involved at service layer)', async () => {
      const raw = 'token-only-refresh';
      const create = jest.fn().mockImplementation(async ({ data }) => ({
        id: 'sess_2',
        ...data,
      }));

      const { svc } = makeService({
        authSession: {
          findUnique: jest.fn().mockResolvedValue(activeSession(raw)),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create,
        },
        user: { findUnique: jest.fn().mockResolvedValue(ownerUser) },
      });

      const result = await svc.refresh(raw);

      expect(result.accessToken).toBe('access.jwt');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userAgent: undefined,
          ipAddress: undefined,
        }),
      });
    });
  });

  describe('refresh reject paths', () => {
    it('rejects unknown refresh tokens without mutating sessions', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const updateMany = jest.fn();
      const create = jest.fn();

      const { svc } = makeService({
        authSession: { findUnique, updateMany, create },
        user: { findUnique: jest.fn() },
      });

      await expect(svc.refresh('nope')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(updateMany).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects expired session by revoking the row only (not the whole family)', async () => {
      const raw = 'expired-refresh';
      const session = activeSession(raw, {
        expiresAt: new Date(Date.now() - 60_000),
      });
      const findUnique = jest.fn().mockResolvedValue(session);
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const create = jest.fn();

      const { svc } = makeService({
        authSession: { findUnique, updateMany, create },
        user: { findUnique: jest.fn() },
      });

      await expect(svc.refresh(raw)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'sess_1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('revokes the whole family on reuse of an already-revoked refresh', async () => {
      const raw = 'stolen-old-refresh';
      const session = activeSession(raw, { revokedAt: new Date() });
      const findUnique = jest.fn().mockResolvedValue(session);
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const create = jest.fn();

      const { svc } = makeService({
        authSession: { findUnique, updateMany, create },
        user: { findUnique: jest.fn() },
      });

      await expect(svc.refresh(raw)).rejects.toMatchObject({
        response: { code: ApiDomainErrorCode.SESSION_REVOKED },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam_1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('treats lost claim race as reuse and family-revokes', async () => {
      const raw = 'race-refresh';
      const session = activeSession(raw);
      const findUnique = jest.fn().mockResolvedValue(session);
      const updateMany = jest
        .fn()
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });
      const create = jest.fn();

      const { svc } = makeService({
        authSession: { findUnique, updateMany, create },
        user: { findUnique: jest.fn() },
      });

      await expect(svc.refresh(raw)).rejects.toMatchObject({
        response: { code: ApiDomainErrorCode.SESSION_REVOKED },
      });
      expect(updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'sess_1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(updateMany).toHaveBeenNthCalledWith(2, {
        where: { familyId: 'fam_1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(create).not.toHaveBeenCalled();
    });
  });
});

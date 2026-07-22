import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserAccountType } from '@prisma/client';
import { hashToken } from '../../common/security/token';
import { AuthService } from './auth.service';

describe('AuthService refresh rotation', () => {
  const notifications = {} as never;
  const audit = {} as never;
  const mail = {} as never;

  function makeService(prisma: Record<string, unknown>) {
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('access.jwt'),
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
    return new AuthService(
      prisma as never,
      jwt,
      config,
      notifications,
      audit,
      mail,
    );
  }

  const ownerUser = {
    id: 'user_1',
    email: 'owner@example.com',
    name: 'Owner',
    systemRole: 'USER',
    accountType: UserAccountType.VENUE_OWNER,
    memberships: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rotates: revokes old session and issues a new token in the same family', async () => {
    const raw = 'old-refresh-raw-token';
    const session = {
      id: 'sess_1',
      userId: 'user_1',
      familyId: 'fam_1',
      refreshTokenHash: hashToken(raw),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const findUnique = jest.fn().mockResolvedValue(session);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const userFindUnique = jest.fn().mockResolvedValue(ownerUser);
    const create = jest.fn().mockImplementation(async ({ data }) => ({
      id: 'sess_2',
      ...data,
    }));

    const svc = makeService({
      authSession: { findUnique, updateMany, create },
      user: { findUnique: userFindUnique },
    });

    const result = await svc.refresh(raw, '127.0.0.1', 'jest');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'sess_1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        familyId: 'fam_1',
        refreshTokenHash: expect.any(String),
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      }),
    });
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken).not.toBe(raw);
    expect(result.accessToken).toBe('access.jwt');
  });

  it('persists truncated userAgent (max 200) on rotate', async () => {
    const raw = 'old-refresh-raw-token';
    const longUa = 'U'.repeat(250);
    const session = {
      id: 'sess_1',
      userId: 'user_1',
      familyId: 'fam_1',
      refreshTokenHash: hashToken(raw),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const create = jest.fn().mockImplementation(async ({ data }) => ({
      id: 'sess_2',
      ...data,
    }));

    const svc = makeService({
      authSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create,
      },
      user: { findUnique: jest.fn().mockResolvedValue(ownerUser) },
    });

    await svc.refresh(raw, '10.0.0.1', longUa);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userAgent: 'U'.repeat(200),
        ipAddress: '10.0.0.1',
      }),
    });
  });

  it('rejects reuse of a revoked refresh and revokes the family', async () => {
    const raw = 'stolen-old-refresh';
    const session = {
      id: 'sess_1',
      userId: 'user_1',
      familyId: 'fam_1',
      refreshTokenHash: hashToken(raw),
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };
    const findUnique = jest.fn().mockResolvedValue(session);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn();

    const svc = makeService({
      authSession: { findUnique, updateMany, create },
      user: { findUnique: jest.fn() },
    });

    await expect(svc.refresh(raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam_1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('treats lost claim race as reuse and family-revokes', async () => {
    const raw = 'race-refresh';
    const session = {
      id: 'sess_1',
      userId: 'user_1',
      familyId: 'fam_1',
      refreshTokenHash: hashToken(raw),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const findUnique = jest.fn().mockResolvedValue(session);
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 0 }) // claim failed
      .mockResolvedValueOnce({ count: 1 }); // family revoke
    const create = jest.fn();

    const svc = makeService({
      authSession: { findUnique, updateMany, create },
      user: { findUnique: jest.fn() },
    });

    await expect(svc.refresh(raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
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

  it('rejects unknown refresh tokens', async () => {
    const svc = makeService({
      authSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      user: { findUnique: jest.fn() },
    });

    await expect(svc.refresh('nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

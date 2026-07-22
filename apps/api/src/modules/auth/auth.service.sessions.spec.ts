import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hashToken } from '../../common/security/token';
import { AuthService } from './auth.service';

describe('AuthService session list/revoke', () => {
  const notifications = {} as never;
  const audit = {} as never;
  const mail = {} as never;

  function makeService(prisma: Record<string, unknown>) {
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('access.jwt'),
    } as unknown as JwtService;
    const config = {
      get: (_key: string, fallback?: string) => fallback,
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists active non-expired sessions without token fields', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'sess_1',
        createdAt: new Date('2026-07-20T10:00:00Z'),
        userAgent: 'Mozilla/5.0',
        expiresAt: new Date('2026-07-27T10:00:00Z'),
      },
    ]);
    const svc = makeService({
      authSession: { findMany },
    });

    const result = await svc.listAuthSessions('user_1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      select: {
        id: true,
        createdAt: true,
        userAgent: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).not.toHaveProperty('refreshTokenHash');
    expect(result.sessions[0]).not.toHaveProperty('refreshToken');
  });

  it('revokes a session family when the row belongs to the user', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'sess_1',
      familyId: 'fam_1',
      revokedAt: null,
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const svc = makeService({
      authSession: { findFirst, updateMany },
    });

    await expect(
      svc.revokeAuthSession('user_1', 'sess_1'),
    ).resolves.toEqual({ revoked: true });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'sess_1', userId: 'user_1' },
      select: { id: true, familyId: true, revokedAt: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam_1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('404s when revoking a session that is not owned', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const updateMany = jest.fn();
    const svc = makeService({
      authSession: { findFirst, updateMany },
    });

    await expect(
      svc.revokeAuthSession('user_1', 'sess_other'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('revoke-others keeps current family from refresh cookie', async () => {
    const raw = 'current-refresh';
    const findUnique = jest.fn().mockResolvedValue({
      userId: 'user_1',
      familyId: 'fam_keep',
      revokedAt: null,
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const svc = makeService({
      authSession: { findUnique, updateMany },
    });

    await expect(
      svc.revokeOtherAuthSessions('user_1', { refreshToken: raw }),
    ).resolves.toEqual({ revokedCount: 3 });

    expect(findUnique).toHaveBeenCalledWith({
      where: { refreshTokenHash: hashToken(raw) },
      select: { userId: true, familyId: true, revokedAt: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        revokedAt: null,
        familyId: { not: 'fam_keep' },
      },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revoke-others falls back to JWT sid when no refresh cookie', async () => {
    const findFirst = jest.fn().mockResolvedValue({ familyId: 'fam_sid' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const svc = makeService({
      authSession: {
        findUnique: jest.fn(),
        findFirst,
        updateMany,
      },
    });

    await expect(
      svc.revokeOtherAuthSessions('user_1', { sessionId: 'sess_sid' }),
    ).resolves.toEqual({ revokedCount: 1 });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'sess_sid', userId: 'user_1', revokedAt: null },
      select: { familyId: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        revokedAt: null,
        familyId: { not: 'fam_sid' },
      },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revoke-others requires an identifiable current session', async () => {
    const svc = makeService({
      authSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
    });

    await expect(svc.revokeOtherAuthSessions('user_1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

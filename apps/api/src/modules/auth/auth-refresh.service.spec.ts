import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isSessionAbsolutelyExpired,
  isSessionIdleExpired,
  resolveIdleTtlSec,
} from '../../common/auth-session-policy.util';
import { hashToken } from '../../common/security/token';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { AuthRefreshService } from './auth-refresh.service';

describe('AuthRefreshService idle / absolute policy', () => {
  const config = {
    get: (key: string) => {
      if (key === 'AUTH_IDLE_TTL_SEC') return '1800';
      if (key === 'AUTH_IDLE_TTL_REMEMBER_SEC') return '604800';
      return undefined;
    },
  } as unknown as ConfigService;

  function makePrisma(session: Record<string, unknown> | null) {
    return {
      authSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  async function expectSessionRevoked(run: () => Promise<unknown>) {
    try {
      await run();
      throw new Error('expected refresh to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as UnauthorizedException).getResponse()).toMatchObject({
        code: ApiDomainErrorCode.SESSION_REVOKED,
      });
    }
  }

  it('revokes family when idle exceeded', async () => {
    const now = Date.now();
    const prisma = makePrisma({
      id: 's1',
      userId: 'u1',
      familyId: 'f1',
      revokedAt: null,
      rememberMe: false,
      lastActiveAt: new Date(now - 40 * 60 * 1000),
      absoluteExpiresAt: new Date(now + 8 * 60 * 60 * 1000),
      expiresAt: new Date(now + 8 * 60 * 60 * 1000),
    });
    const auth = {
      refreshIssueTokens: jest.fn(),
    };
    const svc = new AuthRefreshService(
      prisma as never,
      config,
      auth as never,
    );

    await expectSessionRevoked(() => svc.refresh('raw-token'));
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId: 'f1', revokedAt: null },
      }),
    );
    expect(auth.refreshIssueTokens).not.toHaveBeenCalled();
  });

  it('revokes family when absolute expiry passed', async () => {
    const now = Date.now();
    const prisma = makePrisma({
      id: 's1',
      userId: 'u1',
      familyId: 'f1',
      revokedAt: null,
      rememberMe: true,
      lastActiveAt: new Date(now),
      absoluteExpiresAt: new Date(now - 1000),
      expiresAt: new Date(now + 1000),
    });
    const auth = { refreshIssueTokens: jest.fn() };
    const svc = new AuthRefreshService(
      prisma as never,
      config,
      auth as never,
    );

    await expectSessionRevoked(() => svc.refresh('raw-token'));
    expect(auth.refreshIssueTokens).not.toHaveBeenCalled();
  });

  it('rotates and preserves remember-me when healthy', async () => {
    const now = Date.now();
    const absolute = new Date(now + 20 * 24 * 60 * 60 * 1000);
    const prisma = makePrisma({
      id: 's1',
      userId: 'u1',
      familyId: 'f1',
      revokedAt: null,
      rememberMe: true,
      lastActiveAt: new Date(now - 60_000),
      absoluteExpiresAt: absolute,
      expiresAt: new Date(now + 60_000),
    });
    const auth = {
      refreshIssueTokens: jest.fn().mockResolvedValue({ ok: true }),
    };
    const svc = new AuthRefreshService(
      prisma as never,
      config,
      auth as never,
    );

    await svc.refresh('raw-token', '1.1.1.1', 'ua');
    expect(auth.refreshIssueTokens).toHaveBeenCalledWith(
      'u1',
      '1.1.1.1',
      'ua',
      {
        familyId: 'f1',
        rememberMe: true,
        absoluteExpiresAt: absolute,
      },
    );
  });

  it('policy helpers agree with idle defaults', () => {
    expect(resolveIdleTtlSec(false)).toBe(1800);
    expect(
      isSessionIdleExpired({
        lastActiveAt: new Date(Date.now() - 2000),
        idleTtlSec: 1,
      }),
    ).toBe(true);
    expect(
      isSessionAbsolutelyExpired({
        absoluteExpiresAt: new Date(Date.now() - 1),
      }),
    ).toBe(true);
    expect(hashToken('x')).toHaveLength(64);
  });
});

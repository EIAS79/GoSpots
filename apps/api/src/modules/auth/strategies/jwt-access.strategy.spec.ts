import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserAccountType } from '@prisma/client';
import { ApiDomainErrorCode } from '../../../common/api-error.codes';
import { PrismaService } from '../../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth.service';
import { JwtAccessStrategy } from './jwt-access.strategy';

function expectUnauthorizedWithCode(err: unknown, code: string) {
  expect(err).toBeInstanceOf(UnauthorizedException);
  expect((err as UnauthorizedException).getResponse()).toMatchObject({ code });
}

describe('JwtAccessStrategy', () => {
  const findFirst = jest.fn();
  const prisma = { authSession: { findFirst } } as unknown as PrismaService;
  const config = {
    getOrThrow: jest.fn().mockReturnValue('dev-jwt-access-secret-min-32-chars!!'),
  } as unknown as ConfigService;

  let strategy: JwtAccessStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtAccessStrategy(config, prisma);
  });

  const ownerPayload: JwtAccessPayload = {
    sub: 'user_owner',
    sysRole: 'USER',
    email: 'owner@example.com',
    acct: UserAccountType.VENUE_OWNER,
  };

  const staffPayload: JwtAccessPayload = {
    sub: 'user_staff',
    sysRole: 'USER',
    email: 'alice@arcade.locora',
    acct: UserAccountType.VENUE_STAFF,
    sid: 'sess_1',
  };

  it('passes through non-staff payloads without session lookup', async () => {
    await expect(strategy.validate(ownerPayload)).resolves.toBe(ownerPayload);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('throws SESSION_REVOKED when staff payload has no sid', async () => {
    const payload = { ...staffPayload, sid: undefined };

    await expect(strategy.validate(payload)).rejects.toMatchObject({
      response: { code: ApiDomainErrorCode.SESSION_REVOKED },
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('throws SESSION_REVOKED when staff session is missing or revoked', async () => {
    findFirst.mockResolvedValue(null);

    try {
      await strategy.validate(staffPayload);
      throw new Error('expected UnauthorizedException');
    } catch (err) {
      expectUnauthorizedWithCode(err, ApiDomainErrorCode.SESSION_REVOKED);
    }

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: staffPayload.sid,
        userId: staffPayload.sub,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
    });
  });

  it('returns staff payload when session is active', async () => {
    findFirst.mockResolvedValue({ id: staffPayload.sid });

    await expect(strategy.validate(staffPayload)).resolves.toBe(staffPayload);
  });

  it('checks session for staff detected via login email suffix', async () => {
    const payload: JwtAccessPayload = {
      sub: 'user_staff',
      sysRole: 'USER',
      email: 'bob@shop.gospots',
      sid: 'sess_2',
    };
    findFirst.mockResolvedValue({ id: payload.sid });

    await expect(strategy.validate(payload)).resolves.toBe(payload);
    expect(findFirst).toHaveBeenCalled();
  });
});

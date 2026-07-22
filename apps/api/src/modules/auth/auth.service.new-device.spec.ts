import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserAccountType } from '@prisma/client';
import { hashPassword } from '../../common/security/password';
import { AuthService } from './auth.service';

describe('AuthService login new-device alert', () => {
  const password = 'SecurePass1x';
  let passwordHash: string;

  const mail = { send: jest.fn() };
  const notifications = { recordSignIn: jest.fn() };
  const audit = { record: jest.fn() };

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mail.send.mockResolvedValue({ sent: true });
    notifications.recordSignIn.mockResolvedValue(undefined);
  });

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
      notifications as never,
      audit as never,
      mail as never,
    );
  }

  function ownerRow() {
    return {
      id: 'user_owner',
      email: 'owner@example.com',
      name: 'Owner',
      passwordHash,
      accountType: UserAccountType.VENUE_OWNER,
      systemRole: 'USER',
      failedLogins: 0,
      lockedUntil: null,
      passwordSetAt: new Date(),
      memberships: [
        {
          isActive: true,
          role: 'OWNER',
          shopId: 'shop_1',
          permissions: '',
          permissionRows: [],
          shop: {
            slug: 'demo',
            dashboardKey: 'key',
            subscription: { tier: 'STARTER' },
          },
        },
      ],
    };
  }

  function loginPrisma(opts: {
    priorAgents: Array<string | null>;
    mailImpl?: () => Promise<unknown>;
  }) {
    const user = ownerRow();
    const userFindUnique = jest
      .fn()
      .mockResolvedValueOnce(user) // login lookup by email
      .mockResolvedValue(user); // issueTokens
    const userUpdate = jest.fn().mockResolvedValue(user);
    const membershipFindFirst = jest.fn().mockResolvedValue({
      shopId: 'shop_1',
      role: 'OWNER',
      isActive: true,
    });
    const sessionFindMany = jest.fn().mockResolvedValue(
      opts.priorAgents.map((userAgent) => ({ userAgent })),
    );
    const sessionCreate = jest.fn().mockImplementation(async ({ data }) => ({
      id: 'sess_new',
      ...data,
    }));

    if (opts.mailImpl) {
      mail.send.mockImplementation(opts.mailImpl);
    }

    return {
      prisma: {
        user: { findUnique: userFindUnique, update: userUpdate },
        membership: { findFirst: membershipFindFirst },
        authSession: {
          findMany: sessionFindMany,
          create: sessionCreate,
          updateMany: jest.fn(),
        },
      },
      sessionFindMany,
    };
  }

  it('sends new-sign-in mail when UA differs from all active sessions', async () => {
    const { prisma } = loginPrisma({
      priorAgents: ['Mozilla/5.0 OldBrowser'],
    });
    const svc = makeService(prisma);

    await svc.login(
      { login: 'owner@example.com', password },
      '127.0.0.1',
      'Mozilla/5.0 NewBrowser',
    );

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        subject: expect.stringMatching(/new sign-in/i),
        shopId: 'shop_1',
        required: false,
        text: expect.stringContaining('Mozilla/5.0 NewBrowser'),
      }),
    );
  });

  it('skips mail when an active session already has the same UA', async () => {
    const { prisma } = loginPrisma({
      priorAgents: ['Mozilla/5.0 Same'],
    });
    const svc = makeService(prisma);

    await svc.login(
      { login: 'owner@example.com', password },
      '127.0.0.1',
      'Mozilla/5.0 Same',
    );

    expect(mail.send).not.toHaveBeenCalled();
  });

  it('sends mail on first login (no active sessions)', async () => {
    const { prisma } = loginPrisma({ priorAgents: [] });
    const svc = makeService(prisma);

    await svc.login(
      { login: 'owner@example.com', password },
      '127.0.0.1',
      'Mozilla/5.0 First',
    );

    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('still returns tokens when mail.send throws', async () => {
    const { prisma } = loginPrisma({
      priorAgents: [],
      mailImpl: async () => {
        throw new Error('resend down');
      },
    });
    const svc = makeService(prisma);

    const tokens = await svc.login(
      { login: 'owner@example.com', password },
      '127.0.0.1',
      'Mozilla/5.0',
    );

    expect(tokens).toEqual(
      expect.objectContaining({
        accessToken: 'access.jwt',
        refreshToken: expect.any(String),
      }),
    );
    expect(mail.send).toHaveBeenCalled();
  });
});

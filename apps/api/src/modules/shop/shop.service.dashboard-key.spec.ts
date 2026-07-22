import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword } from '../../common/security/password';
import { ShopService } from './shop.service';

describe('ShopService.rotateDashboardKey', () => {
  const actor = {
    sub: 'user_1',
    shopId: 'shop_1',
    shopRole: 'OWNER' as const,
    perms: '',
  };

  function makeService(prisma: Record<string, unknown>) {
    return new ShopService(
      prisma as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
    );
  }

  it('rejects non-owner', async () => {
    const service = makeService({
      user: { findUnique: jest.fn() },
      shop: { findUnique: jest.fn(), update: jest.fn() },
    });
    await expect(
      service.rotateDashboardKey(
        { ...actor, shopRole: 'MANAGER' },
        { password: 'CorrectHorse1' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires password confirmation', async () => {
    const service = makeService({
      user: { findUnique: jest.fn() },
      shop: { findUnique: jest.fn(), update: jest.fn() },
    });
    await expect(service.rotateDashboardKey(actor, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects wrong password before rotating', async () => {
    const passwordHash = await hashPassword('CorrectHorse1');
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ passwordHash }),
      },
      shop: { findUnique: jest.fn(), update: jest.fn() },
    };
    const service = makeService(prisma);
    await expect(
      service.rotateDashboardKey(actor, { password: 'WrongPassword1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.shop.update).not.toHaveBeenCalled();
  });

  it('rotates key, audits without logging the new key, returns dashboardPath', async () => {
    const passwordHash = await hashPassword('CorrectHorse1');
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ passwordHash }),
      },
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'shop_1',
          slug: 'arcade',
          dashboardKey: 'oldKey12345',
        }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            slug: 'arcade',
            dashboardKey: data.dashboardKey,
          }),
        ),
      },
    };
    const service = new ShopService(
      prisma as never,
      audit as never,
      {} as never,
      {} as never,
    );

    const out = await service.rotateDashboardKey(actor, {
      password: 'CorrectHorse1',
    });

    expect(out.slug).toBe('arcade');
    expect(out.dashboardPath.startsWith('arcade--')).toBe(true);
    expect(out.dashboardPath).not.toContain('oldKey12345');
    expect(prisma.shop.update).toHaveBeenCalledTimes(1);
    const updateData = prisma.shop.update.mock.calls[0][0].data as {
      dashboardKey: string;
      dashboardKeyHash: string;
    };
    expect(updateData.dashboardKeyHash).toHaveLength(64);
    expect(updateData.dashboardKey).toBe(out.dashboardPath.split('--')[1]);
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        action: 'shop.dashboard_key.rotate',
        meta: expect.objectContaining({ shopId: 'shop_1', rotated: true }),
      }),
    );
    const meta = audit.record.mock.calls[0][1].meta as Record<string, unknown>;
    expect(JSON.stringify(meta)).not.toContain(out.dashboardPath.split('--')[1]);
  });
});

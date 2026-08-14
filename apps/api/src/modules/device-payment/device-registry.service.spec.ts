import { DeviceStatus, DeviceType } from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';
import { DeviceRegistryService } from './device-registry.service';

function actor(shopId: string): JwtAccessPayload {
  return {
    sub: 'owner-1',
    shopId,
    shopRole: 'OWNER',
    perms: '*',
  } as JwtAccessPayload;
}

describe('DeviceRegistryService', () => {
  it('always scopes the device list to the actor Shop and derives online from lastSeenAt', async () => {
    const prisma: any = {
      device: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'device-1',
            shopId: 'shop-1',
            label: 'Front POS',
            type: DeviceType.POS,
            provider: null,
            status: DeviceStatus.ACTIVE,
            metadata: null,
            lastSeenAt: new Date(),
            terminal: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
    };
    const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
    const service = new DeviceRegistryService(prisma, flags, { record: jest.fn() } as any);
    const result = await service.list(actor('shop-1'));
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: 'shop-1' } }),
    );
    expect(result.devices[0]).toMatchObject({
      label: 'Front POS',
      type: DeviceType.POS,
      online: true,
    });
  });

  it('refuses a terminal without a provider', async () => {
    const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
    const service = new DeviceRegistryService({} as any, flags, { record: jest.fn() } as any);
    await expect(
      service.create(actor('shop-1'), {
        label: 'Terminal 1',
        type: DeviceType.PAYMENT_TERMINAL,
      }),
    ).rejects.toThrow(/provider is required/i);
  });

  it('rejects a cross-venue device claim without mutating it', async () => {
    const prisma: any = {
      device: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
    };
    const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
    const service = new DeviceRegistryService(prisma, flags, { record: jest.fn() } as any);
    await expect(
      service.claim(actor('shop-1'), 'device-from-shop-2', { expectedVersion: 1 }),
    ).rejects.toThrow(/not found/i);
    expect(prisma.device.findFirst).toHaveBeenCalledWith({
      where: { id: 'device-from-shop-2', shopId: 'shop-1' },
    });
    expect(prisma.device.updateMany).not.toHaveBeenCalled();
  });

  it('allows only one concurrent claim for the same version', async () => {
    const existing = {
      id: 'device-1',
      shopId: 'shop-1',
      status: DeviceStatus.ACTIVE,
      version: 1,
    };
    let claimed = false;
    const prisma: any = {
      device: {
        findFirst: jest.fn(async (query: any) =>
          query.include
            ? { ...existing, claimState: 'CLAIMED', claimedAt: new Date(), claimedById: 'owner-1', label: 'POS', type: DeviceType.POS, provider: null, metadata: null, lastSeenAt: null, terminal: null, createdAt: new Date(), updatedAt: new Date(), version: 2 }
            : existing,
        ),
        updateMany: jest.fn(async () => {
          if (claimed) return { count: 0 };
          claimed = true;
          return { count: 1 };
        }),
      },
    };
    const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
    const service = new DeviceRegistryService(prisma, flags, { record: jest.fn() } as any);
    const results = await Promise.allSettled([
      service.claim(actor('shop-1'), 'device-1', { expectedVersion: 1 }),
      service.claim(actor('shop-1'), 'device-1', { expectedVersion: 1 }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});

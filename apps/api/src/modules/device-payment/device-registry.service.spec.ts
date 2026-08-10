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
    const service = new DeviceRegistryService(prisma, flags);
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
    const service = new DeviceRegistryService({} as any, flags);
    await expect(
      service.create(actor('shop-1'), {
        label: 'Terminal 1',
        type: DeviceType.PAYMENT_TERMINAL,
      }),
    ).rejects.toThrow(/provider is required/i);
  });
});

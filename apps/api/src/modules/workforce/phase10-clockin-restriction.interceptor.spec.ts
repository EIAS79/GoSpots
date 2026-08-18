import { firstValueFrom, of } from 'rxjs';
import type { ExecutionContext } from '@nestjs/common';
import { Phase10ClockInRestrictionInterceptor } from './phase10-clockin-restriction.interceptor';

function context(body: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        originalUrl: '/api/v1/workforce/clock-in',
        body,
        user: { sub: 'staff-user', shopId: 'shop-a', shopRole: 'CASHIER', perms: '' },
      }),
    }),
  } as unknown as ExecutionContext;
}

function policy(overrides: Record<string, unknown> = {}) {
  return {
    shopId: 'shop-a',
    clockInDeviceRequired: false,
    clockInAllowedDeviceIds: [],
    clockInLocationRequired: false,
    clockInLatitude: null,
    clockInLongitude: null,
    clockInRadiusMeters: 100,
    ...overrides,
  };
}

describe('Phase10ClockInRestrictionInterceptor', () => {
  it('leaves existing venues unrestricted by default', async () => {
    const prisma = {
      workforcePolicy: { findUnique: jest.fn().mockResolvedValue(policy()) },
      device: { findFirst: jest.fn() },
    };
    const interceptor = new Phase10ClockInRestrictionInterceptor(prisma as never);
    const next = { handle: jest.fn(() => of('ok')) };
    await expect(firstValueFrom(interceptor.intercept(context({}), next))).resolves.toBe('ok');
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(prisma.device.findFirst).not.toHaveBeenCalled();
  });

  it('requires an active same-venue device when enabled', async () => {
    const prisma = {
      workforcePolicy: {
        findUnique: jest.fn().mockResolvedValue(policy({ clockInDeviceRequired: true })),
      },
      device: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const interceptor = new Phase10ClockInRestrictionInterceptor(prisma as never);
    const next = { handle: jest.fn(() => of('ok')) };

    await expect(firstValueFrom(interceptor.intercept(context({}), next))).rejects.toThrow(
      /active registered venue device/i,
    );
    await expect(
      firstValueFrom(interceptor.intercept(context({ deviceId: 'foreign-device' }), next)),
    ).rejects.toThrow(/does not belong to this venue/i);

    prisma.device.findFirst.mockResolvedValue({ id: 'device-a' });
    await expect(
      firstValueFrom(interceptor.intercept(context({ deviceId: 'device-a' }), next)),
    ).resolves.toBe('ok');
    expect(prisma.device.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'device-a', shopId: 'shop-a', status: 'ACTIVE' },
      select: { id: true },
    });
  });

  it('enforces an optional configured geofence', async () => {
    const prisma = {
      workforcePolicy: {
        findUnique: jest.fn().mockResolvedValue(
          policy({
            clockInLocationRequired: true,
            clockInLatitude: 52.2297,
            clockInLongitude: 21.0122,
            clockInRadiusMeters: 100,
          }),
        ),
      },
      device: { findFirst: jest.fn() },
    };
    const interceptor = new Phase10ClockInRestrictionInterceptor(prisma as never);
    const next = { handle: jest.fn(() => of('ok')) };

    await expect(
      firstValueFrom(interceptor.intercept(context({ latitude: 52.2300, longitude: 21.0122 }), next)),
    ).resolves.toBe('ok');

    await expect(
      firstValueFrom(interceptor.intercept(context({ latitude: 52.24, longitude: 21.0122 }), next)),
    ).rejects.toThrow(/outside the configured venue radius/i);
  });
});
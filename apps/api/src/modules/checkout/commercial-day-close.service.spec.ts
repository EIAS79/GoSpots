import type { JwtAccessPayload } from '../auth/auth.service';
import { CommercialDayCloseService } from './commercial-day-close.service';

function actor(role: 'OWNER' | 'MANAGER' | 'STAFF'): JwtAccessPayload {
  return {
    sub: `${role.toLowerCase()}-1`,
    shopId: 'shop-1',
    shopRole: role,
    perms: role === 'STAFF' ? 'cash.close' : '*',
  } as JwtAccessPayload;
}

describe('CommercialDayCloseService', () => {
  it('blocks staff from closing a commercial day while unresolved tabs remain', async () => {
    const tx: any = {
      $queryRaw: jest.fn(),
      commercialDayClose: { findUnique: jest.fn().mockResolvedValue(null) },
      commercialPolicy: {
        upsert: jest.fn().mockResolvedValue({
          allowCashShiftCloseWithOpenTabs: false,
        }),
      },
      guestCheck: {
        findMany: jest.fn().mockResolvedValue([{ id: 'check-1' }]),
      },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new CommercialDayCloseService(
      prisma,
      { record: jest.fn() } as any,
    );

    await expect(
      service.close(actor('STAFF'), { businessDate: '2026-08-15' }),
    ).rejects.toThrow(/unresolved GuestChecks/i);
  });

  it('requires and records an explicit manager reason when overriding open tabs', async () => {
    const create = jest.fn(async ({ data }: any) => ({
      id: 'close-1',
      ...data,
      closedAt: new Date('2026-08-15T22:00:00Z'),
    }));
    const tx: any = {
      $queryRaw: jest.fn(),
      commercialDayClose: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
      commercialPolicy: {
        upsert: jest.fn().mockResolvedValue({
          allowCashShiftCloseWithOpenTabs: false,
        }),
      },
      guestCheck: {
        findMany: jest.fn().mockResolvedValue([{ id: 'check-1' }]),
      },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new CommercialDayCloseService(prisma, audit);

    await expect(
      service.close(actor('MANAGER'), { businessDate: '2026-08-15' }),
    ).rejects.toThrow(/requires a reason/i);

    const result = await service.close(actor('MANAGER'), {
      businessDate: '2026-08-15',
      reason: 'Overnight private event remains open',
    });
    expect(result.overrideUsed).toBe(true);
    expect(result.openTabCount).toBe(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overrideUsed: true,
          overrideReason: 'Overnight private event remains open',
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalled();
  });
});

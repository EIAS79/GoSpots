import { Prisma } from '@prisma/client';
import { Phase10PerformanceService } from './phase10-performance.service';

const baseRow = {
  membershipId: 'membership-a',
  displayName: 'Employee A',
  salesCount: 2,
  salesMinor: 10000,
  averageCheckMinor: 5000,
  refundCount: 0,
  refundRate: 0,
  voidCount: 0,
  voidRate: 0,
  discountCount: 0,
  discountRate: 0,
  workedHours: 2,
  overtimeSeconds: 0,
  lateCount: 0,
  lateSeconds: 0,
  breakComplianceViolations: 0,
  exceptionCount: 0,
  upsellPerformance: null,
  serviceTimingSeconds: null,
  note: 'Operational metrics are review aids only.',
};

function dependencies() {
  const prisma = {
    membership: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'membership-a', userId: 'user-a' },
      ]),
    },
    operationsSession: {
      findMany: jest.fn().mockResolvedValue([
        { createdById: 'user-a' },
        { createdById: 'user-a' },
      ]),
    },
    cashSession: {
      findMany: jest.fn().mockResolvedValue([
        { closedById: 'user-a', variance: new Prisma.Decimal('1.50') },
        { closedById: 'user-a', variance: new Prisma.Decimal('-0.25') },
      ]),
    },
    prepStatusEvent: {
      findMany: jest.fn().mockResolvedValue([
        {
          actorUserId: 'user-a',
          ticketId: 'ticket-a',
          createdAt: new Date('2026-08-18T10:01:00.000Z'),
        },
      ]),
    },
    prepTicket: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'ticket-a',
          openedAt: new Date('2026-08-18T09:59:00.000Z'),
          startedAt: new Date('2026-08-18T10:00:00.000Z'),
        },
      ]),
    },
    shop: {
      findUnique: jest.fn().mockResolvedValue({ currency: 'PLN' }),
    },
  };
  const accountability = {
    performance: jest.fn().mockResolvedValue([baseRow]),
  };
  const workforce = {
    report: jest.fn().mockResolvedValue({
      rows: [{ membershipId: 'membership-a', laborCostMinor: 2500 }],
    }),
  };
  return { prisma, accountability, workforce };
}

describe('Phase10PerformanceService', () => {
  it('derives resource, cash, labor-to-sales and KDS metrics from canonical facts', async () => {
    const { prisma, accountability, workforce } = dependencies();
    const service = new Phase10PerformanceService(
      prisma as never,
      accountability as never,
      workforce as never,
    );
    const rows = await service.performance(
      { sub: 'owner-a', shopId: 'shop-a', shopRole: 'OWNER', perms: '' } as never,
      30,
    );

    expect(rows[0]).toMatchObject({
      resourceSessionCount: 2,
      cashVariance: '1.2500',
      cashVarianceCurrency: 'PLN',
      cashVarianceCloseCount: 2,
      laborCostMinor: 2500,
      laborToSalesBasisPoints: 2500,
      kdsReadyCount: 1,
      kdsAverageReadySeconds: 60,
      serviceTimingSeconds: 60,
    });
  });

  it('does not expose labor cost or labor-to-sales to non-owner readers', async () => {
    const { prisma, accountability, workforce } = dependencies();
    const service = new Phase10PerformanceService(
      prisma as never,
      accountability as never,
      workforce as never,
    );
    const rows = await service.performance(
      { sub: 'manager-a', shopId: 'shop-a', shopRole: 'MANAGER', perms: 'staff.read' } as never,
      30,
    );

    expect(rows[0].laborCostMinor).toBeNull();
    expect(rows[0].laborToSalesBasisPoints).toBeNull();
  });
});
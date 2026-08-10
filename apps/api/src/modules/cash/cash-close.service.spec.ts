import {
  CashSessionStatus,
  Prisma,
  ShiftCloseApprovalStatus,
} from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CashService } from './cash.service';

function d(value: string | number) {
  return new Prisma.Decimal(value);
}

const owner = {
  sub: 'owner-1',
  shopId: 'shop-1',
  shopRole: 'OWNER',
  perms: '*',
} as JwtAccessPayload;

describe('CashService approved close path', () => {
  it('closes after an above-threshold variance is approved and freezes reconciliation values', async () => {
    const current: any = {
      id: 'session-1',
      shopId: 'shop-1',
      drawerId: 'drawer-1',
      status: CashSessionStatus.OPEN,
      openedById: 'cashier-1',
      openingFloat: d(100),
      currency: 'PLN',
      version: 1,
      movements: [],
    };
    const closed: any = {
      ...current,
      status: CashSessionStatus.CLOSED,
      version: 2,
      drawer: {
        id: 'drawer-1',
        shopId: 'shop-1',
        name: 'Main drawer',
        isActive: true,
        createdAt: new Date('2026-08-10T08:00:00Z'),
        updatedAt: new Date('2026-08-10T08:00:00Z'),
      },
      closedExpectedCash: d(100),
      countedCash: d(110),
      variance: d(10),
      closedAt: new Date('2026-08-10T09:00:00Z'),
      closedById: 'owner-1',
      closeNote: null,
      createdAt: new Date('2026-08-10T08:00:00Z'),
      updatedAt: new Date('2026-08-10T09:00:00Z'),
      counts: [],
      approvals: [],
    };

    const update = jest.fn().mockResolvedValue(closed);
    const approvalFind = jest.fn().mockResolvedValue({
      id: 'approval-1',
      status: ShiftCloseApprovalStatus.APPROVED,
    });
    const tx: any = {
      $queryRaw: jest.fn(),
      cashSession: {
        findFirst: jest.fn().mockResolvedValue(current),
        update,
      },
      cashCount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'count-1',
          countedAmount: d(110),
          expectedCashAtSubmission: d(100),
        }),
      },
      shop: {
        findUnique: jest.fn().mockResolvedValue({
          cashSessionRequired: true,
          cashBlindCountEnabled: true,
          cashVarianceApprovalThreshold: d(5),
          currency: 'PLN',
        }),
      },
      shiftCloseApproval: { findFirst: approvalFind },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new CashService(
      prisma,
      { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any,
      outbox as any,
      audit as any,
    );

    const result = await service.closeSession(owner, 'session-1', {
      cashCountId: 'count-1',
    });

    expect(approvalFind).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-1',
        cashSessionId: 'session-1',
        cashCountId: 'count-1',
        status: ShiftCloseApprovalStatus.APPROVED,
      },
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data).toMatchObject({
      status: CashSessionStatus.CLOSED,
      closedById: 'owner-1',
    });
    expect(update.mock.calls[0][0].data.closedExpectedCash.toFixed(4)).toBe(
      '100.0000',
    );
    expect(update.mock.calls[0][0].data.countedCash.toFixed(4)).toBe(
      '110.0000',
    );
    expect(update.mock.calls[0][0].data.variance.toFixed(4)).toBe('10.0000');
    expect(result.status).toBe(CashSessionStatus.CLOSED);
    expect(result.closedExpectedCash).toBe('100.0000');
    expect(result.countedCash).toBe('110.0000');
    expect(result.variance).toBe('10.0000');
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

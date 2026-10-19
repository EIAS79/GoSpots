import { PrismaService } from '../../prisma/prisma.service';
import { PaymentConnectorRegistry } from './connectors/payment-connector.registry';
import { ForbiddenException } from '@nestjs/common';
import { OfflinePaymentMinimumRole, PaymentOperationState, Prisma } from '@prisma/client';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { MoneyOperationsService } from './money-operations.service';

function actor(role: string, perms = '*'): JwtAccessPayload {
  return {
    sub: 'user-1',
    shopId: 'shop-1',
    shopRole: role,
    perms,
  } as JwtAccessPayload;
}

function harness(overrides: Record<string, any> = {}) {
  const connector = {
    provider: 'fake',
    capabilities: jest.fn().mockResolvedValue({
      payments: true,
      cancel: true,
      refunds: true,
      terminal: false,
      offlineCollection: false,
    }),
    health: jest.fn().mockResolvedValue({ ok: true }),
  };
  const prisma: any = {
    offlinePaymentPolicy: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    paymentOperation: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) } }),
    },
    ...overrides,
  };
  const registry: any = { resolve: jest.fn().mockReturnValue(connector) };
  return { service: new MoneyOperationsService(prisma, registry), prisma, connector };
}

describe('MoneyOperationsService', () => {
  it('requires the dedicated high-risk refund.execute permission', () => {
    const h = harness();
    const cashier = actor('CASHIER', PERMISSIONS.CHECKOUT_WRITE);
    expect(() => h.service.assertRefundAuthorized(cashier)).toThrow(ForbiddenException);
    expect(h.service.assertRefundAuthorized(actor('MANAGER', PERMISSIONS.REFUND_EXECUTE))).toBe('shop-1');
  });

  it('keeps offline collection disabled when the provider does not advertise the capability', async () => {
    const h = harness();
    const result = await h.service.evaluateOfflineCollection(actor('OWNER'), 'fake', '10.00');
    expect(result).toEqual({ allowed: false, reason: 'CONNECTOR_OFFLINE_UNSUPPORTED' });
    expect(h.prisma.paymentOperation.aggregate).not.toHaveBeenCalled();
  });

  it('enforces single and cumulative offline risk ceilings', async () => {
    const h = harness();
    h.connector.capabilities.mockResolvedValue({
      payments: true,
      cancel: true,
      refunds: true,
      terminal: true,
      offlineCollection: true,
    });
    h.prisma.offlinePaymentPolicy.findUnique.mockResolvedValue({
      shopId: 'shop-1',
      enabled: true,
      maxSingleAmount: new Prisma.Decimal('100.0000'),
      maxCumulativePendingAmount: new Prisma.Decimal('150.0000'),
      minimumRole: OfflinePaymentMinimumRole.MANAGER,
      customerWarningText: 'Offline card payment is pending provider forwarding.',
      forceReconnectAfterMinutes: 15,
    });
    h.prisma.paymentOperation.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal('90.0000') },
    });

    await expect(h.service.evaluateOfflineCollection(actor('OWNER'), 'fake', '101.00')).resolves.toMatchObject({
      allowed: false,
      reason: 'OFFLINE_SINGLE_LIMIT_EXCEEDED',
    });
    await expect(h.service.evaluateOfflineCollection(actor('OWNER'), 'fake', '70.00')).resolves.toMatchObject({
      allowed: false,
      reason: 'OFFLINE_CUMULATIVE_LIMIT_EXCEEDED',
      pendingAmount: '90.0000',
    });
    await expect(h.service.evaluateOfflineCollection(actor('OWNER'), 'fake', '50.00')).resolves.toMatchObject({
      allowed: true,
      pendingAmount: '90.0000',
      forceReconnectAfterMinutes: 15,
    });
    expect(h.prisma.paymentOperation.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 'shop-1',
          reconciliationRequired: true,
          state: { in: [PaymentOperationState.UNKNOWN] },
        }),
      }),
    );
  });

  it('rejects offline collection below the configured operator role', async () => {
    const h = harness();
    h.connector.capabilities.mockResolvedValue({ payments: true, cancel: true, refunds: true, terminal: true, offlineCollection: true });
    h.prisma.offlinePaymentPolicy.findUnique.mockResolvedValue({
      shopId: 'shop-1',
      enabled: true,
      maxSingleAmount: new Prisma.Decimal('100.0000'),
      maxCumulativePendingAmount: new Prisma.Decimal('200.0000'),
      minimumRole: OfflinePaymentMinimumRole.MANAGER,
      customerWarningText: null,
      forceReconnectAfterMinutes: 30,
    });
    const result = await h.service.evaluateOfflineCollection(
      actor('CASHIER', PERMISSIONS.PAYMENT_WRITE),
      'fake',
      '20.00',
    );
    expect(result).toEqual({ allowed: false, reason: 'OFFLINE_ROLE_NOT_ALLOWED' });
  });
});

describe('financial exception reconciliation atomicity (fake Prisma transaction)', () => {
  function fixture(issueWriteFails = false) {
    const decimal = (v: string) => new Prisma.Decimal(v);
    const tx = {
      financialReconciliationRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn().mockResolvedValue({
          id: 'run-1',
          shopId: 'shop-1',
          status: 'MISMATCH',
          mismatchCount: 1,
          totals: {},
          issues: [{ id: 'issue-1' }],
        }),
      },
      financialReconciliationIssue: {
        createMany: issueWriteFails
          ? jest
              .fn()
              .mockRejectedValue(new Error('simulated issue insert failure'))
          : jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    // Simulated commit-on-success store. Callback writes are staged by the
    // fake transaction; an exception must leave no durable RUNNING entry.
    const committed = { runIds: [] as string[], issueIds: [] as string[] };
    const prisma = {
      financialReconciliationRun: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      checkSettlement: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { total: decimal('100') } }),
      },
      payment: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: decimal('100') } }),
      },
      ledgerEntry: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { amount: decimal('100') } })
          .mockResolvedValueOnce({ _sum: { amount: decimal('0') } }),
      },
      refund: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: decimal('0') } }),
      },
      cashSession: { findMany: jest.fn().mockResolvedValue([]) },
      paymentOperation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'unknown-operation',
            amount: decimal('10'),
            state: PaymentOperationState.UNKNOWN,
            provider: 'adyen',
            providerPaymentId: null,
          },
        ]),
      },
      complianceRequest: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: (tx: typeof tx) => Promise<unknown>) => {
        const result = await cb(tx);
        committed.runIds.push('run-1');
        if (tx.financialReconciliationIssue.createMany.mock.calls.length) {
          committed.issueIds.push('issue-1');
        }
        return result;
      }),
    };
    const service = new MoneyOperationsService(prisma as unknown as PrismaService, {} as unknown as PaymentConnectorRegistry);
    const dto = {
      fromInclusive: '2026-10-13T00:00:00Z',
      toExclusive: '2026-10-14T00:00:00Z',
      businessDate: '2026-10-13',
      correlationId: 'reconciliation-local-1',
      currency: 'PLN',
    };
    return { prisma, tx, service, dto, committed };
  }

  it('creates run, unresolved-provider issue, and final status inside one transaction', async () => {
    const h = fixture();
    await h.service.runFinancialReconciliation(actor('OWNER'), h.dto);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.financialReconciliationRun.create).toHaveBeenCalledTimes(1);
    expect(h.tx.financialReconciliationIssue.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          shopId: 'shop-1',
          currency: 'PLN',
          runId: 'run-1',
          type: 'PAYMENT_REQUIRES_RECONCILIATION',
          entityId: 'unknown-operation',
        }),
      ],
    });
    expect(h.tx.financialReconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: { status: 'MISMATCH', mismatchCount: 1, completedAt: expect.any(Date) as unknown },
      }),
    );
    expect('create' in h.prisma.financialReconciliationRun).toBe(false);
    expect(h.committed).toEqual({ runIds: ['run-1'], issueIds: ['issue-1'] });
  });

  it('returns an existing tenant-scoped correlation run without duplicate writes', async () => {
    const h = fixture();
    h.prisma.financialReconciliationRun.findUnique.mockResolvedValue({
      id: 'prior-run',
      shopId: 'shop-1',
      currency: 'PLN',
      status: 'CLEAR',
      mismatchCount: 0,
      issues: [],
    });
    const existing = await h.service.runFinancialReconciliation(actor('OWNER'), h.dto);
    expect(existing).toMatchObject({ id: 'prior-run', status: 'CLEAR', mismatchCount: 0 });
    expect(h.prisma.financialReconciliationRun.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId_businessDate_currency_correlationId: {
          shopId: 'shop-1',
          businessDate: new Date('2026-10-13'),
          currency: 'PLN',
          correlationId: 'reconciliation-local-1',
        } },
      }),
    );
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.committed).toEqual({ runIds: [], issueIds: [] });
  });

  it('rejects on issue insertion failure inside transaction without finalizing RUNNING', async () => {
    const h = fixture(true);
    await expect(
      h.service.runFinancialReconciliation(actor('OWNER'), h.dto),
    ).rejects.toThrow('simulated issue insert failure');
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.financialReconciliationRun.create).toHaveBeenCalledTimes(1);
    expect(h.tx.financialReconciliationIssue.createMany).toHaveBeenCalledTimes(
      1,
    );
    expect(h.tx.financialReconciliationRun.update).not.toHaveBeenCalled();
    expect(h.committed).toEqual({ runIds: [], issueIds: [] });
  });
});

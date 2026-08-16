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

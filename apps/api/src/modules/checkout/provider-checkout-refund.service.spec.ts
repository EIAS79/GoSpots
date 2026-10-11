import { NotFoundException } from '@nestjs/common';
import { RefundState } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import type { PaymentDomainService } from '../device-payment/payment-domain.service';
import { ProviderCheckoutRefundService } from './provider-checkout-refund.service';

const actor = {
  sub: 'operator-a',
  shopId: 'shop-a',
  shopRole: 'OWNER',
  perms: '*',
} as JwtAccessPayload;

function priorRefund() {
  return {
    id: 'refund-a',
    paymentOperationId: 'op-a',
    idempotencyKey: 'key-a',
    reason: 'Original reason',
    providerRefundId: 'provider-refund-a',
    state: RefundState.SUCCEEDED,
    amount: '10.0000',
    currency: 'PLN',
    errorCode: null,
    errorMessage: null,
    createdAt: new Date('2026-10-11T00:00:00.000Z'),
    updatedAt: new Date('2026-10-11T00:00:00.000Z'),
    allocations: [],
  };
}

describe('ProviderCheckoutRefundService tenant and replay firewall', () => {
  function makeHarness(refunds: Array<ReturnType<typeof priorRefund>> = []) {
    const prisma = {
      paymentOperation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'op-a',
          shopId: 'shop-a',
          settlementId: 'settlement-a',
          checkoutPaymentId: 'payment-a',
          state: 'REFUNDED',
          amount: '10.0000',
          currency: 'PLN',
          refunds,
        }),
        findMany: jest.fn(),
      },
      payment: { findFirst: jest.fn() },
      checkSettlement: { findFirst: jest.fn() },
    };
    const provider = { createRefund: jest.fn() };
    const service = new ProviderCheckoutRefundService(
      prisma as unknown as PrismaService,
      provider as unknown as PaymentDomainService,
    );
    return { prisma, provider, service };
  }

  it('returns the original full-refund response on a same-key retry without another provider request', async () => {
    const h = makeHarness([priorRefund()]);
    const first = await h.service.refundRemaining(
      actor,
      'op-a',
      'Original reason',
      'key-a',
    );
    const second = await h.service.refundRemaining(
      actor,
      'op-a',
      'Original reason',
      'key-a',
    );
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      id: 'refund-a',
      providerRefundId: 'provider-refund-a',
      state: RefundState.SUCCEEDED,
      amount: '10.0000',
    });
    expect(h.provider.createRefund).not.toHaveBeenCalled();
    expect(h.prisma.payment.findFirst).not.toHaveBeenCalled();
    expect(h.prisma.paymentOperation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'op-a', shopId: 'shop-a' } }),
    );
  });

  it('rejects same-key replay with changed refund reason without contacting provider', async () => {
    const h = makeHarness([priorRefund()]);
    await expect(
      h.service.refundRemaining(actor, 'op-a', 'Different reason', 'key-a'),
    ).rejects.toThrow('different refund reason');
    expect(h.provider.createRefund).not.toHaveBeenCalled();
  });

  it('denies a foreign payment operation without any provider or checkout mutation', async () => {
    const h = makeHarness();
    h.prisma.paymentOperation.findFirst.mockResolvedValueOnce(null);
    await expect(
      h.service.refundRemaining(
        { ...actor, shopId: 'shop-b' },
        'op-a',
        'Original reason',
        'foreign-key',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(h.prisma.paymentOperation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'op-a', shopId: 'shop-b' } }),
    );
    expect(h.prisma.payment.findFirst).not.toHaveBeenCalled();
    expect(h.provider.createRefund).not.toHaveBeenCalled();
  });

  it('does not reveal another tenant settlement or provider payment list', async () => {
    const h = makeHarness();
    h.prisma.checkSettlement.findFirst.mockResolvedValueOnce(null);
    await expect(
      h.service.list({ ...actor, shopId: 'shop-b' }, 'settlement-a'),
    ).rejects.toThrow('Settlement not found');
    expect(h.prisma.checkSettlement.findFirst).toHaveBeenCalledWith({
      where: { id: 'settlement-a', shopId: 'shop-b' },
      select: { id: true },
    });
    expect(h.prisma.paymentOperation.findMany).not.toHaveBeenCalled();
  });
});

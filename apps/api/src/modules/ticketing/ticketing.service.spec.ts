import { ConflictException } from '@nestjs/common';
import { TicketingService } from './ticketing.service';

const actor = {
  sub: 'user-1',
  email: 'owner@example.com',
  shopId: 'shop-1',
  shopRole: 'OWNER',
} as any;

const secretConfig = {
  get: jest.fn((key: string) => (key === 'OPAQUE_IDENTIFIER_SECRET' ? 'test-opaque-secret' : undefined)),
} as any;

describe('TicketingService', () => {
  it('replays an existing ticket order without issuing raw tokens again', async () => {
    const order = { id: 'order-1', shopId: 'shop-1', idempotencyKey: 'idem-1' };
    const tickets = [{ id: 'ticket-1', orderId: order.id }];
    const prisma = {
      ticketOrder: { findUnique: jest.fn().mockResolvedValue(order) },
      ticket: { findMany: jest.fn().mockResolvedValue(tickets) },
    } as any;
    const service = new TicketingService(prisma, { get: jest.fn() } as any);

    const result = await service.issueOrder(actor, {
      idempotencyKey: 'idem-1',
      lines: [{ productId: 'product-1', quantity: 1 }],
    } as any);

    expect(result).toEqual({ order, tickets, replayed: true, rawTokens: [] });
  });

  it('stores an opaque customer reference rather than the raw identifier', async () => {
    const create = jest.fn().mockImplementation(async ({ data }) => ({ id: 'wallet-1', ...data }));
    const prisma = {
      rfidWallet: { create },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    } as any;
    const service = new TicketingService(prisma, secretConfig);

    await service.createWallet(actor, { customerRef: 'customer@example.com', currency: 'eur' } as any);

    const data = create.mock.calls[0][0].data;
    expect(data.customerRefHash).toBeTruthy();
    expect(data.customerRefHash).not.toBe('customer@example.com');
    expect(data.currency).toBe('EUR');
  });

  it('rejects a spend that would make the RFID wallet negative', async () => {
    const tx = {
      rfidWalletEntry: { findUnique: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      rfidWallet: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wallet-1', shopId: 'shop-1', balanceMinor: 50, active: true }),
        update: jest.fn(),
      },
    } as any;
    const prisma = {
      $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)),
    } as any;
    const service = new TicketingService(prisma, { get: jest.fn() } as any);

    await expect(
      service.spend(actor, 'wallet-1', { amountMinor: 100, idempotencyKey: 'spend-1' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.rfidWallet.update).not.toHaveBeenCalled();
  });

  it('turns a concurrent scan idempotency collision into a replay', async () => {
    const replay = { id: 'scan-1', shopId: 'shop-1', idempotencyKey: 'scan-key', result: 'ACCEPTED' };
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({ code: 'P2002' }),
      ticketScan: { findUnique: jest.fn().mockResolvedValue(replay) },
    } as any;
    const service = new TicketingService(prisma, secretConfig);

    const result = await service.scan(actor, { token: 'gst_example', idempotencyKey: 'scan-key' } as any);

    expect(result).toEqual({ scan: replay, replayed: true });
  });
});
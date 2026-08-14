import type { DomainEventOutbox } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  DOMAIN_EVENT_MAX_ATTEMPTS,
  DomainEventConsumerService,
} from './domain-event-consumer.service';

function event(
  payload: unknown,
  overrides: Partial<DomainEventOutbox> = {},
): DomainEventOutbox {
  return {
    id: 'event-1',
    shopId: 'shop-1',
    aggregateType: 'guest_check',
    aggregateId: 'check-1',
    eventType: 'guest-check.updated',
    correlationId: 'corr-1',
    payload: payload as never,
    occurredAt: new Date('2026-08-13T00:00:00Z'),
    nextAttemptAt: new Date('2026-08-13T00:00:00Z'),
    status: 'PROCESSING',
    attemptCount: 1,
    lastError: null,
    processedAt: null,
    createdAt: new Date('2026-08-13T00:00:00Z'),
    updatedAt: new Date('2026-08-13T00:00:00Z'),
    ...overrides,
  };
}

describe('DomainEventConsumerService', () => {
  function setup() {
    const update = jest.fn().mockResolvedValue({});
    const receiptCreate = jest.fn().mockResolvedValue({ id: 'receipt-1' });
    const prisma = {
      domainEventOutbox: { update },
      domainEventConsumerReceipt: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          domainEventOutbox: { update },
          domainEventConsumerReceipt: { create: receiptCreate },
        }),
      ),
    } as unknown as PrismaService;
    return {
      service: new DomainEventConsumerService(prisma),
      update,
      prisma,
    };
  }

  it('processes legacy pre-versioning events as schema v1', async () => {
    const { service, update } = setup();
    const handler = jest.fn().mockResolvedValue(undefined);

    await expect(
      service.processClaimed(event({ legacy: true }), handler),
    ).resolves.toMatchObject({ outcome: 'processed', id: 'event-1' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PROCESSED', lastError: null }),
      }),
    );
  });

  it('reclaims due work through the bounded processing lease', async () => {
    const findMany = jest.fn().mockResolvedValue([
      event({ eventSchemaVersion: 1 }),
    ]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const query = jest.fn().mockResolvedValue([{ id: 'event-1' }]);
    const prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          $queryRaw: query,
          domainEventOutbox: { updateMany, findMany },
        }),
      ),
    } as unknown as PrismaService;
    const service = new DomainEventConsumerService(prisma);

    await expect(service.claimPending()).resolves.toHaveLength(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['event-1'] } },
      data: { status: 'PROCESSING', attemptCount: { increment: 1 } },
    });
  });

  it('dead-letters an unknown future event version before the handler runs', async () => {
    const { service, update } = setup();
    const handler = jest.fn();

    await expect(
      service.processClaimed(event({ eventSchemaVersion: 2 }), handler),
    ).resolves.toEqual({
      outcome: 'dead',
      id: 'event-1',
      error: 'UNSUPPORTED_EVENT_SCHEMA_VERSION:2',
    });
    expect(handler).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: {
        status: 'DEAD',
        lastError: 'UNSUPPORTED_EVENT_SCHEMA_VERSION:2',
      },
    });
  });

  it('retries handler failures before the bounded dead-letter threshold', async () => {
    const { service, update } = setup();
    const handler = jest.fn().mockRejectedValue(new Error('temporary failure'));

    await expect(
      service.processClaimed(event({ eventSchemaVersion: 1 }), handler),
    ).resolves.toEqual({
      outcome: 'failed',
      id: 'event-1',
      error: 'temporary failure',
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-1' },
        data: expect.objectContaining({ status: 'FAILED', lastError: 'temporary failure' }),
      }),
    );
  });

  it('dead-letters repeated handler failures at the attempt ceiling', async () => {
    const { service } = setup();
    const handler = jest.fn().mockRejectedValue(new Error('permanent failure'));

    await expect(
      service.processClaimed(
        event(
          { eventSchemaVersion: 1 },
          { attemptCount: DOMAIN_EVENT_MAX_ATTEMPTS },
        ),
        handler,
      ),
    ).resolves.toEqual({
      outcome: 'dead',
      id: 'event-1',
      error: 'permanent failure',
    });
  });

  it('does not invoke a consumer twice after a durable receipt exists', async () => {
    const { service, prisma } = setup();
    (prisma.domainEventConsumerReceipt.findUnique as jest.Mock).mockResolvedValue({ id: 'receipt-1' });
    const handler = jest.fn();
    await expect(
      service.processClaimed(event({ eventSchemaVersion: 1 }), handler, 'reports'),
    ).resolves.toMatchObject({ outcome: 'processed' });
    expect(handler).not.toHaveBeenCalled();
  });
});

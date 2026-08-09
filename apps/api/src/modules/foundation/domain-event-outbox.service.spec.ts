import type { Prisma } from '@prisma/client';
import { DomainEventOutboxService } from './domain-event-outbox.service';

describe('DomainEventOutboxService', () => {
  it('writes the event through the caller transaction client', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'event_1' });
    const tx = {
      domainEventOutbox: { create },
    } as unknown as Prisma.TransactionClient;
    const service = new DomainEventOutboxService();

    await expect(
      service.enqueue(tx, {
        shopId: 'shop-a',
        aggregateType: 'guest_check',
        aggregateId: 'check_1',
        eventType: 'guest-check.updated',
        payload: { version: 2 },
      }),
    ).resolves.toEqual({ id: 'event_1' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: 'shop-a',
          aggregateId: 'check_1',
          eventType: 'guest-check.updated',
        }),
        select: { id: true },
      }),
    );
  });

  it('rejects non-canonical event names', async () => {
    const tx = {
      domainEventOutbox: { create: jest.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new DomainEventOutboxService().enqueue(tx, {
        shopId: 'shop-a',
        aggregateType: 'guest_check',
        aggregateId: 'check_1',
        eventType: 'GuestCheckUpdated',
        payload: {},
      }),
    ).rejects.toThrow('lower-case');
  });
});

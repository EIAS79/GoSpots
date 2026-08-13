import type { Prisma } from '@prisma/client';
import {
  CURRENT_DOMAIN_EVENT_SCHEMA_VERSION,
  DomainEventOutboxService,
  isSupportedDomainEventSchemaVersion,
  readDomainEventSchemaVersion,
} from './domain-event-outbox.service';

describe('DomainEventOutboxService', () => {
  it('writes a v1 event through the caller transaction client', async () => {
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
          payload: {
            version: 2,
            eventSchemaVersion: CURRENT_DOMAIN_EVENT_SCHEMA_VERSION,
          },
        }),
        select: { id: true },
      }),
    );
  });

  it('interprets pre-versioning legacy rows as v1', () => {
    expect(readDomainEventSchemaVersion({ legacy: true })).toBe(1);
    expect(isSupportedDomainEventSchemaVersion({ legacy: true })).toBe(true);
  });

  it('marks unknown future versions unsupported for safe dead-letter handling', () => {
    expect(readDomainEventSchemaVersion({ eventSchemaVersion: 2 })).toBe(2);
    expect(isSupportedDomainEventSchemaVersion({ eventSchemaVersion: 2 })).toBe(false);
  });

  it('rejects a producer attempting to emit an unsupported event version', async () => {
    const tx = {
      domainEventOutbox: { create: jest.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new DomainEventOutboxService().enqueue(tx, {
        shopId: 'shop-a',
        aggregateType: 'guest_check',
        aggregateId: 'check_1',
        eventType: 'guest-check.updated',
        eventSchemaVersion: 2,
        payload: {},
      }),
    ).rejects.toThrow('Unsupported domain event schema version');
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

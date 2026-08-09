import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type DomainEventInput = {
  shopId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  occurredAt?: Date;
};

const EVENT_TYPE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

/**
 * Writes durable application-domain events through a caller-supplied transaction.
 * Requiring TransactionClient prevents accidental out-of-transaction publication.
 */
@Injectable()
export class DomainEventOutboxService {
  async enqueue(
    tx: Prisma.TransactionClient,
    event: DomainEventInput,
  ): Promise<{ id: string }> {
    if (!EVENT_TYPE_PATTERN.test(event.eventType)) {
      throw new BadRequestException(
        'Domain event type must be lower-case and dot-separated',
      );
    }
    if (
      !event.shopId?.trim() ||
      !event.aggregateType?.trim() ||
      !event.aggregateId?.trim()
    ) {
      throw new BadRequestException('Domain event tenant and aggregate are required');
    }

    return tx.domainEventOutbox.create({
      data: {
        shopId: event.shopId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload,
        occurredAt: event.occurredAt,
      },
      select: { id: true },
    });
  }
}

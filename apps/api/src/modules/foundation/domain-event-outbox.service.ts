import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

export const CURRENT_DOMAIN_EVENT_SCHEMA_VERSION = 1;

export type DomainEventInput = {
  shopId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  correlationId?: string;
  eventSchemaVersion?: number;
  occurredAt?: Date;
};

const EVENT_TYPE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

function versionedPayload(
  payload: Prisma.InputJsonValue,
  eventSchemaVersion: number,
): Prisma.InputJsonValue {
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    return {
      ...(payload as Prisma.InputJsonObject),
      eventSchemaVersion,
    };
  }
  return { eventSchemaVersion, data: payload };
}

/**
 * Legacy outbox rows predate explicit event versioning and are therefore v1.
 * Consumers must call this before decoding the event-specific payload. Unknown
 * future versions are intentionally reported as unsupported so a dispatcher can
 * dead-letter them instead of attempting an unsafe decode.
 */
export function readDomainEventSchemaVersion(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return CURRENT_DOMAIN_EVENT_SCHEMA_VERSION;
  }
  const value = (payload as Record<string, unknown>).eventSchemaVersion;
  if (value === undefined) return CURRENT_DOMAIN_EVENT_SCHEMA_VERSION;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return Number.NaN;
  }
  return value;
}

export function isSupportedDomainEventSchemaVersion(payload: unknown): boolean {
  return readDomainEventSchemaVersion(payload) === CURRENT_DOMAIN_EVENT_SCHEMA_VERSION;
}

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

    const eventSchemaVersion =
      event.eventSchemaVersion ?? CURRENT_DOMAIN_EVENT_SCHEMA_VERSION;
    if (
      !Number.isInteger(eventSchemaVersion) ||
      eventSchemaVersion !== CURRENT_DOMAIN_EVENT_SCHEMA_VERSION
    ) {
      throw new BadRequestException(
        `Unsupported domain event schema version: ${eventSchemaVersion}`,
      );
    }

    const payloadCorrelationId =
      typeof event.payload === 'object' && event.payload !== null && !Array.isArray(event.payload)
        ? (event.payload as Prisma.InputJsonObject).correlationId
        : undefined;
    const correlationId =
      event.correlationId?.trim() ||
      (typeof payloadCorrelationId === 'string' ? payloadCorrelationId.trim() : '') ||
      randomUUID();

    return tx.domainEventOutbox.create({
      data: {
        shopId: event.shopId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        correlationId,
        payload: versionedPayload(
          typeof event.payload === 'object' && event.payload !== null && !Array.isArray(event.payload)
            ? { ...(event.payload as Prisma.InputJsonObject), correlationId }
            : event.payload,
          eventSchemaVersion,
        ),
        occurredAt: event.occurredAt,
      },
      select: { id: true },
    });
  }
}

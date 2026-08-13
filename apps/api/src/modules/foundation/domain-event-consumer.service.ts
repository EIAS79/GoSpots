import { Injectable } from '@nestjs/common';
import type { DomainEventOutbox } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isSupportedDomainEventSchemaVersion,
  readDomainEventSchemaVersion,
} from './domain-event-outbox.service';

export const DOMAIN_EVENT_MAX_ATTEMPTS = 10;

export type DomainEventHandler = (event: DomainEventOutbox) => Promise<void>;

export type DomainEventConsumeResult =
  | { outcome: 'processed'; id: string }
  | { outcome: 'failed'; id: string; error: string }
  | { outcome: 'dead'; id: string; error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Shared outbox consumer mechanics.
 *
 * Workers claim rows with SKIP LOCKED, then pass each claimed row through
 * `processClaimed`. Unknown future payload versions are marked DEAD before any
 * event-specific decoder/handler runs. Handler failures are retriable up to the
 * bounded attempt limit and then become DEAD.
 */
@Injectable()
export class DomainEventConsumerService {
  constructor(private readonly prisma: PrismaService) {}

  async claimPending(limit = 50): Promise<DomainEventOutbox[]> {
    const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "DomainEventOutbox"
        WHERE "status" IN ('PENDING', 'FAILED')
        ORDER BY "occurredAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${bounded}
      `);
      const ids = rows.map((row) => row.id);
      if (!ids.length) return [];

      await tx.domainEventOutbox.updateMany({
        where: { id: { in: ids } },
        data: { status: 'PROCESSING', attemptCount: { increment: 1 } },
      });
      return tx.domainEventOutbox.findMany({
        where: { id: { in: ids } },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      });
    });
  }

  async processClaimed(
    event: DomainEventOutbox,
    handler: DomainEventHandler,
  ): Promise<DomainEventConsumeResult> {
    const version = readDomainEventSchemaVersion(event.payload);
    if (!isSupportedDomainEventSchemaVersion(event.payload)) {
      const error = Number.isFinite(version)
        ? `UNSUPPORTED_EVENT_SCHEMA_VERSION:${version}`
        : 'INVALID_EVENT_SCHEMA_VERSION';
      await this.prisma.domainEventOutbox.update({
        where: { id: event.id },
        data: { status: 'DEAD', lastError: error },
      });
      return { outcome: 'dead', id: event.id, error };
    }

    try {
      await handler(event);
      await this.prisma.domainEventOutbox.update({
        where: { id: event.id },
        data: {
          status: 'PROCESSED',
          lastError: null,
          processedAt: new Date(),
        },
      });
      return { outcome: 'processed', id: event.id };
    } catch (cause) {
      const error = errorMessage(cause);
      const dead = event.attemptCount >= DOMAIN_EVENT_MAX_ATTEMPTS;
      await this.prisma.domainEventOutbox.update({
        where: { id: event.id },
        data: {
          status: dead ? 'DEAD' : 'FAILED',
          lastError: error,
        },
      });
      return {
        outcome: dead ? 'dead' : 'failed',
        id: event.id,
        error,
      };
    }
  }
}

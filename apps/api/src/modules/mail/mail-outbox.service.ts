import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MAIL_OUTBOX_MAX_ATTEMPTS,
  MAIL_OUTBOX_SENT_PURGE_BATCH_SIZE,
  MAIL_OUTBOX_SYNC_GRACE_MS,
  mailOutboxBackoffMs,
  truncateMailOutboxError,
  type MailOutboxDeadLetterRow,
  type MailOutboxEnqueueInput,
  type MailOutboxIntent,
  type MailOutboxPayload,
  type MailOutboxRecord,
  type MailOutboxStatus,
  type MailOutboxStatusCounts,
} from './mail-outbox.types';

const RING_MAX = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Durable mail outbox — persists PENDING rows before/around Resend delivery.
 * Worker (`MailOutboxProcessor`) retries FAILED / orphaned PENDING rows.
 */
@Injectable()
export class MailOutboxService {
  private readonly logger = new Logger(MailOutboxService.name);
  private readonly ring: MailOutboxRecord[] = [];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a PENDING outbox row (payload for retry). Returns existing id when
   * `idempotencyKey` already exists. Sets `nextAttemptAt` slightly in the future
   * so the sync send path can finish before the cron worker claims the row.
   */
  async enqueue(input: MailOutboxEnqueueInput): Promise<{ id: string }> {
    const to = input.to.trim().toLowerCase();
    const intent: MailOutboxIntent = {
      to,
      subject: input.subject,
      required: input.required,
    };
    const payload: MailOutboxPayload = {
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      required: input.required,
    };

    const key = input.idempotencyKey?.trim() || null;
    if (key) {
      const existing = await this.prisma.mailOutbox.findUnique({
        where: { idempotencyKey: key },
        select: { id: true },
      });
      if (existing) {
        this.push('attempt', intent, existing.id);
        this.logger.log(
          `[outbox enqueue] id=${existing.id} idempotent hit key=${key}`,
        );
        return { id: existing.id };
      }
    }

    const nextAttemptAt = new Date(Date.now() + MAIL_OUTBOX_SYNC_GRACE_MS);
    const row = await this.prisma.mailOutbox.create({
      data: {
        shopId: input.shopId ?? null,
        idempotencyKey: key,
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    this.push('attempt', intent, row.id);
    this.logger.log(
      `[outbox enqueue] id=${row.id} to=${to} subject=${JSON.stringify(intent.subject)} required=${Boolean(intent.required)}`,
    );
    return { id: row.id };
  }

  /** Load payload for worker delivery. */
  async getPayload(id: string): Promise<MailOutboxPayload | null> {
    const row = await this.prisma.mailOutbox.findUnique({
      where: { id },
      select: { payload: true },
    });
    if (!row?.payload || typeof row.payload !== 'object') return null;
    const p = row.payload as Record<string, unknown>;
    if (
      typeof p.to !== 'string' ||
      typeof p.subject !== 'string' ||
      typeof p.html !== 'string' ||
      typeof p.text !== 'string'
    ) {
      return null;
    }
    return {
      to: p.to,
      subject: p.subject,
      html: p.html,
      text: p.text,
      required: p.required === true ? true : undefined,
    };
  }

  /** Record that a send attempt is starting (correlation for MailService). */
  beginAttempt(intent: MailOutboxIntent): string {
    const id = this.push('attempt', {
      to: intent.to.trim().toLowerCase(),
      subject: intent.subject,
      required: intent.required,
    });
    this.logger.log(
      `[outbox attempt] id=${id} to=${intent.to.trim().toLowerCase()} subject=${JSON.stringify(intent.subject)}`,
    );
    return id;
  }

  async markSent(id: string, intent?: MailOutboxIntent): Promise<void> {
    await this.prisma.mailOutbox.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        lastError: null,
      },
    });
    if (intent) {
      this.push('sent', intent, id);
      this.logger.log(`[outbox sent] id=${id} to=${intent.to}`);
    } else {
      this.logger.log(`[outbox sent] id=${id}`);
    }
  }

  async markSkipped(id: string, intent?: MailOutboxIntent): Promise<void> {
    await this.prisma.mailOutbox.update({
      where: { id },
      data: {
        status: 'SKIPPED',
        lastError: null,
      },
    });
    if (intent) {
      this.push('skipped', intent, id);
      this.logger.warn(
        `[outbox skipped] id=${id} to=${intent.to} subject=${JSON.stringify(intent.subject)}`,
      );
    } else {
      this.logger.warn(`[outbox skipped] id=${id}`);
    }
  }

  /**
   * Mark FAILED with backoff, or DEAD after max attempts.
   * Increments `attempts` by 1.
   */
  async markFailed(id: string, error: unknown, intent?: MailOutboxIntent): Promise<void> {
    const message = truncateMailOutboxError(error);
    const row = await this.prisma.mailOutbox.findUnique({
      where: { id },
      select: { attempts: true },
    });
    const attempts = (row?.attempts ?? 0) + 1;
    const dead = attempts >= MAIL_OUTBOX_MAX_ATTEMPTS;
    const nextAttemptAt = dead
      ? new Date()
      : new Date(Date.now() + mailOutboxBackoffMs(attempts));

    await this.prisma.mailOutbox.update({
      where: { id },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        attempts,
        lastError: message,
        nextAttemptAt,
      },
    });

    if (intent) {
      this.push('failed', intent, id, message);
    }
    this.logger.error(
      `[outbox ${dead ? 'dead' : 'failed'}] id=${id} attempts=${attempts} error=${message}`,
    );
  }

  /** Process-local recent records (tests / diagnostics). Lost on restart. */
  recent(limit = 20): MailOutboxRecord[] {
    const n = Math.max(0, Math.min(limit, this.ring.length));
    return this.ring.slice(-n);
  }

  /**
   * Status histogram for dead-letter visibility.
   * - `shopId` string → that venue
   * - `systemOnly: true` → rows with `shopId IS NULL` (platform / auth mail)
   */
  async statusCounts(
    shopId?: string | null,
    opts?: { systemOnly?: boolean },
  ): Promise<MailOutboxStatusCounts> {
    const where: Prisma.MailOutboxWhereInput = opts?.systemOnly
      ? { shopId: null }
      : shopId
        ? { shopId }
        : {};
    const groups = await this.prisma.mailOutbox.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const counts: MailOutboxStatusCounts = {
      PENDING: 0,
      SENT: 0,
      FAILED: 0,
      DEAD: 0,
      SKIPPED: 0,
    };
    for (const g of groups) {
      const key = g.status as keyof MailOutboxStatusCounts;
      if (key in counts) {
        counts[key] = g._count._all;
      }
    }
    return counts;
  }

  /**
   * List DEAD (and optionally FAILED) rows without html/text bodies.
   * `systemOnly` → `shopId IS NULL` only (platform mail).
   */
  async listDeadLetters(opts: {
    shopId?: string | null;
    systemOnly?: boolean;
    includeFailed?: boolean;
    take?: number;
    skip?: number;
  }): Promise<{ items: MailOutboxDeadLetterRow[]; total: number }> {
    const take = Math.max(1, Math.min(opts.take ?? 50, 100));
    const skip = Math.max(0, opts.skip ?? 0);
    const statuses = opts.includeFailed ? ['DEAD', 'FAILED'] : ['DEAD'];
    const where: Prisma.MailOutboxWhereInput = {
      status: { in: statuses },
      ...(opts.systemOnly
        ? { shopId: null }
        : opts.shopId
          ? { shopId: opts.shopId }
          : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.mailOutbox.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          shopId: true,
          status: true,
          attempts: true,
          lastError: true,
          nextAttemptAt: true,
          createdAt: true,
          updatedAt: true,
          sentAt: true,
          payload: true,
        },
      }),
      this.prisma.mailOutbox.count({ where }),
    ]);

    return {
      total,
      items: rows.map((row) => this.toDeadLetterRow(row)),
    };
  }

  /**
   * Requeue a DEAD row for another delivery budget (PENDING, attempts=0, due now).
   * When `shopId` is set, cross-tenant ids → NotFound.
   * When `systemOnly`, only null-shopId rows may be requeued.
   */
  async requeueDeadLetter(
    id: string,
    opts: { shopId?: string | null; systemOnly?: boolean } = {},
  ): Promise<MailOutboxDeadLetterRow> {
    const where: Prisma.MailOutboxWhereInput = {
      id,
      status: 'DEAD',
      ...(opts.systemOnly
        ? { shopId: null }
        : opts.shopId
          ? { shopId: opts.shopId }
          : {}),
    };
    const existing = await this.prisma.mailOutbox.findFirst({
      where,
      select: {
        id: true,
        shopId: true,
        status: true,
        attempts: true,
        lastError: true,
        nextAttemptAt: true,
        createdAt: true,
        updatedAt: true,
        sentAt: true,
        payload: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Dead-letter mail outbox row not found.');
    }

    const updated = await this.prisma.mailOutbox.update({
      where: { id: existing.id },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        // Keep lastError for operator visibility until the next outcome.
      },
      select: {
        id: true,
        shopId: true,
        status: true,
        attempts: true,
        lastError: true,
        nextAttemptAt: true,
        createdAt: true,
        updatedAt: true,
        sentAt: true,
        payload: true,
      },
    });

    this.logger.warn(
      `[outbox requeue] id=${updated.id} shopId=${updated.shopId ?? 'null'} priorAttempts=${existing.attempts}`,
    );
    return this.toDeadLetterRow(updated);
  }

  /**
   * Delete aged SENT rows (payload includes PII). Uses existing `sentAt` column.
   * Batched loop; safe to call from daily retention cron under advisory lock.
   */
  async purgeSentRows(opts: {
    olderThanDays: number;
    batchSize?: number;
    now?: Date;
  }): Promise<{ deleted: number; cutoff: string }> {
    const days = Math.max(1, Math.floor(opts.olderThanDays));
    const batchSize = Math.max(
      1,
      Math.min(
        opts.batchSize ?? MAIL_OUTBOX_SENT_PURGE_BATCH_SIZE,
        MAIL_OUTBOX_SENT_PURGE_BATCH_SIZE,
      ),
    );
    const now = opts.now ?? new Date();
    const cutoff = new Date(now.getTime() - days * DAY_MS);

    let deleted = 0;
    for (;;) {
      const rows = await this.prisma.mailOutbox.findMany({
        where: {
          status: 'SENT',
          sentAt: { lt: cutoff },
        },
        select: { id: true },
        take: batchSize,
      });
      if (rows.length === 0) break;

      const result = await this.prisma.mailOutbox.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      deleted += result.count;
      if (rows.length < batchSize) break;
    }

    if (deleted > 0) {
      this.logger.log(
        `[outbox retention] purged ${deleted} SENT row(s) with sentAt before ${cutoff.toISOString()}`,
      );
    }

    return { deleted, cutoff: cutoff.toISOString() };
  }

  private toDeadLetterRow(row: {
    id: string;
    shopId: string | null;
    status: string;
    attempts: number;
    lastError: string | null;
    nextAttemptAt: Date;
    createdAt: Date;
    updatedAt: Date;
    sentAt: Date | null;
    payload: Prisma.JsonValue;
  }): MailOutboxDeadLetterRow {
    const meta = extractPayloadMeta(row.payload);
    return {
      id: row.id,
      shopId: row.shopId,
      status: row.status as MailOutboxDeadLetterRow['status'],
      attempts: row.attempts,
      lastError: row.lastError,
      to: meta.to,
      subject: meta.subject,
      required: meta.required,
      nextAttemptAt: row.nextAttemptAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sentAt: row.sentAt,
    };
  }

  private push(
    status: MailOutboxStatus,
    intent: MailOutboxIntent,
    id?: string,
    error?: string,
  ): string {
    const recordId = id ?? randomUUID();
    this.ring.push({
      id: recordId,
      intent,
      status,
      error,
      at: new Date(),
    });
    if (this.ring.length > RING_MAX) {
      this.ring.splice(0, this.ring.length - RING_MAX);
    }
    return recordId;
  }
}

function extractPayloadMeta(payload: Prisma.JsonValue): {
  to: string | null;
  subject: string | null;
  required: boolean;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { to: null, subject: null, required: false };
  }
  const p = payload as Record<string, unknown>;
  return {
    to: typeof p.to === 'string' ? p.to : null,
    subject: typeof p.subject === 'string' ? p.subject : null,
    required: p.required === true,
  };
}

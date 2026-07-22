/** Durable outbox row status (DB). */
export type MailOutboxDbStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'DEAD'
  | 'SKIPPED';

/** Legacy ring-buffer statuses kept for process-local diagnostics. */
export type MailOutboxStatus =
  | 'attempt'
  | 'sent'
  | 'skipped'
  | 'failed';

/**
 * Intent recorded at send time (no bodies — for logs / ring buffer).
 */
export type MailOutboxIntent = {
  to: string;
  subject: string;
  required?: boolean;
};

/** Full payload stored in MailOutbox.payload JSON for retry. */
export type MailOutboxPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  required?: boolean;
};

export type MailOutboxRecord = {
  id: string;
  intent: MailOutboxIntent;
  status: MailOutboxStatus;
  error?: string;
  at: Date;
};

export type MailOutboxEnqueueInput = MailOutboxPayload & {
  shopId?: string | null;
  idempotencyKey?: string | null;
};

/** Sanitized dead-letter / admin list row (no html/text bodies). */
export type MailOutboxDeadLetterRow = {
  id: string;
  shopId: string | null;
  status: MailOutboxDbStatus;
  attempts: number;
  lastError: string | null;
  to: string | null;
  subject: string | null;
  required: boolean;
  nextAttemptAt: Date;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
};

export type MailOutboxStatusCounts = {
  PENDING: number;
  SENT: number;
  FAILED: number;
  DEAD: number;
  SKIPPED: number;
};

/** Max delivery attempts before DEAD (includes the initial sync attempt). */
export const MAIL_OUTBOX_MAX_ATTEMPTS = 8;

/** Grace so the sync send path can finish before the worker claims a fresh PENDING row. */
export const MAIL_OUTBOX_SYNC_GRACE_MS = 120_000;

/** Batch size per processor tick. */
export const MAIL_OUTBOX_BATCH_SIZE = 20;

/** Exponential-ish backoff after failure attempt N (1-based). */
export function mailOutboxBackoffMs(attemptAfterFail: number): number {
  const caps = [
    60_000, // 1m
    5 * 60_000, // 5m
    15 * 60_000, // 15m
    60 * 60_000, // 1h
    6 * 60 * 60_000, // 6h
  ];
  const i = Math.max(0, Math.min(attemptAfterFail - 1, caps.length - 1));
  return caps[i];
}

export function truncateMailOutboxError(error: unknown, max = 500): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error);
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

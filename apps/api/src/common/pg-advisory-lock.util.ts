import type { PrismaClient } from '@prisma/client';

/**
 * Fixed Postgres advisory-lock key pair for reservation reminder cron.
 * Two int4 keys avoid colliding with ad-hoc bigint locks elsewhere.
 * (ASCII-ish: 'GS' + 'RM' namespace.)
 */
export const RESERVATION_REMINDERS_CRON_LOCK_KEY1 = 0x4753; // 'GS'
export const RESERVATION_REMINDERS_CRON_LOCK_KEY2 = 0x524d; // 'RM'

/** Mail outbox processor cron — 'GS' + 'MO'. */
export const MAIL_OUTBOX_CRON_LOCK_KEY1 = 0x4753; // 'GS'
export const MAIL_OUTBOX_CRON_LOCK_KEY2 = 0x4d4f; // 'MO'

/** GDPR retention cron — 'GS' + 'GD'. */
export const GDPR_RETENTION_CRON_LOCK_KEY1 = 0x4753; // 'GS'
export const GDPR_RETENTION_CRON_LOCK_KEY2 = 0x4744; // 'GD'

/** Mail outbox SENT retention cron — 'GS' + 'MR'. */
export const MAIL_OUTBOX_RETENTION_CRON_LOCK_KEY1 = 0x4753; // 'GS'
export const MAIL_OUTBOX_RETENTION_CRON_LOCK_KEY2 = 0x4d52; // 'MR'

/** Dual-provider billing cron (reconcile / grace / webhook retry) — 'GS' + 'BL'. */
export const BILLING_CRON_LOCK_KEY1 = 0x4753; // 'GS'
export const BILLING_CRON_LOCK_KEY2 = 0x424c; // 'BL'

export type AdvisoryLockOutcome<T> =
  | { acquired: false }
  | { acquired: true; result: T };

type XactLockOptions = {
  /** Prisma interactive-transaction timeout (ms). Default 55s. */
  timeout?: number;
  maxWait?: number;
};

/**
 * Run `fn` only if this process wins `pg_try_advisory_xact_lock`.
 *
 * Uses a **transaction-scoped** lock (not session `pg_try_advisory_lock`) so
 * Prisma connection pooling cannot leak the lock onto another connection or
 * unlock on the wrong session. The lock is held until the transaction ends
 * (commit or rollback), which serializes multi-instance cron ticks.
 *
 * `fn` may use the outer Prisma client for reads/writes; mutual exclusion comes
 * from holding the xact lock for the duration of `fn`.
 */
export async function withPgAdvisoryXactLock<T>(
  prisma: PrismaClient,
  key1: number,
  key2: number,
  fn: () => Promise<T>,
  options?: XactLockOptions,
): Promise<AdvisoryLockOutcome<T>> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${key1}, ${key2}) AS acquired
      `;
      if (!rows[0]?.acquired) {
        return { acquired: false as const };
      }
      const result = await fn();
      return { acquired: true as const, result };
    },
    {
      maxWait: options?.maxWait ?? 5_000,
      timeout: options?.timeout ?? 55_000,
    },
  );
}

/** Single-flight wrapper for the reservation reminders / NO_SHOW cron tick. */
export async function withReservationRemindersCronLock<T>(
  prisma: PrismaClient,
  fn: () => Promise<T>,
  options?: XactLockOptions,
): Promise<AdvisoryLockOutcome<T>> {
  return withPgAdvisoryXactLock(
    prisma,
    RESERVATION_REMINDERS_CRON_LOCK_KEY1,
    RESERVATION_REMINDERS_CRON_LOCK_KEY2,
    fn,
    options,
  );
}

/** Single-flight wrapper for the mail outbox processor cron tick. */
export async function withMailOutboxCronLock<T>(
  prisma: PrismaClient,
  fn: () => Promise<T>,
  options?: XactLockOptions,
): Promise<AdvisoryLockOutcome<T>> {
  return withPgAdvisoryXactLock(
    prisma,
    MAIL_OUTBOX_CRON_LOCK_KEY1,
    MAIL_OUTBOX_CRON_LOCK_KEY2,
    fn,
    options,
  );
}

/** Single-flight wrapper for the GDPR retention cron tick. */
export async function withGdprRetentionCronLock<T>(
  prisma: PrismaClient,
  fn: () => Promise<T>,
  options?: XactLockOptions,
): Promise<AdvisoryLockOutcome<T>> {
  return withPgAdvisoryXactLock(
    prisma,
    GDPR_RETENTION_CRON_LOCK_KEY1,
    GDPR_RETENTION_CRON_LOCK_KEY2,
    fn,
    options,
  );
}

/** Single-flight wrapper for the mail outbox SENT retention cron tick. */
export async function withMailOutboxRetentionCronLock<T>(
  prisma: PrismaClient,
  fn: () => Promise<T>,
  options?: XactLockOptions,
): Promise<AdvisoryLockOutcome<T>> {
  return withPgAdvisoryXactLock(
    prisma,
    MAIL_OUTBOX_RETENTION_CRON_LOCK_KEY1,
    MAIL_OUTBOX_RETENTION_CRON_LOCK_KEY2,
    fn,
    options,
  );
}

/** Single-flight wrapper for dual-provider billing cron ticks. */
export async function withBillingCronLock<T>(
  prisma: PrismaClient,
  fn: () => Promise<T>,
  options?: XactLockOptions,
): Promise<AdvisoryLockOutcome<T>> {
  return withPgAdvisoryXactLock(
    prisma,
    BILLING_CRON_LOCK_KEY1,
    BILLING_CRON_LOCK_KEY2,
    fn,
    options,
  );
}

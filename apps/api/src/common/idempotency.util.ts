import { createHash, randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ApiDomainErrorCode } from './api-error.codes';
import { apiConflictException } from './api-error.util';

/** Default receipt TTL (24h). */
export const IDEMPOTENCY_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export const IDEMPOTENCY_KEY_MAX_LEN = 128;

export const IDEMPOTENCY_SCOPES = {
  FINANCE_TRANSACTION_CREATE: 'finance.transactions.create',
  FINANCE_PLAY_BILLING_MARK_PAID: 'finance.play-billing.mark-paid',
  FINANCE_PLAY_SESSION_MARK_PAID: 'finance.play-sessions.mark-paid',
  /** Tier A — money / stock / irreversible pay-cancel (Lane GGGG). */
  FINANCE_ORDERS_CREATE: 'finance.orders.create',
  FINANCE_ORDERS_LINES_ADD: 'finance.orders.lines.add',
  FINANCE_LOSSES_CREATE: 'finance.losses.create',
  FINANCE_PLAY_BILLING_CANCEL: 'finance.play-billing.cancel',
  FINANCE_PLAY_SESSIONS_CANCEL: 'finance.play-sessions.cancel',
  FINANCE_PLAY_SESSIONS_CREATE: 'finance.play-sessions.create',
  /** Tier B — double-charge / double-restore risk (Lane LLLL). */
  FINANCE_ORDERS_UPDATE: 'finance.orders.update',
  FINANCE_ORDERS_LINES_PATCH: 'finance.orders.lines.patch',
  FINANCE_ORDERS_LINES_DELETE: 'finance.orders.lines.delete',
  FINANCE_ORDERS_DELETE: 'finance.orders.delete',
  FINANCE_PLAY_BILLING_UPDATE: 'finance.play-billing.update',
  FINANCE_PLAY_SESSIONS_UPDATE: 'finance.play-sessions.update',
  /** Tier C — low urgency (Lane OOOO). */
  FINANCE_LOSSES_DELETE: 'finance.losses.delete',
  FINANCE_ORDERS_BULK_ARCHIVE: 'finance.orders.bulk.archive',
  FINANCE_ORDERS_BULK_UNARCHIVE: 'finance.orders.bulk.unarchive',
  /** Tier C residual — catalog FX apply via settings (Lane TTTT); keys optional. */
  /** Checkout V2 settlement snapshot creation. Required even though no tender is charged yet. */
  CHECKOUT_SETTLEMENT_CREATE: 'checkout.settlements.create',
  CHECKOUT_PAYMENT_CREATE: 'checkout.payments.create',
  CHECKOUT_CHECK_MERGE: 'checkout.checks.merge',
  CHECKOUT_CHARGES_MOVE: 'checkout.checks.move-charges',
  CASH_SESSION_OPEN: 'cash.sessions.open',
  CASH_MOVEMENT_CREATE: 'cash.movements.create',
  CASH_COUNT_SUBMIT: 'cash.counts.submit',
  CASH_VARIANCE_APPROVE: 'cash.variance.approve',
  CASH_SESSION_CLOSE: 'cash.sessions.close',
  SHOP_CURRENCY_APPLY: 'shop.currency.apply',
  /** Onboarding template seed — derived key from templateId when header absent (Lane ONBOARD32). */
  SHOP_ONBOARDING_APPLY_TEMPLATE: 'shop.onboarding.apply-template',
  /** Dual-provider SaaS billing mutations. */
  BILLING_CHECKOUT: 'billing.checkout',
  BILLING_CANCEL: 'billing.cancel',
  BILLING_PAUSE: 'billing.pause',
  BILLING_RESUME: 'billing.resume',
  BILLING_CHANGE_PLAN: 'billing.change-plan',
  BILLING_CHANGE_RENEWAL_MODE: 'billing.change-renewal-mode',
  BILLING_SWITCH_PROVIDER: 'billing.switch-provider',
  BILLING_MANUAL_RENEWAL: 'billing.manual-renewal',
  BILLING_PAYMENT_METHOD_UPDATE: 'billing.payment-method.update',
  BILLING_STRIPE_PORTAL: 'billing.stripe.customer-portal',
} as const;

/**
 * Hot + Tier A money scopes — Phase 3 `IDEMPOTENCY_REQUIRE_MONEY_KEYS` gate.
 * Tier B/C stay optional even when the env flag is on.
 */
export const IDEMPOTENCY_TIER_A_SCOPES = [
  IDEMPOTENCY_SCOPES.FINANCE_TRANSACTION_CREATE,
  IDEMPOTENCY_SCOPES.FINANCE_PLAY_BILLING_MARK_PAID,
  IDEMPOTENCY_SCOPES.FINANCE_PLAY_SESSION_MARK_PAID,
  IDEMPOTENCY_SCOPES.FINANCE_ORDERS_CREATE,
  IDEMPOTENCY_SCOPES.FINANCE_ORDERS_LINES_ADD,
  IDEMPOTENCY_SCOPES.FINANCE_LOSSES_CREATE,
  IDEMPOTENCY_SCOPES.FINANCE_PLAY_BILLING_CANCEL,
  IDEMPOTENCY_SCOPES.FINANCE_PLAY_SESSIONS_CANCEL,
  IDEMPOTENCY_SCOPES.FINANCE_PLAY_SESSIONS_CREATE,
] as const;

const TIER_A_SCOPE_SET = new Set<string>(IDEMPOTENCY_TIER_A_SCOPES);

export function isIdempotencyTierAScope(scope: string): boolean {
  return TIER_A_SCOPE_SET.has(scope);
}

/** Env `IDEMPOTENCY_REQUIRE_MONEY_KEYS=true|1` — default off (backward compat). */
export function isIdempotencyMoneyKeysRequired(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.IDEMPOTENCY_REQUIRE_MONEY_KEYS;
  return raw === 'true' || raw === '1';
}

type MemoryEntry = {
  response: unknown;
  requestHash: string | null;
  expiresAt: number;
};

/** Process-local replay cache (warm path). Cleared on TTL. */
const memoryCache = new Map<string, MemoryEntry>();

export type IdempotencyOptions = {
  shopId: string;
  scope: string;
  /** Raw `Idempotency-Key` header (optional — absent means no dedupe). */
  key: string | undefined | null;
  /** Optional request fingerprint; mismatch with stored hash → 409. */
  requestHash?: string | null;
  correlationId?: string | null;
  ttlMs?: number;
  /**
   * Phase 3 — when true, missing/blank key → 400 instead of passthrough.
   * Controllers pass this for Tier A scopes when `IDEMPOTENCY_REQUIRE_MONEY_KEYS` is on.
   */
  requireKey?: boolean;
};

type ReceiptRow = {
  status: string;
  requestHash: string | null;
  responseJson: string | null;
  expiresAt: Date | null;
};

function memoryKey(shopId: string, scope: string, key: string): string {
  return `${shopId}\0${scope}\0${key}`;
}

function normalizeKey(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const key = String(raw).trim();
  if (!key) return null;
  if (key.length > IDEMPOTENCY_KEY_MAX_LEN) {
    throw new BadRequestException(
      `Idempotency-Key must be at most ${IDEMPOTENCY_KEY_MAX_LEN} characters`,
    );
  }
  return key;
}

function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toJSON();
  if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item));

  const maybeSerializable = value as { toJSON?: () => unknown };
  if (typeof maybeSerializable.toJSON === 'function') {
    return canonicalizeJson(maybeSerializable.toJSON());
  }

  const source = value as Record<string, unknown>;
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const item = source[key];
    if (
      item === undefined ||
      typeof item === 'function' ||
      typeof item === 'symbol'
    ) {
      continue;
    }
    canonical[key] = canonicalizeJson(item);
  }
  return canonical;
}

/**
 * Stable SHA-256 hex of a JSON-serializable request body (or raw string).
 * Object keys are recursively sorted so semantically identical JSON requests
 * cannot produce different receipt hashes merely because property order changed.
 */
export function hashIdempotencyRequest(body: unknown): string {
  const payload =
    typeof body === 'string'
      ? body
      : JSON.stringify(canonicalizeJson(body ?? null));
  return createHash('sha256').update(payload).digest('hex');
}

function parseStoredResponse(responseJson: string | null): unknown {
  if (responseJson == null || responseJson === '') return null;
  try {
    return JSON.parse(responseJson) as unknown;
  } catch {
    return null;
  }
}

function idempotencyConflict(
  message: string,
  details?: Record<string, unknown>,
) {
  return apiConflictException(
    ApiDomainErrorCode.IDEMPOTENCY_CONFLICT,
    message,
    details,
  );
}

function assertRequestHashMatch(
  stored: string | null,
  incoming: string | null | undefined,
): void {
  if (!stored || !incoming) return;
  if (stored !== incoming) {
    throw idempotencyConflict(
      'Idempotency-Key reused with a different request payload',
    );
  }
}

function readMemory(
  shopId: string,
  scope: string,
  key: string,
  requestHash: string | null | undefined,
): MemoryEntry | undefined {
  const mk = memoryKey(shopId, scope, key);
  const hit = memoryCache.get(mk);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(mk);
    return undefined;
  }
  assertRequestHashMatch(hit.requestHash, requestHash);
  return hit;
}

function writeMemory(
  shopId: string,
  scope: string,
  key: string,
  response: unknown,
  requestHash: string | null,
  ttlMs: number,
): void {
  memoryCache.set(memoryKey(shopId, scope, key), {
    response,
    requestHash,
    expiresAt: Date.now() + ttlMs,
  });
}

/** Test helper — clears process-local cache. */
export function clearIdempotencyMemoryCache(): void {
  memoryCache.clear();
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

async function loadReceipt(
  prisma: PrismaClient,
  shopId: string,
  scope: string,
  key: string,
): Promise<ReceiptRow | null> {
  return prisma.idempotencyReceipt.findUnique({
    where: { shopId_scope_key: { shopId, scope, key } },
    select: {
      status: true,
      requestHash: true,
      responseJson: true,
      expiresAt: true,
    },
  });
}

function receiptStillValid(row: ReceiptRow): boolean {
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

/**
 * Run `fn` once per (shopId, scope, Idempotency-Key).
 *
 * - Missing/blank key → passthrough (no receipt), unless `requireKey` → 400.
 * - Replay → returns stored JSON response (memory first, then DB).
 * - Concurrent claim → winner executes; loser waits briefly then replays, or 409 if still pending.
 */
export async function withClientIdempotency<T>(
  prisma: PrismaClient,
  options: IdempotencyOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const key = normalizeKey(options.key);
  if (!key) {
    if (options.requireKey) {
      throw new BadRequestException(
        'Idempotency-Key header is required for this money operation',
      );
    }
    return fn();
  }

  const { shopId, scope } = options;
  const requestHash = options.requestHash ?? null;
  const ttlMs = options.ttlMs ?? IDEMPOTENCY_DEFAULT_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs);
  const correlationId = options.correlationId?.trim() || randomUUID();

  const fromMem = readMemory(shopId, scope, key, requestHash);
  if (fromMem) return fromMem.response as T;

  const existing = await loadReceipt(prisma, shopId, scope, key);
  if (existing && receiptStillValid(existing)) {
    if (existing.status === 'COMPLETED') {
      assertRequestHashMatch(existing.requestHash, requestHash);
      const parsed = parseStoredResponse(existing.responseJson) as T;
      writeMemory(shopId, scope, key, parsed, existing.requestHash, ttlMs);
      return parsed;
    }
    if (existing.status === 'PENDING') {
      const replay = await waitForCompleted(
        prisma,
        shopId,
        scope,
        key,
        requestHash,
      );
      if (replay) {
        const parsed = parseStoredResponse(replay.responseJson) as T;
        writeMemory(shopId, scope, key, parsed, replay.requestHash, ttlMs);
        return parsed;
      }
      throw idempotencyConflict(
        'Idempotency-Key request is already in progress',
        { scope },
      );
    }
  }

  // Expired or missing — claim with PENDING (unique).
  if (existing && !receiptStillValid(existing)) {
    await prisma.idempotencyReceipt
      .delete({
        where: { shopId_scope_key: { shopId, scope, key } },
      })
      .catch(() => undefined);
  }

  try {
    await prisma.idempotencyReceipt.create({
      data: {
        shopId,
        scope,
        key,
        requestHash,
        correlationId,
        status: 'PENDING',
        responseJson: null,
        expiresAt,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await loadReceipt(prisma, shopId, scope, key);
    if (raced?.status === 'COMPLETED' && receiptStillValid(raced)) {
      assertRequestHashMatch(raced.requestHash, requestHash);
      const parsed = parseStoredResponse(raced.responseJson) as T;
      writeMemory(shopId, scope, key, parsed, raced.requestHash, ttlMs);
      return parsed;
    }
    const replay = await waitForCompleted(
      prisma,
      shopId,
      scope,
      key,
      requestHash,
    );
    if (replay) {
      const parsed = parseStoredResponse(replay.responseJson) as T;
      writeMemory(shopId, scope, key, parsed, replay.requestHash, ttlMs);
      return parsed;
    }
    throw idempotencyConflict(
      'Idempotency-Key request is already in progress',
      { scope },
    );
  }

  try {
    const result = await fn();
    const responseJson = JSON.stringify(result ?? null);
    await prisma.idempotencyReceipt.update({
      where: { shopId_scope_key: { shopId, scope, key } },
      data: {
        status: 'COMPLETED',
        responseJson,
        requestHash,
        expiresAt,
      },
    });
    writeMemory(shopId, scope, key, result, requestHash, ttlMs);
    return result;
  } catch (err) {
    await prisma.idempotencyReceipt
      .delete({ where: { shopId_scope_key: { shopId, scope, key } } })
      .catch(() => undefined);
    throw err;
  }
}

async function waitForCompleted(
  prisma: PrismaClient,
  shopId: string,
  scope: string,
  key: string,
  requestHash: string | null | undefined,
  attempts = 8,
  delayMs = 25,
): Promise<ReceiptRow | undefined> {
  for (let i = 0; i < attempts; i++) {
    await sleep(delayMs);
    const row = await loadReceipt(prisma, shopId, scope, key);
    if (!row || !receiptStillValid(row)) return undefined;
    if (row.status === 'COMPLETED') {
      assertRequestHashMatch(row.requestHash, requestHash);
      return row;
    }
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

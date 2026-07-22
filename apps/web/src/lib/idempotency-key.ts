/**
 * Client Idempotency-Key retry handoff (bible #7 Phase 2).
 *
 * Same stable action fingerprint → reuse key after soft failure / "Try again".
 * Success clears the pending key so the next intentional action mints fresh.
 * Payload/path change → new fingerprint → new key (avoids 409 hash mismatch).
 */

const pendingKeys = new Map<string, string>();

export type IdempotentCallOptions = {
  /** Explicit key wins (tests / panel-held refs). */
  idempotencyKey?: string;
};

/** Stable fingerprint for scope + path ids + body. */
export function idempotencyActionKey(
  scope: string,
  parts: Record<string, unknown> = {},
): string {
  return `${scope}:${JSON.stringify(parts)}`;
}

function takeKey(actionKey: string, explicit?: string): string {
  if (explicit) return explicit;
  let key = pendingKeys.get(actionKey);
  if (!key) {
    key = crypto.randomUUID();
    pendingKeys.set(actionKey, key);
  }
  return key;
}

function clearKey(actionKey: string, explicit?: string): void {
  if (explicit) return;
  pendingKeys.delete(actionKey);
}

/** Test helper — clears pending retry keys. */
export function clearPendingIdempotencyKeys(): void {
  pendingKeys.clear();
}

/**
 * Run an API call with an Idempotency-Key that survives retries of the same
 * action (same fingerprint) until success.
 */
export async function withIdempotentFinanceCall<T>(
  actionKey: string,
  call: (idempotencyKey: string) => Promise<T>,
  opts?: IdempotentCallOptions,
): Promise<T> {
  const key = takeKey(actionKey, opts?.idempotencyKey);
  try {
    const result = await call(key);
    clearKey(actionKey, opts?.idempotencyKey);
    return result;
  } catch (err) {
    // Keep pending key so the next identical attempt reuses it.
    throw err;
  }
}

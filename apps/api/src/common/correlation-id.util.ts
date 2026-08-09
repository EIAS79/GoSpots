import { randomUUID } from 'crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const LEGACY_REQUEST_ID_HEADER = 'x-request-id';

const SAFE_CORRELATION_ID = /^[\w.-]{8,128}$/;

type HeaderValue = string | string[] | undefined;

function firstHeader(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function isSafeCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_CORRELATION_ID.test(value);
}

/**
 * Prefer the standards-facing x-correlation-id header, then the legacy x-request-id
 * used by existing GoSpots clients. Unsafe caller values are never reflected.
 */
export function resolveCorrelationId(
  headers: Record<string, HeaderValue>,
  generate: () => string = randomUUID,
): string {
  const correlation = firstHeader(headers[CORRELATION_ID_HEADER]);
  if (isSafeCorrelationId(correlation)) return correlation;

  const legacy = firstHeader(headers[LEGACY_REQUEST_ID_HEADER]);
  if (isSafeCorrelationId(legacy)) return legacy;

  return generate();
}

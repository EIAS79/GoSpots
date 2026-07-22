/**
 * Optional Sentry init — see docs/audit/GO_SPOTS_OBSERVABILITY.md.
 * No-op when SENTRY_DSN is unset; fail-open if init throws.
 */
import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

const logger = new Logger('Sentry');

/** Keys whose values are always redacted (case-insensitive substring match). */
const SENSITIVE_KEY_RE =
  /^(.*?)(email|phone|password|passwd|secret|token|authorization|cookie|csrf|jwt|api[_-]?key)(.*?)$/i;

const HEADER_DROP = new Set([
  'cookie',
  'authorization',
  'x-csrf-token',
  'set-cookie',
]);

export function redactSensitiveValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_RE.test(key)) {
    return '[Redacted]';
  }
  return redactDeep(value);
}

export function redactDeep(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactSensitiveValue(k, v);
    }
    return out;
  }
  return value;
}

export function scrubRequestHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!headers) return headers;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (HEADER_DROP.has(k.toLowerCase())) {
      out[k] = '[Redacted]';
      continue;
    }
    out[k] = redactSensitiveValue(k, v);
  }
  return out;
}

/** Drop query string (may contain status tokens / magic links). */
export function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const q = url.indexOf('?');
  return q >= 0 ? `${url.slice(0, q)}?[Redacted]` : url;
}

export function scrubSentryEvent(
  event: Sentry.ErrorEvent,
): Sentry.ErrorEvent | null {
  if (event.request) {
    const req = { ...event.request };
    req.headers = scrubRequestHeaders(
      req.headers as Record<string, unknown> | undefined,
    ) as typeof req.headers;
    req.cookies = undefined;
    req.data = undefined;
    if (typeof req.url === 'string') {
      req.url = scrubUrl(req.url);
    }
    if (typeof req.query_string === 'string') {
      req.query_string = '[Redacted]';
    } else if (req.query_string != null) {
      req.query_string = '[Redacted]' as unknown as typeof req.query_string;
    }
    event.request = req;
  }
  if (event.user) {
    event.user = {
      id: event.user.id,
      // never email / username / ip
    };
  }
  if (event.extra) {
    event.extra = redactDeep(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = redactDeep(event.contexts) as typeof event.contexts;
  }
  return event;
}

export function scrubSentryBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  if (breadcrumb.data) {
    breadcrumb.data = redactDeep(breadcrumb.data) as typeof breadcrumb.data;
  }
  if (breadcrumb.category === 'http' && breadcrumb.data) {
    const data = breadcrumb.data as Record<string, unknown>;
    if (typeof data.url === 'string') {
      data.url = scrubUrl(data.url);
    }
  }
  return breadcrumb;
}

/**
 * Call once at process start, before NestFactory.create.
 * Returns true when Sentry was initialized.
 */
export function initSentryFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) {
    return false;
  }

  const tracesRaw = env.SENTRY_TRACES_SAMPLE_RATE?.trim();
  let tracesSampleRate = 0;
  if (tracesRaw) {
    const parsed = Number(tracesRaw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
      tracesSampleRate = parsed;
    }
  }

  try {
    Sentry.init({
      dsn,
      environment:
        env.SENTRY_ENVIRONMENT?.trim() ||
        env.NODE_ENV?.trim() ||
        'development',
      sendDefaultPii: false,
      tracesSampleRate,
      beforeSend: scrubSentryEvent,
      beforeBreadcrumb: scrubSentryBreadcrumb,
    });
    logger.log('Sentry initialized (DSN set)');
    return true;
  } catch (err) {
    logger.warn(
      `Sentry init failed — continuing without Sentry: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}

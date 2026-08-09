import {
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import {
  buildApiErrorBody,
  resolveRequestIdFromRequest,
} from './api-error.util';

/** HTTP status for Nest/Http exceptions; unexpected errors → 500. */
export function httpStatusFromException(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  if (typeof exception === 'object' && exception !== null) {
    if (
      'getStatus' in exception &&
      typeof (exception as { getStatus: unknown }).getStatus === 'function'
    ) {
      try {
        const status = (exception as { getStatus: () => unknown }).getStatus();
        if (typeof status === 'number' && Number.isFinite(status)) {
          return status;
        }
      } catch {
        // fall through
      }
    }
    if (
      'status' in exception &&
      typeof (exception as { status: unknown }).status === 'number'
    ) {
      return (exception as { status: number }).status;
    }
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

/** Report only server / unexpected failures — never client 4xx noise. */
export function shouldCaptureExceptionForSentry(exception: unknown): boolean {
  return httpStatusFromException(exception) >= 500;
}

/** True when Lane V `initSentryFromEnv` succeeded (DSN set + client live). */
export function isSentryClientActive(): boolean {
  return Boolean(Sentry.getClient());
}

type DiagnosticRequest = {
  requestId?: string;
  originalUrl?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type ErrorRecord = Record<string, unknown> & {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  type?: unknown;
  requestId?: unknown;
  request_id?: unknown;
  status?: unknown;
  statusCode?: unknown;
  raw?: unknown;
};

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function redactDiagnosticMessage(value: string): string {
  const redacted = value
    .replace(
      /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/g,
      '[REDACTED_API_KEY]',
    )
    .replace(/\bwhsec_[A-Za-z0-9_-]+\b/g, '[REDACTED_WEBHOOK_SECRET]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]');
  return redacted.length > 500 ? `${redacted.slice(0, 497)}...` : redacted;
}

function checkoutDiagnosticDetails(
  exception: unknown,
  req: DiagnosticRequest,
  status: number,
): Record<string, unknown> | null {
  if (status < 500) return null;
  const rawPath = req.originalUrl ?? req.url ?? '';
  const path = rawPath.split('?')[0] ?? rawPath;
  if (path !== '/api/v1/billing/checkout') return null;

  const requestBody =
    req.body && typeof req.body === 'object'
      ? (req.body as Record<string, unknown>)
      : {};
  const provider = stringValue(requestBody.provider);

  const details: Record<string, unknown> = {
    stage: 'checkout_backend',
    provider,
    reason:
      'Checkout failed on the server. Use this requestId to find the matching detailed API log.',
  };

  if (exception instanceof HttpException) {
    details.stage = 'billing_configuration_or_validation';
    details.reason = redactDiagnosticMessage(exception.message);
    return details;
  }

  if (typeof exception !== 'object' || exception === null) return details;

  const err = exception as ErrorRecord;
  const raw =
    typeof err.raw === 'object' && err.raw !== null
      ? (err.raw as ErrorRecord)
      : undefined;
  const code = stringValue(err.code) ?? stringValue(raw?.code);
  const type = stringValue(err.type) ?? stringValue(raw?.type);
  const providerRequestId =
    stringValue(err.requestId) ??
    stringValue(err.request_id) ??
    stringValue(raw?.requestId) ??
    stringValue(raw?.request_id);
  const providerStatusCode =
    numberValue(err.statusCode) ??
    numberValue(err.status) ??
    numberValue(raw?.statusCode) ??
    numberValue(raw?.status);
  const name =
    stringValue(err.name) ??
    (exception instanceof Error ? exception.name : undefined);
  const message =
    stringValue(err.message) ??
    (exception instanceof Error ? exception.message : undefined);

  const looksLikePrisma = Boolean(
    (code && /^P\d{4}$/i.test(code)) ||
      (name && /prisma/i.test(name)) ||
      (message && /prisma/i.test(message)),
  );
  if (looksLikePrisma) {
    details.stage = 'database';
    details.reason = 'A database operation failed during checkout.';
    if (code) details.providerCode = code;
    return details;
  }

  const looksLikeProvider = Boolean(
    type ||
      providerRequestId ||
      providerStatusCode !== undefined ||
      (code && !/^P\d{4}$/i.test(code)) ||
      (name && /stripe|mollie/i.test(name)),
  );
  if (looksLikeProvider) {
    details.stage = 'provider_checkout';
    if (message) details.reason = redactDiagnosticMessage(message);
    if (code) details.providerCode = code;
    if (type) details.providerErrorType = type;
    if (providerRequestId) details.providerRequestId = providerRequestId;
    if (providerStatusCode !== undefined) {
      details.providerStatusCode = providerStatusCode;
    }
  }

  return details;
}

/**
 * Global filter: capture 5xx/unexpected to Sentry when DSN configured.
 * Responds with §36 envelope `{ code, message, details, requestId }`.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  private readonly adapter: HttpAdapterHost['httpAdapter'];

  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
    this.adapter = httpAdapterHost.httpAdapter;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (shouldCaptureExceptionForSentry(exception) && isSentryClientActive()) {
      Sentry.captureException(exception);
    }

    if (host.getType() !== 'http') {
      super.catch(exception, host);
      return;
    }

    const ctx = host.switchToHttp();
    const req = ctx.getRequest<DiagnosticRequest>();
    const res = ctx.getResponse();
    const status = httpStatusFromException(exception);
    const requestId = resolveRequestIdFromRequest(req ?? {});
    try {
      this.adapter.setHeader?.(res, 'x-request-id', requestId);
    } catch {
      // some adapters may not expose setHeader the same way
    }
    const body = buildApiErrorBody(exception, requestId, status);
    const checkoutDetails = checkoutDiagnosticDetails(
      exception,
      req ?? {},
      status,
    );
    if (checkoutDetails) {
      body.details = { ...body.details, ...checkoutDetails };
    }
    this.adapter.reply(res, body, status);
  }
}

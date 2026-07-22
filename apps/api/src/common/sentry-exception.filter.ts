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
    const req = ctx.getRequest<{
      requestId?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const res = ctx.getResponse();
    const status = httpStatusFromException(exception);
    const requestId = resolveRequestIdFromRequest(req ?? {});
    try {
      this.adapter.setHeader?.(res, 'x-request-id', requestId);
    } catch {
      // some adapters may not expose setHeader the same way
    }
    const body = buildApiErrorBody(exception, requestId, status);
    this.adapter.reply(res, body, status);
  }
}

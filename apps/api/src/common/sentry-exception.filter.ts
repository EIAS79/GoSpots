import {
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/node';

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
 * Delegates response + Nest logging to BaseExceptionFilter.
 * 4xx stay out of Sentry (request interceptor already logs status).
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (shouldCaptureExceptionForSentry(exception) && isSentryClientActive()) {
      Sentry.captureException(exception);
    }
    super.catch(exception, host);
  }
}

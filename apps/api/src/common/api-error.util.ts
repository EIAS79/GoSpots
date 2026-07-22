import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import {
  errorCodeForHttpStatus,
  type ApiDomainErrorCodeValue,
} from './api-error.codes';

/** §36 throw-site helper — `{ code, message, details? }` for envelope mapping. */
export function apiConflictException(
  code: ApiDomainErrorCodeValue,
  message: string,
  details?: Record<string, unknown>,
): ConflictException {
  return new ConflictException(
    details !== undefined ? { code, message, details } : { code, message },
  );
}

/** §36 throw-site helper for 403 domain codes (captcha, CSRF, etc.). */
export function apiForbiddenException(
  code: ApiDomainErrorCodeValue,
  message: string,
  details?: Record<string, unknown>,
): ForbiddenException {
  return new ForbiddenException(
    details !== undefined ? { code, message, details } : { code, message },
  );
}

/** §36 throw-site helper for 401 domain codes (MFA, guest token, session, etc.). */
export function apiUnauthorizedException(
  code: ApiDomainErrorCodeValue,
  message: string,
  details?: Record<string, unknown>,
): UnauthorizedException {
  return new UnauthorizedException(
    details !== undefined ? { code, message, details } : { code, message },
  );
}

export type ApiErrorBody = {
  code: string;
  message: string;
  details: Record<string, unknown>;
  requestId: string;
};

/** Map HTTP status → stable machine code when exception has no custom `code`. */
export function defaultErrorCodeForStatus(status: number): string {
  return errorCodeForHttpStatus(status);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Build the §36 API error envelope from any thrown value.
 * Never puts stack traces or Prisma internals into `message`.
 */
export function buildApiErrorBody(
  exception: unknown,
  requestId: string,
  status = HttpStatus.INTERNAL_SERVER_ERROR,
): ApiErrorBody {
  let code = defaultErrorCodeForStatus(status);
  let message = 'An unexpected error occurred.';
  let details: Record<string, unknown> = {};

  if (exception instanceof HttpException) {
    const raw = exception.getResponse();
    if (typeof raw === 'string') {
      message = sanitizeClientMessage(raw, status);
    } else if (isRecord(raw)) {
      if (typeof raw.code === 'string' && raw.code.trim()) {
        code = raw.code.trim();
      }
      const msg = raw.message;
      if (typeof msg === 'string') {
        message = sanitizeClientMessage(msg, status);
      } else if (Array.isArray(msg)) {
        message = sanitizeClientMessage(
          msg.filter((m) => typeof m === 'string').join('; ') || message,
          status,
        );
        details = { ...details, messages: msg };
      }
      if (isRecord(raw.details)) {
        details = { ...details, ...raw.details };
      } else if (raw.error !== undefined && typeof raw.error === 'string') {
        // Nest default `{ statusCode, message, error }` — keep error as detail only
        details = { ...details, error: raw.error };
      }
    } else {
      message = sanitizeClientMessage(exception.message, status);
    }
  } else if (exception instanceof Error) {
    message =
      status >= 500
        ? 'An unexpected error occurred.'
        : sanitizeClientMessage(exception.message, status);
  }

  return { code, message, details, requestId };
}

/** Strip obvious internal leak patterns from client-facing messages. */
export function sanitizeClientMessage(message: string, status: number): string {
  const trimmed = message.trim() || 'Request failed.';
  if (status >= 500) {
    if (
      /prisma|sql|stack|ENOENT|ECONNREFUSED|password|secret|token/i.test(
        trimmed,
      )
    ) {
      return 'An unexpected error occurred.';
    }
  }
  // Cap length to avoid dumping huge validation dumps as the primary message
  if (trimmed.length > 500) return `${trimmed.slice(0, 497)}...`;
  return trimmed;
}

export function resolveRequestIdFromRequest(req: {
  requestId?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string {
  if (req.requestId && /^[\w.-]{8,128}$/.test(req.requestId)) {
    return req.requestId;
  }
  const raw = req.headers?.['x-request-id'];
  const fromHeader = Array.isArray(raw) ? raw[0] : raw;
  if (fromHeader && /^[\w.-]{8,128}$/.test(fromHeader)) {
    return fromHeader;
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

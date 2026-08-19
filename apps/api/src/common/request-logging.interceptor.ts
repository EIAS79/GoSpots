import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable, tap } from 'rxjs';
import { recordHttpRequest } from './metrics.util';
import type { JwtAccessPayload } from '../modules/auth/auth.service';

const REQUEST_ID_HEADER = 'x-request-id';

const SENSITIVE_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/g, '[REDACTED_API_KEY]'],
  [/\bwhsec_[A-Za-z0-9_-]+\b/g, '[REDACTED_WEBHOOK_SECRET]'],
  [/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]'],
];

type LoggedRequest = {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  user?: JwtAccessPayload;
  requestId?: string;
};

type LoggedResponse = {
  statusCode?: number;
  setHeader?: (k: string, v: string) => void;
};

type ErrorLike = Record<string, unknown> & {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  code?: unknown;
  type?: unknown;
  status?: unknown;
  statusCode?: unknown;
  requestId?: unknown;
  request_id?: unknown;
  decline_code?: unknown;
  declineCode?: unknown;
  param?: unknown;
  raw?: unknown;
  cause?: unknown;
};

/**
 * Structured request logging with safe diagnostic context.
 *
 * Every request receives x-request-id. Failed requests include enough information
 * to correlate browser, API, Stripe/Mollie and Sentry logs while deliberately
 * excluding cookies, Authorization, CSRF values, passwords and raw request bodies.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<LoggedRequest>();
    const res = http.getResponse<LoggedResponse>();

    const requestId = this.resolveRequestId(req);
    req.requestId = requestId;
    res.setHeader?.(REQUEST_ID_HEADER, requestId);

    const started = Date.now();
    const method = req.method ?? 'UNKNOWN';
    const path = this.safePath(req);

    return next.handle().pipe(
      tap({
        next: () =>
          this.writeSuccessLog(
            method,
            path,
            res.statusCode ?? 200,
            started,
            requestId,
            req,
          ),
        error: (err: unknown) =>
          this.writeErrorLog(
            method,
            path,
            this.statusFromError(err),
            started,
            requestId,
            req,
            err,
          ),
      }),
    );
  }

  private resolveRequestId(req: LoggedRequest): string {
    const raw = req.headers[REQUEST_ID_HEADER];
    const fromHeader = Array.isArray(raw) ? raw[0] : raw;
    if (fromHeader && /^[\w.-]{8,128}$/.test(fromHeader)) {
      return fromHeader;
    }
    return randomUUID();
  }

  private safePath(req: LoggedRequest): string {
    const raw = req.originalUrl ?? req.url ?? '';
    // Strip query string — it may contain reset/session tokens.
    const q = raw.indexOf('?');
    return q >= 0 ? raw.slice(0, q) : raw;
  }

  private statusFromError(err: unknown): number {
    if (err instanceof HttpException) return err.getStatus();
    if (typeof err === 'object' && err !== null) {
      const maybe = err as ErrorLike;
      if (typeof maybe.status === 'number') return maybe.status;
      if (typeof maybe.statusCode === 'number') return maybe.statusCode;
    }
    return 500;
  }

  private redactText(value: string): string {
    let redacted = value;
    for (const [pattern, replacement] of SENSITIVE_TEXT_PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }
    return redacted;
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim()
      ? this.redactText(value.trim())
      : undefined;
  }

  private numberValue(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private diagnosticRequestContext(
    path: string,
    req: LoggedRequest,
  ): Record<string, string | number | boolean | undefined> {
    const context: Record<string, string | number | boolean | undefined> = {
      authenticated: Boolean(req.user),
      shopId: req.user?.shopId ?? undefined,
    };

    if (path === '/api/v1/billing/checkout') {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as Record<string, unknown>)
          : {};
      const idempotency = req.headers['idempotency-key'];
      context.provider = this.stringValue(body.provider);
      context.renewalMode = this.stringValue(body.renewalMode);
      context.packId = this.stringValue(body.packId);
      context.currency = this.stringValue(body.currency);
      context.seatQuantity = this.numberValue(body.seatQuantity);
      context.addOnCount = Array.isArray(body.addOnIds)
        ? body.addOnIds.length
        : undefined;
      context.autoRenewConsent =
        typeof body.autoRenewConsent === 'boolean'
          ? body.autoRenewConsent
          : undefined;
      context.hasIdempotencyKey = Boolean(
        Array.isArray(idempotency) ? idempotency[0] : idempotency,
      );
    }

    return context;
  }

  private errorDiagnostic(err: unknown): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (err instanceof Error) {
      result.errorName = err.name;
      result.errorMessage = this.redactText(err.message);
      if (err.stack) result.stack = this.redactText(err.stack);
    } else {
      result.errorName = 'UnknownError';
      result.errorMessage = this.redactText(String(err));
    }

    if (err instanceof HttpException) {
      const response = err.getResponse();
      if (typeof response === 'object' && response !== null) {
        const envelope = response as Record<string, unknown>;
        const code = this.stringValue(envelope.code);
        if (code) result.errorCode = code;
        const message = this.stringValue(envelope.message);
        if (message) result.httpExceptionMessage = message;
      }
    }

    if (typeof err === 'object' && err !== null) {
      const e = err as ErrorLike;
      const raw =
        typeof e.raw === 'object' && e.raw !== null
          ? (e.raw as ErrorLike)
          : undefined;

      const errorCode = this.stringValue(e.code) ?? this.stringValue(raw?.code);
      const providerType =
        this.stringValue(e.type) ?? this.stringValue(raw?.type);
      const providerRequestId =
        this.stringValue(e.requestId) ??
        this.stringValue(e.request_id) ??
        this.stringValue(raw?.requestId) ??
        this.stringValue(raw?.request_id);
      const providerStatusCode =
        this.numberValue(e.statusCode) ??
        this.numberValue(e.status) ??
        this.numberValue(raw?.statusCode) ??
        this.numberValue(raw?.status);
      const providerParam =
        this.stringValue(e.param) ?? this.stringValue(raw?.param);
      const declineCode =
        this.stringValue(e.decline_code) ??
        this.stringValue(e.declineCode) ??
        this.stringValue(raw?.decline_code) ??
        this.stringValue(raw?.declineCode);

      if (errorCode) result.errorCode = errorCode;
      if (providerType) result.providerErrorType = providerType;
      if (providerRequestId) result.providerRequestId = providerRequestId;
      if (providerStatusCode !== undefined) {
        result.providerStatusCode = providerStatusCode;
      }
      if (providerParam) result.providerParam = providerParam;
      if (declineCode) result.declineCode = declineCode;

      if (e.cause instanceof Error) {
        result.causeName = e.cause.name;
        result.causeMessage = this.redactText(e.cause.message);
        if (e.cause.stack) result.causeStack = this.redactText(e.cause.stack);
      }
    }

    return result;
  }

  private shouldSkip(path: string): boolean {
    return (
      path === '/api/v1/live' ||
      path === '/api/v1/ready' ||
      path === '/api/v1/health' ||
      path === '/api/v1/metrics'
    );
  }

  private basePayload(
    method: string,
    path: string,
    statusCode: number,
    started: number,
    requestId: string,
    req: LoggedRequest,
  ): Record<string, unknown> {
    return {
      requestId,
      method,
      path,
      statusCode,
      durationMs: Date.now() - started,
      ...this.diagnosticRequestContext(path, req),
    };
  }

  private writeSuccessLog(
    method: string,
    path: string,
    statusCode: number,
    started: number,
    requestId: string,
    req: LoggedRequest,
  ) {
    if (this.shouldSkip(path)) return;

    recordHttpRequest(method, path, statusCode, Date.now() - started);
    this.logger.log(
      JSON.stringify(
        this.basePayload(method, path, statusCode, started, requestId, req),
      ),
    );
  }

  private writeErrorLog(
    method: string,
    path: string,
    statusCode: number,
    started: number,
    requestId: string,
    req: LoggedRequest,
    err: unknown,
  ) {
    if (this.shouldSkip(path)) return;

    recordHttpRequest(method, path, statusCode, Date.now() - started);
    const payload = {
      ...this.basePayload(method, path, statusCode, started, requestId, req),
      ...this.errorDiagnostic(err),
    };
    const line = JSON.stringify(payload);

    if (statusCode >= 500) {
      this.logger.error(line);
    } else {
      this.logger.warn(line);
    }
  }
}

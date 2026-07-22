import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable, tap } from 'rxjs';
import { recordHttpRequest } from './metrics.util';
import type { JwtAccessPayload } from '../modules/auth/auth.service';

const REQUEST_ID_HEADER = 'x-request-id';

type LoggedRequest = {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  user?: JwtAccessPayload;
  requestId?: string;
};

type LoggedResponse = {
  statusCode?: number;
  setHeader?: (k: string, v: string) => void;
};

/**
 * Minimal structured request logging.
 * Emits method, path, status, duration, requestId, shopId — never auth/secrets.
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
          this.writeLog(
            method,
            path,
            res.statusCode ?? 200,
            started,
            requestId,
            req,
          ),
        error: (err: unknown) => {
          let status = 500;
          if (typeof err === 'object' && err !== null && 'status' in err) {
            const maybe = err.status;
            if (typeof maybe === 'number') status = maybe;
          }
          this.writeLog(method, path, status, started, requestId, req);
        },
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
    // Strip query string — may contain tokens
    const q = raw.indexOf('?');
    return q >= 0 ? raw.slice(0, q) : raw;
  }

  private writeLog(
    method: string,
    path: string,
    statusCode: number,
    started: number,
    requestId: string,
    req: LoggedRequest,
  ) {
    // Skip noisy probe traffic in logs (still returns requestId header)
    if (
      path === '/api/v1/live' ||
      path === '/api/v1/ready' ||
      path === '/api/v1/health' ||
      path === '/api/v1/metrics'
    ) {
      return;
    }

    recordHttpRequest(method, statusCode, Date.now() - started);

    const shopId = req.user?.shopId ?? undefined;
    const payload: Record<string, string | number | undefined> = {
      requestId,
      method,
      path,
      statusCode,
      durationMs: Date.now() - started,
    };
    if (shopId) payload.shopId = shopId;

    this.logger.log(JSON.stringify(payload));
  }
}

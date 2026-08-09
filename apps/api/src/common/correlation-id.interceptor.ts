import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  CORRELATION_ID_HEADER,
  LEGACY_REQUEST_ID_HEADER,
  resolveCorrelationId,
} from './correlation-id.util';

type CorrelatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  correlationId?: string;
  requestId?: string;
};

type CorrelatedResponse = {
  setHeader?: (name: string, value: string) => void;
};

/**
 * Establishes one safe correlation ID before request logging and business code.
 * The legacy x-request-id alias is deliberately kept during the compatibility window.
 */
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<CorrelatedRequest>();
    const res = http.getResponse<CorrelatedResponse>();
    const correlationId = resolveCorrelationId(req.headers);

    req.correlationId = correlationId;
    req.requestId = correlationId;
    // RequestLoggingInterceptor already reads x-request-id; keep it synchronized so
    // its structured requestId field is the correlation ID without duplicate logging.
    req.headers[CORRELATION_ID_HEADER] = correlationId;
    req.headers[LEGACY_REQUEST_ID_HEADER] = correlationId;
    res.setHeader?.(CORRELATION_ID_HEADER, correlationId);
    res.setHeader?.(LEGACY_REQUEST_ID_HEADER, correlationId);

    return next.handle();
  }
}

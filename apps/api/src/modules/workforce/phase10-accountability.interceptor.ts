import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import {
  catchError,
  from,
  map,
  mergeMap,
  Observable,
  switchMap,
  throwError,
} from 'rxjs';
import type { JwtAccessPayload } from '../auth/auth.types';
import { Phase10AccountabilityService } from './phase10-accountability.service';
import { classifyAccountableAction } from './phase10.rules';

type RequestLike = {
  method?: string;
  originalUrl?: string;
  url?: string;
  body?: Record<string, unknown>;
  params?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  user?: JwtAccessPayload;
};

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function responseSourceId(
  value: unknown,
  request: RequestLike,
): string | undefined {
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    for (const key of [
      'id',
      'paymentId',
      'refundId',
      'transactionId',
      'orderId',
      'checkId',
    ]) {
      const candidate = row[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
  }
  const paramId = request.params?.id;
  return typeof paramId === 'string' && paramId.trim() ? paramId : undefined;
}

@Injectable()
export class Phase10AccountabilityInterceptor implements NestInterceptor {
  constructor(private readonly accountability: Phase10AccountabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const actor = request.user;
    if (!actor?.sub || !actor.shopId) return next.handle() as Observable<unknown>;

    const method = request.method ?? 'GET';
    const url = request.originalUrl ?? request.url ?? '';
    const lowerPath = url.toLowerCase().split('?')[0];
    const classification = classifyAccountableAction(method, url, request.body);
    const operatorToken = firstHeader(request.headers?.['x-operator-token']);
    const approvalRequestId = firstHeader(
      request.headers?.['x-staff-approval-id'],
    );

    const preflight =
      method.toUpperCase() === 'POST' &&
      lowerPath.endsWith('/workforce/clock-in')
        ? this.accountability.assertClockInAllowed(actor)
        : Promise.resolve();

    return from(preflight).pipe(
      switchMap(() =>
        from(
          this.accountability.prepareAction(
            actor,
            classification,
            operatorToken,
            approvalRequestId,
          ),
        ),
      ),
      switchMap((prepared) => {
        // A caller may send an arbitrary x-staff-approval-id even when the
        // configured policy does not require approval. Only an approval that
        // the service atomically reserved may be linked to immutable evidence.
        if (prepared && !prepared.approvalReserved) {
          prepared.approvalRequestId = undefined;
          prepared.approverMembershipId = undefined;
        }
        return (next.handle() as Observable<unknown>).pipe(
          mergeMap((value: unknown) =>
            from(
              this.accountability.finalizePreparedAction(
                prepared,
                responseSourceId(value, request),
                {
                  method: method.toUpperCase(),
                  path: lowerPath,
                  requestId: firstHeader(request.headers?.['x-request-id']),
                },
              ),
            ).pipe(map((): unknown => value)),
          ),
          catchError((error: unknown) =>
            from(this.accountability.abortPreparedAction(prepared)).pipe(
              mergeMap(() => throwError(() => error)),
            ),
          ),
        );
      }),
    );
  }
}

import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { from, Observable, switchMap } from 'rxjs';
import { requireShopId } from '../../common/tenant';
import type { JwtAccessPayload } from '../auth/auth.types';
import { Phase10ScheduleService } from './phase10-schedule.service';

type ScheduleRequest = {
  method?: string;
  originalUrl?: string;
  url?: string;
  body?: Record<string, unknown>;
  user?: JwtAccessPayload;
};

@Injectable()
export class Phase10ScheduleConflictInterceptor implements NestInterceptor {
  constructor(private readonly schedules: Phase10ScheduleService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<ScheduleRequest>();
    const actor = request.user;
    const path = String(request.originalUrl ?? request.url ?? '')
      .toLowerCase()
      .split('?')[0];
    if (
      !actor?.sub ||
      !actor.shopId ||
      String(request.method ?? '').toUpperCase() !== 'POST' ||
      !path.endsWith('/workforce/schedule')
    ) {
      return next.handle() as Observable<unknown>;
    }

    return from(this.assertConflictFree(actor, request.body ?? {})).pipe(
      switchMap(() => next.handle() as Observable<unknown>),
    );
  }

  private async assertConflictFree(
    actor: JwtAccessPayload,
    body: Record<string, unknown>,
  ) {
    const membershipId =
      typeof body.membershipId === 'string' ? body.membershipId.trim() : '';
    const startsAt =
      typeof body.startsAt === 'string' ? new Date(body.startsAt) : new Date(NaN);
    const endsAt =
      typeof body.endsAt === 'string' ? new Date(body.endsAt) : new Date(NaN);
    if (!membershipId || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return;
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('Shift end must be after start.');
    }
    await this.schedules.assertNoConflict({
      shopId: requireShopId(actor),
      membershipId,
      startsAt,
      endsAt,
    });
  }
}
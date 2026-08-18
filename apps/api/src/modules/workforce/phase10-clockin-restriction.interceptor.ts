import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { DeviceStatus } from '@prisma/client';
import { from, Observable, switchMap } from 'rxjs';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import { distanceBetweenCoordinatesMeters } from './phase10.rules';

type ClockInRequest = {
  method?: string;
  originalUrl?: string;
  url?: string;
  body?: Record<string, unknown>;
  user?: JwtAccessPayload;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Optional clock-in boundary required by Phase 10. Existing venues are unchanged
 * until an owner enables device and/or location restrictions in WorkforcePolicy.
 */
@Injectable()
export class Phase10ClockInRestrictionInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<ClockInRequest>();
    const actor = request.user;
    const method = String(request.method ?? 'GET').toUpperCase();
    const path = String(request.originalUrl ?? request.url ?? '')
      .toLowerCase()
      .split('?')[0];

    if (
      !actor?.sub ||
      !actor.shopId ||
      method !== 'POST' ||
      !path.endsWith('/workforce/clock-in')
    ) {
      return next.handle() as Observable<unknown>;
    }

    return from(this.assertRestrictions(actor, request.body ?? {})).pipe(
      switchMap(() => next.handle() as Observable<unknown>),
    );
  }

  private async assertRestrictions(
    actor: JwtAccessPayload,
    body: Record<string, unknown>,
  ) {
    const shopId = requireShopId(actor);
    const policy = await this.prisma.workforcePolicy.findUnique({
      where: { shopId },
    });
    if (!policy) return;

    if (policy.clockInDeviceRequired) {
      const deviceId =
        typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
      if (!deviceId) {
        throw new ForbiddenException(
          'Clock-in requires an active registered venue device.',
        );
      }
      const device = await this.prisma.device.findFirst({
        where: { id: deviceId, shopId, status: DeviceStatus.ACTIVE },
        select: { id: true },
      });
      if (!device) {
        throw new ForbiddenException(
          'Clock-in device is not active or does not belong to this venue.',
        );
      }
      if (
        policy.clockInAllowedDeviceIds.length > 0 &&
        !policy.clockInAllowedDeviceIds.includes(device.id)
      ) {
        throw new ForbiddenException(
          'This registered device is not approved for workforce clock-in.',
        );
      }
    }

    if (policy.clockInLocationRequired) {
      const latitude = finiteNumber(body.latitude);
      const longitude = finiteNumber(body.longitude);
      if (
        latitude == null ||
        longitude == null ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new ForbiddenException(
          'Clock-in requires valid venue location evidence.',
        );
      }
      if (policy.clockInLatitude == null || policy.clockInLongitude == null) {
        throw new ForbiddenException(
          'Venue clock-in geofence is enabled but not configured.',
        );
      }
      const distance = distanceBetweenCoordinatesMeters(
        { latitude: policy.clockInLatitude, longitude: policy.clockInLongitude },
        { latitude, longitude },
      );
      if (distance > policy.clockInRadiusMeters) {
        throw new ForbiddenException(
          'Clock-in location is outside the configured venue radius.',
        );
      }
    }
  }
}
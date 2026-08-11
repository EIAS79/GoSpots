import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ReservationStatus,
  ResourceStatus,
  ResourceType,
  type PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { assertBookingSlotFree } from '../../common/booking-overlap.util';
import { withResourceBookingLock } from '../../common/booking-lock.util';
import {
  assertGuestTokenActive,
  guestTokenLookupWhere,
  guestTokenPersistFields,
  guestTokenRevokeFields,
  issueGuestToken,
  verifyPresentedGuestToken,
} from '../../common/guest-token.util';
import { assertWithinOpeningHours } from '../../common/opening-hours.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';

export type CapacityRequest = {
  startsAt: string;
  endsAt: string;
  partySize?: number;
  resourceId?: string;
  resourceCategoryId?: string;
  resourceType?: string;
};

export type UnifiedBookingInput = CapacityRequest & {
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  notes?: string;
  sourceChannel: string;
  recurrence?: {
    frequency: 'DAILY' | 'WEEKLY';
    count: number;
  };
};

type CapacityCandidate = {
  id: string;
  name: string;
  type: string | null;
  categoryId: string | null;
  capacity: number | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

type CapacityPolicy = {
  resourceCategoryId: string | null;
  resourceType: string | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minPartySize: number;
  maxPartySize: number | null;
};

type DbClient = PrismaClient | Prisma.TransactionClient | PrismaService;

@Injectable()
export class GrowthCapacityService {
  constructor(private readonly prisma: PrismaService) {}

  async capacity(actor: JwtAccessPayload, dto: CapacityRequest) {
    return this.capacityForShop(requireShopId(actor), dto);
  }

  async capacityForShop(shopId: string, dto: CapacityRequest) {
    const { startsAt, endsAt, partySize } = this.parseWindow(dto);
    await assertWithinOpeningHours(this.prisma, shopId, startsAt, endsAt);

    const resourceType = this.parseResourceType(dto.resourceType);
    const where: Prisma.ResourceWhereInput = {
      shopId,
      status: { not: ResourceStatus.MAINTENANCE },
      ...(dto.resourceId ? { id: dto.resourceId } : {}),
      ...(dto.resourceCategoryId
        ? { categoryId: dto.resourceCategoryId }
        : {}),
      ...(resourceType ? { type: resourceType } : {}),
      OR: [{ capacity: null }, { capacity: { gte: partySize } }],
    };

    const [resources, policies] = await Promise.all([
      this.prisma.resource.findMany({
        where,
        orderBy: [{ capacity: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          type: true,
          categoryId: true,
          capacity: true,
        },
      }),
      this.prisma.reservationCapacityPolicy.findMany({
        where: { shopId, active: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const available: CapacityCandidate[] = [];
    const unavailable: Array<{ resourceId: string; reason: string }> = [];

    for (const resource of resources) {
      const policy = this.pickPolicy(policies, resource);
      if (
        partySize < (policy?.minPartySize ?? 1) ||
        (policy?.maxPartySize != null && partySize > policy.maxPartySize)
      ) {
        unavailable.push({ resourceId: resource.id, reason: 'PARTY_SIZE' });
        continue;
      }

      const bufferBeforeMinutes = Math.max(0, policy?.bufferBeforeMinutes ?? 0);
      const bufferAfterMinutes = Math.max(0, policy?.bufferAfterMinutes ?? 0);
      const blockedStart = new Date(
        startsAt.getTime() - bufferBeforeMinutes * 60_000,
      );
      const blockedEnd = new Date(
        endsAt.getTime() + bufferAfterMinutes * 60_000,
      );

      try {
        await assertBookingSlotFree(
          this.prisma,
          shopId,
          resource.id,
          blockedStart,
          blockedEnd,
        );
        await this.assertOperationallyFree(
          shopId,
          resource.id,
          blockedStart,
          blockedEnd,
        );
        available.push({
          ...resource,
          bufferBeforeMinutes,
          bufferAfterMinutes,
        });
      } catch (error) {
        unavailable.push({
          resourceId: resource.id,
          reason: this.errorReason(error),
        });
      }
    }

    return {
      startsAt,
      endsAt,
      partySize,
      requested: {
        resourceId: dto.resourceId ?? null,
        resourceCategoryId: dto.resourceCategoryId ?? null,
        resourceType: resourceType ?? null,
      },
      available,
      unavailable,
    };
  }

  async assertResourceIntervalAvailable(
    shopId: string,
    resourceId: string,
    startsAt: Date,
    endsAt: Date,
    partySize = 1,
  ) {
    const result = await this.capacityForShop(shopId, {
      resourceId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      partySize,
    });
    const candidate = result.available.find((item) => item.id === resourceId);
    if (!candidate) {
      throw new ConflictException('Resource is not available for this interval.');
    }
    return candidate;
  }

  async assertOperationallyFreeInTransaction(
    tx: Prisma.TransactionClient,
    shopId: string,
    resourceId: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    return this.assertOperationallyFree(
      shopId,
      resourceId,
      startsAt,
      endsAt,
      tx,
    );
  }

  async createStaff(actor: JwtAccessPayload, dto: UnifiedBookingInput) {
    return this.createForShop(requireShopId(actor), dto, {
      actorUserId: actor.sub,
      issuePublicToken: false,
    });
  }

  async createPublic(shopId: string, dto: UnifiedBookingInput) {
    return this.createForShop(shopId, dto, {
      actorUserId: null,
      issuePublicToken: true,
    });
  }

  async createForShop(
    shopId: string,
    dto: UnifiedBookingInput,
    options: { actorUserId: string | null; issuePublicToken: boolean },
  ) {
    if (!dto.guestName?.trim()) {
      throw new BadRequestException('Guest name is required.');
    }
    if (!dto.sourceChannel?.trim()) {
      throw new BadRequestException('sourceChannel is required.');
    }

    const recurrenceCount = dto.recurrence?.count ?? 1;
    if (
      !Number.isInteger(recurrenceCount) ||
      recurrenceCount < 1 ||
      recurrenceCount > 24
    ) {
      throw new BadRequestException(
        'Recurrence count must be between 1 and 24.',
      );
    }

    const first = this.parseWindow(dto);
    const seriesId = recurrenceCount > 1 ? randomUUID() : null;
    const windows = Array.from({ length: recurrenceCount }, (_, index) => {
      const deltaDays =
        dto.recurrence?.frequency === 'DAILY' ? index : index * 7;
      return {
        startsAt: new Date(first.startsAt.getTime() + deltaDays * 86_400_000),
        endsAt: new Date(first.endsAt.getTime() + deltaDays * 86_400_000),
      };
    });

    const assignments: Array<{
      startsAt: Date;
      endsAt: Date;
      candidate: CapacityCandidate;
      guestToken: ReturnType<typeof issueGuestToken> | null;
    }> = [];

    for (const window of windows) {
      const result = await this.capacityForShop(shopId, {
        ...dto,
        startsAt: window.startsAt.toISOString(),
        endsAt: window.endsAt.toISOString(),
      });
      const candidate = result.available[0];
      if (!candidate) {
        throw new ConflictException(
          `No capacity is available for ${window.startsAt.toISOString()}.`,
        );
      }
      assignments.push({
        ...window,
        candidate,
        guestToken: options.issuePublicToken
          ? issueGuestToken({ from: window.endsAt })
          : null,
      });
    }

    const lockResourceIds = [
      ...new Set(assignments.map((assignment) => assignment.candidate.id)),
    ].sort();

    const rows = await this.prisma.$transaction(async (tx) => {
      for (const resourceId of lockResourceIds) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:growth-booking:${resourceId}`}))`;
      }

      const created: Array<{
        reservationId: string;
        resourceId: string;
        startsAt: Date;
        endsAt: Date;
        guestToken?: string;
      }> = [];

      for (const assignment of assignments) {
        const blockedStart = new Date(
          assignment.startsAt.getTime() -
            assignment.candidate.bufferBeforeMinutes * 60_000,
        );
        const blockedEnd = new Date(
          assignment.endsAt.getTime() +
            assignment.candidate.bufferAfterMinutes * 60_000,
        );

        await assertBookingSlotFree(
          tx,
          shopId,
          assignment.candidate.id,
          blockedStart,
          blockedEnd,
        );
        await this.assertOperationallyFree(
          shopId,
          assignment.candidate.id,
          blockedStart,
          blockedEnd,
          tx,
        );

        const issued = assignment.guestToken;
        const reservation = await tx.reservation.create({
          data: {
            shopId,
            resourceId: assignment.candidate.id,
            guestName: dto.guestName.trim(),
            guestEmail: dto.guestEmail?.trim() || null,
            guestPhone: dto.guestPhone?.trim() || null,
            partySize: first.partySize,
            startsAt: assignment.startsAt,
            endsAt: assignment.endsAt,
            status: ReservationStatus.CONFIRMED,
            staffAlert: options.issuePublicToken,
            notes: dto.notes?.trim() || null,
            ...(issued ? guestTokenPersistFields(issued) : {}),
          },
        });

        await tx.reservationBookingEvidence.create({
          data: {
            shopId,
            reservationId: reservation.id,
            sourceChannel: dto.sourceChannel.trim().toUpperCase(),
            requestedCategoryId: dto.resourceCategoryId ?? null,
            requestedResourceType: dto.resourceType ?? null,
            assignedResourceId: assignment.candidate.id,
            bufferBeforeMinutes: assignment.candidate.bufferBeforeMinutes,
            bufferAfterMinutes: assignment.candidate.bufferAfterMinutes,
            recurrenceSeriesId: seriesId,
            recurrenceRule: dto.recurrence
              ? (dto.recurrence as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });

        created.push({
          reservationId: reservation.id,
          resourceId: assignment.candidate.id,
          startsAt: reservation.startsAt,
          endsAt: reservation.endsAt,
          ...(issued ? { guestToken: issued.raw } : {}),
        });
      }

      return created;
    });

    return { recurrenceSeriesId: seriesId, reservations: rows };
  }

  async reschedulePublic(
    shopId: string,
    reservationId: string,
    guestToken: string,
    dto: CapacityRequest,
  ) {
    const current = await this.requireGuestReservation(
      shopId,
      reservationId,
      guestToken,
    );
    const capacity = await this.capacityForShop(shopId, {
      ...dto,
      resourceId: dto.resourceId ?? current.resourceId ?? undefined,
      partySize: dto.partySize ?? current.partySize,
    });
    const candidate = capacity.available[0];
    if (!candidate) {
      throw new ConflictException('No capacity is available for that time.');
    }
    const { startsAt, endsAt } = this.parseWindow(dto);

    return withResourceBookingLock(this.prisma, candidate.id, async (tx) => {
      const blockedStart = new Date(
        startsAt.getTime() - candidate.bufferBeforeMinutes * 60_000,
      );
      const blockedEnd = new Date(
        endsAt.getTime() + candidate.bufferAfterMinutes * 60_000,
      );
      await assertBookingSlotFree(
        tx,
        shopId,
        candidate.id,
        blockedStart,
        blockedEnd,
        current.id,
      );
      await this.assertOperationallyFree(
        shopId,
        candidate.id,
        blockedStart,
        blockedEnd,
        tx,
      );

      const row = await tx.reservation.update({
        where: { id: current.id },
        data: {
          resourceId: candidate.id,
          startsAt,
          endsAt,
          partySize: dto.partySize ?? current.partySize,
        },
      });
      await tx.reservationBookingEvidence.upsert({
        where: { reservationId: current.id },
        create: {
          shopId,
          reservationId: current.id,
          sourceChannel: 'PUBLIC_RESCHEDULE',
          requestedCategoryId: dto.resourceCategoryId ?? null,
          requestedResourceType: dto.resourceType ?? null,
          assignedResourceId: candidate.id,
          bufferBeforeMinutes: candidate.bufferBeforeMinutes,
          bufferAfterMinutes: candidate.bufferAfterMinutes,
        },
        update: {
          assignedResourceId: candidate.id,
          requestedCategoryId: dto.resourceCategoryId ?? undefined,
          requestedResourceType: dto.resourceType ?? undefined,
          bufferBeforeMinutes: candidate.bufferBeforeMinutes,
          bufferAfterMinutes: candidate.bufferAfterMinutes,
        },
      });
      return row;
    });
  }

  async cancelPublic(
    shopId: string,
    reservationId: string,
    guestToken: string,
    reason?: string,
  ) {
    const row = await this.requireGuestReservation(
      shopId,
      reservationId,
      guestToken,
    );
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.reservation.update({
        where: { id: row.id },
        data: {
          status: ReservationStatus.CANCELED,
          ...guestTokenRevokeFields(now),
        },
      }),
      this.prisma.reservationBookingEvidence.upsert({
        where: { reservationId: row.id },
        create: {
          shopId,
          reservationId: row.id,
          sourceChannel: 'PUBLIC_CANCEL',
          assignedResourceId: row.resourceId,
          canceledAt: now,
          cancellationReason: reason?.trim() || null,
        },
        update: {
          canceledAt: now,
          cancellationReason: reason?.trim() || null,
        },
      }),
    ]);
    return { ok: true };
  }

  async checkIn(actor: JwtAccessPayload, reservationId: string) {
    const shopId = requireShopId(actor);
    const row = await this.prisma.reservation.findFirst({
      where: { id: reservationId, shopId },
    });
    if (!row) throw new NotFoundException('Reservation not found.');
    if (
      row.status !== ReservationStatus.PENDING &&
      row.status !== ReservationStatus.CONFIRMED
    ) {
      throw new ConflictException(
        'Only an upcoming reservation can be checked in.',
      );
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.update({
        where: { id: row.id },
        data: { status: ReservationStatus.CHECKED_IN },
      });
      await tx.reservationBookingEvidence.upsert({
        where: { reservationId: row.id },
        create: {
          shopId,
          reservationId: row.id,
          sourceChannel: 'STAFF',
          assignedResourceId: row.resourceId,
          checkedInAt: now,
          checkedInById: actor.sub,
        },
        update: { checkedInAt: now, checkedInById: actor.sub },
      });
      return reservation;
    });
  }

  async applyDeposit(
    actor: JwtAccessPayload,
    reservationId: string,
    input: {
      guestCheckId: string;
      amountMinor: number;
      currency?: string;
      correlationId: string;
    },
  ) {
    const shopId = requireShopId(actor);
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new BadRequestException('amountMinor must be a positive integer.');
    }
    if (!input.correlationId?.trim()) {
      throw new BadRequestException('correlationId is required.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:reservation-deposit:${reservationId}`}))`;
      const existing = await tx.reservationDepositApplication.findFirst({
        where: { shopId, correlationId: input.correlationId },
      });
      if (existing) return existing;

      const [reservation, guestCheck, ledger, applications, shop] =
        await Promise.all([
          tx.reservation.findFirst({ where: { id: reservationId, shopId } }),
          tx.guestCheck.findFirst({ where: { id: input.guestCheckId, shopId } }),
          tx.reservationDepositLedgerEntry.findMany({
            where: { shopId, reservationId },
          }),
          tx.reservationDepositApplication.findMany({
            where: { shopId, reservationId },
          }),
          tx.shop.findUnique({ where: { id: shopId }, select: { currency: true } }),
        ]);

      if (!reservation) throw new NotFoundException('Reservation not found.');
      if (!guestCheck) throw new NotFoundException('Guest check not found.');

      const depositBalance = ledger.reduce(
        (sum, entry) => sum + entry.amountMinor,
        0,
      );
      const applied = applications.reduce(
        (sum, application) => sum + application.amountMinor,
        0,
      );
      if (depositBalance - applied < input.amountMinor) {
        throw new ConflictException(
          'Deposit application exceeds the unapplied deposit balance.',
        );
      }

      return tx.reservationDepositApplication.create({
        data: {
          shopId,
          reservationId,
          guestCheckId: input.guestCheckId,
          amountMinor: input.amountMinor,
          currency: (input.currency ?? shop?.currency ?? 'EUR').toUpperCase(),
          correlationId: input.correlationId.trim(),
          actorUserId: actor.sub,
        },
      });
    });
  }

  async expireWaitlist(shopId: string, at = new Date()) {
    const result = await this.prisma.reservationWaitlistEntry.updateMany({
      where: {
        shopId,
        status: 'OFFERED',
        offerExpiresAt: { lte: at },
      },
      data: { status: 'EXPIRED' },
    });
    return { expired: result.count };
  }

  private parseWindow(dto: CapacityRequest) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Invalid start or end date/time.');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('End time must be after start time.');
    }
    if (endsAt.getTime() - startsAt.getTime() > 24 * 60 * 60 * 1000) {
      throw new BadRequestException('A booking cannot span more than 24 hours.');
    }
    const partySize = dto.partySize ?? 1;
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 500) {
      throw new BadRequestException('partySize must be between 1 and 500.');
    }
    return { startsAt, endsAt, partySize };
  }

  private parseResourceType(value?: string) {
    if (!value) return undefined;
    if (!Object.values(ResourceType).includes(value as ResourceType)) {
      throw new BadRequestException('Unsupported resourceType.');
    }
    return value as ResourceType;
  }

  private pickPolicy(
    policies: CapacityPolicy[],
    resource: { categoryId: string | null; type: string | null },
  ) {
    return (
      policies.find(
        (policy) =>
          policy.resourceCategoryId != null &&
          policy.resourceCategoryId === resource.categoryId,
      ) ??
      policies.find(
        (policy) =>
          policy.resourceType != null && policy.resourceType === resource.type,
      ) ??
      policies.find(
        (policy) =>
          policy.resourceCategoryId == null && policy.resourceType == null,
      ) ??
      null
    );
  }

  private async assertOperationallyFree(
    shopId: string,
    resourceId: string,
    startsAt: Date,
    endsAt: Date,
    client: DbClient = this.prisma,
  ) {
    const now = new Date();
    const [maintenance, session, hold] = await Promise.all([
      client.resourceMaintenancePeriod.findFirst({
        where: {
          shopId,
          resourceId,
          startsAt: { lt: endsAt },
          OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
        },
      }),
      client.operationsSession.findFirst({
        where: {
          shopId,
          resourceId,
          status: { in: ['ACTIVE', 'PAUSED'] },
          startedAt: { lt: endsAt },
          OR: [{ finishedAt: null }, { finishedAt: { gt: startsAt } }],
        },
      }),
      client.eventResourceHold.findFirst({
        where: {
          shopId,
          resourceId,
          status: { in: ['HOLD', 'CONFIRMED'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
    ]);

    if (maintenance) {
      throw new ConflictException('Resource is blocked for maintenance.');
    }
    if (session) {
      throw new ConflictException('Resource has an active operations session.');
    }
    if (hold) {
      throw new ConflictException('Resource is held by an event.');
    }
  }

  private async requireGuestReservation(
    shopId: string,
    reservationId: string,
    token: string,
  ) {
    const row = await this.prisma.reservation.findFirst({
      where: {
        id: reservationId,
        ...guestTokenLookupWhere(shopId, token),
      },
    });
    if (!row || !verifyPresentedGuestToken(row, token)) {
      throw new NotFoundException('Booking not found.');
    }
    assertGuestTokenActive(row);
    return row;
  }

  private errorReason(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    return 'CONFLICT';
  }
}

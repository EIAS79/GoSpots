import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertBookingSlotFree } from '../../common/booking-overlap.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { GrowthCapacityService } from './growth-capacity.service';
import { projectSignedBalance, signedLedgerAmount } from './growth.rules';
import type {
  AttachReservationPolicyDto,
  CreateReservationPolicyDto,
  CreateWaitlistDto,
  OfferWaitlistDto,
  RecordDepositDto,
  ReservationOutcomeDto,
} from './growth.types';

@Injectable()
export class ReservationGrowthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly capacity: GrowthCapacityService,
  ) {}

  listPolicies(actor: JwtAccessPayload) {
    return this.prisma.reservationPolicy.findMany({
      where: { shopId: requireShopId(actor) },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createPolicy(actor: JwtAccessPayload, dto: CreateReservationPolicyDto) {
    const shopId = requireShopId(actor);
    const depositKind = dto.depositKind ?? 'NONE';
    if (
      depositKind === 'FIXED' &&
      (!Number.isInteger(dto.depositFixedMinor) || Number(dto.depositFixedMinor) < 0)
    ) {
      throw new BadRequestException(
        'Fixed deposit requires non-negative depositFixedMinor.',
      );
    }
    if (
      depositKind === 'PERCENT' &&
      (!Number.isInteger(dto.depositPercentBps) ||
        Number(dto.depositPercentBps) < 0 ||
        Number(dto.depositPercentBps) > 10_000)
    ) {
      throw new BadRequestException(
        'Percent deposit requires depositPercentBps from 0 to 10000.',
      );
    }
    const row = await this.prisma.reservationPolicy.create({
      data: {
        shopId,
        name: dto.name.trim(),
        depositKind,
        depositFixedMinor: dto.depositFixedMinor,
        depositPercentBps: dto.depositPercentBps,
        cancellationWindowMinutes: Math.max(0, dto.cancellationWindowMinutes ?? 0),
        lateCancelForfeitPercent: this.percent(dto.lateCancelForfeitPercent ?? 0),
        noShowForfeitPercent: this.percent(dto.noShowForfeitPercent ?? 100),
      },
    });
    await this.record(actor, 'reservation.policy.create', 'Created reservation policy', {
      policyId: row.id,
    });
    return row;
  }

  async attachPolicy(
    actor: JwtAccessPayload,
    reservationId: string,
    dto: AttachReservationPolicyDto,
  ) {
    const shopId = requireShopId(actor);
    const reservation = await this.requireReservation(shopId, reservationId);
    const policy = await this.prisma.reservationPolicy.findFirst({
      where: { id: dto.policyId, shopId, active: true },
    });
    if (!policy) throw new NotFoundException('Reservation policy not found.');
    const snapshot = {
      name: policy.name,
      depositKind: policy.depositKind,
      depositFixedMinor: policy.depositFixedMinor,
      depositPercentBps: policy.depositPercentBps,
      cancellationWindowMinutes: policy.cancellationWindowMinutes,
      lateCancelForfeitPercent: policy.lateCancelForfeitPercent,
      noShowForfeitPercent: policy.noShowForfeitPercent,
      capturedAt: new Date().toISOString(),
    };
    const extension = await this.prisma.reservationExtension.upsert({
      where: { reservationId },
      create: {
        shopId,
        reservationId,
        policyId: policy.id,
        policySnapshot: snapshot as Prisma.InputJsonValue,
      },
      update: {
        policyId: policy.id,
        policySnapshot: snapshot as Prisma.InputJsonValue,
      },
    });
    await this.record(actor, 'reservation.policy.attach', 'Attached policy snapshot', {
      reservationId,
      policyId: policy.id,
    });
    return {
      ...extension,
      depositRequiredMinor: this.requiredDepositMinor(reservation, policy),
    };
  }

  async recordDeposit(
    actor: JwtAccessPayload,
    reservationId: string,
    dto: RecordDepositDto,
  ) {
    const shopId = requireShopId(actor);
    await this.requireReservation(shopId, reservationId);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    const signedAmount = signedLedgerAmount(dto.type, dto.amountMinor, [
      'REFUND',
      'FORFEIT',
    ]);
    const entry = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reservation-deposit:${shopId}:${reservationId}`}))`;
      const existing = await tx.reservationDepositLedgerEntry.findUnique({
        where: { shopId_correlationId: { shopId, correlationId: dto.correlationId } },
      });
      if (existing) return existing;
      if (dto.type === 'CAPTURE') {
        if (!dto.paymentId) throw new BadRequestException('CAPTURE requires paymentId.');
        const payment = await tx.payment.findFirst({
          where: { id: dto.paymentId, shopId, status: 'SUCCESS' },
        });
        if (!payment) {
          throw new ConflictException('Successful payment evidence was not found.');
        }
      }
      if (dto.type === 'REFUND') {
        if (!dto.refundId) throw new BadRequestException('REFUND requires refundId.');
        const refund = await tx.refund.findFirst({
          where: { id: dto.refundId, shopId, state: 'SUCCEEDED' },
        });
        if (!refund) {
          throw new ConflictException('Successful refund evidence was not found.');
        }
      }
      const prior = await tx.reservationDepositLedgerEntry.findMany({
        where: { shopId, reservationId },
        select: { amountMinor: true },
      });
      if (signedAmount < 0 && projectSignedBalance(prior) + signedAmount < 0) {
        throw new ConflictException(
          'Deposit refund/forfeit cannot exceed captured balance.',
        );
      }
      return tx.reservationDepositLedgerEntry.create({
        data: {
          shopId,
          reservationId,
          type: dto.type,
          amountMinor: signedAmount,
          currency: (dto.currency ?? shop?.currency ?? 'EUR').toUpperCase(),
          paymentId: dto.paymentId,
          refundId: dto.refundId,
          correlationId: dto.correlationId,
          note: dto.note,
          actorUserId: actor.sub,
        },
      });
    });
    await this.record(actor, 'reservation.deposit.record', 'Recorded deposit movement', {
      reservationId,
      entryId: entry.id,
      amountMinor: entry.amountMinor,
    });
    return { entry, summary: await this.depositSummary(actor, reservationId) };
  }

  async depositSummary(actor: JwtAccessPayload, reservationId: string) {
    const shopId = requireShopId(actor);
    await this.requireReservation(shopId, reservationId);
    const entries = await this.prisma.reservationDepositLedgerEntry.findMany({
      where: { shopId, reservationId },
      orderBy: { createdAt: 'asc' },
    });
    const applications = await this.prisma.reservationDepositApplication.findMany({
      where: { shopId, reservationId },
      orderBy: { createdAt: 'asc' },
    });
    const balanceMinor = projectSignedBalance(entries);
    const appliedMinor = applications.reduce((sum, row) => sum + row.amountMinor, 0);
    return {
      reservationId,
      balanceMinor,
      appliedMinor,
      unappliedMinor: Math.max(0, balanceMinor - appliedMinor),
      capturedMinor: entries
        .filter((row) => row.type === 'CAPTURE')
        .reduce((sum, row) => sum + row.amountMinor, 0),
      refundedMinor: -entries
        .filter((row) => row.type === 'REFUND')
        .reduce((sum, row) => sum + row.amountMinor, 0),
      forfeitedMinor: -entries
        .filter((row) => row.type === 'FORFEIT')
        .reduce((sum, row) => sum + row.amountMinor, 0),
      entries,
      applications,
    };
  }

  async closeReservation(
    actor: JwtAccessPayload,
    id: string,
    dto: ReservationOutcomeDto,
  ) {
    const shopId = requireShopId(actor);
    const reservation = await this.requireReservation(shopId, id);
    if (reservation.status === dto.outcome) {
      return { reservation, deposit: await this.depositSummary(actor, id) };
    }
    const extension = await this.prisma.reservationExtension.findFirst({
      where: { shopId, reservationId: id },
    });
    const policy = extension?.policyId
      ? await this.prisma.reservationPolicy.findFirst({
          where: { id: extension.policyId, shopId },
        })
      : null;
    const summary = await this.depositSummary(actor, id);
    const late = policy
      ? reservation.startsAt.getTime() - Date.now() <=
        policy.cancellationWindowMinutes * 60_000
      : false;
    const forfeitPercent =
      dto.outcome === 'NO_SHOW'
        ? policy?.noShowForfeitPercent ?? 0
        : late
          ? policy?.lateCancelForfeitPercent ?? 0
          : 0;
    const forfeitMinor = Math.min(
      summary.unappliedMinor,
      Math.round((summary.unappliedMinor * forfeitPercent) / 100),
    );
    if (forfeitMinor > 0) {
      await this.recordDeposit(actor, id, {
        type: 'FORFEIT',
        amountMinor: forfeitMinor,
        currency: summary.entries[0]?.currency,
        correlationId: `reservation-outcome:${id}:${dto.outcome}`,
        note: dto.reason ?? `${dto.outcome} policy forfeit`,
      });
    }
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: dto.outcome, version: { increment: 1 } },
    });
    const after = await this.depositSummary(actor, id);
    await this.record(actor, 'reservation.outcome', 'Applied reservation outcome policy', {
      reservationId: id,
      outcome: dto.outcome,
      forfeitMinor,
      refundDueMinor: after.unappliedMinor,
    });
    return { reservation: updated, deposit: after, refundDueMinor: after.unappliedMinor };
  }

  async createWaitlist(actor: JwtAccessPayload, dto: CreateWaitlistDto) {
    return this.createWaitlistForShop(requireShopId(actor), dto, actor.sub);
  }

  async createWaitlistForShop(
    shopId: string,
    dto: CreateWaitlistDto,
    actorUserId: string | null = null,
  ) {
    const desiredStartsAt = new Date(dto.desiredStartsAt);
    const desiredEndsAt = new Date(dto.desiredEndsAt);
    this.assertInterval(desiredStartsAt, desiredEndsAt);
    if (!dto.guestName?.trim()) throw new BadRequestException('Guest name is required.');
    if (dto.resourceId) await this.requireResource(shopId, dto.resourceId);
    const row = await this.prisma.reservationWaitlistEntry.create({
      data: {
        shopId,
        resourceId: dto.resourceId,
        guestName: dto.guestName.trim(),
        guestEmail: dto.guestEmail?.trim() || null,
        guestPhone: dto.guestPhone?.trim() || null,
        partySize: Math.max(1, dto.partySize ?? 1),
        desiredStartsAt,
        desiredEndsAt,
        priority: dto.priority ?? 0,
        note: dto.note?.trim() || null,
      },
    });
    if (actorUserId) {
      await this.audit.recordForShop(shopId, {
        section: 'reservation',
        action: 'reservation.waitlist.create',
        summary: 'Added guest to waitlist',
        meta: { waitlistEntryId: row.id, actorUserId },
      });
    }
    return row;
  }

  async listWaitlist(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await this.capacity.expireWaitlist(shopId);
    return this.prisma.reservationWaitlistEntry.findMany({
      where: { shopId, status: { in: ['WAITING', 'OFFERED'] } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async offerWaitlist(
    actor: JwtAccessPayload,
    id: string,
    dto: OfferWaitlistDto,
  ) {
    const shopId = requireShopId(actor);
    await this.capacity.expireWaitlist(shopId);
    const row = await this.prisma.reservationWaitlistEntry.findFirst({
      where: { id, shopId, status: 'WAITING' },
    });
    if (!row) throw new NotFoundException('Waiting entry not found.');
    const availability = await this.capacity.capacityForShop(shopId, {
      startsAt: row.desiredStartsAt.toISOString(),
      endsAt: row.desiredEndsAt.toISOString(),
      partySize: row.partySize,
      resourceId: row.resourceId ?? undefined,
    });
    const candidate = availability.available[0];
    if (!candidate) {
      throw new ConflictException('No capacity is currently available for this waitlist entry.');
    }
    const now = new Date();
    const updated = await this.prisma.reservationWaitlistEntry.update({
      where: { id },
      data: {
        resourceId: row.resourceId ?? candidate.id,
        status: 'OFFERED',
        offeredAt: now,
        offerExpiresAt: new Date(
          now.getTime() + Math.max(1, dto.offerMinutes ?? 15) * 60_000,
        ),
      },
    });
    await this.record(actor, 'reservation.waitlist.offer', 'Offered waitlist slot', {
      waitlistEntryId: id,
      resourceId: updated.resourceId,
      expiresAt: updated.offerExpiresAt,
    });
    return updated;
  }

  async convertWaitlist(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    await this.capacity.expireWaitlist(shopId);
    const row = await this.prisma.reservationWaitlistEntry.findFirst({
      where: { id, shopId, status: 'OFFERED' },
    });
    if (!row) throw new NotFoundException('Active offered waitlist entry not found.');
    if (row.offerExpiresAt && row.offerExpiresAt <= new Date()) {
      await this.capacity.expireWaitlist(shopId);
      throw new ConflictException('The waitlist offer has expired.');
    }
    const availability = await this.capacity.capacityForShop(shopId, {
      startsAt: row.desiredStartsAt.toISOString(),
      endsAt: row.desiredEndsAt.toISOString(),
      partySize: row.partySize,
      resourceId: row.resourceId ?? undefined,
    });
    const candidate = availability.available[0];
    if (!candidate) throw new ConflictException('Capacity is no longer available.');

    const reservation = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`waitlist:${shopId}:${id}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`growth-booking:${shopId}:${candidate.id}`}))`;
      const locked = await tx.reservationWaitlistEntry.findFirst({
        where: { id, shopId, status: 'OFFERED' },
      });
      if (!locked) throw new ConflictException('Waitlist offer was already claimed.');
      if (locked.offerExpiresAt && locked.offerExpiresAt <= new Date()) {
        await tx.reservationWaitlistEntry.update({
          where: { id },
          data: { status: 'EXPIRED' },
        });
        throw new ConflictException('The waitlist offer has expired.');
      }
      await assertBookingSlotFree(
        tx,
        shopId,
        candidate.id,
        locked.desiredStartsAt,
        locked.desiredEndsAt,
      );
      const created = await tx.reservation.create({
        data: {
          shopId,
          resourceId: candidate.id,
          guestName: locked.guestName,
          guestEmail: locked.guestEmail,
          guestPhone: locked.guestPhone,
          partySize: locked.partySize,
          startsAt: locked.desiredStartsAt,
          endsAt: locked.desiredEndsAt,
          status: 'CONFIRMED',
          notes: locked.note,
        },
      });
      await tx.reservationBookingEvidence.create({
        data: {
          shopId,
          reservationId: created.id,
          sourceChannel: 'WAITLIST',
          assignedResourceId: candidate.id,
          bufferBeforeMinutes: candidate.bufferBeforeMinutes,
          bufferAfterMinutes: candidate.bufferAfterMinutes,
        },
      });
      await tx.reservationWaitlistEntry.update({
        where: { id },
        data: {
          status: 'CLAIMED',
          resourceId: candidate.id,
          reservationId: created.id,
        },
      });
      return created;
    });
    await this.record(actor, 'reservation.waitlist.claim', 'Claimed waitlist offer', {
      waitlistEntryId: id,
      reservationId: reservation.id,
    });
    return reservation;
  }

  async convertReservation(actor: JwtAccessPayload, reservationId: string) {
    const shopId = requireShopId(actor);
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reservation-session:${shopId}:${reservationId}`}))`;
      const reservation = await tx.reservation.findFirst({
        where: { id: reservationId, shopId },
      });
      if (!reservation) throw new NotFoundException('Reservation not found.');
      if (!reservation.resourceId) {
        throw new ConflictException('Reservation needs a resource before conversion.');
      }
      const extension = await tx.reservationExtension.findFirst({
        where: { shopId, reservationId },
      });
      if (extension?.convertedSessionId) {
        const existing = await tx.operationsSession.findFirst({
          where: { id: extension.convertedSessionId, shopId },
        });
        if (existing) return existing;
      }
      const active = await tx.operationsSession.findFirst({
        where: {
          shopId,
          resourceId: reservation.resourceId,
          status: { in: ['ACTIVE', 'PAUSED'] },
        },
      });
      if (active) throw new ConflictException('Resource already has an active session.');
      const resource = await tx.resource.findFirst({
        where: { id: reservation.resourceId, shopId },
      });
      if (!resource) throw new NotFoundException('Reservation resource not found.');
      const rates = await tx.operationsRatePlan.findMany({
        where: { shopId, active: true },
        orderBy: { createdAt: 'desc' },
      });
      const rate =
        rates.find((candidate) => candidate.resourceId === resource.id) ??
        rates.find(
          (candidate) =>
            !candidate.resourceId &&
            candidate.resourceCategoryId === resource.categoryId,
        ) ??
        rates.find(
          (candidate) => !candidate.resourceId && !candidate.resourceCategoryId,
        );
      if (!rate) throw new ConflictException('No active operations rate plan applies.');
      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        select: { currency: true },
      });
      const rateSnapshot = {
        ratePlanId: rate.id,
        name: rate.name,
        hourlyRateMinor: rate.hourlyRateMinor,
        overtimeRateMinor: rate.overtimeRateMinor,
        overtimeAfterMinutes: rate.overtimeAfterMinutes,
        roundingMinutes: rate.roundingMinutes,
        minimumMinutes: rate.minimumMinutes,
        capMinor: rate.capMinor,
      };
      const created = await tx.operationsSession.create({
        data: {
          shopId,
          resourceId: resource.id,
          reservationId,
          guestCheckId: reservation.guestCheckId,
          ratePlanId: rate.id,
          hourlyRateMinor: rate.hourlyRateMinor,
          overtimeRateMinor: rate.overtimeRateMinor,
          overtimeAfterMinutes: rate.overtimeAfterMinutes,
          roundingMinutes: rate.roundingMinutes,
          minimumMinutes: rate.minimumMinutes,
          capMinor: rate.capMinor,
          rateSnapshot: rateSnapshot as Prisma.InputJsonValue,
          currency: shop?.currency ?? 'EUR',
          createdById: actor.sub,
        },
      });
      await tx.reservationExtension.upsert({
        where: { reservationId },
        create: { shopId, reservationId, convertedSessionId: created.id },
        update: { convertedSessionId: created.id },
      });
      return created;
    });
    await this.record(actor, 'reservation.session.convert', 'Converted reservation to session', {
      reservationId,
      sessionId: session.id,
    });
    return session;
  }

  async timeline(actor: JwtAccessPayload, from: Date, to: Date) {
    const shopId = requireShopId(actor);
    this.assertInterval(from, to);
    await this.capacity.expireWaitlist(shopId);
    const reservations = await this.prisma.reservation.findMany({
      where: { shopId, startsAt: { lt: to }, endsAt: { gt: from } },
      include: { resource: true },
      orderBy: { startsAt: 'asc' },
    });
    const waitlist = await this.prisma.reservationWaitlistEntry.findMany({
      where: { shopId, desiredStartsAt: { lt: to }, desiredEndsAt: { gt: from } },
      orderBy: { desiredStartsAt: 'asc' },
    });
    const sessions = await this.prisma.operationsSession.findMany({
      where: {
        shopId,
        startedAt: { lt: to },
        OR: [{ finishedAt: null }, { finishedAt: { gt: from } }],
      },
      orderBy: { startedAt: 'asc' },
    });
    const eventHolds = await this.prisma.eventResourceHold.findMany({
      where: {
        shopId,
        startsAt: { lt: to },
        endsAt: { gt: from },
        status: { in: ['HOLD', 'CONFIRMED'] },
      },
      orderBy: { startsAt: 'asc' },
    });
    return { from, to, reservations, waitlist, sessions, eventHolds };
  }

  private percent(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new BadRequestException('Percent must be an integer from 0 to 100.');
    }
    return value;
  }

  private requiredDepositMinor(
    reservation: {
      billingBaseAmount: Prisma.Decimal | null;
      billedAmount: Prisma.Decimal | null;
    },
    policy: {
      depositKind: string;
      depositFixedMinor: number | null;
      depositPercentBps: number | null;
    },
  ) {
    if (policy.depositKind === 'FIXED') return policy.depositFixedMinor ?? 0;
    if (policy.depositKind === 'PERCENT') {
      const major = reservation.billingBaseAmount ?? reservation.billedAmount;
      const baseMinor = major ? Math.round(Number(major.toString()) * 100) : 0;
      return Math.round((baseMinor * (policy.depositPercentBps ?? 0)) / 10_000);
    }
    return 0;
  }

  private assertInterval(start: Date, end: Date) {
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException('End must be after start.');
    }
  }

  private async requireReservation(shopId: string, id: string) {
    const row = await this.prisma.reservation.findFirst({ where: { id, shopId } });
    if (!row) throw new NotFoundException('Reservation not found.');
    return row;
  }

  private async requireResource(shopId: string, id: string) {
    const row = await this.prisma.resource.findFirst({ where: { id, shopId } });
    if (!row) throw new NotFoundException('Resource not found.');
    return row;
  }

  private record(
    actor: JwtAccessPayload,
    action: string,
    summary: string,
    meta: Record<string, unknown>,
  ) {
    return this.audit.record(actor, {
      section: 'reservation',
      action,
      summary,
      meta,
    });
  }
}

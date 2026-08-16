import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CommercialAdjustmentScope,
  CommercialAdjustmentSource,
  CommercialAdjustmentType,
  CommercialCheckType,
  Prisma,
  ReservationStatus,
  ResourceStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { isDiningResourceType } from '../../common/dining-reservation.util';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';

export type RefundReservationDepositDto = {
  amountMinor: number;
  correlationId: string;
  reason: string;
};

@Injectable()
export class Phase8ReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private requirePermission(actor: JwtAccessPayload, permission: string) {
    if (!actor.shopId) throw new ForbiddenException('Shop context is required.');
    if (actor.shopRole === 'OWNER') return;
    if (!hasPermission(actor.perms ?? '', permission as never)) {
      throw new ForbiddenException(`Missing ${permission}`);
    }
  }

  private requireArrivalPermissions(actor: JwtAccessPayload) {
    this.requirePermission(actor, PERMISSIONS.RESERVATION_WRITE);
    this.requirePermission(actor, PERMISSIONS.TRANSACTION_WRITE);
  }

  async arrive(actor: JwtAccessPayload, reservationId: string) {
    this.requireArrivalPermissions(actor);
    const shopId = requireShopId(actor);

    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`phase8-arrival:${shopId}:${reservationId}`}))`;

        const reservation = await tx.reservation.findFirst({
          where: { id: reservationId, shopId },
        });
        if (!reservation) throw new NotFoundException('Reservation not found.');
        if (!reservation.resourceId) {
          throw new ConflictException(
            'Reservation must have an assigned resource before arrival.',
          );
        }
        if (
          reservation.status !== ReservationStatus.PENDING &&
          reservation.status !== ReservationStatus.CONFIRMED &&
          reservation.status !== ReservationStatus.CHECKED_IN
        ) {
          throw new ConflictException(
            'Only an upcoming or already-arrived reservation can be converted.',
          );
        }

        const resource = await tx.resource.findFirst({
          where: { id: reservation.resourceId, shopId },
        });
        if (!resource) {
          throw new NotFoundException('Reservation resource not found.');
        }
        if (resource.status === ResourceStatus.MAINTENANCE) {
          throw new ConflictException('Reservation resource is in maintenance.');
        }

        const shop = await tx.shop.findUnique({
          where: { id: shopId },
          select: { currency: true },
        });
        const currency = (shop?.currency ?? reservation.currency ?? 'EUR').toUpperCase();

        let guestCheck = reservation.guestCheckId
          ? await tx.guestCheck.findFirst({
              where: { id: reservation.guestCheckId, shopId },
            })
          : null;
        if (guestCheck && guestCheck.status !== 'OPEN') {
          throw new ConflictException(
            'The reservation is linked to a guest check that is no longer open.',
          );
        }
        if (!guestCheck) {
          guestCheck = await tx.guestCheck.create({
            data: {
              shopId,
              guestName: reservation.guestName,
              label: `Reservation · ${reservation.guestName}`,
              note: reservation.notes,
              currency,
              createdById: actor.sub,
            },
          });
        }

        const extension = await tx.reservationExtension.upsert({
          where: { reservationId },
          create: { shopId, reservationId },
          update: {},
        });

        let operationsSession = extension.convertedSessionId
          ? await tx.operationsSession.findFirst({
              where: { id: extension.convertedSessionId, shopId },
            })
          : null;

        if (!operationsSession && !isDiningResourceType(resource.type)) {
          const active = await tx.operationsSession.findFirst({
            where: {
              shopId,
              resourceId: resource.id,
              status: { in: ['ACTIVE', 'PAUSED'] },
            },
          });
          if (active && active.reservationId !== reservationId) {
            throw new ConflictException(
              'Reservation resource already has an active session.',
            );
          }
          operationsSession = active;

          if (!operationsSession) {
            const rates = await tx.operationsRatePlan.findMany({
              where: { shopId, active: true },
              orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            });
            const rate =
              rates.find((candidate) => candidate.resourceId === resource.id) ??
              rates.find(
                (candidate) =>
                  !candidate.resourceId &&
                  candidate.resourceCategoryId === resource.categoryId,
              ) ??
              rates.find(
                (candidate) =>
                  !candidate.resourceId && !candidate.resourceCategoryId,
              );
            if (!rate) {
              throw new ConflictException(
                'No active operations rate plan applies to this reservation resource.',
              );
            }
            const rateSnapshot = {
              schemaVersion: 1,
              ratePlanId: rate.id,
              name: rate.name,
              billingMode: rate.billingMode,
              hourlyRateMinor: rate.hourlyRateMinor,
              unitPriceMinor: rate.unitPriceMinor,
              fixedDurationMinutes: rate.fixedDurationMinutes,
              minimumChargeMinor: rate.minimumChargeMinor,
              graceMinutes: rate.graceMinutes,
              overtimeRateMinor: rate.overtimeRateMinor,
              overtimeAfterMinutes: rate.overtimeAfterMinutes,
              roundingMinutes: rate.roundingMinutes,
              minimumMinutes: rate.minimumMinutes,
              capMinor: rate.capMinor,
            };
            operationsSession = await tx.operationsSession.create({
              data: {
                shopId,
                resourceId: resource.id,
                reservationId,
                guestCheckId: guestCheck.id,
                ratePlanId: rate.id,
                currentRatePlanId: rate.id,
                currentRateSnapshot: rateSnapshot as Prisma.InputJsonValue,
                hourlyRateMinor: rate.hourlyRateMinor,
                billingMode: rate.billingMode,
                unitPriceMinor: rate.unitPriceMinor,
                fixedDurationMinutes: rate.fixedDurationMinutes,
                minimumChargeMinor: rate.minimumChargeMinor,
                graceMinutes: rate.graceMinutes,
                participantCount: Math.max(1, reservation.partySize),
                overtimeRateMinor: rate.overtimeRateMinor,
                overtimeAfterMinutes: rate.overtimeAfterMinutes,
                roundingMinutes: rate.roundingMinutes,
                minimumMinutes: rate.minimumMinutes,
                capMinor: rate.capMinor,
                rateSnapshot: rateSnapshot as Prisma.InputJsonValue,
                currency,
                createdById: actor.sub,
              },
            });
            await tx.sessionResourceLink.create({
              data: {
                shopId,
                sessionId: operationsSession.id,
                resourceId: resource.id,
                actorUserId: actor.sub,
              },
            });
          }
        }

        await tx.guestCheckCommercialProfile.upsert({
          where: { guestCheckId: guestCheck.id },
          create: {
            shopId,
            guestCheckId: guestCheck.id,
            checkType: isDiningResourceType(resource.type)
              ? CommercialCheckType.RESTAURANT_TABLE
              : CommercialCheckType.SESSION,
            assignedOperatorId: actor.sub,
            resourceId: resource.id,
            operationsSessionId: operationsSession?.id ?? null,
          },
          update: {
            assignedOperatorId: actor.sub,
            resourceId: resource.id,
            operationsSessionId: operationsSession?.id ?? null,
            version: { increment: 1 },
          },
        });

        const [ledger, applications] = await Promise.all([
          tx.reservationDepositLedgerEntry.findMany({
            where: { shopId, reservationId },
            select: { amountMinor: true },
          }),
          tx.reservationDepositApplication.findMany({
            where: { shopId, reservationId },
            select: { amountMinor: true },
          }),
        ]);
        const depositBalance = ledger.reduce(
          (sum, entry) => sum + entry.amountMinor,
          0,
        );
        const previouslyApplied = applications.reduce(
          (sum, application) => sum + application.amountMinor,
          0,
        );
        const depositToApply = Math.max(0, depositBalance - previouslyApplied);
        const applicationCorrelationId = `phase8-arrival:${reservationId}:${guestCheck.id}`;

        let depositApplication = await tx.reservationDepositApplication.findFirst({
          where: { shopId, correlationId: applicationCorrelationId },
        });
        if (!depositApplication && depositToApply > 0) {
          depositApplication = await tx.reservationDepositApplication.create({
            data: {
              shopId,
              reservationId,
              guestCheckId: guestCheck.id,
              amountMinor: depositToApply,
              currency,
              correlationId: applicationCorrelationId,
              actorUserId: actor.sub,
            },
          });
          await tx.commercialAdjustment.create({
            data: {
              shopId,
              guestCheckId: guestCheck.id,
              type: CommercialAdjustmentType.DEPOSIT_APPLICATION,
              scope: CommercialAdjustmentScope.CHECK,
              targetSourceType: 'RESERVATION_DEPOSIT',
              targetSourceId: reservationId,
              amountMinor: depositToApply,
              beforeTotalMinor: 0,
              afterTotalMinor: 0,
              reason: 'Reservation deposit credit applied on arrival',
              source: CommercialAdjustmentSource.DEPOSIT,
              createdById: actor.sub,
            },
          });
        }

        const now = new Date();
        await tx.reservation.update({
          where: { id: reservationId },
          data: {
            guestCheckId: guestCheck.id,
            status: ReservationStatus.CHECKED_IN,
            version: { increment: 1 },
          },
        });
        await tx.reservationExtension.update({
          where: { reservationId },
          data: { convertedSessionId: operationsSession?.id ?? null },
        });
        await tx.reservationBookingEvidence.upsert({
          where: { reservationId },
          create: {
            shopId,
            reservationId,
            sourceChannel: 'STAFF_ARRIVAL',
            assignedResourceId: resource.id,
            checkedInAt: now,
            checkedInById: actor.sub,
          },
          update: {
            assignedResourceId: resource.id,
            checkedInAt: now,
            checkedInById: actor.sub,
          },
        });
        await tx.resource.updateMany({
          where: {
            id: resource.id,
            shopId,
            status: { not: ResourceStatus.MAINTENANCE },
          },
          data: { status: ResourceStatus.BUSY },
        });

        return {
          reservationId,
          lifecycleState: 'ARRIVED' as const,
          resourceId: resource.id,
          guestCheckId: guestCheck.id,
          operationsSessionId: operationsSession?.id ?? null,
          depositApplicationMinor: depositApplication?.amountMinor ?? 0,
          currency,
        };
      },
      { timeout: 15_000 },
    );

    await this.audit.record(actor, {
      section: 'reservation',
      action: 'reservation.arrive',
      summary: 'Converted reservation to active venue operations',
      meta: result,
    });
    return result;
  }

  async refundProviderDeposit(
    actor: JwtAccessPayload,
    reservationId: string,
    dto: RefundReservationDepositDto,
  ) {
    this.requirePermission(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    if (!Number.isInteger(dto.amountMinor) || dto.amountMinor <= 0) {
      throw new BadRequestException('amountMinor must be a positive integer.');
    }
    if (!dto.correlationId?.trim()) {
      throw new BadRequestException('correlationId is required.');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('reason is required.');
    }

    const stripe = this.stripe();
    const correlationId = dto.correlationId.trim();
    const row = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`phase8-deposit-refund:${shopId}:${reservationId}`}))`;
        const existing = await tx.reservationDepositLedgerEntry.findFirst({
          where: { shopId, correlationId },
        });
        if (existing) {
          if (
            existing.reservationId !== reservationId ||
            existing.type !== 'REFUND' ||
            existing.amountMinor !== -dto.amountMinor
          ) {
            throw new ConflictException(
              'The refund correlationId was already used with a different request.',
            );
          }
          return existing;
        }

        const reservation = await tx.reservation.findFirst({
          where: { id: reservationId, shopId },
          select: { id: true },
        });
        if (!reservation) throw new NotFoundException('Reservation not found.');

        const [ledger, applications, attempt] = await Promise.all([
          tx.reservationDepositLedgerEntry.findMany({
            where: { shopId, reservationId },
            select: { amountMinor: true, currency: true },
          }),
          tx.reservationDepositApplication.findMany({
            where: { shopId, reservationId },
            select: { amountMinor: true },
          }),
          tx.reservationDepositCheckoutAttempt.findFirst({
            where: {
              shopId,
              reservationId,
              status: 'SUCCEEDED',
              providerPaymentIntentId: { not: null },
            },
            orderBy: { succeededAt: 'desc' },
          }),
        ]);
        const balanceMinor = ledger.reduce(
          (sum, entry) => sum + entry.amountMinor,
          0,
        );
        const appliedMinor = applications.reduce(
          (sum, application) => sum + application.amountMinor,
          0,
        );
        const refundableMinor = Math.max(0, balanceMinor - appliedMinor);
        if (dto.amountMinor > refundableMinor) {
          throw new ConflictException(
            'Refund exceeds the captured, unapplied reservation deposit balance.',
          );
        }
        if (!attempt?.providerPaymentIntentId) {
          throw new ConflictException(
            'No successful provider payment is available for this refund.',
          );
        }

        const refund = await stripe.refunds.create(
          {
            payment_intent: attempt.providerPaymentIntentId,
            amount: dto.amountMinor,
            metadata: {
              purpose: 'RESERVATION_DEPOSIT_REFUND',
              shopId,
              reservationId,
              correlationId,
            },
          },
          {
            idempotencyKey: `reservation-deposit-refund:${shopId}:${reservationId}:${correlationId}`,
          },
        );
        if (refund.status === 'failed' || refund.status === 'canceled') {
          throw new ServiceUnavailableException(
            `Stripe refund did not succeed (${refund.status}).`,
          );
        }

        return tx.reservationDepositLedgerEntry.create({
          data: {
            shopId,
            reservationId,
            type: 'REFUND',
            amountMinor: -dto.amountMinor,
            currency: (
              ledger.find((entry) => entry.currency)?.currency ??
              attempt.currency
            ).toUpperCase(),
            refundId: refund.id,
            correlationId,
            note: dto.reason.trim(),
            actorUserId: actor.sub,
          },
        });
      },
      { timeout: 20_000 },
    );

    await this.audit.record(actor, {
      section: 'finance',
      action: 'reservation.deposit.refund-provider',
      summary: 'Refunded reservation deposit through payment provider',
      meta: {
        reservationId,
        amountMinor: dto.amountMinor,
        refundId: row.refundId,
        correlationId,
      },
    });
    return row;
  }

  private stripe() {
    const key = this.config.get<string>('STRIPE_SECRET_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException('Stripe is not configured.');
    }
    return new Stripe(key);
  }
}

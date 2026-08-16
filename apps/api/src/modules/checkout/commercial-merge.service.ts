import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CheckoutPaymentStatus, Prisma } from '@prisma/client';
import { assertExpectedVersion } from '../../common/optimistic-concurrency.util';
import {
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
} from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { DomainEventOutboxService } from '../foundation/domain-event-outbox.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import {
  MergeGuestChecksDto,
  MoveGuestCheckChargesDto,
} from './dto/chunk04.dto';

const checkSelect = {
  id: true,
  status: true,
  version: true,
  currency: true,
  currentSettlementId: true,
  mergedIntoCheckId: true,
  label: true,
  guestName: true,
  shopOrders: { select: { id: true } },
  playSessions: { select: { id: true } },
  reservations: { select: { id: true } },
} satisfies Prisma.GuestCheckSelect;

type MergeCheck = Prisma.GuestCheckGetPayload<{ select: typeof checkSelect }>;

@Injectable()
export class CommercialMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly outbox: DomainEventOutboxService,
    private readonly audit: AuditService,
  ) {}

  private assertPermission(actor: JwtAccessPayload, permission: PermissionKey) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', permission)) return;
    throw new ForbiddenException(`Missing ${permission}`);
  }

  private async requireSplit(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'checkout_split'))) {
      throw new ForbiddenException(
        'Split and merge checkout is not enabled for this venue',
      );
    }
  }

  private async loadCheck(
    tx: Prisma.TransactionClient,
    shopId: string,
    id: string,
  ): Promise<MergeCheck> {
    const check = await tx.guestCheck.findFirst({
      where: { id, shopId },
      select: checkSelect,
    });
    if (!check) throw new NotFoundException('Guest check not found');
    return check;
  }

  private assertCompatible(source: MergeCheck, destination: MergeCheck) {
    if (source.id === destination.id) {
      throw new BadRequestException('Source and destination checks must differ');
    }
    if (source.status !== 'OPEN' || destination.status !== 'OPEN') {
      throw new ConflictException('Only open checks can be merged or moved');
    }
    if (source.mergedIntoCheckId || destination.mergedIntoCheckId) {
      throw new ConflictException('A previously merged check cannot be reused');
    }
    if (source.currency !== destination.currency) {
      throw new ConflictException('Checks must use the same currency');
    }
  }

  private async lockChecks(
    tx: Prisma.TransactionClient,
    shopId: string,
    checkIds: string[],
  ) {
    const ids = [...new Set(checkIds)].sort();
    if (ids.length !== 2) {
      throw new BadRequestException('Exactly two distinct checks are required');
    }
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "GuestCheck" WHERE "shopId"=${shopId} AND "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
    );
  }

  private async assertNoSuccessfulPayments(
    tx: Prisma.TransactionClient,
    shopId: string,
    checkIds: string[],
  ) {
    const count = await tx.payment.count({
      where: {
        shopId,
        status: CheckoutPaymentStatus.SUCCESS,
        settlement: { guestCheckId: { in: checkIds } },
      },
    });
    if (count > 0) {
      throw new ConflictException(
        'Checks with recorded payments cannot be merged or have charges moved',
      );
    }
  }

  private async voidUnpaidCurrentSettlements(
    tx: Prisma.TransactionClient,
    shopId: string,
    checkIds: string[],
  ) {
    await tx.checkSettlement.updateMany({
      where: {
        shopId,
        guestCheckId: { in: checkIds },
        state: { in: ['OPEN', 'CALCULATED', 'PARTIALLY_PAID'] },
      },
      data: { state: 'VOID' },
    });
  }

  private async modernSourceIds(
    tx: Prisma.TransactionClient,
    shopId: string,
    checkId: string,
  ) {
    const [venueOrders, operationsSessions, adjustments, serviceCharges, tips] =
      await Promise.all([
        tx.venueOrder.findMany({
          where: { shopId, guestCheckId: checkId },
          select: { id: true },
        }),
        tx.operationsSession.findMany({
          where: { shopId, guestCheckId: checkId },
          select: { id: true },
        }),
        tx.commercialAdjustment.findMany({
          where: { shopId, guestCheckId: checkId, voidedAt: null },
          select: { id: true },
        }),
        tx.guestCheckServiceCharge.findMany({
          where: { shopId, guestCheckId: checkId, voidedAt: null },
          select: { id: true },
        }),
        tx.guestCheckTip.findMany({
          where: { shopId, guestCheckId: checkId, voidedAt: null },
          select: { id: true },
        }),
      ]);
    return {
      venueOrderIds: venueOrders.map((row) => row.id),
      operationsSessionIds: operationsSessions.map((row) => row.id),
      adjustmentIds: adjustments.map((row) => row.id),
      serviceChargeIds: serviceCharges.map((row) => row.id),
      tipIds: tips.map((row) => row.id),
    };
  }

  private async inheritProfileWhenDestinationEmpty(
    tx: Prisma.TransactionClient,
    shopId: string,
    sourceCheckId: string,
    destinationCheckId: string,
  ) {
    const [sourceProfile, destinationProfile] = await Promise.all([
      tx.guestCheckCommercialProfile.findFirst({
        where: { shopId, guestCheckId: sourceCheckId },
      }),
      tx.guestCheckCommercialProfile.findFirst({
        where: { shopId, guestCheckId: destinationCheckId },
      }),
    ]);
    if (!sourceProfile || destinationProfile) return;
    await tx.guestCheckCommercialProfile.create({
      data: {
        shopId,
        guestCheckId: destinationCheckId,
        checkType: sourceProfile.checkType,
        assignedOperatorId: sourceProfile.assignedOperatorId,
        resourceId: sourceProfile.resourceId,
        operationsSessionId: sourceProfile.operationsSessionId,
        tableReference: sourceProfile.tableReference,
        customerId: sourceProfile.customerId,
        serviceArea: sourceProfile.serviceArea,
      },
    });
  }

  async merge(
    actor: JwtAccessPayload,
    destinationCheckId: string,
    dto: MergeGuestChecksDto,
    correlationId?: string,
  ) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    await this.requireSplit(shopId);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockChecks(tx, shopId, [
        destinationCheckId,
        dto.sourceCheckId,
      ]);
      const source = await this.loadCheck(tx, shopId, dto.sourceCheckId);
      const destination = await this.loadCheck(tx, shopId, destinationCheckId);
      this.assertCompatible(source, destination);
      assertExpectedVersion(source.version, dto.expectedSourceVersion, {
        aggregateType: 'guest_check',
        aggregateId: source.id,
      });
      assertExpectedVersion(
        destination.version,
        dto.expectedDestinationVersion,
        { aggregateType: 'guest_check', aggregateId: destination.id },
      );
      await this.assertNoSuccessfulPayments(tx, shopId, [
        source.id,
        destination.id,
      ]);
      await this.voidUnpaidCurrentSettlements(tx, shopId, [
        source.id,
        destination.id,
      ]);

      const movedShopOrderIds = source.shopOrders.map((row) => row.id);
      const movedPlaySessionIds = source.playSessions.map((row) => row.id);
      const movedReservationIds = source.reservations.map((row) => row.id);
      const modern = await this.modernSourceIds(tx, shopId, source.id);

      if (movedShopOrderIds.length) {
        await tx.shopOrder.updateMany({
          where: { shopId, guestCheckId: source.id },
          data: { guestCheckId: destination.id },
        });
      }
      if (movedPlaySessionIds.length) {
        await tx.playSession.updateMany({
          where: { shopId, guestCheckId: source.id },
          data: { guestCheckId: destination.id },
        });
      }
      if (movedReservationIds.length) {
        await tx.reservation.updateMany({
          where: { shopId, guestCheckId: source.id },
          data: {
            guestCheckId: destination.id,
            version: { increment: 1 },
          },
        });
      }
      if (modern.venueOrderIds.length) {
        await tx.venueOrder.updateMany({
          where: { shopId, guestCheckId: source.id },
          data: {
            guestCheckId: destination.id,
            version: { increment: 1 },
          },
        });
      }
      if (modern.operationsSessionIds.length) {
        await tx.operationsSession.updateMany({
          where: { shopId, guestCheckId: source.id },
          data: { guestCheckId: destination.id, version: { increment: 1 } },
        });
      }
      if (modern.adjustmentIds.length) {
        await tx.commercialAdjustment.updateMany({
          where: { shopId, guestCheckId: source.id, voidedAt: null },
          data: { guestCheckId: destination.id },
        });
      }
      if (modern.serviceChargeIds.length) {
        await tx.guestCheckServiceCharge.updateMany({
          where: { shopId, guestCheckId: source.id, voidedAt: null },
          data: { guestCheckId: destination.id },
        });
      }
      if (modern.tipIds.length) {
        await tx.guestCheckTip.updateMany({
          where: { shopId, guestCheckId: source.id, voidedAt: null },
          data: { guestCheckId: destination.id },
        });
      }
      await this.inheritProfileWhenDestinationEmpty(
        tx,
        shopId,
        source.id,
        destination.id,
      );

      const destinationClaim = await tx.guestCheck.updateMany({
        where: {
          id: destination.id,
          shopId,
          status: 'OPEN',
          version: dto.expectedDestinationVersion,
        },
        data: { currentSettlementId: null, version: { increment: 1 } },
      });
      const sourceClaim = await tx.guestCheck.updateMany({
        where: {
          id: source.id,
          shopId,
          status: 'OPEN',
          version: dto.expectedSourceVersion,
        },
        data: {
          status: 'VOID',
          voidedAt: new Date(),
          currentSettlementId: null,
          mergedIntoCheckId: destination.id,
          version: { increment: 1 },
        },
      });
      if (destinationClaim.count !== 1 || sourceClaim.count !== 1) {
        throw new ConflictException('A check changed while merge was in progress');
      }

      const legacyEvent = await tx.guestCheckMergeEvent.create({
        data: {
          shopId,
          sourceCheckId: source.id,
          destinationCheckId: destination.id,
          actorId: actor.sub,
          movedShopOrderIds,
          movedPlaySessionIds,
          movedReservationIds,
        },
      });
      const commercialEvent = await tx.commercialMergeEvent.create({
        data: {
          shopId,
          sourceCheckId: source.id,
          destinationCheckId: destination.id,
          actorId: actor.sub,
          operation: 'MERGE',
          movedVenueOrderIds: modern.venueOrderIds,
          movedOperationsSessionIds: modern.operationsSessionIds,
          movedAdjustmentIds: modern.adjustmentIds,
          movedServiceChargeIds: modern.serviceChargeIds,
          movedTipIds: modern.tipIds,
        },
      });

      await this.outbox.enqueue(tx, {
        shopId,
        aggregateType: 'guest_check',
        aggregateId: destination.id,
        eventType: 'guest-check.merged',
        payload: {
          schemaVersion: 2,
          mergeEventId: legacyEvent.id,
          commercialMergeEventId: commercialEvent.id,
          sourceCheckId: source.id,
          destinationCheckId: destination.id,
          movedShopOrderIds,
          movedPlaySessionIds,
          movedReservationIds,
          movedVenueOrderIds: modern.venueOrderIds,
          movedOperationsSessionIds: modern.operationsSessionIds,
          movedAdjustmentIds: modern.adjustmentIds,
          movedServiceChargeIds: modern.serviceChargeIds,
          movedTipIds: modern.tipIds,
          correlationId: correlationId ?? null,
        },
      });

      return {
        legacyEvent,
        commercialEvent,
        modern,
        sourceVersion: source.version + 1,
        destinationVersion: destination.version + 1,
      };
    });

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.merge.phase4',
      summary: 'Merged all canonical charge sources into another GuestCheck',
      meta: {
        mergeEventId: result.legacyEvent.id,
        commercialMergeEventId: result.commercialEvent.id,
        sourceCheckId: dto.sourceCheckId,
        destinationCheckId,
        movedShopOrderIds: result.legacyEvent.movedShopOrderIds,
        movedPlaySessionIds: result.legacyEvent.movedPlaySessionIds,
        movedReservationIds: result.legacyEvent.movedReservationIds,
        movedVenueOrderIds: result.modern.venueOrderIds,
        movedOperationsSessionIds: result.modern.operationsSessionIds,
        correlationId: correlationId ?? null,
        revenueRowsCreated: false,
      },
    });

    return {
      mergeEventId: result.legacyEvent.id,
      commercialMergeEventId: result.commercialEvent.id,
      sourceCheckId: dto.sourceCheckId,
      destinationCheckId,
      sourceVersion: result.sourceVersion,
      destinationVersion: result.destinationVersion,
      movedShopOrderIds: result.legacyEvent.movedShopOrderIds,
      movedPlaySessionIds: result.legacyEvent.movedPlaySessionIds,
      movedReservationIds: result.legacyEvent.movedReservationIds,
      movedVenueOrderIds: result.modern.venueOrderIds,
      movedOperationsSessionIds: result.modern.operationsSessionIds,
      movedAdjustmentIds: result.modern.adjustmentIds,
      movedServiceChargeIds: result.modern.serviceChargeIds,
      movedTipIds: result.modern.tipIds,
      createdAt: result.legacyEvent.createdAt.toISOString(),
    };
  }

  async moveCharges(
    actor: JwtAccessPayload,
    sourceCheckId: string,
    dto: MoveGuestCheckChargesDto,
    correlationId?: string,
  ) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    await this.requireSplit(shopId);

    const orderIds = [...new Set(dto.shopOrderIds ?? [])];
    const playIds = [...new Set(dto.playSessionIds ?? [])];
    const reservationIds = [...new Set(dto.reservationIds ?? [])];
    const venueOrderIds = [...new Set(dto.venueOrderIds ?? [])];
    const operationsSessionIds = [...new Set(dto.operationsSessionIds ?? [])];
    if (
      orderIds.length +
        playIds.length +
        reservationIds.length +
        venueOrderIds.length +
        operationsSessionIds.length ===
      0
    ) {
      throw new BadRequestException('Select at least one charge source to move');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockChecks(tx, shopId, [
        sourceCheckId,
        dto.destinationCheckId,
      ]);
      const source = await this.loadCheck(tx, shopId, sourceCheckId);
      const destination = await this.loadCheck(
        tx,
        shopId,
        dto.destinationCheckId,
      );
      this.assertCompatible(source, destination);
      assertExpectedVersion(source.version, dto.expectedSourceVersion, {
        aggregateType: 'guest_check',
        aggregateId: source.id,
      });
      assertExpectedVersion(
        destination.version,
        dto.expectedDestinationVersion,
        { aggregateType: 'guest_check', aggregateId: destination.id },
      );
      await this.assertNoSuccessfulPayments(tx, shopId, [
        source.id,
        destination.id,
      ]);
      await this.voidUnpaidCurrentSettlements(tx, shopId, [
        source.id,
        destination.id,
      ]);

      const sourceOrders = new Set(source.shopOrders.map((row) => row.id));
      const sourcePlay = new Set(source.playSessions.map((row) => row.id));
      const sourceReservations = new Set(
        source.reservations.map((row) => row.id),
      );
      const modern = await this.modernSourceIds(tx, shopId, source.id);
      const sourceVenueOrders = new Set(modern.venueOrderIds);
      const sourceOperationsSessions = new Set(modern.operationsSessionIds);

      for (const id of orderIds) {
        if (!sourceOrders.has(id)) {
          throw new BadRequestException(
            `Order ${id} is not attached to source check`,
          );
        }
      }
      for (const id of playIds) {
        if (!sourcePlay.has(id)) {
          throw new BadRequestException(
            `Play session ${id} is not attached to source check`,
          );
        }
      }
      for (const id of reservationIds) {
        if (!sourceReservations.has(id)) {
          throw new BadRequestException(
            `Reservation ${id} is not attached to source check`,
          );
        }
      }
      for (const id of venueOrderIds) {
        if (!sourceVenueOrders.has(id)) {
          throw new BadRequestException(
            `Venue order ${id} is not attached to source check`,
          );
        }
      }
      for (const id of operationsSessionIds) {
        if (!sourceOperationsSessions.has(id)) {
          throw new BadRequestException(
            `Operations session ${id} is not attached to source check`,
          );
        }
      }

      if (orderIds.length) {
        await tx.shopOrder.updateMany({
          where: { shopId, guestCheckId: source.id, id: { in: orderIds } },
          data: { guestCheckId: destination.id },
        });
      }
      if (playIds.length) {
        await tx.playSession.updateMany({
          where: { shopId, guestCheckId: source.id, id: { in: playIds } },
          data: { guestCheckId: destination.id },
        });
      }
      if (reservationIds.length) {
        await tx.reservation.updateMany({
          where: {
            shopId,
            guestCheckId: source.id,
            id: { in: reservationIds },
          },
          data: {
            guestCheckId: destination.id,
            version: { increment: 1 },
          },
        });
      }
      if (venueOrderIds.length) {
        await tx.venueOrder.updateMany({
          where: {
            shopId,
            guestCheckId: source.id,
            id: { in: venueOrderIds },
          },
          data: {
            guestCheckId: destination.id,
            version: { increment: 1 },
          },
        });
      }
      if (operationsSessionIds.length) {
        await tx.operationsSession.updateMany({
          where: {
            shopId,
            guestCheckId: source.id,
            id: { in: operationsSessionIds },
          },
          data: {
            guestCheckId: destination.id,
            version: { increment: 1 },
          },
        });
      }

      const sourceClaim = await tx.guestCheck.updateMany({
        where: {
          id: source.id,
          shopId,
          status: 'OPEN',
          version: dto.expectedSourceVersion,
        },
        data: { currentSettlementId: null, version: { increment: 1 } },
      });
      const destinationClaim = await tx.guestCheck.updateMany({
        where: {
          id: destination.id,
          shopId,
          status: 'OPEN',
          version: dto.expectedDestinationVersion,
        },
        data: { currentSettlementId: null, version: { increment: 1 } },
      });
      if (sourceClaim.count !== 1 || destinationClaim.count !== 1) {
        throw new ConflictException(
          'A check changed while charges were being moved',
        );
      }

      const event = await tx.commercialMergeEvent.create({
        data: {
          shopId,
          sourceCheckId: source.id,
          destinationCheckId: destination.id,
          actorId: actor.sub,
          operation: 'MOVE',
          movedVenueOrderIds: venueOrderIds,
          movedOperationsSessionIds: operationsSessionIds,
          movedAdjustmentIds: [],
          movedServiceChargeIds: [],
          movedTipIds: [],
        },
      });
      await this.outbox.enqueue(tx, {
        shopId,
        aggregateType: 'guest_check',
        aggregateId: source.id,
        eventType: 'guest-check.charges-moved',
        payload: {
          schemaVersion: 2,
          commercialMergeEventId: event.id,
          sourceCheckId: source.id,
          destinationCheckId: destination.id,
          shopOrderIds: orderIds,
          playSessionIds: playIds,
          reservationIds,
          venueOrderIds,
          operationsSessionIds,
          correlationId: correlationId ?? null,
        },
      });
      return {
        event,
        sourceVersion: source.version + 1,
        destinationVersion: destination.version + 1,
      };
    });

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.charges.move.phase4',
      summary: 'Moved canonical charge sources between GuestChecks',
      meta: {
        commercialMergeEventId: result.event.id,
        sourceCheckId,
        destinationCheckId: dto.destinationCheckId,
        shopOrderIds: orderIds,
        playSessionIds: playIds,
        reservationIds,
        venueOrderIds,
        operationsSessionIds,
        correlationId: correlationId ?? null,
        revenueRowsCreated: false,
      },
    });

    return {
      commercialMergeEventId: result.event.id,
      sourceCheckId,
      destinationCheckId: dto.destinationCheckId,
      sourceVersion: result.sourceVersion,
      destinationVersion: result.destinationVersion,
      shopOrderIds: orderIds,
      playSessionIds: playIds,
      reservationIds,
      venueOrderIds,
      operationsSessionIds,
    };
  }

  async history(actor: JwtAccessPayload, checkId: string) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_READ);
    const shopId = requireShopId(actor);
    await this.requireSplit(shopId);
    const exists = await this.prisma.guestCheck.findFirst({
      where: { id: checkId, shopId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Guest check not found');

    const [legacyEvents, commercialEvents] = await Promise.all([
      this.prisma.guestCheckMergeEvent.findMany({
        where: {
          shopId,
          OR: [{ sourceCheckId: checkId }, { destinationCheckId: checkId }],
        },
        include: {
          sourceCheck: { select: { id: true, label: true, guestName: true } },
          destinationCheck: {
            select: { id: true, label: true, guestName: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.commercialMergeEvent.findMany({
        where: {
          shopId,
          OR: [{ sourceCheckId: checkId }, { destinationCheckId: checkId }],
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      checkId,
      events: legacyEvents.map((event) => ({
        id: event.id,
        sourceCheckId: event.sourceCheckId,
        destinationCheckId: event.destinationCheckId,
        actorId: event.actorId,
        movedShopOrderIds: event.movedShopOrderIds,
        movedPlaySessionIds: event.movedPlaySessionIds,
        movedReservationIds: event.movedReservationIds,
        sourceCheck: event.sourceCheck,
        destinationCheck: event.destinationCheck,
        createdAt: event.createdAt.toISOString(),
      })),
      commercialEvents: commercialEvents.map((event) => ({
        id: event.id,
        operation: event.operation,
        sourceCheckId: event.sourceCheckId,
        destinationCheckId: event.destinationCheckId,
        actorId: event.actorId,
        movedVenueOrderIds: event.movedVenueOrderIds,
        movedOperationsSessionIds: event.movedOperationsSessionIds,
        movedAdjustmentIds: event.movedAdjustmentIds,
        movedServiceChargeIds: event.movedServiceChargeIds,
        movedTipIds: event.movedTipIds,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
}

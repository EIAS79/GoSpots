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

const mergeCheckSelect = {
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

type MergeCheck = Prisma.GuestCheckGetPayload<{
  select: typeof mergeCheckSelect;
}>;

@Injectable()
export class GuestCheckMergeService {
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

  private async requireChunk04(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'checkout_split'))) {
      throw new ForbiddenException(
        'Split and merge checkout is not enabled for this venue',
      );
    }
  }

  private async loadCheck(
    db: Prisma.TransactionClient | PrismaService,
    shopId: string,
    id: string,
  ): Promise<MergeCheck> {
    const check = await db.guestCheck.findFirst({
      where: { id, shopId },
      select: mergeCheckSelect,
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
      Prisma.sql`SELECT "id" FROM "GuestCheck" WHERE "shopId" = ${shopId} AND "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
    );
  }

  async merge(
    actor: JwtAccessPayload,
    destinationCheckId: string,
    dto: MergeGuestChecksDto,
    correlationId?: string,
  ) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    await this.requireChunk04(shopId);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockChecks(tx, shopId, [destinationCheckId, dto.sourceCheckId]);
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

      const movedShopOrderIds = source.shopOrders.map((row) => row.id);
      const movedPlaySessionIds = source.playSessions.map((row) => row.id);
      const movedReservationIds = source.reservations.map((row) => row.id);

      if (movedShopOrderIds.length) {
        await tx.shopOrder.updateMany({
          where: { shopId, guestCheckId: source.id, id: { in: movedShopOrderIds } },
          data: { guestCheckId: destination.id },
        });
      }
      if (movedPlaySessionIds.length) {
        await tx.playSession.updateMany({
          where: {
            shopId,
            guestCheckId: source.id,
            id: { in: movedPlaySessionIds },
          },
          data: { guestCheckId: destination.id },
        });
      }
      if (movedReservationIds.length) {
        await tx.reservation.updateMany({
          where: {
            shopId,
            guestCheckId: source.id,
            id: { in: movedReservationIds },
          },
          data: { guestCheckId: destination.id },
        });
      }

      const destinationClaim = await tx.guestCheck.updateMany({
        where: {
          id: destination.id,
          shopId,
          status: 'OPEN',
          version: dto.expectedDestinationVersion,
        },
        data: {
          currentSettlementId: null,
          version: { increment: 1 },
        },
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

      const event = await tx.guestCheckMergeEvent.create({
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

      await this.outbox.enqueue(tx, {
        shopId,
        aggregateType: 'guest_check',
        aggregateId: destination.id,
        eventType: 'guest-check.merged',
        payload: {
          mergeEventId: event.id,
          sourceCheckId: source.id,
          destinationCheckId: destination.id,
          movedShopOrderIds,
          movedPlaySessionIds,
          movedReservationIds,
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
      action: 'guest_check.merge',
      summary: 'Merged one guest check into another',
      meta: {
        mergeEventId: result.event.id,
        sourceCheckId: dto.sourceCheckId,
        destinationCheckId,
        movedShopOrderIds: result.event.movedShopOrderIds,
        movedPlaySessionIds: result.event.movedPlaySessionIds,
        movedReservationIds: result.event.movedReservationIds,
        correlationId: correlationId ?? null,
        revenueRowsCreated: false,
      },
    });

    return {
      mergeEventId: result.event.id,
      sourceCheckId: dto.sourceCheckId,
      destinationCheckId,
      sourceVersion: result.sourceVersion,
      destinationVersion: result.destinationVersion,
      movedShopOrderIds: result.event.movedShopOrderIds,
      movedPlaySessionIds: result.event.movedPlaySessionIds,
      movedReservationIds: result.event.movedReservationIds,
      createdAt: result.event.createdAt.toISOString(),
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
    await this.requireChunk04(shopId);

    const orderIds = [...new Set(dto.shopOrderIds ?? [])];
    const playIds = [...new Set(dto.playSessionIds ?? [])];
    const reservationIds = [...new Set(dto.reservationIds ?? [])];
    if (orderIds.length + playIds.length + reservationIds.length === 0) {
      throw new BadRequestException('Select at least one charge source to move');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockChecks(tx, shopId, [sourceCheckId, dto.destinationCheckId]);
      const source = await this.loadCheck(tx, shopId, sourceCheckId);
      const destination = await this.loadCheck(tx, shopId, dto.destinationCheckId);
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

      const sourceOrders = new Set(source.shopOrders.map((row) => row.id));
      const sourcePlay = new Set(source.playSessions.map((row) => row.id));
      const sourceReservations = new Set(source.reservations.map((row) => row.id));
      for (const id of orderIds) {
        if (!sourceOrders.has(id)) {
          throw new BadRequestException(`Order ${id} is not attached to source check`);
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
          data: { guestCheckId: destination.id },
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

      await this.outbox.enqueue(tx, {
        shopId,
        aggregateType: 'guest_check',
        aggregateId: source.id,
        eventType: 'guest-check.charges-moved',
        payload: {
          sourceCheckId: source.id,
          destinationCheckId: destination.id,
          shopOrderIds: orderIds,
          playSessionIds: playIds,
          reservationIds,
          correlationId: correlationId ?? null,
        },
      });

      return {
        sourceVersion: source.version + 1,
        destinationVersion: destination.version + 1,
      };
    });

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.charges.move',
      summary: 'Moved charge sources between guest checks',
      meta: {
        sourceCheckId,
        destinationCheckId: dto.destinationCheckId,
        shopOrderIds: orderIds,
        playSessionIds: playIds,
        reservationIds,
        correlationId: correlationId ?? null,
        revenueRowsCreated: false,
      },
    });

    return {
      sourceCheckId,
      destinationCheckId: dto.destinationCheckId,
      sourceVersion: result.sourceVersion,
      destinationVersion: result.destinationVersion,
      shopOrderIds: orderIds,
      playSessionIds: playIds,
      reservationIds,
    };
  }

  async history(actor: JwtAccessPayload, checkId: string) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_READ);
    const shopId = requireShopId(actor);
    await this.requireChunk04(shopId);
    const exists = await this.prisma.guestCheck.findFirst({
      where: { id: checkId, shopId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Guest check not found');

    const events = await this.prisma.guestCheckMergeEvent.findMany({
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
    });
    return {
      checkId,
      events: events.map((event) => ({
        id: event.id,
        sourceCheck: event.sourceCheck,
        destinationCheck: event.destinationCheck,
        actorId: event.actorId,
        movedShopOrderIds: event.movedShopOrderIds,
        movedPlaySessionIds: event.movedPlaySessionIds,
        movedReservationIds: event.movedReservationIds,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
}

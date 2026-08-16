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
  Prisma,
  PrismaClient,
  RestaurantFireState,
  RestaurantOrderLifecycle,
  RestaurantOrderOrigin,
  RestaurantPickupStatus,
  RestaurantPrinterJobStatus,
  RestaurantTabStatus,
} from '@prisma/client';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { requireShopId } from '../../common/tenant';
import { withTenantRls } from '../../common/tenant-rls.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { OrderingPricingService } from '../ordering/ordering-pricing.service';
import {
  BarTabDto,
  BootstrapRestaurantOrderDto,
  FireCourseDto,
  MenuServiceModePolicyDto,
  ModifierAvailabilityDto,
  PickupStatusDto,
  PrepStationGroupDto,
  PrepTicketControlDto,
  PrinterJobResultDto,
  PrinterRouteDto,
  QrTableOrderDto,
  QrTableTokenDto,
  RestaurantLifecycleDto,
  RestaurantLineOpsDto,
  TableTransferDto,
} from './dto/restaurant-operations.dto';

const LIFECYCLE_TRANSITIONS: Record<RestaurantOrderLifecycle, readonly RestaurantOrderLifecycle[]> = {
  DRAFT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['IN_PREPARATION', 'CANCELLED'],
  IN_PREPARATION: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: ['CLOSED'],
  CANCELLED: [],
  CLOSED: [],
};

export function isRestaurantLifecycleTransitionAllowed(
  from: RestaurantOrderLifecycle,
  to: RestaurantOrderLifecycle,
): boolean {
  return from === to || LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function restaurantTimerBand(ageSeconds: number, targetSeconds: number) {
  if (targetSeconds <= 0) return 'RED' as const;
  const ratio = ageSeconds / targetSeconds;
  if (ratio >= 1) return 'RED' as const;
  if (ratio >= 0.75) return 'AMBER' as const;
  return 'GREEN' as const;
}

type QrPayload = {
  v: 1;
  s: string;
  r: string;
  e: number;
  n: string;
};

type Tx = Prisma.TransactionClient;

@Injectable()
export class RestaurantOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: OrderingPricingService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async setServiceModePolicy(actor: JwtAccessPayload, dto: MenuServiceModePolicyDto) {
    const shopId = requireShopId(actor);
    await this.requireMenuItem(shopId, dto.menuItemId);
    const row = await this.prisma.menuServiceModePolicy.upsert({
      where: {
        shopId_menuItemId_serviceMode: {
          shopId,
          menuItemId: dto.menuItemId,
          serviceMode: dto.serviceMode,
        },
      },
      create: {
        shopId,
        menuItemId: dto.menuItemId,
        serviceMode: dto.serviceMode,
        enabled: dto.enabled,
        updatedById: actor.sub,
      },
      update: { enabled: dto.enabled, updatedById: actor.sub },
    });
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.service_mode_availability',
      summary: `${dto.enabled ? 'Enabled' : 'Disabled'} menu item for ${dto.serviceMode}`,
      meta: { menuItemId: dto.menuItemId, serviceMode: dto.serviceMode, enabled: dto.enabled },
    });
    return row;
  }

  async setModifierAvailability(actor: JwtAccessPayload, dto: ModifierAvailabilityDto) {
    const shopId = requireShopId(actor);
    const modifier = await this.prisma.menuModifier.findFirst({ where: { id: dto.modifierId, shopId } });
    if (!modifier) throw new NotFoundException('Modifier not found.');
    const row = await this.prisma.menuModifierAvailability.upsert({
      where: { shopId_modifierId: { shopId, modifierId: dto.modifierId } },
      create: {
        shopId,
        modifierId: dto.modifierId,
        available: dto.available,
        reason: dto.reason,
        updatedById: actor.sub,
      },
      update: { available: dto.available, reason: dto.reason, updatedById: actor.sub },
    });
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.modifier_availability',
      summary: `${dto.available ? 'Re-enabled' : '86’d'} modifier ${modifier.name}`,
      meta: { modifierId: dto.modifierId, available: dto.available, reason: dto.reason },
    });
    return row;
  }

  async bootstrapOrder(actor: JwtAccessPayload, orderId: string, dto: BootstrapRestaurantOrderDto) {
    const shopId = requireShopId(actor);
    const order = await this.requireOrder(shopId, orderId);
    const origin = (dto.origin ?? (order.serviceMode === 'QUICK_SALE' ? 'CASHIER' : 'STAFF')) as RestaurantOrderOrigin;
    const pickup = order.serviceMode === 'TAKEAWAY' ? RestaurantPickupStatus.PREPARING : RestaurantPickupStatus.NOT_APPLICABLE;
    const ops = await this.prisma.$transaction(async (tx) => {
      const row = await tx.restaurantOrderOps.upsert({
        where: { orderId },
        create: {
          shopId,
          orderId,
          lifecycle: RestaurantOrderLifecycle.PLACED,
          origin,
          displayNumber: `R-${order.id}`,
          prepQuoteMinutes: dto.prepQuoteMinutes,
          pickupStatus: pickup,
          currentResourceId: order.resourceId,
          createdById: actor.sub,
          updatedById: actor.sub,
        },
        update: {
          prepQuoteMinutes: dto.prepQuoteMinutes,
          currentResourceId: order.resourceId,
          updatedById: actor.sub,
          version: { increment: 1 },
        },
      });
      await this.ensureLineOps(tx, shopId, orderId, actor.sub);
      return row;
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'restaurant.order.bootstrap',
      summary: 'Attached restaurant lifecycle to canonical order',
      meta: { orderId, origin, prepQuoteMinutes: dto.prepQuoteMinutes },
    });
    return this.getOrderOps(actor, orderId);
  }

  async getOrderOps(actor: JwtAccessPayload, orderId: string) {
    const shopId = requireShopId(actor);
    const order = await this.requireOrder(shopId, orderId);
    const ops = await this.prisma.restaurantOrderOps.findFirst({ where: { shopId, orderId } });
    const lines = await this.prisma.venueOrderLine.findMany({ where: { shopId, orderId }, orderBy: { createdAt: 'asc' } });
    const lineOps = lines.length
      ? await this.prisma.restaurantOrderLineOps.findMany({ where: { shopId, orderLineId: { in: lines.map((line) => line.id) } } })
      : [];
    const transfers = await this.prisma.restaurantTableTransfer.findMany({ where: { shopId, orderId }, orderBy: { createdAt: 'asc' } });
    return {
      order,
      ops,
      lines: lines.map((line) => ({ ...line, ops: lineOps.find((row) => row.orderLineId === line.id) ?? null })),
      transfers,
    };
  }

  async transitionOrder(actor: JwtAccessPayload, orderId: string, dto: RestaurantLifecycleDto) {
    const shopId = requireShopId(actor);
    const order = await this.requireOrder(shopId, orderId);
    let ops = await this.prisma.restaurantOrderOps.findFirst({ where: { shopId, orderId } });
    if (!ops) {
      await this.bootstrapOrder(actor, orderId, {});
      ops = await this.prisma.restaurantOrderOps.findFirstOrThrow({ where: { shopId, orderId } });
    }
    const next = dto.lifecycle as RestaurantOrderLifecycle;
    if (!isRestaurantLifecycleTransitionAllowed(ops.lifecycle, next)) {
      throw new ConflictException(`Invalid restaurant lifecycle transition ${ops.lifecycle} -> ${next}.`);
    }
    if (next === RestaurantOrderLifecycle.CLOSED && order.status !== 'COMPLETED') {
      throw new ConflictException('Fulfillment cannot close before the canonical order is financially/commercially completed.');
    }
    if (next === RestaurantOrderLifecycle.CANCELLED && !['CANCELED', 'COMPLETED', 'REFUNDED'].includes(order.status)) {
      await this.cancelCanonicalOrder(shopId, orderId, actor.sub);
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.restaurantOrderOps.update({
        where: { id: ops!.id },
        data: {
          lifecycle: next,
          updatedById: actor.sub,
          version: { increment: 1 },
          ...(next === RestaurantOrderLifecycle.READY && order.serviceMode === 'TAKEAWAY'
            ? { pickupStatus: RestaurantPickupStatus.READY_FOR_PICKUP }
            : {}),
        },
      });
      if (next === RestaurantOrderLifecycle.SERVED) {
        await tx.restaurantOrderLineOps.updateMany({ where: { shopId, orderId, servedAt: null }, data: { servedAt: now, updatedById: actor.sub } });
      }
      return row;
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'restaurant.order.transition',
      summary: `Restaurant order moved ${ops.lifecycle} -> ${next}`,
      meta: { orderId, from: ops.lifecycle, to: next },
    });
    return updated;
  }

  async setLineOps(actor: JwtAccessPayload, orderId: string, lineId: string, dto: RestaurantLineOpsDto) {
    const shopId = requireShopId(actor);
    await this.requireOrderLine(shopId, orderId, lineId);
    const fireState = dto.fireState as RestaurantFireState;
    const row = await this.prisma.restaurantOrderLineOps.upsert({
      where: { orderLineId: lineId },
      create: {
        shopId,
        orderId,
        orderLineId: lineId,
        courseNumber: dto.courseNumber,
        fireState,
        priority: dto.priority ?? 0,
        rush: dto.rush ?? false,
        ...(fireState === RestaurantFireState.FIRED ? { firedAt: new Date() } : {}),
        updatedById: actor.sub,
      },
      update: {
        courseNumber: dto.courseNumber,
        fireState,
        priority: dto.priority,
        rush: dto.rush,
        ...(fireState === RestaurantFireState.FIRED ? { firedAt: new Date() } : { firedAt: null }),
        updatedById: actor.sub,
      },
    });
    if (fireState === RestaurantFireState.FIRED) await this.routeSelectedLines(shopId, orderId, [lineId], actor.sub);
    return row;
  }

  async fireCourse(actor: JwtAccessPayload, orderId: string, dto: FireCourseDto) {
    const shopId = requireShopId(actor);
    await this.requireOrder(shopId, orderId);
    await this.ensureLineOps(this.prisma, shopId, orderId, actor.sub);
    const rows = await this.prisma.restaurantOrderLineOps.findMany({
      where: {
        shopId,
        orderId,
        courseNumber: dto.courseNumber,
        ...(dto.lineIds?.length ? { orderLineId: { in: dto.lineIds } } : {}),
      },
    });
    if (!rows.length) throw new NotFoundException('No lines found for the requested course/selection.');
    const now = new Date();
    await this.prisma.restaurantOrderLineOps.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { fireState: RestaurantFireState.FIRED, firedAt: now, updatedById: actor.sub },
    });
    const routed = await this.routeSelectedLines(shopId, orderId, rows.map((row) => row.orderLineId), actor.sub);
    const ops = await this.prisma.restaurantOrderOps.findFirst({ where: { shopId, orderId } });
    if (ops && ['PLACED', 'ACKNOWLEDGED'].includes(ops.lifecycle)) {
      await this.prisma.restaurantOrderOps.update({ where: { id: ops.id }, data: { lifecycle: RestaurantOrderLifecycle.IN_PREPARATION, updatedById: actor.sub, version: { increment: 1 } } });
    }
    await this.audit.record(actor, {
      section: 'operations',
      action: 'restaurant.course.fire',
      summary: `Fired course ${dto.courseNumber}`,
      meta: { orderId, courseNumber: dto.courseNumber, lineIds: rows.map((row) => row.orderLineId), ticketIds: routed },
    });
    return { ok: true, lineCount: rows.length, ticketIds: routed };
  }

  async transferTable(actor: JwtAccessPayload, orderId: string, dto: TableTransferDto) {
    const shopId = requireShopId(actor);
    const order = await this.requireOrder(shopId, orderId);
    if (dto.toResourceId) await this.requireResource(shopId, dto.toResourceId);
    const activeLines = await this.prisma.venueOrderLine.findMany({ where: { shopId, orderId, canceledAt: null } });
    const requested = dto.lineIds?.length ? new Set(dto.lineIds) : null;
    const selected = requested ? activeLines.filter((line) => requested.has(line.id)) : activeLines;
    if (requested && selected.length !== requested.size) throw new BadRequestException('One or more selected lines do not belong to this order.');
    if (!selected.length && dto.fromSeat == null) throw new BadRequestException('No order lines selected for transfer.');

    const result = await this.prisma.$transaction(async (tx) => {
      let targetOrderId = orderId;
      const moveSubset = Boolean(dto.toResourceId && selected.length > 0 && selected.length < activeLines.length);
      if (moveSubset) {
        const totals = this.sumLineTotals(selected);
        const target = await tx.venueOrder.create({
          data: {
            shopId,
            guestCheckId: order.guestCheckId,
            operationsSessionId: order.operationsSessionId,
            resourceId: dto.toResourceId,
            serviceMode: order.serviceMode,
            status: order.status,
            seat: dto.toSeat ?? order.seat,
            guestLabel: order.guestLabel,
            currency: order.currency,
            ...totals,
            createdById: actor.sub,
          },
        });
        targetOrderId = target.id;
        await tx.venueOrderLine.updateMany({ where: { shopId, id: { in: selected.map((line) => line.id) } }, data: { orderId: target.id, ...(dto.toSeat ? { seat: dto.toSeat } : {}) } });
        await tx.restaurantOrderLineOps.updateMany({ where: { shopId, orderLineId: { in: selected.map((line) => line.id) } }, data: { orderId: target.id, updatedById: actor.sub } });
        const sourceRemaining = activeLines.filter((line) => !requested!.has(line.id));
        await tx.venueOrder.update({ where: { id: orderId }, data: this.sumLineTotals(sourceRemaining) });
        await tx.restaurantOrderOps.create({
          data: {
            shopId,
            orderId: target.id,
            lifecycle: (await tx.restaurantOrderOps.findFirst({ where: { shopId, orderId } }))?.lifecycle ?? RestaurantOrderLifecycle.PLACED,
            origin: RestaurantOrderOrigin.STAFF,
            displayNumber: `R-${target.id}`,
            currentResourceId: dto.toResourceId,
            createdById: actor.sub,
            updatedById: actor.sub,
          },
        });
      } else {
        if (dto.toResourceId) {
          await tx.venueOrder.update({ where: { id: orderId }, data: { resourceId: dto.toResourceId, version: { increment: 1 } } });
          await tx.restaurantOrderOps.updateMany({ where: { shopId, orderId }, data: { currentResourceId: dto.toResourceId, updatedById: actor.sub, version: { increment: 1 } } });
        }
        if (dto.fromSeat != null && dto.toSeat != null) {
          await tx.venueOrderLine.updateMany({ where: { shopId, orderId, seat: dto.fromSeat, canceledAt: null }, data: { seat: dto.toSeat } });
        } else if (dto.toSeat != null && selected.length) {
          await tx.venueOrderLine.updateMany({ where: { shopId, id: { in: selected.map((line) => line.id) } }, data: { seat: dto.toSeat } });
        }
      }
      await tx.restaurantTableTransfer.create({
        data: {
          shopId,
          orderId,
          fromResourceId: order.resourceId,
          toResourceId: dto.toResourceId,
          movedLineIds: selected.map((line) => line.id) as Prisma.InputJsonValue,
          fromSeat: dto.fromSeat,
          toSeat: dto.toSeat,
          actorUserId: actor.sub,
          reason: dto.reason,
        },
      });
      return { sourceOrderId: orderId, targetOrderId, movedLineIds: selected.map((line) => line.id) };
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'restaurant.table.transfer',
      summary: 'Transferred restaurant table/seat/items without rewriting snapshots',
      meta: { ...result, fromResourceId: order.resourceId, toResourceId: dto.toResourceId, fromSeat: dto.fromSeat, toSeat: dto.toSeat },
    });
    return result;
  }

  async openTab(actor: JwtAccessPayload, orderId: string, dto: BarTabDto) {
    const shopId = requireShopId(actor);
    await this.requireOrder(shopId, orderId);
    if (dto.preauthOperationId) {
      const preauth = await this.prisma.paymentOperation.findFirst({ where: { id: dto.preauthOperationId, shopId } });
      if (!preauth || !['AUTHORIZED', 'CAPTURED'].includes(preauth.state)) throw new ConflictException('Referenced preauthorization is not authorized/captured for this venue.');
    }
    await this.bootstrapIfMissing(actor, orderId);
    const row = await this.prisma.restaurantOrderOps.update({
      where: { orderId },
      data: {
        tabStatus: RestaurantTabStatus.OPEN,
        tabName: dto.name.trim(),
        preauthOperationId: dto.preauthOperationId,
        updatedById: actor.sub,
        version: { increment: 1 },
      },
    });
    await this.audit.record(actor, { section: 'operations', action: 'restaurant.tab.open', summary: `Opened bar tab ${dto.name}`, meta: { orderId, preauthOperationId: dto.preauthOperationId } });
    return row;
  }

  async closeTab(actor: JwtAccessPayload, orderId: string) {
    const shopId = requireShopId(actor);
    const row = await this.prisma.restaurantOrderOps.findFirst({ where: { shopId, orderId } });
    if (!row || row.tabStatus !== RestaurantTabStatus.OPEN) throw new ConflictException('Open bar tab not found.');
    const order = await this.requireOrder(shopId, orderId);
    if (!['COMPLETED', 'REFUNDED'].includes(order.status)) throw new ConflictException('Bar tab still has an unsettled canonical order.');
    return this.prisma.restaurantOrderOps.update({ where: { id: row.id }, data: { tabStatus: RestaurantTabStatus.CLOSED, updatedById: actor.sub, version: { increment: 1 } } });
  }

  listUnsettledTabs(actor: JwtAccessPayload) {
    return this.prisma.restaurantOrderOps.findMany({ where: { shopId: requireShopId(actor), tabStatus: RestaurantTabStatus.OPEN }, orderBy: { updatedAt: 'asc' } });
  }

  async setPickupStatus(actor: JwtAccessPayload, orderId: string, dto: PickupStatusDto) {
    const shopId = requireShopId(actor);
    const order = await this.requireOrder(shopId, orderId);
    if (order.serviceMode !== 'TAKEAWAY') throw new ConflictException('Pickup state is only valid for takeaway orders.');
    await this.bootstrapIfMissing(actor, orderId);
    return this.prisma.restaurantOrderOps.update({
      where: { orderId },
      data: { pickupStatus: dto.status as RestaurantPickupStatus, updatedById: actor.sub, version: { increment: 1 } },
    });
  }

  async createStationGroup(actor: JwtAccessPayload, dto: PrepStationGroupDto) {
    const shopId = requireShopId(actor);
    const stations = await this.prisma.prepStation.findMany({ where: { shopId, id: { in: dto.stationIds }, active: true } });
    if (stations.length !== new Set(dto.stationIds).size) throw new BadRequestException('One or more prep stations are invalid.');
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.prepStationGroup.upsert({
        where: { shopId_name: { shopId, name: dto.name } },
        create: { shopId, name: dto.name, expo: dto.expo ?? false, sortOrder: dto.sortOrder ?? 0 },
        update: { expo: dto.expo, sortOrder: dto.sortOrder, active: true },
      });
      await tx.prepStationGroupMember.deleteMany({ where: { shopId, groupId: group.id } });
      await tx.prepStationGroupMember.createMany({ data: dto.stationIds.map((stationId, index) => ({ shopId, groupId: group.id, stationId, sortOrder: index })) });
      return group;
    });
  }

  async controlTicket(actor: JwtAccessPayload, ticketId: string, dto: PrepTicketControlDto) {
    const shopId = requireShopId(actor);
    const ticket = await this.prisma.prepTicket.findFirst({ where: { id: ticketId, shopId } });
    if (!ticket) throw new NotFoundException('Prep ticket not found.');
    const now = new Date();
    return this.prisma.prepTicketControl.upsert({
      where: { ticketId },
      create: {
        shopId,
        ticketId,
        acknowledgedAt: dto.acknowledge ? now : undefined,
        acknowledgedById: dto.acknowledge ? actor.sub : undefined,
        recalledAt: dto.recall ? now : undefined,
        recalledById: dto.recall ? actor.sub : undefined,
        priority: dto.priority ?? 0,
        rush: dto.rush ?? false,
        held: dto.held ?? false,
        firedAt: dto.held === false ? now : undefined,
      },
      update: {
        ...(dto.acknowledge ? { acknowledgedAt: now, acknowledgedById: actor.sub } : {}),
        ...(dto.recall ? { recalledAt: now, recalledById: actor.sub } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.rush !== undefined ? { rush: dto.rush } : {}),
        ...(dto.held !== undefined ? { held: dto.held, ...(dto.held ? {} : { firedAt: now }) } : {}),
      },
    });
  }

  async kdsBoard(actor: JwtAccessPayload, stationId?: string) {
    const shopId = requireShopId(actor);
    const stations = await this.prisma.prepStation.findMany({ where: { shopId, active: true }, orderBy: { sortOrder: 'asc' } });
    const tickets = await this.prisma.prepTicket.findMany({
      where: { shopId, ...(stationId ? { stationId } : {}), status: { in: ['NEW', 'PREPARING', 'READY', 'COLLECTED'] } },
      orderBy: { openedAt: 'asc' },
      take: 300,
    });
    const controls = tickets.length ? await this.prisma.prepTicketControl.findMany({ where: { shopId, ticketId: { in: tickets.map((ticket) => ticket.id) } } }) : [];
    const now = Date.now();
    return {
      generatedAt: new Date(),
      stations,
      tickets: tickets
        .map((ticket) => {
          const station = stations.find((candidate) => candidate.id === ticket.stationId);
          const control = controls.find((candidate) => candidate.ticketId === ticket.id) ?? null;
          const ageSeconds = Math.max(0, Math.floor((now - ticket.openedAt.getTime()) / 1000));
          return { ...ticket, control, ageSeconds, timerBand: restaurantTimerBand(ageSeconds, station?.targetSeconds ?? 600) };
        })
        .filter((ticket) => ticket.status !== 'COLLECTED' || ticket.control?.recalledAt),
    };
  }

  async configurePrinterRoute(actor: JwtAccessPayload, dto: PrinterRouteDto) {
    const shopId = requireShopId(actor);
    const station = await this.prisma.prepStation.findFirst({ where: { id: dto.stationId, shopId, active: true } });
    if (!station) throw new NotFoundException('Prep station not found.');
    return this.prisma.restaurantPrinterRoute.upsert({
      where: { shopId_stationId: { shopId, stationId: dto.stationId } },
      create: { shopId, stationId: dto.stationId, printerKey: dto.printerKey, fallbackPrinterKey: dto.fallbackPrinterKey },
      update: { printerKey: dto.printerKey, fallbackPrinterKey: dto.fallbackPrinterKey, active: true },
    });
  }

  printerQueue(actor: JwtAccessPayload) {
    return this.prisma.restaurantPrinterJob.findMany({
      where: { shopId: requireShopId(actor), status: { in: [RestaurantPrinterJobStatus.QUEUED, RestaurantPrinterJobStatus.FAILED] } },
      orderBy: [{ printerKey: 'asc' }, { sequenceNumber: 'asc' }],
      take: 500,
    });
  }

  async completePrinterJob(actor: JwtAccessPayload, jobId: string, dto: PrinterJobResultDto) {
    const shopId = requireShopId(actor);
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.restaurantPrinterJob.findFirst({ where: { id: jobId, shopId } });
      if (!job) throw new NotFoundException('Printer job not found.');
      if (job.status === RestaurantPrinterJobStatus.PRINTED) return job;
      if (dto.success) {
        return tx.restaurantPrinterJob.update({ where: { id: job.id }, data: { status: RestaurantPrinterJobStatus.PRINTED, attempts: { increment: 1 }, printedAt: new Date(), lastError: null } });
      }
      const route = await tx.restaurantPrinterRoute.findFirst({ where: { shopId, stationId: job.stationId, active: true } });
      if (route?.fallbackPrinterKey && !job.fallbackUsed) {
        const sequenceNumber = await this.nextPrinterSequence(tx, shopId, route.fallbackPrinterKey);
        return tx.restaurantPrinterJob.update({
          where: { id: job.id },
          data: {
            printerKey: route.fallbackPrinterKey,
            fallbackUsed: true,
            sequenceNumber,
            status: RestaurantPrinterJobStatus.QUEUED,
            attempts: { increment: 1 },
            lastError: dto.error ?? 'PRIMARY_PRINTER_FAILED',
          },
        });
      }
      return tx.restaurantPrinterJob.update({ where: { id: job.id }, data: { status: RestaurantPrinterJobStatus.FAILED, attempts: { increment: 1 }, lastError: dto.error ?? 'PRINT_FAILED' } });
    });
  }

  async createQrToken(actor: JwtAccessPayload, dto: QrTableTokenDto) {
    const shopId = requireShopId(actor);
    await this.requireResource(shopId, dto.resourceId);
    const expiresAt = new Date(Date.now() + dto.ttlMinutes * 60_000);
    const payload: QrPayload = { v: 1, s: shopId, r: dto.resourceId, e: expiresAt.getTime(), n: randomBytes(16).toString('base64url') };
    const token = this.signQrPayload(payload);
    const row = await this.prisma.qrTableOrderToken.create({
      data: { shopId, resourceId: dto.resourceId, tokenHash: this.hashToken(token), expiresAt, maxUses: dto.maxUses ?? 20, createdById: actor.sub },
    });
    await this.audit.record(actor, { section: 'operations', action: 'restaurant.qr_token.create', summary: 'Created signed table QR order token', meta: { tokenId: row.id, resourceId: dto.resourceId, expiresAt: expiresAt.toISOString(), maxUses: row.maxUses } });
    return { id: row.id, token, expiresAt, resourceId: dto.resourceId, maxUses: row.maxUses };
  }

  async revokeQrToken(actor: JwtAccessPayload, tokenId: string) {
    const shopId = requireShopId(actor);
    const row = await this.prisma.qrTableOrderToken.findFirst({ where: { id: tokenId, shopId } });
    if (!row) throw new NotFoundException('QR token not found.');
    return this.prisma.qrTableOrderToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  }

  async publicMenu(token: string) {
    const payload = this.verifyQrTokenShape(token);
    return withTenantRls(this.prisma as unknown as PrismaClient, { shopId: payload.s, mode: 'tenant' }, async (tx) => {
      await this.requireActiveQrRow(tx, payload, token, false);
      const shop = await tx.shop.findUnique({ where: { id: payload.s }, select: { id: true, name: true, currency: true, timezone: true } });
      if (!shop) throw new NotFoundException('Venue not found.');
      const policies = await tx.menuServiceModePolicy.findMany({ where: { shopId: payload.s, serviceMode: 'QR_TABLE', enabled: false }, select: { menuItemId: true } });
      const disabled = new Set(policies.map((row) => row.menuItemId));
      const items = await tx.menuItem.findMany({ where: { shopId: payload.s, isAvailable: true }, orderBy: { name: 'asc' }, take: 2000 });
      const sections = await tx.menuSection.findMany({ where: { shopId: payload.s }, orderBy: { sortOrder: 'asc' } });
      const visible = items.filter((item) => !disabled.has(item.id) && (!item.trackStock || item.stock > 0) && this.withinMenuWindow(item, sections.find((section) => section.id === item.sectionId), shop.timezone));
      const itemIds = visible.map((item) => item.id);
      const links = itemIds.length ? await tx.menuItemModifierGroup.findMany({ where: { shopId: payload.s, menuItemId: { in: itemIds } } }) : [];
      const groupIds = [...new Set(links.map((link) => link.modifierGroupId))];
      const groups = groupIds.length ? await tx.menuModifierGroup.findMany({ where: { shopId: payload.s, id: { in: groupIds }, active: true } }) : [];
      const modifiers = groupIds.length ? await tx.menuModifier.findMany({ where: { shopId: payload.s, groupId: { in: groupIds }, active: true } }) : [];
      const unavailable = modifiers.length ? await tx.menuModifierAvailability.findMany({ where: { shopId: payload.s, modifierId: { in: modifiers.map((modifier) => modifier.id) }, available: false } }) : [];
      const blockedModifierIds = new Set(unavailable.map((row) => row.modifierId));
      return {
        venue: { id: shop.id, name: shop.name, currency: shop.currency },
        tableResourceId: payload.r,
        sections,
        items: visible.map((item) => ({ id: item.id, sectionId: item.sectionId, name: item.name, description: item.description, imageUrl: item.imageUrl, price: item.price.toString(), trackStock: item.trackStock, stock: item.trackStock ? item.stock : null })),
        modifierGroups: groups,
        modifiers: modifiers.filter((modifier) => !blockedModifierIds.has(modifier.id)),
        itemModifierGroups: links,
      };
    });
  }

  async createQrOrder(token: string, dto: QrTableOrderDto) {
    const payload = this.verifyQrTokenShape(token);
    const created = await withTenantRls(this.prisma as unknown as PrismaClient, { shopId: payload.s, mode: 'tenant' }, async (tx) => {
      const tokenRow = await this.requireActiveQrRow(tx, payload, token, true);
      await this.requireResourceTx(tx, payload.s, payload.r);
      for (const line of dto.lines) await this.assertLineAvailable(tx, payload.s, 'QR_TABLE', line.menuItemId, line.modifierIds ?? []);
      const priced = [];
      for (const line of dto.lines) priced.push(await this.pricing.priceLine(payload.s, line, tx));
      for (const line of dto.lines) await this.claimStock(tx, payload.s, line.menuItemId, line.quantity);
      const subtotalMinor = priced.reduce((sum, line) => sum + line.subtotalMinor, 0);
      const taxMinor = priced.reduce((sum, line) => sum + line.taxMinor, 0);
      const shop = await tx.shop.findUnique({ where: { id: payload.s }, select: { currency: true } });
      const order = await tx.venueOrder.create({
        data: {
          shopId: payload.s,
          resourceId: payload.r,
          serviceMode: 'DINE_IN',
          status: 'OPEN',
          guestLabel: dto.guestLabel?.trim() || null,
          currency: shop?.currency ?? 'EUR',
          subtotalMinor,
          taxMinor,
          totalMinor: subtotalMinor + taxMinor,
          createdById: `qr:${tokenRow.id}`,
        },
      });
      const courseByLineId = new Map<string, number>();
      for (let index = 0; index < priced.length; index += 1) {
        const line = priced[index];
        const input = dto.lines[index];
        const createdLine = await tx.venueOrderLine.create({
          data: {
            shopId: payload.s,
            orderId: order.id,
            menuItemId: line.menuItemId,
            variantId: line.variantId,
            quantity: line.quantity,
            seat: line.seat,
            nameSnapshot: line.nameSnapshot,
            variantNameSnapshot: line.variantNameSnapshot,
            unitBaseMinor: line.unitBaseMinor,
            variantMinor: line.variantMinor,
            modifierMinor: line.modifierMinor,
            unitPriceMinor: line.unitPriceMinor,
            taxCategorySnapshot: line.taxCategorySnapshot,
            taxRateBps: line.taxRateBps,
            taxMinor: line.taxMinor,
            totalMinor: line.totalMinor,
            priceSnapshot: line.priceSnapshot,
          },
        });
        if (line.modifiers.length) await tx.orderLineModifier.createMany({ data: line.modifiers.map((modifier) => ({ shopId: payload.s, orderLineId: createdLine.id, modifierId: modifier.id, nameSnapshot: modifier.name, priceDeltaMinor: modifier.priceDeltaMinor })) });
        courseByLineId.set(createdLine.id, input.courseNumber ?? 1);
      }
      await tx.restaurantOrderOps.create({
        data: {
          shopId: payload.s,
          orderId: order.id,
          lifecycle: RestaurantOrderLifecycle.PLACED,
          origin: RestaurantOrderOrigin.QR_TABLE,
          displayNumber: `R-${order.id}`,
          currentResourceId: payload.r,
          createdById: null,
        },
      });
      for (const [lineId, courseNumber] of courseByLineId) {
        await tx.restaurantOrderLineOps.create({ data: { shopId: payload.s, orderId: order.id, orderLineId: lineId, courseNumber, fireState: RestaurantFireState.FIRED, firedAt: new Date() } });
      }
      const claimed = await tx.qrTableOrderToken.updateMany({
        where: { id: tokenRow.id, shopId: payload.s, revokedAt: null, expiresAt: { gt: new Date() }, useCount: { lt: tokenRow.maxUses } },
        data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('QR token use limit reached or token expired.');
      return { orderId: order.id, displayNumber: `R-${order.id}` };
    });
    await withTenantRls(this.prisma as unknown as PrismaClient, { shopId: payload.s, mode: 'tenant' }, async () => {
      await this.routeSelectedLines(payload.s, created.orderId, await this.lineIds(payload.s, created.orderId), `qr:${payload.r}`);
      await this.audit.recordForShop(payload.s, { section: 'operations', action: 'restaurant.qr_order.create', summary: 'QR table order entered canonical ordering pipeline', meta: { orderId: created.orderId, resourceId: payload.r }, actorName: 'QR table guest' });
    });
    return created;
  }

  async publicDisplay(token: string) {
    const payload = this.verifyQrTokenShape(token);
    return withTenantRls(this.prisma as unknown as PrismaClient, { shopId: payload.s, mode: 'tenant' }, async (tx) => {
      await this.requireActiveQrRow(tx, payload, token, false);
      const ops = await tx.restaurantOrderOps.findMany({
        where: { shopId: payload.s, currentResourceId: payload.r, lifecycle: { in: [RestaurantOrderLifecycle.PLACED, RestaurantOrderLifecycle.ACKNOWLEDGED, RestaurantOrderLifecycle.IN_PREPARATION, RestaurantOrderLifecycle.READY, RestaurantOrderLifecycle.SERVED] } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      return ops.map((row) => ({ orderNumber: this.publicOrderNumber(row.displayNumber), state: row.lifecycle, pickupStatus: row.pickupStatus }));
    });
  }

  private async bootstrapIfMissing(actor: JwtAccessPayload, orderId: string) {
    const shopId = requireShopId(actor);
    const exists = await this.prisma.restaurantOrderOps.findFirst({ where: { shopId, orderId } });
    if (!exists) await this.bootstrapOrder(actor, orderId, {});
  }

  private async requireOrder(shopId: string, orderId: string) {
    const order = await this.prisma.venueOrder.findFirst({ where: { id: orderId, shopId } });
    if (!order) throw new NotFoundException('Order not found.');
    return order;
  }

  private async requireOrderLine(shopId: string, orderId: string, lineId: string) {
    const line = await this.prisma.venueOrderLine.findFirst({ where: { id: lineId, orderId, shopId } });
    if (!line) throw new NotFoundException('Order line not found.');
    return line;
  }

  private async requireMenuItem(shopId: string, menuItemId: string) {
    const item = await this.prisma.menuItem.findFirst({ where: { id: menuItemId, shopId } });
    if (!item) throw new NotFoundException('Menu item not found.');
    return item;
  }

  private async requireResource(shopId: string, resourceId: string) {
    const resource = await this.prisma.resource.findFirst({ where: { id: resourceId, shopId } });
    if (!resource) throw new NotFoundException('Resource/table not found.');
    return resource;
  }

  private async requireResourceTx(tx: Tx, shopId: string, resourceId: string) {
    const resource = await tx.resource.findFirst({ where: { id: resourceId, shopId } });
    if (!resource) throw new NotFoundException('Resource/table not found.');
    return resource;
  }

  private async ensureLineOps(db: Pick<PrismaService, 'venueOrderLine' | 'restaurantOrderLineOps'> | Tx, shopId: string, orderId: string, actorUserId: string) {
    const lines = await db.venueOrderLine.findMany({ where: { shopId, orderId } });
    for (const line of lines) {
      await db.restaurantOrderLineOps.upsert({
        where: { orderLineId: line.id },
        create: { shopId, orderId, orderLineId: line.id, courseNumber: 1, fireState: RestaurantFireState.HOLD, updatedById: actorUserId },
        update: {},
      });
    }
  }

  private async cancelCanonicalOrder(shopId: string, orderId: string, actorUserId: string) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const lines = await tx.venueOrderLine.findMany({ where: { shopId, orderId, canceledAt: null }, select: { id: true } });
      const lineIds = lines.map((line) => line.id);
      if (lineIds.length) {
        const prep = await tx.prepTicketLine.findMany({ where: { shopId, orderLineId: { in: lineIds }, status: { notIn: ['CANCELED', 'COLLECTED'] } } });
        for (const row of prep) {
          await tx.prepTicketLine.update({ where: { id: row.id }, data: { status: 'CANCELED', canceledAt: now, cancellationReason: 'ORDER_CANCELED' } });
          await tx.prepStatusEvent.create({ data: { shopId, ticketId: row.ticketId, lineId: row.id, fromStatus: row.status, toStatus: 'CANCELED', actorUserId, reason: 'ORDER_CANCELED' } });
        }
        await tx.venueOrderLine.updateMany({ where: { shopId, id: { in: lineIds } }, data: { canceledAt: now, cancellationReason: 'ORDER_CANCELED' } });
      }
      await tx.venueOrder.update({ where: { id: orderId }, data: { status: 'CANCELED', canceledAt: now, subtotalMinor: 0, taxMinor: 0, totalMinor: 0, version: { increment: 1 } } });
    });
  }

  private sumLineTotals(lines: { taxMinor: number; totalMinor: number }[]) {
    const taxMinor = lines.reduce((sum, line) => sum + line.taxMinor, 0);
    const totalMinor = lines.reduce((sum, line) => sum + line.totalMinor, 0);
    return { subtotalMinor: totalMinor - taxMinor, taxMinor, totalMinor };
  }

  private async routeSelectedLines(shopId: string, orderId: string, lineIds: string[], actorUserId: string) {
    if (!lineIds.length) return [];
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.venueOrder.findFirst({ where: { id: orderId, shopId } });
      if (!order) throw new NotFoundException('Order not found.');
      const lines = await tx.venueOrderLine.findMany({ where: { shopId, orderId, id: { in: lineIds }, canceledAt: null } });
      const modifiers = lines.length ? await tx.orderLineModifier.findMany({ where: { shopId, orderLineId: { in: lines.map((line) => line.id) } } }) : [];
      const ticketIds = new Set<string>();
      for (const line of lines) {
        const key = this.routeKey(line.priceSnapshot);
        if (!key) continue;
        const route = await tx.prepRoute.findFirst({ where: { shopId, key, active: true } });
        if (!route) continue;
        const station = await tx.prepStation.findFirst({ where: { id: route.stationId, shopId, active: true } });
        if (!station) continue;
        const ticket = await tx.prepTicket.upsert({
          where: { shopId_orderId_stationId: { shopId, orderId, stationId: station.id } },
          create: { shopId, orderId, stationId: station.id },
          update: {},
        });
        await tx.prepTicketLine.upsert({
          where: { shopId_orderLineId_stationId: { shopId, orderLineId: line.id, stationId: station.id } },
          create: {
            shopId,
            ticketId: ticket.id,
            stationId: station.id,
            orderLineId: line.id,
            quantity: line.quantity,
            nameSnapshot: line.nameSnapshot,
            modifiersSnapshot: modifiers.filter((modifier) => modifier.orderLineId === line.id).map((modifier) => ({ name: modifier.nameSnapshot, priceDeltaMinor: modifier.priceDeltaMinor })) as Prisma.InputJsonValue,
          },
          update: {},
        });
        await tx.prepTicketControl.upsert({ where: { ticketId: ticket.id }, create: { shopId, ticketId: ticket.id, firedAt: new Date() }, update: { held: false, firedAt: new Date() } });
        await this.queuePrintForTicketLine(tx, shopId, ticket.id, station.id, line.id);
        ticketIds.add(ticket.id);
      }
      if (ticketIds.size && order.status === 'OPEN') await tx.venueOrder.update({ where: { id: order.id }, data: { status: 'SENT', version: { increment: 1 } } });
      if (ticketIds.size) {
        await tx.prepStatusEvent.createMany({ data: [...ticketIds].map((ticketId) => ({ shopId, ticketId, toStatus: 'NEW', actorUserId, reason: 'COURSE_FIRED' })) });
      }
      return [...ticketIds];
    });
  }

  private routeKey(snapshot: Prisma.JsonValue): string | null {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
    const value = (snapshot as Prisma.JsonObject).prepRouteKey;
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private async queuePrintForTicketLine(tx: Tx, shopId: string, ticketId: string, stationId: string, lineId: string) {
    const route = await tx.restaurantPrinterRoute.findFirst({ where: { shopId, stationId, active: true } });
    if (!route) return;
    const dedupKey = `ticket:${ticketId}:line:${lineId}`;
    const existing = await tx.restaurantPrinterJob.findUnique({ where: { shopId_dedupKey: { shopId, dedupKey } } });
    if (existing) return;
    const sequenceNumber = await this.nextPrinterSequence(tx, shopId, route.printerKey);
    await tx.restaurantPrinterJob.create({ data: { shopId, ticketId, stationId, printerKey: route.printerKey, sequenceNumber, dedupKey } });
  }

  private async nextPrinterSequence(tx: Tx, shopId: string, printerKey: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`phase6-printer:${shopId}:${printerKey}`}))`;
    const max = await tx.restaurantPrinterJob.aggregate({ where: { shopId, printerKey }, _max: { sequenceNumber: true } });
    return (max._max.sequenceNumber ?? 0) + 1;
  }

  private async assertLineAvailable(tx: Tx, shopId: string, serviceMode: string, menuItemId: string, modifierIds: string[]) {
    const item = await tx.menuItem.findFirst({ where: { id: menuItemId, shopId } });
    if (!item || !item.isAvailable) throw new ConflictException('Menu item is currently unavailable.');
    if (item.trackStock && item.stock <= 0) throw new ConflictException('Menu item is sold out.');
    const policy = await tx.menuServiceModePolicy.findUnique({ where: { shopId_menuItemId_serviceMode: { shopId, menuItemId, serviceMode } } });
    if (policy && !policy.enabled) throw new ConflictException('Menu item is unavailable for this service mode.');
    if (modifierIds.length) {
      const blocked = await tx.menuModifierAvailability.findFirst({ where: { shopId, modifierId: { in: modifierIds }, available: false } });
      if (blocked) throw new ConflictException('One or more selected modifiers are sold out.');
    }
  }

  private async claimStock(tx: Tx, shopId: string, menuItemId: string, quantity: number) {
    const item = await tx.menuItem.findFirst({ where: { id: menuItemId, shopId }, select: { trackStock: true } });
    if (!item?.trackStock) return;
    const claimed = await tx.menuItem.updateMany({ where: { id: menuItemId, shopId, isAvailable: true, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
    if (claimed.count !== 1) throw new ConflictException('Stock changed while ordering; item is now sold out or insufficient.');
    const remaining = await tx.menuItem.findUnique({ where: { id: menuItemId }, select: { stock: true } });
    if (remaining && remaining.stock <= 0) await tx.menuItem.update({ where: { id: menuItemId }, data: { isAvailable: false } });
  }

  private signQrPayload(payload: QrPayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.qrSecret()).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifyQrTokenShape(token: string): QrPayload {
    const parts = token.split('.');
    if (parts.length !== 2) throw new ForbiddenException('Invalid table token.');
    const [encoded, signature] = parts;
    const expected = createHmac('sha256', this.qrSecret()).update(encoded).digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('Invalid table token signature.');
    let payload: QrPayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as QrPayload;
    } catch {
      throw new ForbiddenException('Invalid table token payload.');
    }
    if (payload.v !== 1 || !payload.s || !payload.r || !Number.isFinite(payload.e) || payload.e <= Date.now()) throw new ForbiddenException('Table token is expired or malformed.');
    return payload;
  }

  private qrSecret() {
    const secret = this.config.get<string>('QR_ORDER_TOKEN_SECRET')?.trim();
    if (!secret || secret.length < 32) throw new ServiceUnavailableException('QR ordering is not configured: QR_ORDER_TOKEN_SECRET must contain at least 32 characters.');
    return secret;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async requireActiveQrRow(tx: Tx, payload: QrPayload, token: string, requireUseCapacity: boolean) {
    const row = await tx.qrTableOrderToken.findFirst({ where: { tokenHash: this.hashToken(token), shopId: payload.s, resourceId: payload.r } });
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) throw new ForbiddenException('Table token is invalid, revoked, or expired.');
    if (row.expiresAt.getTime() !== payload.e) throw new ForbiddenException('Table token metadata mismatch.');
    if (requireUseCapacity && row.useCount >= row.maxUses) throw new ForbiddenException('Table token use limit reached.');
    return row;
  }

  private withinMenuWindow(
    item: { useSectionTiming: boolean; availableFrom: string | null; availableTo: string | null; availableDays: string },
    section: { availableFrom: string | null; availableTo: string | null; availableDays: string } | undefined,
    timeZone: string,
  ) {
    const timing = item.useSectionTiming && section ? section : item;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const weekdayName = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    const now = `${hour}:${minute}`;
    if (!timing.availableDays.split(',').map((value) => Number(value.trim())).includes(weekday)) return false;
    if (!timing.availableFrom || !timing.availableTo) return true;
    return timing.availableFrom <= timing.availableTo
      ? now >= timing.availableFrom && now <= timing.availableTo
      : now >= timing.availableFrom || now <= timing.availableTo;
  }

  private publicOrderNumber(displayNumber: string) {
    return displayNumber.length > 10 ? displayNumber.slice(-8).toUpperCase() : displayNumber;
  }

  private lineIds(shopId: string, orderId: string) {
    return this.prisma.venueOrderLine.findMany({ where: { shopId, orderId, canceledAt: null }, select: { id: true } }).then((rows) => rows.map((row) => row.id));
  }
}

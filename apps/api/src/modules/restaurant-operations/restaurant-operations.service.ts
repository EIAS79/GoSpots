import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
import type {
  BarTabDto,
  BootstrapRestaurantOrderDto,
  FireCourseDto,
  PickupStatusDto,
  PrepStationGroupDto,
  PrepTicketControlDto,
  PrinterJobResultDto,
  PrinterRouteDto,
  QrTableTokenDto,
  RestaurantLifecycleDto,
  RestaurantLineOpsDto,
} from './dto/restaurant-operations.dto';

const TRANSITIONS: Record<RestaurantOrderLifecycle, readonly RestaurantOrderLifecycle[]> = {
  DRAFT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['IN_PREPARATION', 'CANCELLED'],
  IN_PREPARATION: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: ['CLOSED'],
  CANCELLED: [],
  CLOSED: [],
};

type Tx = Prisma.TransactionClient;
type QrPayload = { v: 1; s: string; r: string; e: number; n: string };

export function isRestaurantLifecycleTransitionAllowed(from: RestaurantOrderLifecycle, to: RestaurantOrderLifecycle) {
  return from === to || TRANSITIONS[from].includes(to);
}

export function restaurantTimerBand(ageSeconds: number, targetSeconds: number, warningPct = 75, overduePct = 100) {
  if (targetSeconds <= 0) return 'RED' as const;
  const pct = (ageSeconds / targetSeconds) * 100;
  if (pct >= overduePct) return 'RED' as const;
  if (pct >= warningPct) return 'AMBER' as const;
  return 'GREEN' as const;
}

@Injectable()
export class RestaurantOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async bootstrapOrder(actor: JwtAccessPayload, orderId: string, dto: BootstrapRestaurantOrderDto) {
    const shopId = requireShopId(actor);
    const order = await this.requireOrder(shopId, orderId);
    const origin = (dto.origin ?? (order.serviceMode === 'QUICK_SALE' ? 'CASHIER' : 'STAFF')) as RestaurantOrderOrigin;
    const pickupStatus = order.serviceMode === 'TAKEAWAY' ? RestaurantPickupStatus.PREPARING : RestaurantPickupStatus.NOT_APPLICABLE;
    await this.prisma.$transaction(async (tx) => {
      await tx.restaurantOrderOps.upsert({
        where: { orderId },
        create: { shopId, orderId, lifecycle: RestaurantOrderLifecycle.PLACED, origin, displayNumber: `R-${order.id}`, prepQuoteMinutes: dto.prepQuoteMinutes, pickupStatus, currentResourceId: order.resourceId, createdById: actor.sub, updatedById: actor.sub },
        update: { prepQuoteMinutes: dto.prepQuoteMinutes, currentResourceId: order.resourceId, updatedById: actor.sub, version: { increment: 1 } },
      });
      const lines = await tx.venueOrderLine.findMany({ where: { shopId, orderId } });
      for (const line of lines) {
        await tx.restaurantOrderLineOps.upsert({
          where: { orderLineId: line.id },
          create: { shopId, orderId, orderLineId: line.id, courseNumber: 1, fireState: RestaurantFireState.HOLD, updatedById: actor.sub },
          update: {},
        });
      }
    });
    await this.audit.record(actor, { section: 'operations', action: 'restaurant.order.bootstrap', summary: 'Attached restaurant lifecycle to canonical order', meta: { orderId, origin, prepQuoteMinutes: dto.prepQuoteMinutes } });
    return this.getOrderOps(actor, orderId);
  }

  async getOrderOps(actor: JwtAccessPayload, orderId: string) {
    const shopId = requireShopId(actor);
    const order = await this.requireOrder(shopId, orderId);
    const ops = await this.prisma.restaurantOrderOps.findFirst({ where: { shopId, orderId } });
    const lines = await this.prisma.venueOrderLine.findMany({ where: { shopId, orderId }, orderBy: { createdAt: 'asc' } });
    const lineOps = lines.length ? await this.prisma.restaurantOrderLineOps.findMany({ where: { shopId, orderLineId: { in: lines.map((line) => line.id) } } }) : [];
    const transfers = await this.prisma.restaurantTableTransfer.findMany({ where: { shopId, orderId }, orderBy: { createdAt: 'asc' } });
    return { order, ops, lines: lines.map((line) => ({ ...line, ops: lineOps.find((row) => row.orderLineId === line.id) ?? null })), transfers };
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
    if (!isRestaurantLifecycleTransitionAllowed(ops.lifecycle, next)) throw new ConflictException(`Invalid restaurant lifecycle transition ${ops.lifecycle} -> ${next}.`);
    if (next === RestaurantOrderLifecycle.CLOSED && !['COMPLETED', 'REFUNDED'].includes(order.status)) throw new ConflictException('Fulfillment close is independent, but cannot precede commercial completion.');
    if (next === RestaurantOrderLifecycle.CANCELLED && !['CANCELED', 'COMPLETED', 'REFUNDED'].includes(order.status)) await this.cancelCanonicalOrder(shopId, orderId, actor.sub);
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.restaurantOrderOps.update({
        where: { id: ops!.id },
        data: { lifecycle: next, updatedById: actor.sub, version: { increment: 1 }, ...(next === RestaurantOrderLifecycle.READY && order.serviceMode === 'TAKEAWAY' ? { pickupStatus: RestaurantPickupStatus.READY_FOR_PICKUP } : {}) },
      });
      if (next === RestaurantOrderLifecycle.SERVED) await tx.restaurantOrderLineOps.updateMany({ where: { shopId, orderId, servedAt: null }, data: { servedAt: now, updatedById: actor.sub } });
      return row;
    });
    await this.audit.record(actor, { section: 'operations', action: 'restaurant.order.transition', summary: `Restaurant order moved ${ops.lifecycle} -> ${next}`, meta: { orderId, from: ops.lifecycle, to: next } });
    return updated;
  }

  async setLineOps(actor: JwtAccessPayload, orderId: string, lineId: string, dto: RestaurantLineOpsDto) {
    const shopId = requireShopId(actor);
    const line = await this.prisma.venueOrderLine.findFirst({ where: { id: lineId, orderId, shopId } });
    if (!line) throw new NotFoundException('Order line not found.');
    const fireState = dto.fireState as RestaurantFireState;
    const row = await this.prisma.restaurantOrderLineOps.upsert({
      where: { orderLineId: lineId },
      create: { shopId, orderId, orderLineId: lineId, courseNumber: dto.courseNumber, fireState, priority: dto.priority ?? 0, rush: dto.rush ?? false, firedAt: fireState === RestaurantFireState.FIRED ? new Date() : null, updatedById: actor.sub },
      update: { courseNumber: dto.courseNumber, fireState, priority: dto.priority, rush: dto.rush, firedAt: fireState === RestaurantFireState.FIRED ? new Date() : null, updatedById: actor.sub },
    });
    if (fireState === RestaurantFireState.FIRED) await this.routeLines(shopId, orderId, [lineId], actor.sub);
    return row;
  }

  async fireCourse(actor: JwtAccessPayload, orderId: string, dto: FireCourseDto) {
    const shopId = requireShopId(actor);
    await this.requireOrder(shopId, orderId);
    const lines = await this.prisma.venueOrderLine.findMany({ where: { shopId, orderId, canceledAt: null }, select: { id: true } });
    for (const line of lines) {
      await this.prisma.restaurantOrderLineOps.upsert({ where: { orderLineId: line.id }, create: { shopId, orderId, orderLineId: line.id, courseNumber: 1, fireState: RestaurantFireState.HOLD, updatedById: actor.sub }, update: {} });
    }
    const rows = await this.prisma.restaurantOrderLineOps.findMany({ where: { shopId, orderId, courseNumber: dto.courseNumber, ...(dto.lineIds?.length ? { orderLineId: { in: dto.lineIds } } : {}) } });
    if (!rows.length) throw new NotFoundException('No lines found for requested course/selection.');
    const now = new Date();
    await this.prisma.restaurantOrderLineOps.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { fireState: RestaurantFireState.FIRED, firedAt: now, updatedById: actor.sub } });
    const ticketIds = await this.routeLines(shopId, orderId, rows.map((row) => row.orderLineId), actor.sub);
    await this.prisma.restaurantOrderOps.updateMany({ where: { shopId, orderId, lifecycle: { in: [RestaurantOrderLifecycle.PLACED, RestaurantOrderLifecycle.ACKNOWLEDGED] } }, data: { lifecycle: RestaurantOrderLifecycle.IN_PREPARATION, updatedById: actor.sub, version: { increment: 1 } } });
    await this.audit.record(actor, { section: 'operations', action: 'restaurant.course.fire', summary: `Fired course ${dto.courseNumber}`, meta: { orderId, courseNumber: dto.courseNumber, lineIds: rows.map((row) => row.orderLineId), ticketIds } });
    return { ok: true, lineCount: rows.length, ticketIds };
  }

  async openTab(actor: JwtAccessPayload, orderId: string, dto: BarTabDto) {
    const shopId = requireShopId(actor);
    await this.requireOrder(shopId, orderId);
    if (dto.preauthOperationId) {
      const preauth = await this.prisma.paymentOperation.findFirst({ where: { id: dto.preauthOperationId, shopId } });
      if (!preauth || !['AUTHORIZED', 'CAPTURED'].includes(preauth.state)) throw new ConflictException('Referenced preauthorization is not authorized/captured for this venue.');
    }
    if (!(await this.prisma.restaurantOrderOps.findFirst({ where: { shopId, orderId } }))) await this.bootstrapOrder(actor, orderId, {});
    const row = await this.prisma.restaurantOrderOps.update({ where: { orderId }, data: { tabStatus: RestaurantTabStatus.OPEN, tabName: dto.name.trim(), preauthOperationId: dto.preauthOperationId, updatedById: actor.sub, version: { increment: 1 } } });
    await this.audit.record(actor, { section: 'operations', action: 'restaurant.tab.open', summary: `Opened bar tab ${dto.name}`, meta: { orderId, preauthOperationId: dto.preauthOperationId } });
    return row;
  }

  async closeTab(actor: JwtAccessPayload, orderId: string) {
    const shopId = requireShopId(actor);
    const ops = await this.prisma.restaurantOrderOps.findFirst({ where: { shopId, orderId } });
    if (!ops || ops.tabStatus !== RestaurantTabStatus.OPEN) throw new ConflictException('Open bar tab not found.');
    const order = await this.requireOrder(shopId, orderId);
    if (!['COMPLETED', 'REFUNDED'].includes(order.status)) throw new ConflictException('Bar tab still has an unsettled canonical order.');
    const row = await this.prisma.restaurantOrderOps.update({ where: { id: ops.id }, data: { tabStatus: RestaurantTabStatus.CLOSED, updatedById: actor.sub, version: { increment: 1 } } });
    await this.audit.record(actor, { section: 'operations', action: 'restaurant.tab.close', summary: 'Closed settled bar tab', meta: { orderId } });
    return row;
  }

  listUnsettledTabs(actor: JwtAccessPayload) {
    return this.prisma.restaurantOrderOps.findMany({ where: { shopId: requireShopId(actor), tabStatus: RestaurantTabStatus.OPEN }, orderBy: { updatedAt: 'asc' } });
  }

  async setPickupStatus(actor: JwtAccessPayload, orderId: string, dto: PickupStatusDto) {
    const shopId = requireShopId(actor);
    const order = await this.requireOrder(shopId, orderId);
    if (order.serviceMode !== 'TAKEAWAY') throw new ConflictException('Pickup state is only valid for takeaway orders.');
    if (!(await this.prisma.restaurantOrderOps.findFirst({ where: { shopId, orderId } }))) await this.bootstrapOrder(actor, orderId, {});
    return this.prisma.restaurantOrderOps.update({ where: { orderId }, data: { pickupStatus: dto.status as RestaurantPickupStatus, updatedById: actor.sub, version: { increment: 1 } } });
  }

  async createStationGroup(actor: JwtAccessPayload, dto: PrepStationGroupDto) {
    const shopId = requireShopId(actor);
    const uniqueStationIds = [...new Set(dto.stationIds)];
    const stations = await this.prisma.prepStation.findMany({ where: { shopId, id: { in: uniqueStationIds }, active: true } });
    if (stations.length !== uniqueStationIds.length) throw new NotFoundException('One or more prep stations are invalid.');
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.prepStationGroup.upsert({ where: { shopId_name: { shopId, name: dto.name } }, create: { shopId, name: dto.name, expo: dto.expo ?? false, sortOrder: dto.sortOrder ?? 0 }, update: { expo: dto.expo, sortOrder: dto.sortOrder, active: true } });
      await tx.prepStationGroupMember.deleteMany({ where: { shopId, groupId: group.id } });
      await tx.prepStationGroupMember.createMany({ data: uniqueStationIds.map((stationId, sortOrder) => ({ shopId, groupId: group.id, stationId, sortOrder })) });
      return group;
    });
  }

  async controlTicket(actor: JwtAccessPayload, ticketId: string, dto: PrepTicketControlDto) {
    const shopId = requireShopId(actor);
    const ticket = await this.prisma.prepTicket.findFirst({ where: { id: ticketId, shopId } });
    if (!ticket) throw new NotFoundException('Prep ticket not found.');
    const now = new Date();
    const row = await this.prisma.prepTicketControl.upsert({
      where: { ticketId },
      create: { shopId, ticketId, acknowledgedAt: dto.acknowledge ? now : null, acknowledgedById: dto.acknowledge ? actor.sub : null, recalledAt: dto.recall ? now : null, recalledById: dto.recall ? actor.sub : null, priority: dto.priority ?? 0, rush: dto.rush ?? false, held: dto.held ?? false, firedAt: dto.held === false ? now : null },
      update: { ...(dto.acknowledge ? { acknowledgedAt: now, acknowledgedById: actor.sub } : {}), ...(dto.recall ? { recalledAt: now, recalledById: actor.sub } : {}), ...(dto.priority !== undefined ? { priority: dto.priority } : {}), ...(dto.rush !== undefined ? { rush: dto.rush } : {}), ...(dto.held !== undefined ? { held: dto.held, ...(dto.held ? {} : { firedAt: now }) } : {}) },
    });
    await this.audit.record(actor, { section: 'operations', action: 'kds.ticket.control', summary: 'Updated KDS acknowledgement/recall/priority/hold control', meta: { ticketId, ...dto } });
    return row;
  }

  async kdsBoard(actor: JwtAccessPayload, stationId?: string) {
    const shopId = requireShopId(actor);
    const [stations, tickets, policies] = await Promise.all([
      this.prisma.prepStation.findMany({ where: { shopId, active: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.prepTicket.findMany({ where: { shopId, ...(stationId ? { stationId } : {}), status: { in: ['NEW', 'PREPARING', 'READY', 'COLLECTED'] } }, orderBy: { openedAt: 'asc' }, take: 300 }),
      this.prisma.prepStationTimerPolicy.findMany({ where: { shopId } }),
    ]);
    const controls = tickets.length ? await this.prisma.prepTicketControl.findMany({ where: { shopId, ticketId: { in: tickets.map((ticket) => ticket.id) } } }) : [];
    const lines = tickets.length ? await this.prisma.prepTicketLine.findMany({ where: { shopId, ticketId: { in: tickets.map((ticket) => ticket.id) } }, orderBy: { routedAt: 'asc' } }) : [];
    const now = Date.now();
    return {
      generatedAt: new Date(),
      stations,
      tickets: tickets.map((ticket) => {
        const station = stations.find((candidate) => candidate.id === ticket.stationId);
        const control = controls.find((candidate) => candidate.ticketId === ticket.id) ?? null;
        const policy = policies.find((candidate) => candidate.stationId === ticket.stationId);
        const ageSeconds = Math.max(0, Math.floor((now - ticket.openedAt.getTime()) / 1000));
        return { ...ticket, control, ageSeconds, timerBand: restaurantTimerBand(ageSeconds, station?.targetSeconds ?? 600, policy?.warningPct ?? 75, policy?.overduePct ?? 100), lines: lines.filter((line) => line.ticketId === ticket.id) };
      }).filter((ticket) => ticket.status !== 'COLLECTED' || ticket.control?.recalledAt),
    };
  }

  async configurePrinterRoute(actor: JwtAccessPayload, dto: PrinterRouteDto) {
    const shopId = requireShopId(actor);
    const station = await this.prisma.prepStation.findFirst({ where: { id: dto.stationId, shopId, active: true } });
    if (!station) throw new NotFoundException('Prep station not found.');
    return this.prisma.restaurantPrinterRoute.upsert({ where: { shopId_stationId: { shopId, stationId: dto.stationId } }, create: { shopId, stationId: dto.stationId, printerKey: dto.printerKey, fallbackPrinterKey: dto.fallbackPrinterKey }, update: { printerKey: dto.printerKey, fallbackPrinterKey: dto.fallbackPrinterKey, active: true } });
  }

  printerQueue(actor: JwtAccessPayload) {
    return this.prisma.restaurantPrinterJob.findMany({ where: { shopId: requireShopId(actor), status: { in: [RestaurantPrinterJobStatus.QUEUED, RestaurantPrinterJobStatus.FAILED] } }, orderBy: [{ printerKey: 'asc' }, { sequenceNumber: 'asc' }], take: 500 });
  }

  async completePrinterJob(actor: JwtAccessPayload, jobId: string, dto: PrinterJobResultDto) {
    const shopId = requireShopId(actor);
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.restaurantPrinterJob.findFirst({ where: { id: jobId, shopId } });
      if (!job) throw new NotFoundException('Printer job not found.');
      if (job.status === RestaurantPrinterJobStatus.PRINTED) return job;
      if (dto.success) return tx.restaurantPrinterJob.update({ where: { id: job.id }, data: { status: RestaurantPrinterJobStatus.PRINTED, attempts: { increment: 1 }, printedAt: new Date(), lastError: null } });
      const route = await tx.restaurantPrinterRoute.findFirst({ where: { shopId, stationId: job.stationId, active: true } });
      if (route?.fallbackPrinterKey && !job.fallbackUsed) {
        const sequenceNumber = await this.nextPrinterSequence(tx, shopId, route.fallbackPrinterKey);
        return tx.restaurantPrinterJob.update({ where: { id: job.id }, data: { printerKey: route.fallbackPrinterKey, fallbackUsed: true, sequenceNumber, status: RestaurantPrinterJobStatus.QUEUED, attempts: { increment: 1 }, lastError: dto.error ?? 'PRIMARY_PRINTER_FAILED' } });
      }
      return tx.restaurantPrinterJob.update({ where: { id: job.id }, data: { status: RestaurantPrinterJobStatus.FAILED, attempts: { increment: 1 }, lastError: dto.error ?? 'PRINT_FAILED' } });
    });
  }

  async createQrToken(actor: JwtAccessPayload, dto: QrTableTokenDto) {
    const shopId = requireShopId(actor);
    const resource = await this.prisma.resource.findFirst({ where: { id: dto.resourceId, shopId } });
    if (!resource) throw new NotFoundException('Resource/table not found.');
    const expiresAt = new Date(Date.now() + dto.ttlMinutes * 60_000);
    const payload: QrPayload = { v: 1, s: shopId, r: dto.resourceId, e: expiresAt.getTime(), n: randomBytes(16).toString('base64url') };
    const token = this.signQrPayload(payload);
    const row = await this.prisma.qrTableOrderToken.create({ data: { shopId, resourceId: dto.resourceId, tokenHash: this.hashToken(token), expiresAt, maxUses: dto.maxUses ?? 20, createdById: actor.sub } });
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
    const payload = this.verifyQrToken(token);
    return withTenantRls(this.prisma as unknown as PrismaClient, { shopId: payload.s, mode: 'tenant' }, async (tx) => {
      await this.requireActiveToken(tx, payload, token);
      const shop = await tx.shop.findFirst({ where: { id: payload.s }, select: { id: true, name: true, currency: true, timezone: true } });
      if (!shop) throw new NotFoundException('Venue not found.');
      const disabledPolicies = await tx.menuServiceModePolicy.findMany({ where: { shopId: payload.s, serviceMode: 'QR_TABLE', enabled: false }, select: { menuItemId: true } });
      const disabled = new Set(disabledPolicies.map((row) => row.menuItemId));
      const [items, sections, presentations] = await Promise.all([
        tx.menuItem.findMany({ where: { shopId: payload.s, isAvailable: true }, orderBy: { name: 'asc' }, take: 2000 }),
        tx.menuSection.findMany({ where: { shopId: payload.s }, orderBy: { sortOrder: 'asc' } }),
        tx.restaurantMenuPresentation.findMany({ where: { shopId: payload.s } }),
      ]);
      const visible = items.filter((item) => !disabled.has(item.id) && (!item.trackStock || item.stock > 0) && this.withinMenuWindow(item, sections.find((section) => section.id === item.sectionId), shop.timezone));
      const itemIds = visible.map((item) => item.id);
      const variants = itemIds.length ? await tx.menuItemVariant.findMany({ where: { shopId: payload.s, menuItemId: { in: itemIds }, active: true }, orderBy: { sortOrder: 'asc' } }) : [];
      const links = itemIds.length ? await tx.menuItemModifierGroup.findMany({ where: { shopId: payload.s, menuItemId: { in: itemIds } } }) : [];
      const groupIds = [...new Set(links.map((link) => link.modifierGroupId))];
      const groups = groupIds.length ? await tx.menuModifierGroup.findMany({ where: { shopId: payload.s, id: { in: groupIds }, active: true } }) : [];
      const modifiers = groupIds.length ? await tx.menuModifier.findMany({ where: { shopId: payload.s, groupId: { in: groupIds }, active: true } }) : [];
      const blocked = modifiers.length ? await tx.menuModifierAvailability.findMany({ where: { shopId: payload.s, modifierId: { in: modifiers.map((modifier) => modifier.id) }, available: false } }) : [];
      const blockedIds = new Set(blocked.map((row) => row.modifierId));
      return {
        venue: { id: shop.id, name: shop.name, currency: shop.currency },
        tableResourceId: payload.r,
        sections,
        items: visible.map((item) => {
          const presentation = presentations.find((row) => row.menuItemId === item.id);
          return { id: item.id, sectionId: item.sectionId, name: presentation?.customerName?.trim() || item.name, description: item.description, imageUrl: item.imageUrl, price: item.price.toString(), trackStock: item.trackStock, stock: item.trackStock ? item.stock : null, expectedRestockAt: presentation?.expectedRestockAt ?? null };
        }),
        variants,
        modifierGroups: groups,
        modifiers: modifiers.filter((modifier) => !blockedIds.has(modifier.id)),
        itemModifierGroups: links,
      };
    });
  }

  async publicDisplay(token: string) {
    const payload = this.verifyQrToken(token);
    return withTenantRls(this.prisma as unknown as PrismaClient, { shopId: payload.s, mode: 'tenant' }, async (tx) => {
      await this.requireActiveToken(tx, payload, token);
      const rows = await tx.restaurantOrderOps.findMany({ where: { shopId: payload.s, currentResourceId: payload.r, lifecycle: { in: [RestaurantOrderLifecycle.PLACED, RestaurantOrderLifecycle.ACKNOWLEDGED, RestaurantOrderLifecycle.IN_PREPARATION, RestaurantOrderLifecycle.READY, RestaurantOrderLifecycle.SERVED] } }, orderBy: { createdAt: 'asc' }, take: 100 });
      return rows.map((row) => ({ orderNumber: row.displayNumber.length > 10 ? row.displayNumber.slice(-8).toUpperCase() : row.displayNumber, state: row.lifecycle, pickupStatus: row.pickupStatus }));
    });
  }

  private async routeLines(shopId: string, orderId: string, lineIds: string[], actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const lines = await tx.venueOrderLine.findMany({ where: { shopId, orderId, id: { in: lineIds }, canceledAt: null } });
      const modifiers = lines.length ? await tx.orderLineModifier.findMany({ where: { shopId, orderLineId: { in: lineIds } } }) : [];
      const presentations = lines.length ? await tx.restaurantMenuPresentation.findMany({ where: { shopId, menuItemId: { in: [...new Set(lines.map((line) => line.menuItemId))] } } }) : [];
      const tickets = new Set<string>();
      for (const line of lines) {
        const key = this.routeKey(line.priceSnapshot);
        if (!key) continue;
        const route = await tx.prepRoute.findFirst({ where: { shopId, key, active: true } });
        if (!route) continue;
        const station = await tx.prepStation.findFirst({ where: { id: route.stationId, shopId, active: true } });
        if (!station) continue;
        const ticket = await tx.prepTicket.upsert({ where: { shopId_orderId_stationId: { shopId, orderId, stationId: station.id } }, create: { shopId, orderId, stationId: station.id }, update: {} });
        const presentation = presentations.find((row) => row.menuItemId === line.menuItemId);
        await tx.prepTicketLine.upsert({ where: { shopId_orderLineId_stationId: { shopId, orderLineId: line.id, stationId: station.id } }, create: { shopId, ticketId: ticket.id, stationId: station.id, orderLineId: line.id, quantity: line.quantity, nameSnapshot: presentation?.kitchenName?.trim() || line.nameSnapshot, modifiersSnapshot: modifiers.filter((modifier) => modifier.orderLineId === line.id).map((modifier) => ({ name: modifier.nameSnapshot, priceDeltaMinor: modifier.priceDeltaMinor })) as Prisma.InputJsonValue }, update: {} });
        await tx.prepTicketControl.upsert({ where: { ticketId: ticket.id }, create: { shopId, ticketId: ticket.id, firedAt: new Date() }, update: { held: false, firedAt: new Date() } });
        await this.queuePrint(tx, shopId, ticket.id, station.id, line.id);
        tickets.add(ticket.id);
      }
      if (tickets.size) await tx.venueOrder.updateMany({ where: { id: orderId, shopId, status: 'OPEN' }, data: { status: 'SENT', version: { increment: 1 } } });
      for (const ticketId of tickets) await tx.prepStatusEvent.create({ data: { shopId, ticketId, toStatus: 'NEW', actorUserId, reason: 'COURSE_FIRED' } });
      return [...tickets];
    });
  }

  private async queuePrint(tx: Tx, shopId: string, ticketId: string, stationId: string, lineId: string) {
    const route = await tx.restaurantPrinterRoute.findFirst({ where: { shopId, stationId, active: true } });
    if (!route) return;
    const dedupKey = `ticket:${ticketId}:line:${lineId}`;
    if (await tx.restaurantPrinterJob.findUnique({ where: { shopId_dedupKey: { shopId, dedupKey } } })) return;
    const sequenceNumber = await this.nextPrinterSequence(tx, shopId, route.printerKey);
    await tx.restaurantPrinterJob.create({ data: { shopId, ticketId, stationId, printerKey: route.printerKey, sequenceNumber, dedupKey } });
  }

  private async nextPrinterSequence(tx: Tx, shopId: string, printerKey: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`phase6-printer:${shopId}:${printerKey}`}))`;
    const max = await tx.restaurantPrinterJob.aggregate({ where: { shopId, printerKey }, _max: { sequenceNumber: true } });
    return (max._max.sequenceNumber ?? 0) + 1;
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

  private async requireOrder(shopId: string, orderId: string) {
    const order = await this.prisma.venueOrder.findFirst({ where: { id: orderId, shopId } });
    if (!order) throw new NotFoundException('Order not found.');
    return order;
  }

  private signQrPayload(payload: QrPayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.qrSecret()).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifyQrToken(token: string): QrPayload {
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) throw new ForbiddenException('Invalid table token.');
    const expected = createHmac('sha256', this.qrSecret()).update(encoded).digest();
    let actual: Buffer;
    try { actual = Buffer.from(signature, 'base64url'); } catch { throw new ForbiddenException('Invalid table token signature.'); }
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ForbiddenException('Invalid table token signature.');
    let payload: QrPayload;
    try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as QrPayload; } catch { throw new ForbiddenException('Invalid table token payload.'); }
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

  private async requireActiveToken(tx: Tx, payload: QrPayload, token: string) {
    const row = await tx.qrTableOrderToken.findFirst({ where: { tokenHash: this.hashToken(token), shopId: payload.s, resourceId: payload.r } });
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now() || row.expiresAt.getTime() !== payload.e) throw new ForbiddenException('Table token is invalid, revoked, or expired.');
    return row;
  }

  private withinMenuWindow(item: { useSectionTiming: boolean; availableFrom: string | null; availableTo: string | null; availableDays: string }, section: { availableFrom: string | null; availableTo: string | null; availableDays: string } | undefined, timeZone: string) {
    const timing = item.useSectionTiming && section ? section : item;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const weekdayName = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    const now = `${hour}:${minute}`;
    if (!timing.availableDays.split(',').map((value) => Number(value.trim())).includes(weekday)) return false;
    if (!timing.availableFrom || !timing.availableTo) return true;
    return timing.availableFrom <= timing.availableTo ? now >= timing.availableFrom && now <= timing.availableTo : now >= timing.availableFrom || now <= timing.availableTo;
  }

  private routeKey(snapshot: Prisma.JsonValue): string | null {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
    const value = (snapshot as Prisma.JsonObject).prepRouteKey;
    return typeof value === 'string' && value.trim() ? value : null;
  }
}

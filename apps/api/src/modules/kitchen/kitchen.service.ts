import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RestaurantFireState } from '@prisma/client';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CreatePrepRouteDto, CreatePrepStationDto, PrepStatusDto } from './dto/kitchen.dto';

const TERMINAL = new Set(['COLLECTED', 'CANCELED']);
const TRANSITIONS: Record<string, string[]> = {
  NEW: ['PREPARING', 'CANCELED'],
  PREPARING: ['READY', 'CANCELED'],
  READY: ['COLLECTED', 'CANCELED'],
  COLLECTED: [],
  CANCELED: [],
};

export function isPrepTransitionAllowed(from: string, to: string) {
  return from === to || (TRANSITIONS[from] ?? []).includes(to);
}

export function projectTicketStatus(statuses: string[]) {
  const live = statuses.filter(Boolean);
  if (!live.length || live.every((status) => status === 'CANCELED')) return 'CANCELED';
  if (live.every((status) => status === 'COLLECTED' || status === 'CANCELED')) return 'COLLECTED';
  if (live.every((status) => ['READY', 'COLLECTED', 'CANCELED'].includes(status))) return 'READY';
  if (live.some((status) => ['PREPARING', 'READY', 'COLLECTED'].includes(status))) return 'PREPARING';
  return 'NEW';
}

export function buildEdgePrepRelay(
  ticket: { id: string; stationId: string; status: string; updatedAt: Date },
  lines: { id: string; status: string; quantity: number }[],
) {
  return {
    kind: 'KDS_PROJECTION',
    ticketId: ticket.id,
    stationId: ticket.stationId,
    status: ticket.status,
    updatedAt: ticket.updatedAt.toISOString(),
    lines: lines.map((line) => ({ id: line.id, status: line.status, quantity: line.quantity })),
  };
}

export function buildPrepAlerts(
  tickets: { id: string; stationId: string; status: string; ageSeconds: number }[],
  stations: { id: string; targetSeconds: number }[],
) {
  const targets = new Map(stations.map((station) => [station.id, station.targetSeconds]));
  const alerts: { kind: 'READY' | 'OVERDUE'; ticketId: string; stationId: string }[] = [];
  for (const ticket of tickets) {
    if (ticket.status === 'READY') {
      alerts.push({ kind: 'READY', ticketId: ticket.id, stationId: ticket.stationId });
      continue;
    }
    const target = targets.get(ticket.stationId);
    if (
      target != null &&
      ['NEW', 'PREPARING'].includes(ticket.status) &&
      ticket.ageSeconds > target
    ) {
      alerts.push({ kind: 'OVERDUE', ticketId: ticket.id, stationId: ticket.stationId });
    }
  }
  return alerts;
}

function routeKey(snapshot: Prisma.JsonValue): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const value = (snapshot as Prisma.JsonObject).prepRouteKey;
  return typeof value === 'string' && value.trim() ? value : null;
}

function effectiveTotals(lines: { taxMinor: number; totalMinor: number; canceledAt: Date | null }[]) {
  const active = lines.filter((line) => !line.canceledAt);
  const taxMinor = active.reduce((sum, line) => sum + line.taxMinor, 0);
  const totalMinor = active.reduce((sum, line) => sum + line.totalMinor, 0);
  return { subtotalMinor: totalMinor - taxMinor, taxMinor, totalMinor };
}

function timerBand(ageSeconds: number, targetSeconds: number, warningPct: number, overduePct: number) {
  const pct = targetSeconds > 0 ? (ageSeconds / targetSeconds) * 100 : overduePct;
  if (pct >= overduePct) return 'RED';
  if (pct >= warningPct) return 'AMBER';
  return 'GREEN';
}

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listStations(actor: JwtAccessPayload) {
    return this.prisma.prepStation.findMany({
      where: { shopId: requireShopId(actor), active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createStation(actor: JwtAccessPayload, dto: CreatePrepStationDto) {
    const row = await this.prisma.prepStation.create({
      data: {
        shopId: requireShopId(actor),
        name: dto.name,
        kind: dto.kind,
        targetSeconds: dto.targetSeconds ?? 600,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.record(actor, 'kds.station.create', 'Created prep station', {
      stationId: row.id,
      kind: row.kind,
    });
    return row;
  }

  async createRoute(actor: JwtAccessPayload, dto: CreatePrepRouteDto) {
    const shopId = requireShopId(actor);
    const station = await this.prisma.prepStation.findFirst({
      where: { id: dto.stationId, shopId, active: true },
    });
    if (!station) throw new NotFoundException('Prep station not found.');
    return this.prisma.prepRoute.upsert({
      where: { shopId_key: { shopId, key: dto.key } },
      create: {
        shopId,
        key: dto.key,
        stationId: dto.stationId,
        menuItemId: dto.menuItemId,
        priority: dto.priority ?? 0,
      },
      update: {
        stationId: dto.stationId,
        menuItemId: dto.menuItemId,
        priority: dto.priority ?? 0,
        active: true,
      },
    });
  }

  async submitOrder(actor: JwtAccessPayload, orderId: string) {
    const shopId = requireShopId(actor);
    const count = await this.routeOrder(shopId, orderId);
    await this.record(actor, 'kds.order.route', 'Routed fired order lines to prep stations', {
      orderId,
      ticketCount: count,
    });
    return { ok: true, ticketCount: count };
  }

  async board(actor: JwtAccessPayload, stationId?: string) {
    const shopId = requireShopId(actor);
    await this.routePendingOrders(shopId);
    await this.syncCanceledOrderLines(shopId, actor.sub);
    const [tickets, stations, policies] = await Promise.all([
      this.prisma.prepTicket.findMany({
        where: {
          shopId,
          ...(stationId ? { stationId } : {}),
          status: { in: ['NEW', 'PREPARING', 'READY'] },
        },
        orderBy: { openedAt: 'asc' },
      }),
      this.prisma.prepStation.findMany({
        where: { shopId, active: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.prepStationTimerPolicy.findMany({ where: { shopId } }),
    ]);
    const ticketIds = tickets.map((ticket) => ticket.id);
    const [lines, controls] = ticketIds.length
      ? await Promise.all([
          this.prisma.prepTicketLine.findMany({
            where: { shopId, ticketId: { in: ticketIds } },
            orderBy: { routedAt: 'asc' },
          }),
          this.prisma.prepTicketControl.findMany({
            where: { shopId, ticketId: { in: ticketIds } },
          }),
        ])
      : [[], []];
    const now = Date.now();
    const projectedTickets = tickets.map((ticket) => {
      const ticketLines = lines.filter((line) => line.ticketId === ticket.id);
      const control = controls.find((candidate) => candidate.ticketId === ticket.id) ?? null;
      const station = stations.find((candidate) => candidate.id === ticket.stationId);
      const policy = policies.find((candidate) => candidate.stationId === ticket.stationId);
      const ageSeconds = Math.max(0, Math.floor((now - ticket.openedAt.getTime()) / 1000));
      return {
        ...ticket,
        ageSeconds,
        timerBand: timerBand(
          ageSeconds,
          station?.targetSeconds ?? 600,
          policy?.warningPct ?? 75,
          policy?.overduePct ?? 100,
        ),
        prepareSeconds: ticket.startedAt
          ? Math.max(
              0,
              Math.floor(((ticket.readyAt ?? new Date()).getTime() - ticket.startedAt.getTime()) / 1000),
            )
          : null,
        control,
        lines: ticketLines,
        edgeProjection: buildEdgePrepRelay(ticket, ticketLines),
      };
    });
    return {
      generatedAt: new Date(),
      stations,
      tickets: projectedTickets,
      alerts: buildPrepAlerts(projectedTickets, stations),
    };
  }

  async setLineStatus(actor: JwtAccessPayload, lineId: string, dto: PrepStatusDto) {
    const shopId = requireShopId(actor);
    const line = await this.prisma.prepTicketLine.findFirst({ where: { id: lineId, shopId } });
    if (!line) throw new NotFoundException('Prep line not found.');
    if (!isPrepTransitionAllowed(line.status, dto.status)) {
      throw new ConflictException(`Invalid prep transition ${line.status} → ${dto.status}.`);
    }
    if (line.status === dto.status) return line;
    const now = new Date();
    const data: Prisma.PrepTicketLineUpdateInput = {
      status: dto.status,
      ...(dto.status === 'PREPARING' ? { startedAt: line.startedAt ?? now } : {}),
      ...(dto.status === 'READY' ? { readyAt: now } : {}),
      ...(dto.status === 'COLLECTED' ? { collectedAt: now } : {}),
      ...(dto.status === 'CANCELED'
        ? { canceledAt: now, cancellationReason: dto.reason ?? 'KDS' }
        : {}),
    };
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.prepTicketLine.update({ where: { id: line.id }, data });
      await tx.prepStatusEvent.create({
        data: {
          shopId,
          ticketId: line.ticketId,
          lineId: line.id,
          fromStatus: line.status,
          toStatus: dto.status,
          actorUserId: actor.sub,
          reason: dto.reason,
        },
      });
      if (dto.status === 'CANCELED') {
        const orderLine = await tx.venueOrderLine.findFirst({
          where: { id: line.orderLineId, shopId },
        });
        if (orderLine && !orderLine.canceledAt) {
          const order = await tx.venueOrder.findFirst({
            where: { id: orderLine.orderId, shopId },
          });
          if (order && ['COMPLETED', 'REFUNDED', 'CANCELED'].includes(order.status)) {
            throw new ConflictException('Terminal order cannot be canceled from KDS.');
          }
          await tx.venueOrderLine.update({
            where: { id: orderLine.id },
            data: { canceledAt: now, cancellationReason: dto.reason ?? 'KDS' },
          });
          const orderLines = await tx.venueOrderLine.findMany({
            where: { shopId, orderId: orderLine.orderId },
            select: { taxMinor: true, totalMinor: true, canceledAt: true },
          });
          const totals = effectiveTotals(orderLines);
          const hasActive = orderLines.some((candidate) => !candidate.canceledAt);
          await tx.venueOrder.update({
            where: { id: orderLine.orderId },
            data: {
              ...totals,
              ...(!hasActive ? { status: 'CANCELED', canceledAt: now } : {}),
            },
          });
        }
      }
      return row;
    });
    await this.updateTicketProjection(shopId, line.ticketId, actor.sub, dto.reason);
    return updated;
  }

  async setTicketStatus(actor: JwtAccessPayload, ticketId: string, dto: PrepStatusDto) {
    const shopId = requireShopId(actor);
    const ticket = await this.prisma.prepTicket.findFirst({ where: { id: ticketId, shopId } });
    if (!ticket) throw new NotFoundException('Prep ticket not found.');
    const lines = await this.prisma.prepTicketLine.findMany({ where: { shopId, ticketId } });
    for (const line of lines) {
      if (TERMINAL.has(line.status)) continue;
      if (!isPrepTransitionAllowed(line.status, dto.status)) {
        if (dto.status === 'READY' && line.status === 'NEW') {
          await this.setLineStatus(actor, line.id, { status: 'PREPARING' });
        } else if (dto.status === 'COLLECTED' && line.status !== 'READY') {
          if (line.status === 'NEW') await this.setLineStatus(actor, line.id, { status: 'PREPARING' });
          await this.setLineStatus(actor, line.id, { status: 'READY' });
        }
      }
      await this.setLineStatus(actor, line.id, dto);
    }
    return this.prisma.prepTicket.findUnique({ where: { id: ticketId } });
  }

  private async routePendingOrders(shopId: string) {
    const orders = await this.prisma.venueOrder.findMany({
      where: { shopId, status: { in: ['OPEN', 'SENT'] } },
      select: { id: true },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const order of orders) await this.routeOrder(shopId, order.id);
  }

  private async routeOrder(shopId: string, orderId: string) {
    const order = await this.prisma.venueOrder.findFirst({
      where: { id: orderId, shopId, status: { in: ['OPEN', 'SENT'] } },
    });
    if (!order) throw new NotFoundException('Order not found or not routable.');
    const lines = await this.prisma.venueOrderLine.findMany({
      where: { shopId, orderId, canceledAt: null },
    });
    if (!lines.length) return 0;
    const lineIds = lines.map((line) => line.id);
    const [modifiers, controls, presentations] = await Promise.all([
      this.prisma.orderLineModifier.findMany({
        where: { shopId, orderLineId: { in: lineIds } },
      }),
      this.prisma.restaurantOrderLineOps.findMany({
        where: { shopId, orderLineId: { in: lineIds } },
      }),
      this.prisma.restaurantMenuPresentation.findMany({
        where: { shopId, menuItemId: { in: [...new Set(lines.map((line) => line.menuItemId))] } },
      }),
    ]);
    const routed = new Set<string>();
    for (const line of lines) {
      const phase6 = controls.find((control) => control.orderLineId === line.id);
      if (phase6 && phase6.fireState !== RestaurantFireState.FIRED) continue;
      const key = routeKey(line.priceSnapshot);
      if (!key) continue;
      const route = await this.prisma.prepRoute.findFirst({ where: { shopId, key, active: true } });
      if (!route) continue;
      const station = await this.prisma.prepStation.findFirst({
        where: { id: route.stationId, shopId, active: true },
      });
      if (!station) continue;
      const ticket = await this.prisma.prepTicket.upsert({
        where: { shopId_orderId_stationId: { shopId, orderId, stationId: station.id } },
        create: { shopId, orderId, stationId: station.id },
        update: {},
      });
      const presentation = presentations.find((row) => row.menuItemId === line.menuItemId);
      await this.prisma.prepTicketLine.upsert({
        where: {
          shopId_orderLineId_stationId: { shopId, orderLineId: line.id, stationId: station.id },
        },
        create: {
          shopId,
          ticketId: ticket.id,
          stationId: station.id,
          orderLineId: line.id,
          quantity: line.quantity,
          nameSnapshot: presentation?.kitchenName?.trim() || line.nameSnapshot,
          modifiersSnapshot: modifiers
            .filter((modifier) => modifier.orderLineId === line.id)
            .map((modifier) => ({
              name: modifier.nameSnapshot,
              priceDeltaMinor: modifier.priceDeltaMinor,
            })) as Prisma.InputJsonValue,
        },
        update: {},
      });
      await this.prisma.prepTicketControl.upsert({
        where: { ticketId: ticket.id },
        create: { shopId, ticketId: ticket.id, firedAt: phase6?.firedAt ?? new Date() },
        update: {},
      });
      await this.queuePrinterJob(shopId, ticket.id, station.id, line.id);
      routed.add(ticket.id);
    }
    if (routed.size && order.status === 'OPEN') {
      await this.prisma.venueOrder.update({
        where: { id: order.id },
        data: { status: 'SENT', version: { increment: 1 } },
      });
    }
    return routed.size;
  }

  private async queuePrinterJob(shopId: string, ticketId: string, stationId: string, lineId: string) {
    const route = await this.prisma.restaurantPrinterRoute.findFirst({
      where: { shopId, stationId, active: true },
    });
    if (!route) return;
    const dedupKey = `ticket:${ticketId}:line:${lineId}`;
    if (
      await this.prisma.restaurantPrinterJob.findUnique({
        where: { shopId_dedupKey: { shopId, dedupKey } },
      })
    ) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`printer:${shopId}:${route.printerKey}`}))`;
      const existing = await tx.restaurantPrinterJob.findUnique({
        where: { shopId_dedupKey: { shopId, dedupKey } },
      });
      if (existing) return;
      const max = await tx.restaurantPrinterJob.aggregate({
        where: { shopId, printerKey: route.printerKey },
        _max: { sequenceNumber: true },
      });
      await tx.restaurantPrinterJob.create({
        data: {
          shopId,
          ticketId,
          stationId,
          printerKey: route.printerKey,
          sequenceNumber: (max._max.sequenceNumber ?? 0) + 1,
          dedupKey,
        },
      });
    });
  }

  private async syncCanceledOrderLines(shopId: string, actorUserId: string) {
    const canceled = await this.prisma.venueOrderLine.findMany({
      where: { shopId, canceledAt: { not: null } },
      select: { id: true, canceledAt: true, cancellationReason: true },
    });
    if (!canceled.length) return;
    const affected = new Map<string, string>();
    for (const line of canceled) {
      const livePrepLines = await this.prisma.prepTicketLine.findMany({
        where: { shopId, orderLineId: line.id, status: { notIn: ['COLLECTED', 'CANCELED'] } },
      });
      for (const prepLine of livePrepLines) {
        const reason = line.cancellationReason ?? 'ORDER_CANCELED';
        const canceledAt = line.canceledAt ?? new Date();
        await this.prisma.$transaction(async (tx) => {
          await tx.prepTicketLine.update({
            where: { id: prepLine.id },
            data: { status: 'CANCELED', canceledAt, cancellationReason: reason },
          });
          await tx.prepStatusEvent.create({
            data: {
              shopId,
              ticketId: prepLine.ticketId,
              lineId: prepLine.id,
              fromStatus: prepLine.status,
              toStatus: 'CANCELED',
              actorUserId,
              reason,
            },
          });
        });
        affected.set(prepLine.ticketId, reason);
      }
    }
    for (const [ticketId, reason] of affected) {
      await this.updateTicketProjection(shopId, ticketId, actorUserId, reason);
    }
  }

  private async updateTicketProjection(
    shopId: string,
    ticketId: string,
    actorUserId: string,
    reason?: string,
  ) {
    const ticket = await this.prisma.prepTicket.findFirst({ where: { id: ticketId, shopId } });
    if (!ticket) return;
    const lines = await this.prisma.prepTicketLine.findMany({ where: { shopId, ticketId } });
    const next = projectTicketStatus(lines.map((line) => line.status));
    if (next === ticket.status) return;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.prepTicket.update({
        where: { id: ticketId },
        data: {
          status: next,
          ...(next === 'PREPARING' ? { startedAt: ticket.startedAt ?? now } : {}),
          ...(next === 'READY' ? { readyAt: now } : {}),
          ...(next === 'COLLECTED' ? { collectedAt: now } : {}),
          ...(next === 'CANCELED' ? { canceledAt: now } : {}),
        },
      });
      await tx.prepStatusEvent.create({
        data: {
          shopId,
          ticketId,
          fromStatus: ticket.status,
          toStatus: next,
          actorUserId,
          reason,
        },
      });
    });
  }

  private record(
    actor: JwtAccessPayload,
    action: string,
    summary: string,
    meta: Record<string, unknown>,
  ) {
    return this.audit.record(actor, { section: 'operations', action, summary, meta });
  }
}

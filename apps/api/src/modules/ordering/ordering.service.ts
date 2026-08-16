import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RestaurantFireState, RestaurantOrderLifecycle, RestaurantOrderOrigin, RestaurantPickupStatus } from '@prisma/client';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  CancelOrderLineDto,
  CreateModifierDto,
  CreateModifierGroupDto,
  CreateVariantDto,
  CreateVenueOrderDto,
  LinkModifierGroupDto,
  UpsertCommerceProfileDto,
} from './dto/ordering.dto';
import { OrderingPricingService } from './ordering-pricing.service';

export function calculateEffectiveOrderTotals(
  lines: { taxMinor: number; totalMinor: number; canceledAt?: Date | null }[],
) {
  const active = lines.filter((line) => !line.canceledAt);
  const taxMinor = active.reduce((sum, line) => sum + line.taxMinor, 0);
  const totalMinor = active.reduce((sum, line) => sum + line.totalMinor, 0);
  return { subtotalMinor: totalMinor - taxMinor, taxMinor, totalMinor };
}

function projectPrepTicketStatus(statuses: string[]) {
  if (!statuses.length || statuses.every((status) => status === 'CANCELED')) return 'CANCELED';
  if (statuses.every((status) => status === 'COLLECTED' || status === 'CANCELED')) return 'COLLECTED';
  if (statuses.every((status) => ['READY', 'COLLECTED', 'CANCELED'].includes(status))) return 'READY';
  if (statuses.some((status) => ['PREPARING', 'READY', 'COLLECTED'].includes(status))) return 'PREPARING';
  return 'NEW';
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class OrderingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: OrderingPricingService,
    private readonly audit: AuditService,
  ) {}

  async catalog(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const [items, sections, variants, groups, modifiers, links, profiles] = await Promise.all([
      this.prisma.menuItem.findMany({ where: { shopId }, orderBy: { name: 'asc' } }),
      this.prisma.menuSection.findMany({ where: { shopId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.menuItemVariant.findMany({ where: { shopId, active: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.menuModifierGroup.findMany({ where: { shopId, active: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.menuModifier.findMany({ where: { shopId, active: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.menuItemModifierGroup.findMany({ where: { shopId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.menuItemCommerceProfile.findMany({ where: { shopId } }),
    ]);
    return { items, sections, variants, groups, modifiers, links, profiles };
  }

  createGroup(actor: JwtAccessPayload, dto: CreateModifierGroupDto) {
    return this.prisma.menuModifierGroup.create({
      data: {
        shopId: requireShopId(actor),
        name: dto.name,
        required: dto.required ?? false,
        minSelect: dto.minSelect ?? 0,
        maxSelect: dto.maxSelect ?? 1,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async createModifier(actor: JwtAccessPayload, dto: CreateModifierDto) {
    const shopId = requireShopId(actor);
    const group = await this.prisma.menuModifierGroup.findFirst({ where: { id: dto.groupId, shopId } });
    if (!group) throw new NotFoundException('Modifier group not found.');
    return this.prisma.menuModifier.create({
      data: {
        shopId,
        groupId: dto.groupId,
        name: dto.name,
        priceDeltaMinor: dto.priceDeltaMinor ?? 0,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async createVariant(actor: JwtAccessPayload, dto: CreateVariantDto) {
    const shopId = requireShopId(actor);
    await this.requireMenuItem(shopId, dto.menuItemId);
    return this.prisma.menuItemVariant.create({
      data: {
        shopId,
        menuItemId: dto.menuItemId,
        name: dto.name,
        priceDeltaMinor: dto.priceDeltaMinor ?? 0,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async linkGroup(actor: JwtAccessPayload, dto: LinkModifierGroupDto) {
    const shopId = requireShopId(actor);
    await this.requireMenuItem(shopId, dto.menuItemId);
    const group = await this.prisma.menuModifierGroup.findFirst({
      where: { id: dto.modifierGroupId, shopId },
    });
    if (!group) throw new NotFoundException('Modifier group not found.');
    return this.prisma.menuItemModifierGroup.upsert({
      where: {
        shopId_menuItemId_modifierGroupId: {
          shopId,
          menuItemId: dto.menuItemId,
          modifierGroupId: dto.modifierGroupId,
        },
      },
      create: {
        shopId,
        menuItemId: dto.menuItemId,
        modifierGroupId: dto.modifierGroupId,
        sortOrder: dto.sortOrder ?? 0,
      },
      update: { sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async upsertProfile(actor: JwtAccessPayload, dto: UpsertCommerceProfileDto) {
    const shopId = requireShopId(actor);
    await this.requireMenuItem(shopId, dto.menuItemId);
    return this.prisma.menuItemCommerceProfile.upsert({
      where: { shopId_menuItemId: { shopId, menuItemId: dto.menuItemId } },
      create: {
        shopId,
        menuItemId: dto.menuItemId,
        taxCategoryKey: dto.taxCategoryKey,
        taxRateBps: dto.taxRateBps ?? 0,
        prepRouteKey: dto.prepRouteKey,
        recipeKey: dto.recipeKey,
        favorite: dto.favorite ?? false,
      },
      update: {
        taxCategoryKey: dto.taxCategoryKey,
        taxRateBps: dto.taxRateBps,
        prepRouteKey: dto.prepRouteKey,
        recipeKey: dto.recipeKey,
        favorite: dto.favorite,
      },
    });
  }

  async createOrder(actor: JwtAccessPayload, dto: CreateVenueOrderDto) {
    const shopId = requireShopId(actor);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true, timezone: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');

    let guestCheckId = dto.guestCheckId ?? null;
    let resourceId = dto.resourceId ?? null;
    if (dto.operationsSessionId) {
      const session = await this.prisma.operationsSession.findFirst({
        where: { id: dto.operationsSessionId, shopId, status: { in: ['ACTIVE', 'PAUSED'] } },
      });
      if (!session) throw new NotFoundException('Active play session not found.');
      guestCheckId = guestCheckId ?? session.guestCheckId;
      resourceId = resourceId ?? session.resourceId;
    }
    if (guestCheckId) {
      const check = await this.prisma.guestCheck.findFirst({
        where: { id: guestCheckId, shopId, status: 'OPEN' },
        select: { currentSettlementId: true },
      });
      if (!check) throw new ConflictException('Guest check is not open.');
      if (check.currentSettlementId) {
        const paid = await this.prisma.checkSettlement.findFirst({
          where: {
            id: check.currentSettlementId,
            shopId,
            guestCheckId,
            payments: { some: { status: 'SUCCESS' } },
          },
          select: { id: true },
        });
        if (paid) throw new ConflictException('A paid GuestCheck cannot accept another order.');
      }
    }
    if (resourceId) {
      const resource = await this.prisma.resource.findFirst({ where: { id: resourceId, shopId } });
      if (!resource) throw new NotFoundException('Resource not found.');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const priced = [];
      for (const input of dto.lines) {
        await this.assertLineAvailable(tx, shopId, dto.serviceMode, input, shop.timezone);
        priced.push(await this.pricing.priceLine(shopId, input, tx));
      }
      for (const input of dto.lines) {
        await this.claimTrackedStock(tx, shopId, input.menuItemId, input.quantity);
      }
      const subtotalMinor = priced.reduce((sum, line) => sum + line.subtotalMinor, 0);
      const taxMinor = priced.reduce((sum, line) => sum + line.taxMinor, 0);
      const row = await tx.venueOrder.create({
        data: {
          shopId,
          guestCheckId,
          operationsSessionId: dto.operationsSessionId,
          resourceId,
          serviceMode: dto.serviceMode,
          seat: dto.seat,
          guestLabel: dto.guestLabel,
          currency: shop.currency,
          subtotalMinor,
          taxMinor,
          totalMinor: subtotalMinor + taxMinor,
          createdById: actor.sub,
        },
      });
      const autoFire = dto.serviceMode === 'TAKEAWAY' || dto.serviceMode === 'QUICK_SALE';
      await tx.restaurantOrderOps.create({
        data: {
          shopId,
          orderId: row.id,
          lifecycle: RestaurantOrderLifecycle.PLACED,
          origin:
            dto.serviceMode === 'QUICK_SALE'
              ? RestaurantOrderOrigin.CASHIER
              : RestaurantOrderOrigin.STAFF,
          displayNumber: `R-${row.id}`,
          pickupStatus:
            dto.serviceMode === 'TAKEAWAY'
              ? RestaurantPickupStatus.PREPARING
              : RestaurantPickupStatus.NOT_APPLICABLE,
          currentResourceId: resourceId,
          createdById: actor.sub,
          updatedById: actor.sub,
        },
      });
      for (let index = 0; index < priced.length; index += 1) {
        const line = priced[index];
        const created = await tx.venueOrderLine.create({
          data: {
            shopId,
            orderId: row.id,
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
        if (line.modifiers.length) {
          await tx.orderLineModifier.createMany({
            data: line.modifiers.map((modifier) => ({
              shopId,
              orderLineId: created.id,
              modifierId: modifier.id,
              nameSnapshot: modifier.name,
              priceDeltaMinor: modifier.priceDeltaMinor,
            })),
          });
        }
        await tx.restaurantOrderLineOps.create({
          data: {
            shopId,
            orderId: row.id,
            orderLineId: created.id,
            courseNumber: 1,
            fireState: autoFire ? RestaurantFireState.FIRED : RestaurantFireState.HOLD,
            firedAt: autoFire ? new Date() : null,
            updatedById: actor.sub,
          },
        });
      }
      return row;
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'order.create',
      summary: `Created ${dto.serviceMode.toLowerCase()} order`,
      meta: {
        orderId: order.id,
        totalMinor: order.totalMinor,
        guestCheckId,
        operationsSessionId: dto.operationsSessionId,
      },
    });
    return this.getOrder(actor, order.id);
  }

  async getOrder(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    const order = await this.prisma.venueOrder.findFirst({ where: { id, shopId } });
    if (!order) throw new NotFoundException('Order not found.');
    const lines = await this.prisma.venueOrderLine.findMany({
      where: { shopId, orderId: id },
      orderBy: { createdAt: 'asc' },
    });
    const modifiers = lines.length
      ? await this.prisma.orderLineModifier.findMany({
          where: { shopId, orderLineId: { in: lines.map((line) => line.id) } },
        })
      : [];
    return {
      ...order,
      lines: lines.map((line) => ({
        ...line,
        modifiers: modifiers.filter((modifier) => modifier.orderLineId === line.id),
      })),
    };
  }

  async listOrders(actor: JwtAccessPayload) {
    return this.prisma.venueOrder.findMany({
      where: { shopId: requireShopId(actor) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async cancelLine(
    actor: JwtAccessPayload,
    orderId: string,
    lineId: string,
    dto: CancelOrderLineDto,
  ) {
    const shopId = requireShopId(actor);
    const order = await this.prisma.venueOrder.findFirst({ where: { id: orderId, shopId } });
    if (!order) throw new NotFoundException('Order not found.');
    if (['CANCELED', 'COMPLETED', 'REFUNDED'].includes(order.status)) {
      throw new ConflictException('Terminal order cannot be changed.');
    }
    const line = await this.prisma.venueOrderLine.findFirst({
      where: { id: lineId, orderId, shopId },
    });
    if (!line) throw new NotFoundException('Order line not found.');
    if (line.canceledAt) return line;
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.venueOrderLine.update({
        where: { id: lineId },
        data: { canceledAt: now, cancellationReason: dto.reason },
      });
      await this.cancelPrepLines(tx, shopId, [lineId], actor.sub, dto.reason, now);
      await tx.restaurantOrderLineOps.updateMany({
        where: { shopId, orderLineId: lineId },
        data: { updatedById: actor.sub },
      });
      const effective = await tx.venueOrderLine.findMany({
        where: { shopId, orderId },
        select: { taxMinor: true, totalMinor: true, canceledAt: true },
      });
      const totals = calculateEffectiveOrderTotals(effective);
      const hasActive = effective.some((candidate) => !candidate.canceledAt);
      await tx.venueOrder.update({
        where: { id: orderId },
        data: { ...totals, ...(!hasActive ? { status: 'CANCELED', canceledAt: now } : {}) },
      });
      if (!hasActive) {
        await tx.restaurantOrderOps.updateMany({
          where: { shopId, orderId },
          data: { lifecycle: RestaurantOrderLifecycle.CANCELLED, updatedById: actor.sub },
        });
      }
      return row;
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'order.line.cancel',
      summary: 'Canceled order line without mutating price snapshot',
      meta: { orderId, lineId, reason: dto.reason },
    });
    return updated;
  }

  async cancelOrder(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    const order = await this.prisma.venueOrder.findFirst({ where: { id, shopId } });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.status === 'COMPLETED' || order.status === 'REFUNDED') {
      throw new ConflictException('Settled order must use the refund flow.');
    }
    if (order.status === 'CANCELED') return order;
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const lines = await tx.venueOrderLine.findMany({
        where: { shopId, orderId: id },
        select: { id: true, canceledAt: true },
      });
      const liveLineIds = lines.filter((line) => !line.canceledAt).map((line) => line.id);
      if (liveLineIds.length) {
        await this.cancelPrepLines(tx, shopId, liveLineIds, actor.sub, 'ORDER_CANCELED', now);
        await tx.venueOrderLine.updateMany({
          where: { shopId, orderId: id, id: { in: liveLineIds } },
          data: { canceledAt: now, cancellationReason: 'ORDER_CANCELED' },
        });
      }
      await tx.restaurantOrderOps.updateMany({
        where: { shopId, orderId: id },
        data: { lifecycle: RestaurantOrderLifecycle.CANCELLED, updatedById: actor.sub },
      });
      return tx.venueOrder.update({
        where: { id },
        data: {
          status: 'CANCELED',
          canceledAt: now,
          subtotalMinor: 0,
          taxMinor: 0,
          totalMinor: 0,
        },
      });
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'order.cancel',
      summary: 'Canceled order and active production work',
      meta: { orderId: id },
    });
    return row;
  }

  private async assertLineAvailable(
    tx: Tx,
    shopId: string,
    serviceMode: string,
    input: CreateVenueOrderDto['lines'][number],
    timeZone: string,
  ) {
    const item = await tx.menuItem.findFirst({ where: { id: input.menuItemId, shopId } });
    if (!item || !item.isAvailable) throw new ConflictException('Menu item is unavailable.');
    if (item.trackStock && item.stock < input.quantity) {
      throw new ConflictException('Menu item has insufficient stock.');
    }
    const policyMode = this.policyMode(serviceMode);
    const policy = await tx.menuServiceModePolicy.findUnique({
      where: {
        shopId_menuItemId_serviceMode: { shopId, menuItemId: input.menuItemId, serviceMode: policyMode },
      },
    });
    if (policy && !policy.enabled) {
      throw new ConflictException('Menu item is unavailable for this service mode.');
    }
    const section = item.sectionId
      ? await tx.menuSection.findFirst({ where: { id: item.sectionId, shopId } })
      : null;
    if (!this.withinAvailabilityWindow(item, section, timeZone)) {
      throw new ConflictException('Menu item is unavailable at this time.');
    }
    if (input.modifierIds?.length) {
      const blocked = await tx.menuModifierAvailability.findFirst({
        where: {
          shopId,
          modifierId: { in: [...new Set(input.modifierIds)] },
          available: false,
        },
      });
      if (blocked) throw new ConflictException('A selected modifier is unavailable.');
    }
  }

  private async claimTrackedStock(tx: Tx, shopId: string, menuItemId: string, quantity: number) {
    const item = await tx.menuItem.findFirst({
      where: { id: menuItemId, shopId },
      select: { trackStock: true },
    });
    if (!item?.trackStock) return;
    const claimed = await tx.menuItem.updateMany({
      where: { id: menuItemId, shopId, isAvailable: true, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });
    if (claimed.count !== 1) throw new ConflictException('Stock changed while ordering.');
    const remaining = await tx.menuItem.findUnique({
      where: { id: menuItemId },
      select: { stock: true },
    });
    if (remaining && remaining.stock <= 0) {
      await tx.menuItem.update({ where: { id: menuItemId }, data: { isAvailable: false } });
      await tx.domainEventOutbox.create({
        data: {
          shopId,
          aggregateType: 'RESTAURANT_MENU_AVAILABILITY',
          aggregateId: menuItemId,
          eventType: 'restaurant.menu_availability.changed.v1',
          payload: { schemaVersion: 1, kind: 'AUTO_86', available: false } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private withinAvailabilityWindow(
    item: {
      useSectionTiming: boolean;
      availableFrom: string | null;
      availableTo: string | null;
      availableDays: string;
    },
    section: { availableFrom: string | null; availableTo: string | null; availableDays: string } | null,
    timeZone: string,
  ) {
    const timing = item.useSectionTiming && section ? section : item;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const weekdayName = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    const now = `${hour}:${minute}`;
    const days = timing.availableDays
      .split(',')
      .map((value) => Number(value.trim()))
      .filter(Number.isInteger);
    if (!days.includes(weekday)) return false;
    if (!timing.availableFrom || !timing.availableTo) return true;
    return timing.availableFrom <= timing.availableTo
      ? now >= timing.availableFrom && now <= timing.availableTo
      : now >= timing.availableFrom || now <= timing.availableTo;
  }

  private policyMode(serviceMode: string) {
    if (serviceMode === 'TAKEAWAY') return 'TAKEAWAY';
    if (serviceMode === 'QUICK_SALE') return 'BAR';
    return 'DINE_IN';
  }

  private async cancelPrepLines(
    tx: Tx,
    shopId: string,
    orderLineIds: string[],
    actorUserId: string,
    reason: string,
    now: Date,
  ) {
    if (!orderLineIds.length) return;
    const allPrepLines = await tx.prepTicketLine.findMany({
      where: { shopId, orderLineId: { in: orderLineIds } },
    });
    if (allPrepLines.some((line) => line.status === 'COLLECTED')) {
      throw new ConflictException('Collected production cannot be canceled; use refund/compensation.');
    }
    const prepLines = allPrepLines.filter((line) => line.status !== 'CANCELED');
    const ticketIds = [...new Set(prepLines.map((line) => line.ticketId))];
    for (const prepLine of prepLines) {
      await tx.prepTicketLine.update({
        where: { id: prepLine.id },
        data: { status: 'CANCELED', canceledAt: now, cancellationReason: reason },
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
    }
    for (const ticketId of ticketIds) {
      const ticket = await tx.prepTicket.findFirst({ where: { id: ticketId, shopId } });
      if (!ticket) continue;
      const lines = await tx.prepTicketLine.findMany({
        where: { shopId, ticketId },
        select: { status: true },
      });
      const next = projectPrepTicketStatus(lines.map((line) => line.status));
      if (next === ticket.status) continue;
      await tx.prepTicket.update({
        where: { id: ticketId },
        data: { status: next, ...(next === 'CANCELED' ? { canceledAt: now } : {}) },
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
    }
  }

  private async requireMenuItem(shopId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({ where: { id, shopId } });
    if (!item) throw new NotFoundException('Menu item not found.');
    return item;
  }
}

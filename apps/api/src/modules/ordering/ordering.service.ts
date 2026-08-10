import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CancelOrderLineDto, CreateModifierDto, CreateModifierGroupDto, CreateVariantDto, CreateVenueOrderDto, LinkModifierGroupDto, UpsertCommerceProfileDto } from './dto/ordering.dto';
import { OrderingPricingService } from './ordering-pricing.service';

@Injectable()
export class OrderingService {
  constructor(private readonly prisma: PrismaService, private readonly pricing: OrderingPricingService, private readonly audit: AuditService) {}

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
    return this.prisma.menuModifierGroup.create({ data: { shopId: requireShopId(actor), name: dto.name, required: dto.required ?? false, minSelect: dto.minSelect ?? 0, maxSelect: dto.maxSelect ?? 1, sortOrder: dto.sortOrder ?? 0 } });
  }
  async createModifier(actor: JwtAccessPayload, dto: CreateModifierDto) {
    const shopId = requireShopId(actor);
    const group = await this.prisma.menuModifierGroup.findFirst({ where: { id: dto.groupId, shopId } });
    if (!group) throw new NotFoundException('Modifier group not found.');
    return this.prisma.menuModifier.create({ data: { shopId, groupId: dto.groupId, name: dto.name, priceDeltaMinor: dto.priceDeltaMinor ?? 0, sortOrder: dto.sortOrder ?? 0 } });
  }
  async createVariant(actor: JwtAccessPayload, dto: CreateVariantDto) {
    const shopId = requireShopId(actor); await this.requireMenuItem(shopId, dto.menuItemId);
    return this.prisma.menuItemVariant.create({ data: { shopId, menuItemId: dto.menuItemId, name: dto.name, priceDeltaMinor: dto.priceDeltaMinor ?? 0, sortOrder: dto.sortOrder ?? 0 } });
  }
  async linkGroup(actor: JwtAccessPayload, dto: LinkModifierGroupDto) {
    const shopId = requireShopId(actor); await this.requireMenuItem(shopId, dto.menuItemId);
    const group = await this.prisma.menuModifierGroup.findFirst({ where: { id: dto.modifierGroupId, shopId } });
    if (!group) throw new NotFoundException('Modifier group not found.');
    return this.prisma.menuItemModifierGroup.upsert({ where: { shopId_menuItemId_modifierGroupId: { shopId, menuItemId: dto.menuItemId, modifierGroupId: dto.modifierGroupId } }, create: { shopId, menuItemId: dto.menuItemId, modifierGroupId: dto.modifierGroupId, sortOrder: dto.sortOrder ?? 0 }, update: { sortOrder: dto.sortOrder ?? 0 } });
  }
  async upsertProfile(actor: JwtAccessPayload, dto: UpsertCommerceProfileDto) {
    const shopId = requireShopId(actor); await this.requireMenuItem(shopId, dto.menuItemId);
    return this.prisma.menuItemCommerceProfile.upsert({ where: { shopId_menuItemId: { shopId, menuItemId: dto.menuItemId } }, create: { shopId, menuItemId: dto.menuItemId, taxCategoryKey: dto.taxCategoryKey, taxRateBps: dto.taxRateBps ?? 0, prepRouteKey: dto.prepRouteKey, recipeKey: dto.recipeKey }, update: { taxCategoryKey: dto.taxCategoryKey, taxRateBps: dto.taxRateBps ?? 0, prepRouteKey: dto.prepRouteKey, recipeKey: dto.recipeKey } });
  }

  async createOrder(actor: JwtAccessPayload, dto: CreateVenueOrderDto) {
    const shopId = requireShopId(actor);
    let guestCheckId = dto.guestCheckId ?? null;
    let resourceId = dto.resourceId ?? null;
    if (dto.operationsSessionId) {
      const session = await this.prisma.operationsSession.findFirst({ where: { id: dto.operationsSessionId, shopId, status: { in: ['ACTIVE','PAUSED'] } } });
      if (!session) throw new NotFoundException('Active play session not found.');
      guestCheckId = guestCheckId ?? session.guestCheckId;
      resourceId = resourceId ?? session.resourceId;
    }
    if (guestCheckId) {
      const check = await this.prisma.guestCheck.findFirst({ where: { id: guestCheckId, shopId } });
      if (!check) throw new NotFoundException('Guest check not found.');
    }
    const priced = await Promise.all(dto.lines.map((line) => this.pricing.priceLine(shopId, line)));
    const subtotalMinor = priced.reduce((sum, line) => sum + line.subtotalMinor, 0);
    const taxMinor = priced.reduce((sum, line) => sum + line.taxMinor, 0);
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { currency: true } });
    const order = await this.prisma.$transaction(async (tx) => {
      const row = await tx.venueOrder.create({ data: { shopId, guestCheckId, operationsSessionId: dto.operationsSessionId, resourceId, serviceMode: dto.serviceMode, seat: dto.seat, guestLabel: dto.guestLabel, currency: shop?.currency ?? 'EUR', subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor, createdById: actor.sub } });
      for (const line of priced) {
        const created = await tx.venueOrderLine.create({ data: { shopId, orderId: row.id, menuItemId: line.menuItemId, variantId: line.variantId, quantity: line.quantity, seat: line.seat, nameSnapshot: line.nameSnapshot, variantNameSnapshot: line.variantNameSnapshot, unitBaseMinor: line.unitBaseMinor, variantMinor: line.variantMinor, modifierMinor: line.modifierMinor, unitPriceMinor: line.unitPriceMinor, taxCategorySnapshot: line.taxCategorySnapshot, taxRateBps: line.taxRateBps, taxMinor: line.taxMinor, totalMinor: line.totalMinor, priceSnapshot: line.priceSnapshot } });
        if (line.modifiers.length) await tx.orderLineModifier.createMany({ data: line.modifiers.map((m) => ({ shopId, orderLineId: created.id, modifierId: m.id, nameSnapshot: m.name, priceDeltaMinor: m.priceDeltaMinor })) });
      }
      return row;
    });
    await this.audit.record(actor, { section: 'operations', action: 'order.create', summary: `Created ${dto.serviceMode.toLowerCase()} order`, meta: { orderId: order.id, totalMinor: order.totalMinor, guestCheckId, operationsSessionId: dto.operationsSessionId } });
    return this.getOrder(actor, order.id);
  }

  async getOrder(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    const order = await this.prisma.venueOrder.findFirst({ where: { id, shopId } });
    if (!order) throw new NotFoundException('Order not found.');
    const lines = await this.prisma.venueOrderLine.findMany({ where: { shopId, orderId: id }, orderBy: { createdAt: 'asc' } });
    const modifiers = lines.length ? await this.prisma.orderLineModifier.findMany({ where: { shopId, orderLineId: { in: lines.map((l) => l.id) } } }) : [];
    return { ...order, lines: lines.map((line) => ({ ...line, modifiers: modifiers.filter((m) => m.orderLineId === line.id) })) };
  }

  async listOrders(actor: JwtAccessPayload) {
    return this.prisma.venueOrder.findMany({ where: { shopId: requireShopId(actor) }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async cancelLine(actor: JwtAccessPayload, orderId: string, lineId: string, dto: CancelOrderLineDto) {
    const shopId = requireShopId(actor);
    const order = await this.prisma.venueOrder.findFirst({ where: { id: orderId, shopId } });
    if (!order || order.status === 'CANCELED') throw new ConflictException('Order cannot be changed.');
    const line = await this.prisma.venueOrderLine.findFirst({ where: { id: lineId, orderId, shopId } });
    if (!line) throw new NotFoundException('Order line not found.');
    if (line.canceledAt) return line;
    const updated = await this.prisma.venueOrderLine.update({ where: { id: lineId }, data: { canceledAt: new Date(), cancellationReason: dto.reason } });
    await this.audit.record(actor, { section: 'operations', action: 'order.line.cancel', summary: 'Canceled order line without mutating price snapshot', meta: { orderId, lineId, reason: dto.reason } });
    return updated;
  }

  async cancelOrder(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    const order = await this.prisma.venueOrder.findFirst({ where: { id, shopId } });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.status === 'COMPLETED') throw new ConflictException('Completed order must use the refund flow.');
    if (order.status === 'CANCELED') return order;
    const row = await this.prisma.venueOrder.update({ where: { id }, data: { status: 'CANCELED', canceledAt: new Date() } });
    await this.audit.record(actor, { section: 'operations', action: 'order.cancel', summary: 'Canceled order', meta: { orderId: id } });
    return row;
  }

  private async requireMenuItem(shopId: string, id: string) { const item = await this.prisma.menuItem.findFirst({ where: { id, shopId } }); if (!item) throw new NotFoundException('Menu item not found.'); return item; }
}

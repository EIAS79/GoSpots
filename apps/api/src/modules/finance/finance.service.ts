import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertShopFeature } from '../../common/subscription-feature.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  adjustMenuItemStockBy,
  fetchMenuItemStockRow,
  resetMenuItemStockForDay,
} from '../../common/menu-stock-db.util';
import { canFulfillQty, venueDayKey } from '../../common/menu-stock.util';
import { requireShopId } from '../../common/tenant';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLossDto, CreateTransactionDto } from './dto/finance.dto';
import {
  AddShopOrderLineDto,
  CreateShopOrderDto,
  PatchShopOrderLineDto,
  UpdateShopOrderDto,
} from './dto/orders.dto';
import { BulkOrderIdsDto } from './dto/bulk-orders.dto';
import {
  aggregateTopItems,
  buildFinanceAnalytics,
} from './finance-analytics.util';
import {
  ReservationStatus,
  ResourceStatus,
  type BookingMode,
  type PlaySessionStatus,
  type Prisma,
  type ResourceType,
  type ShopOrderStatus,
} from '@prisma/client';
import { ACTIVE_RESERVATION } from '../../common/booking-floor-status';
import {
  assertNoReservationOverlap,
  assertNoWalkInOverlap,
  assertResourceBookable,
} from '../../common/booking-overlap.util';
import { walkInEffectiveEnd } from '../../common/walk-in-block.util';
import {
  CreatePlaySessionDto,
  UpdatePlaySessionDto,
} from './dto/play-sessions.dto';
import {
  CancelPlayBillingDto,
  MarkPlayBillingPaidDto,
  UpdatePlayBillingDto,
} from './dto/play-billing.dto';
import type { PlayBillingTabDto } from './dto/play-billing.dto';
import {
  bookingCollectsPartySize,
  effectiveBillingPartySize,
  parseBowlingChargeFromNotes,
} from '../../common/booking-unit-kind';
import {
  computeBowlingBillingAmount,
  listBowlingModes,
  parseGamesFromNotes,
  resolveBowlingMode,
} from '../../common/bowling-modes.util';
import {
  applyBillingDiscount,
  classifyPlayBillingRow,
  classifyWalkInBillingRow,
  computePlayBillingAmount,
} from '../../common/play-billing.util';
import {
  auditSummaryAddLine,
  auditSummaryCreate,
  auditSummaryDelete,
  auditSummaryPatchLine,
  auditSummaryRemoveLine,
  auditSummaryUpdate,
  orderTicketLabel,
  shopOrderAuditMeta,
  type ShopOrderForAudit,
} from './shop-order-audit.util';

const LARGE_LOSS_NOTIFY_THRESHOLD = 100;

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async requireFeature(shopId: string, feature: string) {
    await assertShopFeature(this.prisma, shopId, feature);
  }

  private assert(actor: JwtAccessPayload, perm: string) {
    if (!actor.shopId) throw new ForbiddenException();
    const p = actor.perms ?? '';
    if (p !== '*' && !p.split(',').includes(perm)) {
      throw new ForbiddenException(`Missing ${perm}`);
    }
  }

  private async shopLocale(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { locale: true },
    });
    return shop?.locale ?? 'en';
  }

  private async ensureMenuItemStock(shopId: string, menuItemId: string) {
    const locale = await this.shopLocale(shopId);
    const today = venueDayKey(locale);
    await resetMenuItemStockForDay(this.prisma, menuItemId, today);
    const item = await fetchMenuItemStockRow(this.prisma, shopId, menuItemId);
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }

  private describeLinePatch(
    line: { quantity: number; unitPrice: number; lineStatus: string },
    dto: PatchShopOrderLineDto,
  ) {
    const parts: string[] = [];
    if (dto.lineStatus !== undefined && dto.lineStatus !== line.lineStatus) {
      parts.push(
        dto.lineStatus === 'CANCELED' ? 'Canceled line' : 'Restored line',
      );
    }
    if (dto.quantity !== undefined && dto.quantity !== line.quantity) {
      parts.push(`Changed quantity to ${dto.quantity}`);
    }
    if (dto.unitPrice !== undefined && dto.unitPrice !== line.unitPrice) {
      parts.push(`Changed price to ${dto.unitPrice.toFixed(2)}`);
    }
    return parts.length ? parts.join('; ') : 'Updated line';
  }

  private async notifyShopOrderCreated(shopId: string, order: ShopOrderForAudit) {
    await this.notifications.recordOperationsEvent(shopId, {
      title: 'New menu order',
      body: auditSummaryCreate(order),
      href: '/orders',
      dedupeKey: `shop-order:${order.id}`,
    });
  }

  private async notifyShopOrderCompleted(
    shopId: string,
    order: ShopOrderForAudit,
  ) {
    await this.notifications.recordOperationsEvent(shopId, {
      title: 'Order handed off',
      body: `${orderTicketLabel(order)} · ${order.total.toFixed(2)}`,
      href: '/orders',
      dedupeKey: `shop-order-complete:${order.id}`,
    });
  }

  private async adjustMenuStock(
    menuItemId: string,
    delta: number,
  ): Promise<void> {
    if (delta === 0) return;
    const ok = await adjustMenuItemStockBy(this.prisma, menuItemId, delta);
    if (!ok) {
      throw new BadRequestException('Not enough stock for this item.');
    }
  }

  async listTransactions(actor: JwtAccessPayload, take = 40) {
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    return this.prisma.transaction.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { lines: true },
    });
  }

  async createTransaction(actor: JwtAccessPayload, dto: CreateTransactionDto) {
    this.assert(actor, 'transaction.write');
    const shopId = actor.shopId!;
    await this.requireFeature(shopId, 'transaction');
    if (dto.kind === 'SALE') {
      for (const line of dto.lines) {
        if (!line.menuItemId) continue;
        const item = await this.ensureMenuItemStock(shopId, line.menuItemId);
        if (!canFulfillQty(item, line.quantity)) {
          throw new BadRequestException(
            `${item.name} is out of stock (${item.stock} left).`,
          );
        }
      }
    }
    const amount = dto.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const tx = await this.prisma.transaction.create({
      data: {
        shopId,
        kind: dto.kind,
        method: dto.method ?? 'CASH',
        amount,
        note: dto.note,
        createdById: actor.sub,
        lines: {
          create: dto.lines.map((l) => ({
            menuItemId: l.menuItemId,
            name: l.name,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            total: l.quantity * l.unitPrice,
          })),
        },
      },
      include: { lines: true },
    });
    if (dto.kind === 'SALE') {
      for (const line of dto.lines) {
        if (line.menuItemId) {
          await this.adjustMenuStock(line.menuItemId, line.quantity);
        }
      }
    } else if (dto.kind === 'REFUND') {
      for (const line of dto.lines) {
        if (line.menuItemId) {
          await this.adjustMenuStock(line.menuItemId, -line.quantity);
        }
      }
    }
    await this.audit.record(actor, {
      section: 'finance',
      action: 'finance.transaction.create',
      summary: `Recorded ${dto.kind} ${amount.toFixed(2)} (${dto.method ?? 'CASH'})`,
      meta: {
        transactionId: tx.id,
        kind: dto.kind,
        amount,
        lineCount: dto.lines.length,
      },
    });
    return tx;
  }

  async salesByItem(actor: JwtAccessPayload, days = 30) {
    this.assert(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'reports');
    const since = new Date(Date.now() - days * 86400000);
    const merged = await aggregateTopItems(this.prisma, shopId, since, 50);
    await this.audit.record(actor, {
      section: 'reports',
      action: 'reports.sales_by_item',
      summary: `Generated sales-by-item report (${days} days)`,
      meta: { days, rowCount: merged.length },
    });
    return merged;
  }

  async getFinanceAnalytics(actor: JwtAccessPayload, days = 30) {
    this.assert(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'reports');
    return buildFinanceAnalytics(this.prisma, shopId, days);
  }

  async getTopSellers(actor: JwtAccessPayload, days = 30, limit = 10) {
    this.assert(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'reports');
    const since = new Date(Date.now() - days * 86400000);
    return aggregateTopItems(this.prisma, shopId, since, limit);
  }

  private shopOrderInclude() {
    return { lines: { orderBy: { createdAt: 'asc' as const } } };
  }

  private async loadShopOrder(shopId: string, id: string) {
    const o = await this.prisma.shopOrder.findFirst({
      where: { id, shopId },
      include: this.shopOrderInclude(),
    });
    if (!o) throw new NotFoundException();
    return o;
  }

  private async recalcShopOrderTotal(orderId: string) {
    const [lines, order] = await Promise.all([
      this.prisma.shopOrderLine.findMany({
        where: { shopOrderId: orderId, lineStatus: 'ACTIVE' },
      }),
      this.prisma.shopOrder.findUnique({
        where: { id: orderId },
        select: { tableReserved: true, reservationFee: true },
      }),
    ]);
    const linesTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const reservation =
      order?.tableReserved && order.reservationFee != null
        ? Math.max(0, order.reservationFee)
        : 0;
    const total = linesTotal + reservation;
    return this.prisma.shopOrder.update({
      where: { id: orderId },
      data: { total },
      include: this.shopOrderInclude(),
    });
  }

  async listShopOrders(
    actor: JwtAccessPayload,
    opts: {
      status?: ShopOrderStatus | 'ALL';
      archived?: 'exclude' | 'only' | 'all';
      from?: string;
      to?: string;
      q?: string;
      take?: number;
    } = {},
  ) {
    this.assert(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const take = opts.take ?? 80;
    const archived = opts.archived ?? 'exclude';

    const where: Prisma.ShopOrderWhereInput = { shopId };

    if (opts.status && opts.status !== 'ALL') {
      where.status = opts.status;
    }
    if (archived === 'exclude') {
      where.archivedAt = null;
    } else if (archived === 'only') {
      where.archivedAt = { not: null };
    }
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) where.createdAt.gte = new Date(opts.from);
      if (opts.to) {
        const end = new Date(opts.to);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    if (opts.q?.trim()) {
      where.OR = [
        { label: { contains: opts.q.trim(), mode: 'insensitive' } },
        { note: { contains: opts.q.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.shopOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: this.shopOrderInclude(),
    });
  }

  async archiveShopOrders(actor: JwtAccessPayload, dto: BulkOrderIdsDto) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const orders = await this.prisma.shopOrder.findMany({
      where: { shopId, id: { in: dto.ids } },
      include: this.shopOrderInclude(),
    });
    const result = await this.prisma.shopOrder.updateMany({
      where: { shopId, id: { in: dto.ids } },
      data: { archivedAt: new Date() },
    });
    for (const order of orders) {
      await this.auditShopOrder(
        actor,
        'finance.shop_order.archive',
        order,
        auditSummaryUpdate(order, 'Archived'),
      );
    }
    return { updated: result.count };
  }

  async unarchiveShopOrders(actor: JwtAccessPayload, dto: BulkOrderIdsDto) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const orders = await this.prisma.shopOrder.findMany({
      where: { shopId, id: { in: dto.ids } },
      include: this.shopOrderInclude(),
    });
    const result = await this.prisma.shopOrder.updateMany({
      where: { shopId, id: { in: dto.ids } },
      data: { archivedAt: null },
    });
    for (const order of orders) {
      await this.auditShopOrder(
        actor,
        'finance.shop_order.unarchive',
        order,
        auditSummaryUpdate(order, 'Restored from archive'),
      );
    }
    return { updated: result.count };
  }

  async getShopOrder(actor: JwtAccessPayload, id: string) {
    this.assert(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    return this.loadShopOrder(shopId, id);
  }

  async createShopOrder(actor: JwtAccessPayload, dto: CreateShopOrderDto) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const order = await this.prisma.shopOrder.create({
      data: {
        shopId,
        label: dto.label?.trim() || null,
        note: dto.note?.trim() || null,
        paymentMethod: dto.paymentMethod ?? 'CASH',
        guestCount: dto.guestCount ?? 1,
        tableReserved: dto.tableReserved ?? false,
        reservationFee:
          dto.tableReserved && dto.reservationFee != null
            ? Math.max(0, dto.reservationFee)
            : null,
        createdById: actor.sub,
      },
      include: this.shopOrderInclude(),
    });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'finance.shop_order.create',
      summary: auditSummaryCreate(order),
      meta: shopOrderAuditMeta(order),
    });
    await this.notifyShopOrderCreated(shopId, order);
    return order;
  }

  private async auditShopOrder(
    actor: JwtAccessPayload,
    action: string,
    order: ShopOrderForAudit,
    summary: string,
    extra?: Record<string, unknown>,
  ) {
    await this.audit.record(actor, {
      section: 'finance',
      action,
      summary,
      meta: shopOrderAuditMeta(order, extra),
    });
  }

  async updateShopOrder(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateShopOrderDto,
  ) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const order = await this.loadShopOrder(shopId, id);

    if (order.status === 'CANCELED') {
      if (
        dto.status ||
        dto.label !== undefined ||
        dto.note !== undefined ||
        dto.paymentMethod !== undefined
      ) {
        throw new BadRequestException(
          'This order was canceled and cannot be edited.',
        );
      }
      return order;
    }

    if (dto.status && dto.status !== order.status) {
      if (dto.status === 'PENDING') {
        await this.prisma.shopOrder.update({
          where: { id },
          data: {
            status: 'PENDING',
            completedAt: null,
            canceledAt: null,
          },
        });
        return this.recalcShopOrderTotal(id);
      }
      if (dto.status === 'COMPLETED') {
        if (order.status !== 'PENDING') {
          throw new BadRequestException(
            'Only pending orders can be completed.',
          );
        }
        const active = order.lines.filter(
          (l) => l.lineStatus === 'ACTIVE' && l.quantity > 0,
        );
        if (active.length === 0) {
          throw new BadRequestException(
            'Add at least one active line item before handing off this order.',
          );
        }
        await this.prisma.shopOrder.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            canceledAt: null,
          },
        });
        const completed = await this.recalcShopOrderTotal(id);
        await this.auditShopOrder(
          actor,
          'finance.shop_order.complete',
          completed,
          auditSummaryUpdate(completed, 'Handed to customer'),
        );
        await this.notifyShopOrderCompleted(shopId, completed);
        return completed;
      }
      if (dto.status === 'CANCELED') {
        for (const line of order.lines) {
          if (line.menuItemId && line.lineStatus === 'ACTIVE') {
            await this.adjustMenuStock(line.menuItemId, -line.quantity);
          }
        }
        await this.prisma.shopOrderLine.updateMany({
          where: { shopOrderId: id },
          data: { lineStatus: 'CANCELED' },
        });
        await this.prisma.shopOrder.update({
          where: { id },
          data: {
            status: 'CANCELED',
            canceledAt: new Date(),
            completedAt: null,
            total: 0,
          },
        });
        const canceled = await this.loadShopOrder(shopId, id);
        await this.auditShopOrder(
          actor,
          'finance.shop_order.cancel',
          canceled,
          auditSummaryUpdate(canceled, 'Order canceled'),
        );
        return canceled;
      }
    }

    const hasMeta =
      dto.label !== undefined ||
      dto.note !== undefined ||
      dto.paymentMethod !== undefined ||
      dto.guestCount !== undefined ||
      dto.tableReserved !== undefined ||
      dto.reservationFee !== undefined;
    if (hasMeta) {
      const nextTableReserved =
        dto.tableReserved !== undefined
          ? dto.tableReserved
          : order.tableReserved;
      const metaData: Prisma.ShopOrderUpdateInput = {
        label:
          dto.label === undefined ? undefined : (dto.label?.trim() ?? null),
        note: dto.note === undefined ? undefined : (dto.note?.trim() ?? null),
        paymentMethod: dto.paymentMethod,
        guestCount: dto.guestCount,
      };
      if (dto.tableReserved !== undefined) {
        metaData.tableReserved = dto.tableReserved;
        if (!dto.tableReserved) metaData.reservationFee = null;
      }
      if (
        dto.reservationFee !== undefined &&
        (dto.tableReserved ?? order.tableReserved)
      ) {
        metaData.reservationFee =
          dto.reservationFee == null ? null : Math.max(0, dto.reservationFee);
      }
      await this.prisma.shopOrder.update({
        where: { id },
        data: metaData,
        include: this.shopOrderInclude(),
      });
      const updated = await this.recalcShopOrderTotal(id);
      await this.auditShopOrder(
        actor,
        'finance.shop_order.update',
        updated,
        auditSummaryUpdate(updated, 'Updated order details'),
      );
      return updated;
    }
    return this.loadShopOrder(shopId, id);
  }

  async addShopOrderLine(
    actor: JwtAccessPayload,
    orderId: string,
    dto: AddShopOrderLineDto,
  ) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const order = await this.loadShopOrder(shopId, orderId);
    if (order.status === 'CANCELED') {
      throw new BadRequestException('Cannot add lines to a canceled order.');
    }

    const item = await this.ensureMenuItemStock(shopId, dto.menuItemId);
    const qty = dto.quantity ?? 1;
    if (!canFulfillQty(item, qty)) {
      throw new BadRequestException(
        `${item.name} is out of stock (${item.stock} left).`,
      );
    }
    await this.prisma.shopOrderLine.create({
      data: {
        shopOrderId: orderId,
        menuItemId: item.id,
        name: item.name,
        quantity: qty,
        unitPrice: item.price,
        lineStatus: 'ACTIVE',
      },
    });
    await this.adjustMenuStock(item.id, qty);
    const updated = await this.recalcShopOrderTotal(orderId);
    await this.auditShopOrder(
      actor,
      'finance.shop_order.line.add',
      updated,
      auditSummaryAddLine(updated, { name: item.name, quantity: qty }),
      { menuItemId: item.id },
    );
    return updated;
  }

  async patchShopOrderLine(
    actor: JwtAccessPayload,
    orderId: string,
    lineId: string,
    dto: PatchShopOrderLineDto,
  ) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const order = await this.loadShopOrder(shopId, orderId);
    if (order.status === 'CANCELED') {
      throw new BadRequestException('Cannot edit a canceled order.');
    }

    const line = order.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException();

    if (dto.lineStatus === 'CANCELED' && line.lineStatus === 'ACTIVE') {
      if (line.menuItemId) {
        await this.adjustMenuStock(line.menuItemId, -line.quantity);
      }
    }
    if (dto.lineStatus === 'ACTIVE' && line.lineStatus === 'CANCELED') {
      if (line.menuItemId) {
        const item = await this.ensureMenuItemStock(shopId, line.menuItemId);
        if (!canFulfillQty(item, line.quantity)) {
          throw new BadRequestException(`${item.name} is out of stock.`);
        }
        await this.adjustMenuStock(line.menuItemId, line.quantity);
      }
    }

    if (
      dto.quantity !== undefined &&
      line.menuItemId &&
      line.lineStatus === 'ACTIVE' &&
      dto.lineStatus !== 'CANCELED'
    ) {
      const delta = dto.quantity - line.quantity;
      if (delta > 0) {
        const item = await this.ensureMenuItemStock(shopId, line.menuItemId);
        if (!canFulfillQty(item, delta)) {
          throw new BadRequestException(
            `${item.name} is out of stock (${item.stock} left).`,
          );
        }
        await this.adjustMenuStock(line.menuItemId, delta);
      } else if (delta < 0) {
        await this.adjustMenuStock(line.menuItemId, delta);
      }
    }

    await this.prisma.shopOrderLine.update({
      where: { id: lineId },
      data: {
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.unitPrice !== undefined ? { unitPrice: dto.unitPrice } : {}),
        ...(dto.lineStatus !== undefined ? { lineStatus: dto.lineStatus } : {}),
      },
    });

    const updated = await this.recalcShopOrderTotal(orderId);
    const patchedLine = updated.lines.find((l) => l.id === lineId);
    await this.auditShopOrder(
      actor,
      'finance.shop_order.line.patch',
      updated,
      auditSummaryPatchLine(
        updated,
        {
          name: patchedLine?.name ?? line.name,
          quantity: patchedLine?.quantity ?? line.quantity,
        },
        this.describeLinePatch(line, dto),
      ),
      { lineId },
    );
    return updated;
  }

  async deleteShopOrderLine(
    actor: JwtAccessPayload,
    orderId: string,
    lineId: string,
  ) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const order = await this.loadShopOrder(shopId, orderId);
    if (order.status === 'CANCELED') {
      throw new BadRequestException('Cannot edit a canceled order.');
    }
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException();
    if (line.menuItemId && line.lineStatus === 'ACTIVE') {
      await this.adjustMenuStock(line.menuItemId, -line.quantity);
    }
    await this.prisma.shopOrderLine.delete({ where: { id: lineId } });
    const updated = await this.recalcShopOrderTotal(orderId);
    await this.auditShopOrder(
      actor,
      'finance.shop_order.line.delete',
      updated,
      auditSummaryRemoveLine(updated, {
        name: line.name,
        quantity: line.quantity,
      }),
      { lineId },
    );
    return updated;
  }

  async deleteShopOrder(actor: JwtAccessPayload, id: string) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const order = await this.loadShopOrder(shopId, id);
    for (const line of order.lines) {
      if (line.menuItemId && line.lineStatus === 'ACTIVE') {
        await this.adjustMenuStock(line.menuItemId, -line.quantity);
      }
    }
    await this.prisma.shopOrder.delete({ where: { id } });
    await this.auditShopOrder(
      actor,
      'finance.shop_order.delete',
      order,
      auditSummaryDelete(order),
    );
    return { ok: true };
  }

  async listLosses(actor: JwtAccessPayload, take = 50) {
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    return this.prisma.shopLoss.findMany({
      where: { shopId },
      orderBy: { occurredAt: 'desc' },
      take,
    });
  }

  async createLoss(actor: JwtAccessPayload, dto: CreateLossDto) {
    this.assert(actor, 'transaction.write');
    const shopId = actor.shopId!;
    await this.requireFeature(shopId, 'transaction');
    const loss = await this.prisma.shopLoss.create({
      data: {
        shopId: actor.shopId!,
        amount: dto.amount,
        reason: dto.reason,
        category: dto.category,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        createdById: actor.sub,
      },
    });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'finance.loss.create',
      summary: `Recorded loss ${dto.amount} — ${dto.category}`,
      meta: { lossId: loss.id, amount: dto.amount, reason: dto.reason },
    });
    if (dto.amount >= LARGE_LOSS_NOTIFY_THRESHOLD) {
      await this.notifications.recordFinanceEvent(shopId, {
        title: 'Large loss recorded',
        body: `${dto.amount.toFixed(2)} — ${dto.category ?? 'uncategorized'}: ${dto.reason}`,
        href: '/finance',
        dedupeKey: `loss_large_${loss.id}`,
      });
    }
    return loss;
  }

  async deleteLoss(actor: JwtAccessPayload, id: string) {
    this.assert(actor, 'transaction.write');
    const shopId = actor.shopId!;
    await this.requireFeature(shopId, 'transaction');
    const row = await this.prisma.shopLoss.findFirst({
      where: { id, shopId: actor.shopId! },
    });
    if (!row) throw new NotFoundException();
    await this.prisma.shopLoss.delete({ where: { id } });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'finance.loss.delete',
      summary: `Deleted loss record ${row.amount} (${row.category})`,
      meta: { lossId: id },
    });
    return { ok: true };
  }

  private mapPlayBillingRow(
    row: {
      id: string;
      guestName: string;
      partySize: number;
      startsAt: Date;
      endsAt: Date;
      status: string;
      billedAmount: number | null;
      billedAt: Date | null;
      billingDiscountPercent: number;
      billingBaseAmount?: number | null;
      notes: string | null;
      resource: {
        id: string;
        name: string;
        type: string;
        hourlyRate: number;
        category: {
          id: string;
          name: string;
          slotMinutes: number;
          bookingMode: BookingMode;
          offeringConfig: unknown;
          rates: {
            label: string;
            durationMinutes: number | null;
            price: number;
          }[];
        } | null;
      } | null;
    },
    now: Date,
  ) {
    if (!row.resource) return null;
    const bucket = classifyPlayBillingRow(
      row.status,
      row.billedAt,
      row.startsAt,
      row.endsAt,
      now,
    );
    const inProgress = bucket === 'in_progress';
    const billingOpts = {
      bookingMode: row.resource.category?.bookingMode ?? 'TIME',
      notes: row.notes,
      offeringConfig: row.resource.category?.offeringConfig,
      categoryRates: row.resource.category?.rates ?? [],
      slotMinutes: row.resource.category?.slotMinutes ?? 60,
    };
    const party = effectiveBillingPartySize(
      row.resource.type as ResourceType,
      row.partySize,
      billingOpts,
    );
    const durationMinutes = Math.max(
      1,
      Math.ceil(
        ((inProgress
          ? Math.min(now.getTime(), row.endsAt.getTime())
          : row.endsAt.getTime()) -
          row.startsAt.getTime()) /
          60_000,
      ),
    );
    const isBowling = row.resource.type === 'BOWLING';
    const bowlingMode =
      isBowling && row.resource.category
        ? resolveBowlingMode(
            listBowlingModes(
              row.resource.category.offeringConfig as
                | Record<string, unknown>
                | null
                | undefined,
              row.resource.category.bookingMode,
              (row.resource.category.rates ?? []).map((r) => ({
                label: r.label,
                durationMinutes: r.durationMinutes,
                price: r.price,
              })),
              row.resource.category.slotMinutes ?? 60,
            ),
            row.notes,
          )
        : null;
    const computed = bowlingMode
      ? computeBowlingBillingAmount(
          bowlingMode,
          row.notes,
          durationMinutes,
          party,
        )
      : computePlayBillingAmount({
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          partySize: party,
          hourlyRate: row.resource.hourlyRate,
          slotMinutes: row.resource.category?.slotMinutes ?? 60,
          categoryRates: (row.resource.category?.rates ?? []).map((r) => ({
            label: r.label,
            durationMinutes: r.durationMinutes,
            price: r.price,
          })),
          useElapsed: inProgress,
          now,
        });
    const discountPercent = row.billingDiscountPercent ?? 0;
    const rateAmount = computed.amount;
    const baseAmount = row.billingBaseAmount ?? rateAmount;
    const amountDue =
      row.billedAt != null
        ? (row.billedAmount ?? applyBillingDiscount(baseAmount, discountPercent))
        : applyBillingDiscount(baseAmount, discountPercent);
    return {
      id: row.id,
      source: 'booking' as const,
      guestName: row.guestName,
      partySize: row.partySize,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: row.status,
      billedAmount: row.billedAmount,
      billedAt: row.billedAt?.toISOString() ?? null,
      discountPercent,
      notes: row.notes,
      bucket,
      isPaid: row.billedAt != null,
      resource: {
        id: row.resource.id,
        name: row.resource.name,
        type: row.resource.type,
        categoryName: row.resource.category?.name ?? null,
      },
      durationMinutes: computed.durationMinutes,
      computedAmount: rateAmount,
      baseAmount,
      amountDue,
      rateLabel: computed.rateLabel,
      breakdown: computed.breakdown,
      collectsPartySize: bookingCollectsPartySize(
        row.resource.type as ResourceType,
        billingOpts,
      ),
    };
  }

  private mapWalkInBillingRow(
    row: {
      id: string;
      label: string | null;
      playerCount: number;
      startedAt: Date;
      endedAt: Date | null;
      durationMinutes: number | null;
      amount: number;
      billingDiscountPercent: number;
      status: string;
      completedAt: Date | null;
      note: string | null;
      resource: {
        id: string;
        name: string;
        type: string;
        hourlyRate: number;
        category: {
          name: string;
          bookingMode: BookingMode;
          slotMinutes: number;
          offeringConfig: unknown;
          rates?: {
            label: string;
            durationMinutes: number | null;
            price: number;
          }[];
        } | null;
      } | null;
    },
    now: Date,
  ) {
    const bucket = classifyWalkInBillingRow(
      row.status,
      row.completedAt,
      row.startedAt,
      row.endedAt,
      row.durationMinutes,
      now,
    );
    const effectiveEnd =
      row.endedAt ??
      (row.durationMinutes != null && row.durationMinutes > 0
        ? new Date(row.startedAt.getTime() + row.durationMinutes * 60_000)
        : row.startedAt);
    const durationMinutes = Math.max(
      1,
      Math.ceil(
        (effectiveEnd.getTime() - row.startedAt.getTime()) / 60_000,
      ),
    );
    const discountPercent = row.billingDiscountPercent ?? 0;
    const isPaid = row.status === 'COMPLETED' || row.completedAt != null;
    const billingOpts = {
      bookingMode: row.resource?.category?.bookingMode ?? 'TIME',
      notes: row.note,
      offeringConfig: row.resource?.category?.offeringConfig,
      categoryRates: row.resource?.category?.rates ?? [],
      slotMinutes: row.resource?.category?.slotMinutes ?? 60,
    };
    const collectsParty = row.resource
      ? bookingCollectsPartySize(
          row.resource.type as ResourceType,
          billingOpts,
        )
      : false;
    const party = row.resource
      ? effectiveBillingPartySize(
          row.resource.type as ResourceType,
          row.playerCount,
          billingOpts,
        )
      : row.playerCount;
    const baseAmount = row.amount;
    const amountDue = isPaid
      ? row.amount
      : applyBillingDiscount(baseAmount, discountPercent);
    const bowlingMode =
      row.resource?.type === 'BOWLING' && row.resource.category
        ? resolveBowlingMode(
            listBowlingModes(
              row.resource.category.offeringConfig as
                | Record<string, unknown>
                | null
                | undefined,
              row.resource.category.bookingMode,
              (row.resource.category.rates ?? []).map((r) => ({
                label: r.label,
                durationMinutes: r.durationMinutes,
                price: r.price,
              })),
              row.resource.category.slotMinutes ?? 60,
            ),
            row.note,
          )
        : null;
    const breakdown = bowlingMode
      ? `${durationMinutes} min · ${bowlingMode.name}${
          collectsParty
            ? ` · ${party} guest${party > 1 ? 's' : ''}`
            : bowlingMode.chargeType === 'GAME'
              ? ` · ${parseGamesFromNotes(row.note) ?? bowlingMode.defaultGames} game(s)`
              : ''
        }`
      : collectsParty
        ? `${durationMinutes} min · bowling · per person · ${party} guest${party > 1 ? 's' : ''}`
        : parseBowlingChargeFromNotes(row.note) === 'GAME'
          ? `${durationMinutes} min · bowling · by game`
          : `${durationMinutes} min · bowling · lane rental`;
    return {
      id: row.id,
      source: 'walk_in' as const,
      guestName: row.label?.trim() || 'Walk-in guest',
      partySize: row.playerCount,
      startsAt: row.startedAt.toISOString(),
      endsAt: effectiveEnd.toISOString(),
      status: row.status,
      billedAmount: isPaid ? row.amount : null,
      billedAt: row.completedAt?.toISOString() ?? null,
      discountPercent,
      notes: row.note,
      bucket,
      isPaid,
      resource: row.resource
        ? {
            id: row.resource.id,
            name: row.resource.name,
            type: row.resource.type,
            categoryName: row.resource.category?.name ?? null,
          }
        : null,
      durationMinutes,
      computedAmount: baseAmount,
      baseAmount,
      amountDue,
      rateLabel: 'Walk-in',
      breakdown,
      collectsPartySize: collectsParty,
    };
  }

  async listPlayBilling(
    actor: JwtAccessPayload,
    opts: {
      tab?: PlayBillingTabDto;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    this.assert(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const now = new Date();
    const pageSize = Math.min(Math.max(opts.pageSize ?? 10, 1), 100);
    const page = Math.max(opts.page ?? 1, 1);

    const where: Prisma.ReservationWhereInput = {
      shopId,
      resourceId: { not: null },
      status: { notIn: ['CANCELED', 'NO_SHOW'] },
    };

    if (opts.from || opts.to) {
      where.startsAt = {};
      if (opts.from) where.startsAt.gte = new Date(opts.from);
      if (opts.to) {
        const end = new Date(opts.to);
        end.setHours(23, 59, 59, 999);
        where.startsAt.lte = end;
      }
    }

    const reservationRows = await this.prisma.reservation.findMany({
      where,
      include: {
        resource: {
          include: {
            category: {
              include: { rates: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
      orderBy: { startsAt: 'desc' },
    });

    const walkInWhere: Prisma.PlaySessionWhereInput = {
      shopId,
      reservationId: null,
      status: { not: 'CANCELED' },
      archivedAt: null,
    };
    if (opts.from || opts.to) {
      walkInWhere.startedAt = {};
      if (opts.from) walkInWhere.startedAt.gte = new Date(opts.from);
      if (opts.to) {
        const end = new Date(opts.to);
        end.setHours(23, 59, 59, 999);
        walkInWhere.startedAt.lte = end;
      }
    }

    const walkInRows = await this.prisma.playSession.findMany({
      where: walkInWhere,
      include: this.playSessionInclude(),
      orderBy: { startedAt: 'desc' },
    });

    const bookingItems = reservationRows
      .map((r) => this.mapPlayBillingRow(r, now))
      .filter((x): x is NonNullable<typeof x> => x != null);
    const walkInItems = walkInRows
      .map((r) => this.mapWalkInBillingRow(r, now))
      .filter((x): x is NonNullable<typeof x> => x != null);

    const items = [...bookingItems, ...walkInItems].sort(
      (a, b) =>
        new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );

    const tab = opts.tab ?? 'all';
    const filtered =
      tab === 'all'
        ? items.filter((i) => i.bucket != null)
        : items.filter((i) => i.bucket === tab);

    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pageCount);
    const start = (safePage - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    const byDay: Record<
      string,
      {
        day: string;
        items: typeof pageItems;
        totalDue: number;
        totalPaid: number;
      }
    > = {};
    for (const item of pageItems) {
      const day = item.startsAt.slice(0, 10);
      if (!byDay[day]) {
        byDay[day] = { day, items: [], totalDue: 0, totalPaid: 0 };
      }
      byDay[day].items.push(item);
      if (item.isPaid) {
        byDay[day].totalPaid += item.amountDue;
      } else {
        byDay[day].totalDue += item.amountDue;
      }
    }

    const days = Object.values(byDay).sort((a, b) =>
      b.day.localeCompare(a.day),
    );

    return {
      items: pageItems,
      total,
      page: safePage,
      pageSize,
      pageCount,
      days,
      summary: {
        inProgress: items.filter((i) => i.bucket === 'in_progress').length,
        awaitingPayment: items.filter((i) => i.bucket === 'awaiting_payment')
          .length,
        paid: items.filter((i) => i.bucket === 'paid').length,
        unpaidTotal: filtered
          .filter((i) => !i.isPaid)
          .reduce((s, i) => s + i.amountDue, 0),
        paidTotal: filtered
          .filter((i) => i.isPaid)
          .reduce((s, i) => s + (i.billedAmount ?? i.amountDue), 0),
      },
    };
  }

  async markPlayBillingPaid(
    actor: JwtAccessPayload,
    reservationId: string,
    dto: MarkPlayBillingPaidDto,
  ) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const now = new Date();
    const row = await this.prisma.reservation.findFirst({
      where: { id: reservationId, shopId, resourceId: { not: null } },
      include: {
        resource: {
          include: {
            category: { include: { rates: { orderBy: { sortOrder: 'asc' } } } },
          },
        },
      },
    });
    if (!row?.resource) throw new NotFoundException('Booking not found.');

    const mapped = this.mapPlayBillingRow(row, now);
    if (!mapped) throw new BadRequestException('Not billable.');

    const discountPercent =
      dto.discountPercent ?? row.billingDiscountPercent ?? 0;
    const amount =
      dto.amountOverride != null
        ? dto.amountOverride
        : applyBillingDiscount(mapped.baseAmount, discountPercent);

    const sessionStillActive = row.endsAt > now;

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        billedAmount: amount,
        billedAt: now,
        billingDiscountPercent: discountPercent,
        billingPaymentMethod: dto.paymentMethod ?? 'CASH',
        ...(sessionStillActive ? {} : { status: 'COMPLETED' }),
      },
      include: {
        resource: {
          include: {
            category: { include: { rates: { orderBy: { sortOrder: 'asc' } } } },
          },
        },
      },
    });

    await this.audit.record(actor, {
      section: 'finance',
      action: 'play_billing.paid',
      summary: `Marked paid ${amount} for ${updated.guestName} (${updated.resource?.name})`,
      meta: {
        reservationId,
        amount,
        paymentMethod: dto.paymentMethod ?? 'CASH',
      },
    });

    await this.notifications.recordFinanceEvent(shopId, {
      title: 'Play billing paid',
      body: `${updated.guestName} — ${amount.toFixed(2)} via ${dto.paymentMethod ?? 'CASH'}`,
      href: '/play-billing',
    });

    return this.mapPlayBillingRow(updated, now);
  }

  private playBillingInclude() {
    return {
      resource: {
        include: {
          category: { include: { rates: { orderBy: { sortOrder: 'asc' } } } },
        },
      },
    } as const;
  }

  private async loadPlayBillingReservation(
    shopId: string,
    reservationId: string,
  ) {
    const row = await this.prisma.reservation.findFirst({
      where: { id: reservationId, shopId, resourceId: { not: null } },
      include: this.playBillingInclude(),
    });
    if (!row?.resource) throw new NotFoundException('Booking not found.');
    if (
      row.status === ReservationStatus.CANCELED ||
      row.status === ReservationStatus.NO_SHOW
    ) {
      throw new BadRequestException('This booking is already canceled.');
    }
    return row;
  }

  private async assertPlayBillingNoOverlap(
    shopId: string,
    resourceId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId: string,
  ) {
    const clash = await this.prisma.reservation.findFirst({
      where: {
        shopId,
        resourceId,
        id: { not: excludeId },
        status: { in: ACTIVE_RESERVATION },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (clash) {
      throw new ConflictException(
        'This unit already has a booking that overlaps that time. Pick a different slot or unit.',
      );
    }
  }

  async updatePlayBilling(
    actor: JwtAccessPayload,
    reservationId: string,
    dto: UpdatePlayBillingDto,
  ) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const now = new Date();
    const existing = await this.loadPlayBillingReservation(
      shopId,
      reservationId,
    );

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    const resourceId =
      dto.resourceId !== undefined ? dto.resourceId : existing.resourceId;

    if (!resourceId) {
      throw new BadRequestException('Game unit is required.');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'End time must be after start time (same day).',
      );
    }
    const maxSpanMs = 24 * 60 * 60 * 1000;
    if (endsAt.getTime() - startsAt.getTime() > maxSpanMs) {
      throw new BadRequestException(
        'A single booking cannot span more than 24 hours.',
      );
    }

    const resource = await this.prisma.resource.findFirst({
      where: { id: resourceId, shopId },
    });
    if (!resource) throw new NotFoundException('Resource not found.');

    await this.assertPlayBillingNoOverlap(
      shopId,
      resourceId,
      startsAt,
      endsAt,
      reservationId,
    );

    if (!this.mapPlayBillingRow(existing, now)) {
      throw new BadRequestException('Not billable.');
    }

    const partySize = dto.partySize ?? existing.partySize;
    const remapped = this.mapPlayBillingRow(
      {
        ...existing,
        startsAt,
        endsAt,
        partySize,
        resource: existing.resource,
      },
      now,
    );

    const data: Prisma.ReservationUpdateInput = {
      ...(dto.resourceId !== undefined && { resourceId: dto.resourceId }),
      ...(dto.guestName != null && { guestName: dto.guestName }),
      ...(dto.partySize != null && { partySize: dto.partySize }),
      ...(dto.startsAt != null && { startsAt }),
      ...(dto.endsAt != null && { endsAt }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    };

    if (dto.clearPaid) {
      data.billedAt = null;
      data.billedAmount = null;
    }

    if (dto.discountPercent != null) {
      data.billingDiscountPercent = dto.discountPercent;
    }

    const baseInput =
      dto.baseAmount !== undefined
        ? dto.baseAmount
        : dto.amountOverride !== undefined
          ? dto.amountOverride
          : undefined;
    if (baseInput !== undefined) {
      Object.assign(data, { billingBaseAmount: baseInput });
    }

    if (!dto.clearPaid && existing.billedAt && remapped) {
      data.billedAmount = applyBillingDiscount(
        remapped.baseAmount,
        dto.discountPercent ?? existing.billingDiscountPercent ?? 0,
      );
    }

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data,
      include: this.playBillingInclude(),
    });

    await this.audit.record(actor, {
      section: 'finance',
      action: 'play_billing.update',
      summary: `Updated play billing for ${updated.guestName} (${updated.resource?.name})`,
      meta: {
        reservationId,
        guestName: updated.guestName,
        resourceId: updated.resourceId,
        startsAt: updated.startsAt.toISOString(),
        endsAt: updated.endsAt.toISOString(),
        clearPaid: dto.clearPaid ?? false,
      },
    });

    return this.mapPlayBillingRow(updated, now);
  }

  async cancelPlayBilling(
    actor: JwtAccessPayload,
    reservationId: string,
    dto: CancelPlayBillingDto,
  ) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const existing = await this.loadPlayBillingReservation(
      shopId,
      reservationId,
    );
    const reason =
      dto.reason === 'CANCELED'
        ? ReservationStatus.CANCELED
        : ReservationStatus.NO_SHOW;

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: reason,
        billedAt: null,
        billedAmount: null,
      },
      include: this.playBillingInclude(),
    });

    if (existing.resourceId) {
      await this.prisma.resource.update({
        where: { id: existing.resourceId },
        data: { status: ResourceStatus.AVAILABLE },
      });
    }

    const label = reason === ReservationStatus.NO_SHOW ? 'no-show' : 'canceled';
    await this.audit.record(actor, {
      section: 'finance',
      action: 'play_billing.cancel',
      summary: `Marked ${label} for ${updated.guestName} (${updated.resource?.name})`,
      meta: { reservationId, reason },
    });

    return { ok: true, reason, reservationId };
  }

  private playSessionInclude() {
    return {
      resource: {
        select: {
          id: true,
          name: true,
          type: true,
          hourlyRate: true,
          category: {
            select: {
              name: true,
              bookingMode: true,
              slotMinutes: true,
              offeringConfig: true,
              rates: {
                orderBy: { sortOrder: 'asc' as const },
                select: {
                  label: true,
                  durationMinutes: true,
                  price: true,
                },
              },
            },
          },
        },
      },
      reservation: {
        select: { id: true, guestName: true, partySize: true, startsAt: true },
      },
    } as const;
  }

  async listPlaySessions(
    actor: JwtAccessPayload,
    opts: {
      status?: PlaySessionStatus | 'ALL';
      archived?: 'exclude' | 'only';
      take?: number;
    } = {},
  ) {
    this.assert(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const where: Prisma.PlaySessionWhereInput = { shopId };
    if (opts.status && opts.status !== 'ALL') where.status = opts.status;
    if (opts.archived === 'only') where.archivedAt = { not: null };
    else where.archivedAt = null;
    return this.prisma.playSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.take ?? 80,
      include: this.playSessionInclude(),
    });
  }

  async createPlaySession(actor: JwtAccessPayload, dto: CreatePlaySessionDto) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const durationMinutes = dto.durationMinutes ?? null;
    const startedAt = new Date();

    if (dto.resourceId) {
      await assertResourceBookable(this.prisma, shopId, dto.resourceId);
      const blockEnd =
        durationMinutes != null && durationMinutes > 0
          ? new Date(startedAt.getTime() + durationMinutes * 60_000)
          : walkInEffectiveEnd({
              startedAt,
              endedAt: null,
              durationMinutes: null,
            });
      await assertNoWalkInOverlap(
        this.prisma,
        shopId,
        dto.resourceId,
        startedAt,
        blockEnd,
      );
      await assertNoReservationOverlap(
        this.prisma,
        shopId,
        dto.resourceId,
        startedAt,
        blockEnd,
      );
    }

    const session = await this.prisma.playSession.create({
      data: {
        shopId,
        resourceId: dto.resourceId ?? null,
        reservationId: dto.reservationId ?? null,
        playerCount: dto.playerCount ?? 1,
        durationMinutes,
        amount: dto.amount ?? 0,
        billingDiscountPercent: dto.discountPercent ?? 0,
        paymentMethod: dto.paymentMethod ?? 'CASH',
        label: dto.label?.trim() || null,
        note: dto.note?.trim() || null,
        startedAt,
        createdById: actor.sub,
      },
      include: this.playSessionInclude(),
    });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'finance.play_session.create',
      summary: `Started walk-in ${session.label ?? 'guest'}${session.resource ? ` on ${session.resource.name}` : ''}`,
      meta: {
        sessionId: session.id,
        resourceId: session.resourceId,
        playerCount: session.playerCount,
        amount: session.amount,
      },
    });
    return session;
  }

  async markPlaySessionPaid(
    actor: JwtAccessPayload,
    id: string,
    dto: { amountOverride?: number; discountPercent?: number },
  ) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const now = new Date();
    const row = await this.prisma.playSession.findFirst({
      where: { id, shopId, reservationId: null },
      include: { resource: { include: { category: true } } },
    });
    if (!row) throw new NotFoundException('Walk-in session not found.');
    if (row.status === 'CANCELED') {
      throw new BadRequestException('Canceled session cannot be paid.');
    }
    const mapped = this.mapWalkInBillingRow(row, now);
    if (!mapped) throw new BadRequestException('Not billable.');
    const discountPercent =
      dto.discountPercent ?? row.billingDiscountPercent ?? 0;
    const amount =
      dto.amountOverride != null
        ? dto.amountOverride
        : applyBillingDiscount(row.amount, discountPercent);

    const effectiveEnd =
      row.endedAt ??
      (row.durationMinutes != null && row.durationMinutes > 0
        ? new Date(row.startedAt.getTime() + row.durationMinutes * 60_000)
        : null);
    const stillActive =
      row.status === 'ACTIVE' && (!effectiveEnd || effectiveEnd > now);

    const updated = await this.prisma.playSession.update({
      where: { id },
      data: {
        amount,
        billingDiscountPercent: discountPercent,
        completedAt: now,
        ...(stillActive
          ? {}
          : {
              status: 'COMPLETED',
              endedAt: row.endedAt ?? now,
            }),
      },
      include: this.playSessionInclude(),
    });

    await this.audit.record(actor, {
      section: 'finance',
      action: 'play_session.paid',
      summary: `Marked walk-in paid ${amount} (${updated.label ?? 'Walk-in'})`,
      meta: { sessionId: id, amount, paymentMethod: updated.paymentMethod },
    });

    await this.notifications.recordFinanceEvent(shopId, {
      title: 'Walk-in paid',
      body: `${updated.label ?? 'Walk-in guest'} — ${amount.toFixed(2)} via ${updated.paymentMethod}`,
      href: '/play-billing',
    });

    return this.mapWalkInBillingRow(updated, now);
  }

  async cancelPlaySession(actor: JwtAccessPayload, id: string) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const row = await this.prisma.playSession.findFirst({
      where: { id, shopId },
    });
    if (!row) throw new NotFoundException();
    if (row.status === 'COMPLETED') {
      throw new BadRequestException('Paid sessions cannot be canceled.');
    }
    await this.prisma.playSession.update({
      where: { id },
      data: { status: 'CANCELED', completedAt: null },
    });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'finance.play_session.cancel',
      summary: `Canceled walk-in ${row.label ?? 'guest'}`,
      meta: { sessionId: id },
    });
    return { ok: true as const, sessionId: id };
  }

  async updatePlaySession(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdatePlaySessionDto,
  ) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const row = await this.prisma.playSession.findFirst({
      where: { id, shopId },
    });
    if (!row) throw new NotFoundException();
    if (row.status === 'CANCELED') {
      throw new BadRequestException('Canceled session cannot be edited.');
    }

    let completedAt = row.completedAt;
    let endedAt = row.endedAt;
    if (dto.endSession && row.status === 'ACTIVE') {
      endedAt = new Date();
    }
    if (dto.status === 'COMPLETED' && row.status !== 'COMPLETED') {
      completedAt = new Date();
      endedAt = endedAt ?? completedAt;
    }
    if (dto.clearPaid && row.status === 'COMPLETED') {
      return this.prisma.playSession.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          completedAt: null,
        },
        include: this.playSessionInclude(),
      });
    }
    if (dto.status === 'CANCELED') {
      completedAt = null;
    }

    const discountPercent =
      dto.discountPercent !== undefined
        ? dto.discountPercent
        : row.billingDiscountPercent;

    const updated = await this.prisma.playSession.update({
      where: { id },
      data: {
        status: dto.status,
        resourceId: dto.resourceId,
        playerCount: dto.playerCount,
        durationMinutes: dto.durationMinutes,
        amount: dto.amount,
        billingDiscountPercent: discountPercent,
        paymentMethod: dto.paymentMethod,
        label: dto.label === undefined ? undefined : dto.label?.trim() || null,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
        completedAt,
        endedAt,
      },
      include: this.playSessionInclude(),
    });

    const summaryParts: string[] = [];
    if (dto.endSession) summaryParts.push('ended session');
    if (dto.status) summaryParts.push(`status → ${dto.status}`);
    if (dto.amount !== undefined) summaryParts.push(`amount ${dto.amount}`);
    await this.audit.record(actor, {
      section: 'finance',
      action: 'finance.play_session.update',
      summary: `Updated walk-in ${updated.label ?? 'guest'}${summaryParts.length ? ` (${summaryParts.join(', ')})` : ''}`,
      meta: {
        sessionId: id,
        endSession: dto.endSession ?? false,
        status: updated.status,
      },
    });

    if (dto.endSession && updated.status === 'ACTIVE') {
      await this.notifications.recordFinanceEvent(shopId, {
        title: 'Walk-in awaiting payment',
        body: `${updated.label ?? 'Walk-in guest'} finished — collect payment in Game billing.`,
        href: '/play-billing?tab=awaiting_payment',
        dedupeKey: `walkin_awaiting_${id}`,
      });
    }

    return updated;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { loadShopCurrency } from '../../common/currency-stamp.util';
import { postShopOrderCompleted } from '../../common/ledger-post.util';
import {
  adjustMenuItemStockByOrThrow,
  fetchMenuItemStockRow,
  resetMenuItemStockForDay,
} from '../../common/menu-stock-db.util';
import { assertMenuStockQty, venueDayKey } from '../../common/menu-stock.util';
import {
  addMoney,
  lineTotal,
  serializeMoney,
  serializeMoneyOrNull,
  toMoneyNumber,
  type MoneyInput,
} from '../../common/money.util';
import { claimActiveLinesAndRestoreStock } from '../../common/shop-order-stock.util';
import { loadShopVenueTimeContext } from '../../common/shop-venue-time.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { BulkOrderIdsDto } from './dto/bulk-orders.dto';
import {
  AddShopOrderLineDto,
  CreateShopOrderDto,
  PatchShopOrderLineDto,
  UpdateShopOrderDto,
} from './dto/orders.dto';
import {
  assertFinancePerm,
  requireFinanceFeature,
} from './finance-guard.util';
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
import type { Prisma, ShopOrderStatus } from '@prisma/client';

@Injectable()
export class ShopOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Prisma Decimal → decimal string for API JSON (canonical money wire). */
  private serializeShopOrder<
    T extends {
      total: MoneyInput;
      reservationFee: MoneyInput;
      lines: Array<{ unitPrice: MoneyInput } & Record<string, unknown>>;
    },
  >(order: T) {
    return {
      ...order,
      total: serializeMoney(order.total),
      reservationFee: serializeMoneyOrNull(order.reservationFee),
      lines: order.lines.map((l) => ({
        ...l,
        unitPrice: serializeMoney(l.unitPrice),
      })),
    };
  }

  private async ensureMenuItemStock(shopId: string, menuItemId: string) {
    const { resolvedTimeZone } = await loadShopVenueTimeContext(
      this.prisma,
      shopId,
    );
    const today = venueDayKey(resolvedTimeZone);
    await resetMenuItemStockForDay(this.prisma, menuItemId, today, shopId);
    const item = await fetchMenuItemStockRow(this.prisma, shopId, menuItemId);
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }

  private describeLinePatch(
    line: {
      quantity: number;
      unitPrice: MoneyInput;
      lineStatus: string;
    },
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
    if (
      dto.unitPrice !== undefined &&
      dto.unitPrice !== toMoneyNumber(line.unitPrice)
    ) {
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
      body: `${orderTicketLabel(order)} · ${toMoneyNumber(order.total).toFixed(2)}`,
      href: '/orders',
      dedupeKey: `shop-order-complete:${order.id}`,
    });
  }

  private async adjustMenuStock(
    menuItemId: string,
    delta: number,
    shopId?: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    if (delta === 0) return;
    await adjustMenuItemStockByOrThrow(db, menuItemId, delta, shopId);
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

  private async recalcShopOrderTotal(
    orderId: string,
    shopId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const [lines, order] = await Promise.all([
      db.shopOrderLine.findMany({
        where: { shopOrderId: orderId, lineStatus: 'ACTIVE' },
      }),
      db.shopOrder.findFirst({
        where: { id: orderId, shopId },
        select: { tableReserved: true, reservationFee: true },
      }),
    ]);
    const linesTotal = lines.reduce(
      (s, l) =>
        addMoney(s, lineTotal(l.quantity, toMoneyNumber(l.unitPrice))),
      0,
    );
    const reservation =
      order?.tableReserved && order.reservationFee != null
        ? Math.max(0, toMoneyNumber(order.reservationFee))
        : 0;
    const total = addMoney(linesTotal, reservation);
    return db.shopOrder.update({
      where: { id: orderId, shopId },
      data: { total },
      include: this.shopOrderInclude(),
    });
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
    assertFinancePerm(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
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

    const orders = await this.prisma.shopOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: this.shopOrderInclude(),
    });
    return orders.map((o) => this.serializeShopOrder(o));
  }

  async archiveShopOrders(actor: JwtAccessPayload, dto: BulkOrderIdsDto) {
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
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
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
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
    assertFinancePerm(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    return this.serializeShopOrder(await this.loadShopOrder(shopId, id));
  }

  async createShopOrder(actor: JwtAccessPayload, dto: CreateShopOrderDto) {
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    const currency = await loadShopCurrency(this.prisma, shopId);
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
        currency,
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
    return this.serializeShopOrder(order);
  }

  async updateShopOrder(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateShopOrderDto,
  ) {
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
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
      return this.serializeShopOrder(order);
    }

    if (dto.status && dto.status !== order.status) {
      if (dto.status === 'PENDING') {
        await this.prisma.shopOrder.update({
          where: { id, shopId },
          data: {
            status: 'PENDING',
            completedAt: null,
            canceledAt: null,
          },
        });
        return this.serializeShopOrder(
          await this.recalcShopOrderTotal(id, shopId),
        );
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
          where: { id, shopId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            canceledAt: null,
          },
        });
        const completed = await this.recalcShopOrderTotal(id, shopId);
        const orderCurrency = await loadShopCurrency(this.prisma, shopId);
        await postShopOrderCompleted(this.prisma, {
          shopId,
          orderId: completed.id,
          total: completed.total,
          currency: completed.currency ?? orderCurrency,
          completedAt: completed.completedAt ?? new Date(),
          createdById: actor.sub,
        });
        await this.auditShopOrder(
          actor,
          'finance.shop_order.complete',
          completed,
          auditSummaryUpdate(completed, 'Handed to customer'),
        );
        await this.notifyShopOrderCompleted(shopId, completed);
        return this.serializeShopOrder(completed);
      }
      if (dto.status === 'CANCELED') {
        // Order claim + per-line ACTIVE→CANCELED claims, then restore (no double restore).
        const canceled = await this.prisma.$transaction(async (db) => {
          const claimedOrder = await db.shopOrder.updateMany({
            where: { id, shopId, status: { not: 'CANCELED' } },
            data: {
              status: 'CANCELED',
              canceledAt: new Date(),
              completedAt: null,
              total: 0,
            },
          });
          if (claimedOrder.count !== 1) {
            throw new BadRequestException(
              'This order was canceled and cannot be edited.',
            );
          }

          const fresh = await db.shopOrder.findFirstOrThrow({
            where: { id, shopId },
            include: this.shopOrderInclude(),
          });

          // Per-line ACTIVE claim before restore (shared with deleteShopOrder).
          await claimActiveLinesAndRestoreStock(
            db,
            shopId,
            id,
            fresh.lines,
          );

          return db.shopOrder.findFirstOrThrow({
            where: { id, shopId },
            include: this.shopOrderInclude(),
          });
        });
        await this.auditShopOrder(
          actor,
          'finance.shop_order.cancel',
          canceled,
          auditSummaryUpdate(canceled, 'Order canceled'),
        );
        return this.serializeShopOrder(canceled);
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
        where: { id, shopId },
        data: metaData,
        include: this.shopOrderInclude(),
      });
      const updated = await this.recalcShopOrderTotal(id, shopId);
      await this.auditShopOrder(
        actor,
        'finance.shop_order.update',
        updated,
        auditSummaryUpdate(updated, 'Updated order details'),
      );
      return this.serializeShopOrder(updated);
    }
    return this.serializeShopOrder(await this.loadShopOrder(shopId, id));
  }

  async addShopOrderLine(
    actor: JwtAccessPayload,
    orderId: string,
    dto: AddShopOrderLineDto,
  ) {
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    const order = await this.loadShopOrder(shopId, orderId);
    if (order.status === 'CANCELED') {
      throw new BadRequestException('Cannot add lines to a canceled order.');
    }

    const item = await this.ensureMenuItemStock(shopId, dto.menuItemId);
    const qty = dto.quantity ?? 1;
    assertMenuStockQty(
      item,
      qty,
      `${item.name} is out of stock (${item.stock} left).`,
    );
    const { resolvedTimeZone } = await loadShopVenueTimeContext(
      this.prisma,
      shopId,
    );
    const today = venueDayKey(resolvedTimeZone);
    const updated = await this.prisma.$transaction(async (db) => {
      // Re-apply day reset inside the txn so adjust sees the same baseline.
      await resetMenuItemStockForDay(db, item.id, today, shopId);
      await adjustMenuItemStockByOrThrow(
        db,
        item.id,
        qty,
        shopId,
        `${item.name} is out of stock (${item.stock} left).`,
      );
      await db.shopOrderLine.create({
        data: {
          shopOrderId: orderId,
          menuItemId: item.id,
          name: item.name,
          quantity: qty,
          unitPrice: item.price,
          lineStatus: 'ACTIVE',
        },
      });
      const lines = await db.shopOrderLine.findMany({
        where: { shopOrderId: orderId, lineStatus: 'ACTIVE' },
      });
      const fee =
        order.tableReserved && order.reservationFee != null
          ? toMoneyNumber(order.reservationFee)
          : 0;
      const total = addMoney(
        lines.reduce(
          (s, l) =>
            addMoney(s, lineTotal(l.quantity, toMoneyNumber(l.unitPrice))),
          0,
        ),
        fee,
      );
      return db.shopOrder.update({
        where: { id: orderId, shopId },
        data: { total },
        include: this.shopOrderInclude(),
      });
    });
    await this.auditShopOrder(
      actor,
      'finance.shop_order.line.add',
      updated,
      auditSummaryAddLine(updated, { name: item.name, quantity: qty }),
      { menuItemId: item.id },
    );
    return this.serializeShopOrder(updated);
  }

  async patchShopOrderLine(
    actor: JwtAccessPayload,
    orderId: string,
    lineId: string,
    dto: PatchShopOrderLineDto,
  ) {
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    const order = await this.loadShopOrder(shopId, orderId);
    if (order.status === 'CANCELED') {
      throw new BadRequestException('Cannot edit a canceled order.');
    }

    const prior = order.lines.find((l) => l.id === lineId);
    if (!prior) throw new NotFoundException();

    // Stock adjust + line mutate + total recalc in one txn (conditional claims).
    const updated = await this.prisma.$transaction(async (db) => {
      const line = await db.shopOrderLine.findFirst({
        where: { id: lineId, shopOrderId: orderId },
      });
      if (!line) throw new NotFoundException();

      const patchData: Prisma.ShopOrderLineUpdateManyMutationInput = {
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.unitPrice !== undefined ? { unitPrice: dto.unitPrice } : {}),
        ...(dto.lineStatus !== undefined ? { lineStatus: dto.lineStatus } : {}),
      };

      if (dto.lineStatus === 'CANCELED' && line.lineStatus === 'ACTIVE') {
        // Claim ACTIVE→CANCELED first so concurrent cancels cannot double-restore.
        const claimed = await db.shopOrderLine.updateMany({
          where: { id: lineId, shopOrderId: orderId, lineStatus: 'ACTIVE' },
          data: patchData,
        });
        if (claimed.count === 1 && line.menuItemId) {
          await this.adjustMenuStock(
            line.menuItemId,
            -line.quantity,
            shopId,
            db,
          );
        }
      } else if (dto.lineStatus === 'ACTIVE' && line.lineStatus === 'CANCELED') {
        const qty = dto.quantity ?? line.quantity;
        if (line.menuItemId) {
          await adjustMenuItemStockByOrThrow(
            db,
            line.menuItemId,
            qty,
            shopId,
          );
        }
        const claimed = await db.shopOrderLine.updateMany({
          where: { id: lineId, shopOrderId: orderId, lineStatus: 'CANCELED' },
          data: patchData,
        });
        if (claimed.count === 0 && line.menuItemId) {
          // Concurrent restore won — reverse our decrement.
          await this.adjustMenuStock(line.menuItemId, -qty, shopId, db);
          throw new ConflictException(
            'Line was restored concurrently. Retry.',
          );
        }
      } else if (
        dto.quantity !== undefined &&
        line.lineStatus === 'ACTIVE' &&
        dto.lineStatus !== 'CANCELED'
      ) {
        const delta = dto.quantity - line.quantity;
        if (delta !== 0 && line.menuItemId) {
          await adjustMenuItemStockByOrThrow(
            db,
            line.menuItemId,
            delta,
            shopId,
          );
        }
        // Optimistic qty claim: only one concurrent patch on the same baseline wins.
        const claimed = await db.shopOrderLine.updateMany({
          where: {
            id: lineId,
            shopOrderId: orderId,
            lineStatus: 'ACTIVE',
            quantity: line.quantity,
          },
          data: {
            quantity: dto.quantity,
            ...(dto.unitPrice !== undefined
              ? { unitPrice: dto.unitPrice }
              : {}),
          },
        });
        if (claimed.count === 0) {
          if (delta !== 0 && line.menuItemId) {
            await this.adjustMenuStock(line.menuItemId, -delta, shopId, db);
          }
          throw new ConflictException(
            'Line was modified concurrently. Retry.',
          );
        }
      } else {
        await db.shopOrderLine.update({
          where: { id: lineId, shopOrderId: orderId },
          data: {
            ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
            ...(dto.unitPrice !== undefined ? { unitPrice: dto.unitPrice } : {}),
            ...(dto.lineStatus !== undefined
              ? { lineStatus: dto.lineStatus }
              : {}),
          },
        });
      }

      return this.recalcShopOrderTotal(orderId, shopId, db);
    });

    const patchedLine = updated.lines.find((l) => l.id === lineId);
    await this.auditShopOrder(
      actor,
      'finance.shop_order.line.patch',
      updated,
      auditSummaryPatchLine(
        updated,
        {
          name: patchedLine?.name ?? prior.name,
          quantity: patchedLine?.quantity ?? prior.quantity,
        },
        this.describeLinePatch(prior, dto),
      ),
      { lineId },
    );
    return this.serializeShopOrder(updated);
  }

  async deleteShopOrderLine(
    actor: JwtAccessPayload,
    orderId: string,
    lineId: string,
  ) {
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    const order = await this.loadShopOrder(shopId, orderId);
    if (order.status === 'CANCELED') {
      throw new BadRequestException('Cannot edit a canceled order.');
    }
    const prior = order.lines.find((l) => l.id === lineId);
    if (!prior) throw new NotFoundException();

    // Claim ACTIVE→gone + stock restore + total in one txn (no double restore).
    const updated = await this.prisma.$transaction(async (db) => {
      const line = await db.shopOrderLine.findFirst({
        where: { id: lineId, shopOrderId: orderId },
      });
      if (!line) throw new NotFoundException();

      if (line.menuItemId && line.lineStatus === 'ACTIVE') {
        const claimed = await db.shopOrderLine.deleteMany({
          where: {
            id: lineId,
            shopOrderId: orderId,
            lineStatus: 'ACTIVE',
          },
        });
        if (claimed.count === 1) {
          await this.adjustMenuStock(
            line.menuItemId,
            -line.quantity,
            shopId,
            db,
          );
        } else {
          throw new ConflictException(
            'Line was modified concurrently. Retry.',
          );
        }
      } else {
        const deleted = await db.shopOrderLine.deleteMany({
          where: { id: lineId, shopOrderId: orderId },
        });
        if (deleted.count === 0) throw new NotFoundException();
      }

      return this.recalcShopOrderTotal(orderId, shopId, db);
    });

    await this.auditShopOrder(
      actor,
      'finance.shop_order.line.delete',
      updated,
      auditSummaryRemoveLine(updated, {
        name: prior.name,
        quantity: prior.quantity,
      }),
      { lineId },
    );
    return this.serializeShopOrder(updated);
  }

  async deleteShopOrder(actor: JwtAccessPayload, id: string) {
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    const order = await this.loadShopOrder(shopId, id);

    // Claim ACTIVE lines + restore BEFORE order delete — concurrent cancel
    // cannot double-restore from a stale ACTIVE snapshot after cascade.
    await this.prisma.$transaction(async (db) => {
      const fresh = await db.shopOrder.findFirst({
        where: { id, shopId },
        include: this.shopOrderInclude(),
      });
      if (!fresh) throw new NotFoundException();

      await claimActiveLinesAndRestoreStock(db, shopId, id, fresh.lines);

      const deleted = await db.shopOrder.deleteMany({
        where: { id, shopId },
      });
      if (deleted.count !== 1) throw new NotFoundException();
    });

    await this.auditShopOrder(
      actor,
      'finance.shop_order.delete',
      order,
      auditSummaryDelete(order),
    );
    return { ok: true };
  }
}

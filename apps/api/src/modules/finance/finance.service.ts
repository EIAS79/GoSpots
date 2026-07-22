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
import { claimActiveLinesAndRestoreStock } from '../../common/shop-order-stock.util';
import { loadShopCurrency } from '../../common/currency-stamp.util';
import {
  postReservationBilled,
  postShopOrderCompleted,
  postTransactionCreated,
  postWalkInPlaySessionPaid,
} from '../../common/ledger-post.util';
import { loadShopVenueTimeContext } from '../../common/shop-venue-time.util';
import { requireShopId } from '../../common/tenant';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLossDto, CreateTransactionDto } from './dto/finance.dto';
import {
  AddShopOrderLineDto,
  CreateShopOrderDto,
  PatchShopOrderLineDto,
  UpdateShopOrderDto,
} from './dto/orders.dto';
import { BulkOrderIdsDto } from './dto/bulk-orders.dto';
import { FinanceReportsService } from './finance-reports.service';
import { ShopLossService } from './shop-loss.service';
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
import { withResourceBookingLock } from '../../common/booking-lock.util';
import { assertWithinOpeningHours } from '../../common/opening-hours.util';
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
  addMoney,
  lineTotal,
  serializeMoney,
  serializeMoneyOrNull,
  toMoneyNumber,
  type MoneyInput,
} from '../../common/money.util';
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

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly reports: FinanceReportsService,
    private readonly losses: ShopLossService,
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

  private serializeTransaction<
    T extends {
      amount: MoneyInput;
      lines: Array<
        { unitPrice: MoneyInput; total: MoneyInput } & Record<string, unknown>
      >;
    },
  >(tx: T) {
    return {
      ...tx,
      amount: serializeMoney(tx.amount),
      lines: tx.lines.map((l) => ({
        ...l,
        unitPrice: serializeMoney(l.unitPrice),
        total: serializeMoney(l.total),
      })),
    };
  }

  private serializePlaySession<T extends { amount: MoneyInput }>(session: T) {
    return { ...session, amount: serializeMoney(session.amount) };
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
    const ok = await adjustMenuItemStockBy(db, menuItemId, delta, shopId);
    if (!ok) {
      throw new BadRequestException('Not enough stock for this item.');
    }
  }

  async listTransactions(actor: JwtAccessPayload, take = 40) {
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const rows = await this.prisma.transaction.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { lines: true },
    });
    return rows.map((tx) => this.serializeTransaction(tx));
  }

  async createTransaction(actor: JwtAccessPayload, dto: CreateTransactionDto) {
    this.assert(actor, 'transaction.write');
    const shopId = actor.shopId!;
    await this.requireFeature(shopId, 'transaction');
    const currency = await loadShopCurrency(this.prisma, shopId);
    const { resolvedTimeZone } = await loadShopVenueTimeContext(
      this.prisma,
      shopId,
    );
    const today = venueDayKey(resolvedTimeZone);
    const amount = dto.lines.reduce(
      (s, l) => addMoney(s, lineTotal(l.quantity, l.unitPrice)),
      0,
    );

    // Stock adjust + SALE/REFUND row commit atomically (no orphan sale on stock fail).
    const tx = await this.prisma.$transaction(async (db) => {
      if (dto.kind === 'SALE' || dto.kind === 'REFUND') {
        for (const line of dto.lines) {
          if (!line.menuItemId) continue;
          await resetMenuItemStockForDay(db, line.menuItemId, today, shopId);
          if (dto.kind === 'SALE') {
            const item = await fetchMenuItemStockRow(
              db,
              shopId,
              line.menuItemId,
            );
            if (!item) throw new NotFoundException('Menu item not found');
            if (!canFulfillQty(item, line.quantity)) {
              throw new BadRequestException(
                `${item.name} is out of stock (${item.stock} left).`,
              );
            }
            const ok = await adjustMenuItemStockBy(
              db,
              line.menuItemId,
              line.quantity,
              shopId,
            );
            if (!ok) {
              throw new BadRequestException(
                `${item.name} is out of stock (${item.stock} left).`,
              );
            }
          } else {
            await adjustMenuItemStockBy(
              db,
              line.menuItemId,
              -line.quantity,
              shopId,
            );
          }
        }
      }

      const created = await db.transaction.create({
        data: {
          shopId,
          kind: dto.kind,
          method: dto.method ?? 'CASH',
          amount,
          currency,
          note: dto.note,
          createdById: actor.sub,
          lines: {
            create: dto.lines.map((l) => ({
              menuItemId: l.menuItemId,
              name: l.name,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              total: lineTotal(l.quantity, l.unitPrice),
            })),
          },
        },
        include: { lines: true },
      });
      await postTransactionCreated(db, {
        shopId,
        transactionId: created.id,
        kind: dto.kind,
        amount: created.amount,
        currency: created.currency ?? currency,
        createdAt: created.createdAt,
        createdById: actor.sub,
      });
      return created;
    });

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
    return this.serializeTransaction(tx);
  }

  async salesByItem(actor: JwtAccessPayload, days = 30) {
    return this.reports.salesByItem(actor, days);
  }

  async getFinanceAnalytics(actor: JwtAccessPayload, days = 30) {
    return this.reports.getFinanceAnalytics(actor, days);
  }

  async getTopSellers(actor: JwtAccessPayload, days = 30, limit = 10) {
    return this.reports.getTopSellers(actor, days, limit);
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

    const orders = await this.prisma.shopOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: this.shopOrderInclude(),
    });
    return orders.map((o) => this.serializeShopOrder(o));
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
    return this.serializeShopOrder(await this.loadShopOrder(shopId, id));
  }

  async createShopOrder(actor: JwtAccessPayload, dto: CreateShopOrderDto) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
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
    const { resolvedTimeZone } = await loadShopVenueTimeContext(
      this.prisma,
      shopId,
    );
    const today = venueDayKey(resolvedTimeZone);
    const updated = await this.prisma.$transaction(async (db) => {
      // Re-apply day reset inside the txn so adjust sees the same baseline.
      await resetMenuItemStockForDay(db, item.id, today, shopId);
      const ok = await adjustMenuItemStockBy(db, item.id, qty, shopId);
      if (!ok) {
        throw new BadRequestException(
          `${item.name} is out of stock (${item.stock} left).`,
        );
      }
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
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
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
          const ok = await adjustMenuItemStockBy(
            db,
            line.menuItemId,
            qty,
            shopId,
          );
          if (!ok) {
            throw new BadRequestException('Not enough stock for this item.');
          }
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
          const ok = await adjustMenuItemStockBy(
            db,
            line.menuItemId,
            delta,
            shopId,
          );
          if (!ok) {
            throw new BadRequestException(
              'Not enough stock for this item.',
            );
          }
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
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
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
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
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

  async listLosses(actor: JwtAccessPayload, take = 50) {
    return this.losses.listLosses(actor, take);
  }

  async createLoss(actor: JwtAccessPayload, dto: CreateLossDto) {
    return this.losses.createLoss(actor, dto);
  }

  async deleteLoss(actor: JwtAccessPayload, id: string) {
    return this.losses.deleteLoss(actor, id);
  }

  private mapPlayBillingRow(
    row: {
      id: string;
      guestName: string;
      partySize: number;
      startsAt: Date;
      endsAt: Date;
      status: string;
      billedAmount: MoneyInput;
      billedAt: Date | null;
      billingDiscountPercent: number;
      billingBaseAmount?: MoneyInput;
      currency?: string | null;
      notes: string | null;
      resource: {
        id: string;
        name: string;
        type: string;
        hourlyRate: MoneyInput;
        category: {
          id: string;
          name: string;
          slotMinutes: number;
          bookingMode: BookingMode;
          offeringConfig: unknown;
          rates: {
            label: string;
            durationMinutes: number | null;
            price: MoneyInput;
          }[];
        } | null;
      } | null;
    },
    now: Date,
  ) {
    if (!row.resource) return null;
    const categoryRates = (row.resource.category?.rates ?? []).map((r) => ({
      label: r.label,
      durationMinutes: r.durationMinutes,
      price: toMoneyNumber(r.price),
    }));
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
      categoryRates,
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
              categoryRates,
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
          hourlyRate: toMoneyNumber(row.resource.hourlyRate),
          slotMinutes: row.resource.category?.slotMinutes ?? 60,
          categoryRates,
          useElapsed: inProgress,
          now,
        });
    const discountPercent = row.billingDiscountPercent ?? 0;
    const rateAmount = computed.amount;
    const baseAmount =
      row.billingBaseAmount != null
        ? toMoneyNumber(row.billingBaseAmount)
        : rateAmount;
    const amountDue =
      row.billedAt != null
        ? (row.billedAmount != null
            ? toMoneyNumber(row.billedAmount)
            : applyBillingDiscount(baseAmount, discountPercent))
        : applyBillingDiscount(baseAmount, discountPercent);
    return {
      id: row.id,
      source: 'booking' as const,
      guestName: row.guestName,
      partySize: row.partySize,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: row.status,
      billedAmount: serializeMoneyOrNull(row.billedAmount),
      billedAt: row.billedAt?.toISOString() ?? null,
      currency: row.currency ?? null,
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
      computedAmount: serializeMoney(rateAmount),
      baseAmount: serializeMoney(baseAmount),
      amountDue: serializeMoney(amountDue),
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
      amount: MoneyInput;
      billingDiscountPercent: number;
      currency?: string | null;
      status: string;
      completedAt: Date | null;
      note: string | null;
      resource: {
        id: string;
        name: string;
        type: string;
        hourlyRate: MoneyInput;
        category: {
          name: string;
          bookingMode: BookingMode;
          slotMinutes: number;
          offeringConfig: unknown;
          rates?: {
            label: string;
            durationMinutes: number | null;
            price: MoneyInput;
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
    const categoryRates = (row.resource?.category?.rates ?? []).map((r) => ({
      label: r.label,
      durationMinutes: r.durationMinutes,
      price: toMoneyNumber(r.price),
    }));
    const billingOpts = {
      bookingMode: row.resource?.category?.bookingMode ?? 'TIME',
      notes: row.note,
      offeringConfig: row.resource?.category?.offeringConfig,
      categoryRates,
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
    const baseAmount = toMoneyNumber(row.amount);
    const amountDue = isPaid
      ? baseAmount
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
              categoryRates,
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
      billedAmount: isPaid ? serializeMoney(row.amount) : null,
      billedAt: row.completedAt?.toISOString() ?? null,
      currency: row.currency ?? null,
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
      computedAmount: serializeMoney(baseAmount),
      baseAmount: serializeMoney(baseAmount),
      amountDue: serializeMoney(amountDue),
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
        totalDue: string;
        totalPaid: string;
      }
    > = {};
    const dueAcc: Record<string, number> = {};
    const paidAcc: Record<string, number> = {};
    for (const item of pageItems) {
      const day = item.startsAt.slice(0, 10);
      if (!byDay[day]) {
        byDay[day] = {
          day,
          items: [],
          totalDue: serializeMoney(0),
          totalPaid: serializeMoney(0),
        };
        dueAcc[day] = 0;
        paidAcc[day] = 0;
      }
      byDay[day].items.push(item);
      if (item.isPaid) {
        paidAcc[day] = addMoney(paidAcc[day], item.amountDue);
      } else {
        dueAcc[day] = addMoney(dueAcc[day], item.amountDue);
      }
    }
    for (const day of Object.keys(byDay)) {
      byDay[day].totalDue = serializeMoney(dueAcc[day] ?? 0);
      byDay[day].totalPaid = serializeMoney(paidAcc[day] ?? 0);
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
        unpaidTotal: serializeMoney(
          filtered
            .filter((i) => !i.isPaid)
            .reduce((s, i) => addMoney(s, i.amountDue), 0),
        ),
        paidTotal: serializeMoney(
          filtered
            .filter((i) => i.isPaid)
            .reduce(
              (s, i) => addMoney(s, i.billedAmount ?? i.amountDue),
              0,
            ),
        ),
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
    const currency = await loadShopCurrency(this.prisma, shopId);
    const now = new Date();

    const { updated, amount } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.reservation.findFirst({
        where: { id: reservationId, shopId, resourceId: { not: null } },
        include: this.playBillingInclude(),
      });
      if (!row?.resource) throw new NotFoundException('Booking not found.');

      const mapped = this.mapPlayBillingRow(row, now);
      if (!mapped) throw new BadRequestException('Not billable.');

      const discountPercent =
        dto.discountPercent ?? row.billingDiscountPercent ?? 0;
      const payAmount =
        dto.amountOverride != null
          ? dto.amountOverride
          : applyBillingDiscount(
              toMoneyNumber(mapped.baseAmount),
              discountPercent,
            );

      const sessionStillActive = row.endsAt > now;

      // Conditional claim: unpaid → paid + amount stamp in one txn (walk-in pattern).
      const claimed = await tx.reservation.updateMany({
        where: {
          id: reservationId,
          shopId,
          resourceId: { not: null },
          billedAt: null,
          status: { notIn: ['CANCELED', 'NO_SHOW'] },
        },
        data: {
          billedAmount: payAmount,
          billedAt: now,
          currency,
          billingDiscountPercent: discountPercent,
          billingPaymentMethod: dto.paymentMethod ?? 'CASH',
          ...(sessionStillActive ? {} : { status: 'COMPLETED' }),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'Booking was updated by another request.',
        );
      }

      const next = await tx.reservation.findFirst({
        where: { id: reservationId, shopId },
        include: this.playBillingInclude(),
      });
      if (!next?.resource) throw new NotFoundException('Booking not found.');
      await postReservationBilled(tx, {
        shopId,
        reservationId,
        billedAmount: payAmount,
        currency: next.currency ?? currency,
        billedAt: next.billedAt ?? now,
        resourceId: next.resourceId,
        createdById: actor.sub,
      });
      return { updated: next, amount: payAmount };
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
        toMoneyNumber(remapped.baseAmount),
        dto.discountPercent ?? existing.billingDiscountPercent ?? 0,
      );
    }

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId, shopId },
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
      where: { id: reservationId, shopId },
      data: {
        status: reason,
        billedAt: null,
        billedAmount: null,
      },
      include: this.playBillingInclude(),
    });

    if (existing.resourceId) {
      await this.prisma.resource.update({
        where: { id: existing.resourceId, shopId },
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
    const rows = await this.prisma.playSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.take ?? 80,
      include: this.playSessionInclude(),
    });
    return rows.map((s) => this.serializePlaySession(s));
  }

  async createPlaySession(actor: JwtAccessPayload, dto: CreatePlaySessionDto) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const currency = await loadShopCurrency(this.prisma, shopId);
    const durationMinutes = dto.durationMinutes ?? null;
    const startedAt = new Date();
    const hoursEnd =
      durationMinutes != null && durationMinutes > 0
        ? new Date(startedAt.getTime() + durationMinutes * 60_000)
        : startedAt;
    await assertWithinOpeningHours(this.prisma, shopId, startedAt, hoursEnd);

    const createRow = async (db: Prisma.TransactionClient | PrismaService) =>
      db.playSession.create({
        data: {
          shopId,
          resourceId: dto.resourceId ?? null,
          reservationId: dto.reservationId ?? null,
          playerCount: dto.playerCount ?? 1,
          durationMinutes,
          amount: dto.amount ?? 0,
          currency,
          billingDiscountPercent: dto.discountPercent ?? 0,
          paymentMethod: dto.paymentMethod ?? 'CASH',
          label: dto.label?.trim() || null,
          note: dto.note?.trim() || null,
          startedAt,
          createdById: actor.sub,
        },
        include: this.playSessionInclude(),
      });

    let session;
    if (dto.resourceId) {
      session = await withResourceBookingLock(
        this.prisma,
        dto.resourceId,
        async (tx) => {
          await assertResourceBookable(tx, shopId, dto.resourceId!);
          const blockEnd =
            durationMinutes != null && durationMinutes > 0
              ? new Date(startedAt.getTime() + durationMinutes * 60_000)
              : walkInEffectiveEnd({
                  startedAt,
                  endedAt: null,
                  durationMinutes: null,
                });
          await assertNoWalkInOverlap(
            tx,
            shopId,
            dto.resourceId!,
            startedAt,
            blockEnd,
          );
          await assertNoReservationOverlap(
            tx,
            shopId,
            dto.resourceId!,
            startedAt,
            blockEnd,
          );
          return createRow(tx);
        },
      );
    } else {
      session = await createRow(this.prisma);
    }

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
    return this.serializePlaySession(session);
  }

  async markPlaySessionPaid(
    actor: JwtAccessPayload,
    id: string,
    dto: { amountOverride?: number; discountPercent?: number },
  ) {
    this.assert(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await this.requireFeature(shopId, 'transaction');
    const currency = await loadShopCurrency(this.prisma, shopId);
    const now = new Date();

    const { updated, amount } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.playSession.findFirst({
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
      const payAmount =
        dto.amountOverride != null
          ? dto.amountOverride
          : applyBillingDiscount(toMoneyNumber(row.amount), discountPercent);

      const effectiveEnd =
        row.endedAt ??
        (row.durationMinutes != null && row.durationMinutes > 0
          ? new Date(row.startedAt.getTime() + row.durationMinutes * 60_000)
          : null);
      const stillActive =
        row.status === 'ACTIVE' && (!effectiveEnd || effectiveEnd > now);

      // Conditional claim: cancel racing in loses; money stamp is one txn.
      const claimed = await tx.playSession.updateMany({
        where: {
          id,
          shopId,
          reservationId: null,
          status: { not: 'CANCELED' },
        },
        data: {
          amount: payAmount,
          currency: row.currency ?? currency,
          billingDiscountPercent: discountPercent,
          completedAt: now,
          ...(stillActive
            ? {}
            : {
                status: 'COMPLETED',
                endedAt: row.endedAt ?? now,
              }),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'Walk-in session was updated by another request.',
        );
      }

      const next = await tx.playSession.findFirst({
        where: { id, shopId },
        include: this.playSessionInclude(),
      });
      if (!next) throw new NotFoundException('Walk-in session not found.');
      await postWalkInPlaySessionPaid(tx, {
        shopId,
        sessionId: id,
        amount: payAmount,
        currency: next.currency ?? currency,
        completedAt: next.completedAt ?? now,
        reservationId: next.reservationId,
        createdById: actor.sub,
      });
      return { updated: next, amount: payAmount };
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

    // Only unpaid ACTIVE — conditional so pay/complete cannot be undone by a race.
    const claimed = await this.prisma.playSession.updateMany({
      where: {
        id,
        shopId,
        status: 'ACTIVE',
        completedAt: null,
      },
      data: { status: 'CANCELED', completedAt: null },
    });
    if (claimed.count !== 1) {
      const row = await this.prisma.playSession.findFirst({
        where: { id, shopId },
      });
      if (!row) throw new NotFoundException();
      if (row.status === 'COMPLETED' || row.completedAt != null) {
        throw new BadRequestException('Paid sessions cannot be canceled.');
      }
      if (row.status === 'CANCELED') {
        throw new BadRequestException('Session is already canceled.');
      }
      throw new ConflictException(
        'Walk-in session was updated by another request.',
      );
    }

    await this.audit.record(actor, {
      section: 'finance',
      action: 'finance.play_session.cancel',
      summary: 'Canceled walk-in guest',
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

    if (dto.clearPaid) {
      const clearPaidInner = async (
        db: Prisma.TransactionClient | PrismaService,
      ) => {
        const claimed = await db.playSession.updateMany({
          where: {
            id,
            shopId,
            status: { not: 'CANCELED' },
            OR: [{ status: 'COMPLETED' }, { completedAt: { not: null } }],
          },
          data: {
            status: 'ACTIVE',
            completedAt: null,
          },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException('Session is not paid.');
        }
        const next = await db.playSession.findFirst({
          where: { id, shopId },
          include: this.playSessionInclude(),
        });
        if (!next) throw new NotFoundException();
        return next;
      };

      if (row.resourceId) {
        const reopened = await withResourceBookingLock(
          this.prisma,
          row.resourceId,
          async (tx) => {
            await assertResourceBookable(tx, shopId, row.resourceId!);
            const blockEnd = walkInEffectiveEnd({
              startedAt: row.startedAt,
              endedAt: row.endedAt,
              durationMinutes: row.durationMinutes,
            });
            await assertNoWalkInOverlap(
              tx,
              shopId,
              row.resourceId!,
              row.startedAt,
              blockEnd,
              id,
            );
            await assertNoReservationOverlap(
              tx,
              shopId,
              row.resourceId!,
              row.startedAt,
              blockEnd,
            );
            return clearPaidInner(tx);
          },
        );
        return this.serializePlaySession(reopened);
      }
      return this.serializePlaySession(await clearPaidInner(this.prisma));
    }

    if (dto.status === 'CANCELED') {
      const claimed = await this.prisma.playSession.updateMany({
        where: {
          id,
          shopId,
          status: 'ACTIVE',
          completedAt: null,
        },
        data: { status: 'CANCELED', completedAt: null },
      });
      if (claimed.count !== 1) {
        if (row.status === 'COMPLETED' || row.completedAt != null) {
          throw new BadRequestException('Paid sessions cannot be canceled.');
        }
        throw new ConflictException(
          'Walk-in session was updated by another request.',
        );
      }
      const canceled = await this.prisma.playSession.findFirst({
        where: { id, shopId },
        include: this.playSessionInclude(),
      });
      if (!canceled) throw new NotFoundException();
      await this.audit.record(actor, {
        section: 'finance',
        action: 'finance.play_session.update',
        summary: `Updated walk-in ${canceled.label ?? 'guest'} (status → CANCELED)`,
        meta: { sessionId: id, endSession: false, status: 'CANCELED' },
      });
      return this.serializePlaySession(canceled);
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

    const discountPercent =
      dto.discountPercent !== undefined
        ? dto.discountPercent
        : row.billingDiscountPercent;

    const nextResourceId =
      dto.resourceId !== undefined ? dto.resourceId : row.resourceId;
    const nextDurationMinutes =
      dto.durationMinutes !== undefined
        ? dto.durationMinutes
        : row.durationMinutes;
    const nextStatus = dto.status ?? row.status;
    const intervalAffecting =
      dto.resourceId !== undefined ||
      dto.durationMinutes !== undefined ||
      (dto.endSession === true && row.status === 'ACTIVE');
    const needsBookingLock =
      Boolean(nextResourceId) &&
      nextStatus === 'ACTIVE' &&
      intervalAffecting;

    const updateData = {
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
    };

    const applyUpdate = async (
      db: Prisma.TransactionClient | PrismaService,
    ) => {
      const completing =
        dto.status === 'COMPLETED' && row.status !== 'COMPLETED';
      const claimed = await db.playSession.updateMany({
        where: completing
          ? {
              id,
              shopId,
              status: { notIn: ['CANCELED', 'COMPLETED'] },
            }
          : {
              id,
              shopId,
              status: { not: 'CANCELED' },
            },
        data: updateData,
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'Walk-in session was updated by another request.',
        );
      }
      const next = await db.playSession.findFirst({
        where: { id, shopId },
        include: this.playSessionInclude(),
      });
      if (!next) throw new NotFoundException();
      return next;
    };

    const updated = needsBookingLock
      ? await withResourceBookingLock(
          this.prisma,
          nextResourceId!,
          async (tx) => {
            const fresh = await tx.playSession.findFirst({
              where: { id, shopId },
            });
            if (!fresh) throw new NotFoundException();
            if (fresh.status === 'CANCELED') {
              throw new BadRequestException(
                'Canceled session cannot be edited.',
              );
            }
            let lockEndedAt = fresh.endedAt;
            if (dto.endSession && fresh.status === 'ACTIVE') {
              lockEndedAt = new Date();
            }
            const lockDuration =
              dto.durationMinutes !== undefined
                ? dto.durationMinutes
                : fresh.durationMinutes;
            await assertResourceBookable(tx, shopId, nextResourceId!);
            const blockEnd = walkInEffectiveEnd({
              startedAt: fresh.startedAt,
              endedAt: lockEndedAt,
              durationMinutes: lockDuration,
            });
            await assertNoWalkInOverlap(
              tx,
              shopId,
              nextResourceId!,
              fresh.startedAt,
              blockEnd,
              id,
            );
            await assertNoReservationOverlap(
              tx,
              shopId,
              nextResourceId!,
              fresh.startedAt,
              blockEnd,
            );
            return applyUpdate(tx);
          },
        )
      : await applyUpdate(this.prisma);

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

    // Alternate pay path (status → COMPLETED without markPlaySessionPaid).
    const becamePaid =
      (dto.status === 'COMPLETED' && row.status !== 'COMPLETED') ||
      (updated.completedAt != null && row.completedAt == null);
    if (becamePaid && !updated.reservationId) {
      const shopCurrency = await loadShopCurrency(this.prisma, shopId);
      await postWalkInPlaySessionPaid(this.prisma, {
        shopId,
        sessionId: id,
        amount: updated.amount,
        currency: updated.currency ?? shopCurrency,
        completedAt: updated.completedAt ?? new Date(),
        reservationId: updated.reservationId,
        createdById: actor.sub,
      });
    }

    return this.serializePlaySession(updated);
  }
}

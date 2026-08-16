import {
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
} from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { requireShopId } from '../../common/tenant';
import { withTenantRls } from '../../common/tenant-rls.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { OrderingPricingService } from '../ordering/ordering-pricing.service';
import type {
  AppendRestaurantOrderDto,
  QrOrderLineDto,
  QrTableOrderDto,
  TableTransferDto,
} from './dto/restaurant-operations.dto';

type Tx = Prisma.TransactionClient;
type QrPayload = { v: 1; s: string; r: string; e: number; n: string };
type OrderResult = {
  orderId: string;
  displayNumber: string;
  lineIds: string[];
  replayed?: boolean;
};

@Injectable()
export class RestaurantOrderIntegrityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: OrderingPricingService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async createQrOrder(
    token: string,
    idempotencyKey: string | undefined,
    dto: QrTableOrderDto,
  ): Promise<OrderResult> {
    const payload = this.verifyQrToken(token);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const result = await withTenantRls(
      this.prisma as unknown as PrismaClient,
      { shopId: payload.s, mode: 'tenant' },
      async (tx) =>
        this.idempotent(tx, payload.s, 'restaurant.qr_order', key, dto, async () => {
          const tokenRow = await this.lockQrToken(tx, payload, token);
          const [shop, resource] = await Promise.all([
            tx.shop.findFirst({ where: { id: payload.s }, select: { currency: true } }),
            tx.resource.findFirst({ where: { id: payload.r, shopId: payload.s } }),
          ]);
          if (!shop || !resource) throw new ForbiddenException('QR table mapping is no longer valid.');

          let guestCheckId = tokenRow.guestCheckId;
          if (guestCheckId) {
            const openCheck = await tx.guestCheck.findFirst({
              where: { id: guestCheckId, shopId: payload.s, status: 'OPEN' },
              select: { id: true },
            });
            if (!openCheck) guestCheckId = null;
          }
          if (!guestCheckId) {
            const check = await tx.guestCheck.create({
              data: {
                shopId: payload.s,
                label: `QR table ${resource.name}`,
                partySize: 1,
                currency: shop.currency,
                createdById: `qr:${tokenRow.id}`,
              },
            });
            guestCheckId = check.id;
            await tx.qrTableOrderToken.update({ where: { id: tokenRow.id }, data: { guestCheckId } });
          }

          const priced = [];
          for (const input of dto.lines) {
            await this.assertAvailability(tx, payload.s, 'QR_TABLE', input);
            priced.push(await this.pricing.priceLine(payload.s, input, tx));
          }
          for (const input of dto.lines) {
            await this.claimTrackedStock(tx, payload.s, input.menuItemId, input.quantity);
          }

          const order = await tx.venueOrder.create({
            data: {
              shopId: payload.s,
              guestCheckId,
              resourceId: payload.r,
              serviceMode: 'DINING',
              status: 'OPEN',
              guestLabel: dto.guestLabel?.trim() || null,
              currency: shop.currency,
              ...this.sumPriced(priced),
              createdById: `qr:${tokenRow.id}`,
            },
          });
          const lineIds = await this.persistLines(
            tx,
            payload.s,
            order.id,
            dto.lines,
            priced,
            `qr:${tokenRow.id}`,
          );
          await tx.restaurantOrderOps.create({
            data: {
              shopId: payload.s,
              orderId: order.id,
              lifecycle: RestaurantOrderLifecycle.PLACED,
              origin: RestaurantOrderOrigin.QR_TABLE,
              displayNumber: `R-${order.id}`,
              currentResourceId: payload.r,
            },
          });
          await this.routeLines(tx, payload.s, order.id, lineIds, `qr:${tokenRow.id}`);
          const claimed = await tx.qrTableOrderToken.updateMany({
            where: {
              id: tokenRow.id,
              shopId: payload.s,
              revokedAt: null,
              expiresAt: { gt: new Date() },
              useCount: { lt: tokenRow.maxUses },
            },
            data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
          });
          if (claimed.count !== 1) throw new ConflictException('QR token was exhausted or expired.');
          return { orderId: order.id, displayNumber: `R-${order.id}`, lineIds };
        }),
    );

    if (!result.replayed) {
      await withTenantRls(
        this.prisma as unknown as PrismaClient,
        { shopId: payload.s, mode: 'tenant' },
        async () =>
          this.audit.recordForShop(payload.s, {
            section: 'operations',
            action: 'restaurant.qr_order.create',
            summary: 'QR table order entered canonical GuestCheck/order/KDS pipeline',
            meta: { orderId: result.orderId, resourceId: payload.r },
            actorName: 'QR table guest',
          }),
      );
    }
    return result;
  }

  async appendOrder(
    actor: JwtAccessPayload,
    orderId: string,
    idempotencyKey: string | undefined,
    dto: AppendRestaurantOrderDto,
  ): Promise<OrderResult> {
    const shopId = requireShopId(actor);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const result = await withTenantRls(
      this.prisma as unknown as PrismaClient,
      { shopId, mode: 'tenant' },
      async (tx) =>
        this.idempotent(tx, shopId, `restaurant.order.append:${orderId}`, key, dto, async () => {
          const order = await tx.venueOrder.findFirst({ where: { id: orderId, shopId } });
          if (!order) throw new NotFoundException('Order not found.');
          if (['CANCELED', 'COMPLETED', 'REFUNDED'].includes(order.status)) {
            throw new ConflictException('Terminal order cannot accept additional items.');
          }
          await this.assertCheckMutable(tx, shopId, order.guestCheckId);

          const mode = this.availabilityMode(order.serviceMode);
          const priced = [];
          for (const input of dto.lines) {
            await this.assertAvailability(tx, shopId, mode, input);
            priced.push(await this.pricing.priceLine(shopId, input, tx));
          }
          for (const input of dto.lines) {
            await this.claimTrackedStock(tx, shopId, input.menuItemId, input.quantity);
          }
          const lineIds = await this.persistLines(tx, shopId, orderId, dto.lines, priced, actor.sub);
          const activeLines = await tx.venueOrderLine.findMany({
            where: { shopId, orderId, canceledAt: null },
            select: { taxMinor: true, totalMinor: true },
          });
          await tx.venueOrder.update({
            where: { id: orderId },
            data: { ...this.sumStored(activeLines), version: { increment: 1 } },
          });
          await tx.restaurantOrderOps.upsert({
            where: { orderId },
            create: {
              shopId,
              orderId,
              lifecycle: RestaurantOrderLifecycle.PLACED,
              origin:
                order.serviceMode === 'QUICK_SALE'
                  ? RestaurantOrderOrigin.CASHIER
                  : RestaurantOrderOrigin.STAFF,
              displayNumber: `R-${orderId}`,
              currentResourceId: order.resourceId,
              createdById: actor.sub,
              updatedById: actor.sub,
            },
            update: { updatedById: actor.sub, version: { increment: 1 } },
          });
          await this.routeLines(tx, shopId, orderId, lineIds, actor.sub);
          return { orderId, displayNumber: `R-${orderId}`, lineIds };
        }),
    );
    if (!result.replayed) {
      await this.audit.record(actor, {
        section: 'operations',
        action: 'restaurant.order.append',
        summary: 'Added repeated order items idempotently',
        meta: { orderId, lineIds: result.lineIds },
      });
    }
    return result;
  }

  async transfer(actor: JwtAccessPayload, orderId: string, dto: TableTransferDto) {
    const shopId = requireShopId(actor);
    const result = await withTenantRls(
      this.prisma as unknown as PrismaClient,
      { shopId, mode: 'tenant' },
      async (tx) => {
        const source = await tx.venueOrder.findFirst({ where: { id: orderId, shopId } });
        if (!source) throw new NotFoundException('Order not found.');
        this.assertNonTerminal(source.status);
        if (dto.toResourceId) {
          const targetResource = await tx.resource.findFirst({
            where: { id: dto.toResourceId, shopId },
          });
          if (!targetResource) throw new NotFoundException('Destination resource not found.');
        }
        const active = await tx.venueOrderLine.findMany({
          where: { shopId, orderId, canceledAt: null },
          orderBy: { createdAt: 'asc' },
        });
        const requested = dto.lineIds?.length ? new Set(dto.lineIds) : null;
        const selected = requested
          ? active.filter((line) => requested.has(line.id))
          : active.filter((line) => dto.fromSeat == null || line.seat === dto.fromSeat);
        if (requested && selected.length !== requested.size) {
          throw new ConflictException('Selected items changed; refresh before transferring.');
        }
        if (!selected.length) throw new ConflictException('No active items match this transfer.');
        if (!dto.toResourceId && dto.toSeat == null) {
          throw new ConflictException('A destination table/resource or seat is required.');
        }

        let targetOrderId = orderId;
        if (dto.toResourceId && selected.length < active.length) {
          const target = await tx.venueOrder.create({
            data: {
              shopId,
              guestCheckId: source.guestCheckId,
              operationsSessionId: source.operationsSessionId,
              resourceId: dto.toResourceId,
              serviceMode: source.serviceMode,
              status: source.status,
              seat: dto.toSeat ?? source.seat,
              guestLabel: source.guestLabel,
              currency: source.currency,
              ...this.sumStored(selected),
              createdById: actor.sub,
            },
          });
          targetOrderId = target.id;
          await tx.venueOrderLine.updateMany({
            where: { shopId, id: { in: selected.map((line) => line.id) } },
            data: { orderId: target.id, ...(dto.toSeat ? { seat: dto.toSeat } : {}) },
          });
          await tx.restaurantOrderLineOps.updateMany({
            where: { shopId, orderLineId: { in: selected.map((line) => line.id) } },
            data: { orderId: target.id, updatedById: actor.sub },
          });
          const sourceOps = await tx.restaurantOrderOps.findFirst({ where: { shopId, orderId } });
          await tx.restaurantOrderOps.create({
            data: {
              shopId,
              orderId: target.id,
              lifecycle: sourceOps?.lifecycle ?? RestaurantOrderLifecycle.PLACED,
              origin: sourceOps?.origin ?? RestaurantOrderOrigin.STAFF,
              displayNumber: `R-${target.id}`,
              currentResourceId: dto.toResourceId,
              createdById: actor.sub,
              updatedById: actor.sub,
            },
          });
          await this.reparentPrepLines(
            tx,
            shopId,
            source.id,
            target.id,
            selected.map((line) => line.id),
            actor.sub,
          );
          const remaining = active.filter(
            (line) => !selected.some((moved) => moved.id === line.id),
          );
          await tx.venueOrder.update({
            where: { id: source.id },
            data: { ...this.sumStored(remaining), version: { increment: 1 } },
          });
        } else {
          await tx.venueOrder.update({
            where: { id: source.id },
            data: {
              ...(dto.toResourceId ? { resourceId: dto.toResourceId } : {}),
              ...(dto.toSeat ? { seat: dto.toSeat } : {}),
              version: { increment: 1 },
            },
          });
          if (dto.toSeat) {
            await tx.venueOrderLine.updateMany({
              where: { shopId, id: { in: selected.map((line) => line.id) } },
              data: { seat: dto.toSeat },
            });
          }
          if (dto.toResourceId) {
            await tx.restaurantOrderOps.updateMany({
              where: { shopId, orderId },
              data: {
                currentResourceId: dto.toResourceId,
                updatedById: actor.sub,
                version: { increment: 1 },
              },
            });
          }
        }
        await tx.restaurantTableTransfer.create({
          data: {
            shopId,
            orderId,
            fromResourceId: source.resourceId,
            toResourceId: dto.toResourceId,
            movedLineIds: selected.map((line) => line.id) as Prisma.InputJsonValue,
            fromSeat: dto.fromSeat,
            toSeat: dto.toSeat,
            actorUserId: actor.sub,
            reason: dto.reason,
          },
        });
        return {
          sourceOrderId: source.id,
          targetOrderId,
          movedLineIds: selected.map((line) => line.id),
        };
      },
    );
    await this.audit.record(actor, {
      section: 'operations',
      action: 'restaurant.table.transfer',
      summary: 'Transferred restaurant items while preserving KDS lineage',
      meta: result,
    });
    return result;
  }

  async combine(
    actor: JwtAccessPayload,
    sourceOrderId: string,
    targetOrderId: string,
    reason?: string,
  ) {
    const shopId = requireShopId(actor);
    if (sourceOrderId === targetOrderId) {
      throw new ConflictException('Source and target orders must differ.');
    }
    const result = await withTenantRls(
      this.prisma as unknown as PrismaClient,
      { shopId, mode: 'tenant' },
      async (tx) => {
        const [source, target] = await Promise.all([
          tx.venueOrder.findFirst({ where: { id: sourceOrderId, shopId } }),
          tx.venueOrder.findFirst({ where: { id: targetOrderId, shopId } }),
        ]);
        if (!source || !target) throw new NotFoundException('Source or target order not found.');
        this.assertNonTerminal(source.status);
        this.assertNonTerminal(target.status);
        if (
          source.guestCheckId &&
          target.guestCheckId &&
          source.guestCheckId !== target.guestCheckId
        ) {
          throw new ConflictException(
            'Orders on different GuestChecks cannot be combined implicitly.',
          );
        }
        const moved = await tx.venueOrderLine.findMany({
          where: { shopId, orderId: source.id, canceledAt: null },
        });
        if (!moved.length) throw new ConflictException('Source order has no active items.');
        const movedIds = moved.map((line) => line.id);
        await tx.venueOrderLine.updateMany({
          where: { shopId, id: { in: movedIds } },
          data: { orderId: target.id },
        });
        await tx.restaurantOrderLineOps.updateMany({
          where: { shopId, orderLineId: { in: movedIds } },
          data: { orderId: target.id, updatedById: actor.sub },
        });
        await this.reparentPrepLines(tx, shopId, source.id, target.id, movedIds, actor.sub);
        const targetLines = await tx.venueOrderLine.findMany({
          where: { shopId, orderId: target.id, canceledAt: null },
          select: { taxMinor: true, totalMinor: true },
        });
        await tx.venueOrder.update({
          where: { id: target.id },
          data: {
            ...this.sumStored(targetLines),
            guestCheckId: target.guestCheckId ?? source.guestCheckId,
            version: { increment: 1 },
          },
        });
        await tx.venueOrder.update({
          where: { id: source.id },
          data: {
            status: 'CANCELED',
            canceledAt: new Date(),
            subtotalMinor: 0,
            taxMinor: 0,
            totalMinor: 0,
            version: { increment: 1 },
          },
        });
        await tx.restaurantOrderOps.updateMany({
          where: { shopId, orderId: source.id },
          data: {
            lifecycle: RestaurantOrderLifecycle.CANCELLED,
            updatedById: actor.sub,
            version: { increment: 1 },
          },
        });
        await tx.restaurantTableTransfer.create({
          data: {
            shopId,
            orderId: source.id,
            fromResourceId: source.resourceId,
            toResourceId: target.resourceId,
            movedLineIds: movedIds as Prisma.InputJsonValue,
            actorUserId: actor.sub,
            reason: reason ?? 'TABLE_COMBINE',
          },
        });
        return { sourceOrderId, targetOrderId, movedLineIds: movedIds };
      },
    );
    await this.audit.record(actor, {
      section: 'operations',
      action: 'restaurant.table.combine',
      summary: 'Combined restaurant orders without implicitly merging financial authority',
      meta: result,
    });
    return result;
  }

  private async idempotent<T extends object>(
    tx: Tx,
    shopId: string,
    scope: string,
    key: string,
    payload: unknown,
    work: () => Promise<T>,
  ): Promise<T & { replayed?: boolean }> {
    const requestHash = createHash('sha256').update(this.canonicalJson(payload)).digest('hex');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`idem:${shopId}:${scope}:${key}`}))`;
    const existing = await tx.idempotencyReceipt.findUnique({
      where: { shopId_scope_key: { shopId, scope, key } },
    });
    if (existing) {
      if (existing.requestHash && existing.requestHash !== requestHash) {
        throw new ConflictException('Idempotency key was reused with a different request.');
      }
      if (existing.status === 'COMPLETED' && existing.responseJson) {
        return { ...(JSON.parse(existing.responseJson) as T), replayed: true };
      }
      throw new ConflictException('This idempotent operation is already in progress.');
    }
    const receipt = await tx.idempotencyReceipt.create({
      data: {
        shopId,
        scope,
        key,
        requestHash,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const result = await work();
    await tx.idempotencyReceipt.update({
      where: { id: receipt.id },
      data: { status: 'COMPLETED', responseJson: JSON.stringify(result) },
    });
    return result;
  }

  private async persistLines(
    tx: Tx,
    shopId: string,
    orderId: string,
    inputs: QrOrderLineDto[],
    priced: Awaited<ReturnType<OrderingPricingService['priceLine']>>[],
    actorUserId: string,
  ) {
    const lineIds: string[] = [];
    for (let index = 0; index < priced.length; index += 1) {
      const line = priced[index];
      const input = inputs[index];
      const created = await tx.venueOrderLine.create({
        data: {
          shopId,
          orderId,
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
          orderId,
          orderLineId: created.id,
          courseNumber: input.courseNumber ?? 1,
          fireState: RestaurantFireState.FIRED,
          firedAt: new Date(),
          updatedById: actorUserId,
        },
      });
      lineIds.push(created.id);
    }
    return lineIds;
  }

  private async routeLines(
    tx: Tx,
    shopId: string,
    orderId: string,
    lineIds: string[],
    actorUserId: string,
  ) {
    if (!lineIds.length) return;
    const lines = await tx.venueOrderLine.findMany({
      where: { shopId, orderId, id: { in: lineIds }, canceledAt: null },
    });
    const modifiers = await tx.orderLineModifier.findMany({
      where: { shopId, orderLineId: { in: lineIds } },
    });
    const presentations = await tx.restaurantMenuPresentation.findMany({
      where: { shopId, menuItemId: { in: [...new Set(lines.map((line) => line.menuItemId))] } },
    });
    const tickets = new Set<string>();
    for (const line of lines) {
      const key = this.routeKey(line.priceSnapshot);
      if (!key) continue;
      const route = await tx.prepRoute.findFirst({ where: { shopId, key, active: true } });
      if (!route) continue;
      const station = await tx.prepStation.findFirst({
        where: { id: route.stationId, shopId, active: true },
      });
      if (!station) continue;
      const ticket = await tx.prepTicket.upsert({
        where: { shopId_orderId_stationId: { shopId, orderId, stationId: station.id } },
        create: { shopId, orderId, stationId: station.id },
        update: {},
      });
      const presentation = presentations.find((row) => row.menuItemId === line.menuItemId);
      await tx.prepTicketLine.upsert({
        where: {
          shopId_orderLineId_stationId: {
            shopId,
            orderLineId: line.id,
            stationId: station.id,
          },
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
      await tx.prepTicketControl.upsert({
        where: { ticketId: ticket.id },
        create: { shopId, ticketId: ticket.id, firedAt: new Date() },
        update: { held: false, firedAt: new Date() },
      });
      await this.queuePrint(tx, shopId, ticket.id, station.id, line.id);
      tickets.add(ticket.id);
    }
    if (tickets.size) {
      await tx.venueOrder.updateMany({
        where: { id: orderId, shopId, status: 'OPEN' },
        data: { status: 'SENT', version: { increment: 1 } },
      });
      for (const ticketId of tickets) {
        await tx.prepStatusEvent.create({
          data: {
            shopId,
            ticketId,
            toStatus: 'NEW',
            actorUserId,
            reason: 'PHASE6_FIRE',
          },
        });
      }
    }
  }

  private async queuePrint(
    tx: Tx,
    shopId: string,
    ticketId: string,
    stationId: string,
    lineId: string,
  ) {
    const route = await tx.restaurantPrinterRoute.findFirst({
      where: { shopId, stationId, active: true },
    });
    if (!route) return;
    const dedupKey = `ticket:${ticketId}:line:${lineId}`;
    const existing = await tx.restaurantPrinterJob.findUnique({
      where: { shopId_dedupKey: { shopId, dedupKey } },
    });
    if (existing) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`printer:${shopId}:${route.printerKey}`}))`;
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
  }

  private async reparentPrepLines(
    tx: Tx,
    shopId: string,
    sourceOrderId: string,
    targetOrderId: string,
    lineIds: string[],
    actorUserId: string,
  ) {
    const prepLines = await tx.prepTicketLine.findMany({
      where: { shopId, orderLineId: { in: lineIds } },
    });
    for (const prepLine of prepLines) {
      const targetTicket = await tx.prepTicket.upsert({
        where: {
          shopId_orderId_stationId: {
            shopId,
            orderId: targetOrderId,
            stationId: prepLine.stationId,
          },
        },
        create: { shopId, orderId: targetOrderId, stationId: prepLine.stationId },
        update: {},
      });
      await tx.prepTicketLine.update({
        where: { id: prepLine.id },
        data: { ticketId: targetTicket.id },
      });
      await tx.prepStatusEvent.create({
        data: {
          shopId,
          ticketId: targetTicket.id,
          lineId: prepLine.id,
          fromStatus: prepLine.status,
          toStatus: prepLine.status,
          actorUserId,
          reason: 'TABLE_TRANSFER',
        },
      });
    }
    const sourceTickets = await tx.prepTicket.findMany({
      where: { shopId, orderId: sourceOrderId },
    });
    for (const ticket of sourceTickets) {
      const remaining = await tx.prepTicketLine.count({ where: { shopId, ticketId: ticket.id } });
      if (!remaining && !['COLLECTED', 'CANCELED'].includes(ticket.status)) {
        await tx.prepTicket.update({
          where: { id: ticket.id },
          data: { status: 'CANCELED', canceledAt: new Date() },
        });
        await tx.prepStatusEvent.create({
          data: {
            shopId,
            ticketId: ticket.id,
            fromStatus: ticket.status,
            toStatus: 'CANCELED',
            actorUserId,
            reason: 'TABLE_TRANSFER_EMPTY_SOURCE',
          },
        });
      }
    }
  }

  private async assertAvailability(
    tx: Tx,
    shopId: string,
    serviceMode: string,
    input: QrOrderLineDto,
  ) {
    const item = await tx.menuItem.findFirst({ where: { id: input.menuItemId, shopId } });
    if (!item || !item.isAvailable) throw new ConflictException('Menu item is unavailable.');
    if (item.trackStock && item.stock < input.quantity) {
      throw new ConflictException('Menu item has insufficient stock.');
    }
    const policy = await tx.menuServiceModePolicy.findUnique({
      where: {
        shopId_menuItemId_serviceMode: {
          shopId,
          menuItemId: input.menuItemId,
          serviceMode,
        },
      },
    });
    if (policy && !policy.enabled) {
      throw new ConflictException('Menu item is unavailable for this service mode.');
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

  private async assertCheckMutable(tx: Tx, shopId: string, guestCheckId: string | null) {
    if (!guestCheckId) return;
    const check = await tx.guestCheck.findFirst({
      where: { id: guestCheckId, shopId, status: 'OPEN' },
      select: { currentSettlementId: true },
    });
    if (!check) throw new ConflictException('GuestCheck is no longer open.');
    if (!check.currentSettlementId) return;
    const paid = await tx.checkSettlement.findFirst({
      where: {
        id: check.currentSettlementId,
        shopId,
        guestCheckId,
        payments: { some: { status: 'SUCCESS' } },
      },
      select: { id: true },
    });
    if (paid) throw new ConflictException('A paid GuestCheck cannot accept new items.');
  }

  private async lockQrToken(tx: Tx, payload: QrPayload, token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const row = await tx.qrTableOrderToken.findFirst({
      where: { tokenHash, shopId: payload.s, resourceId: payload.r },
    });
    if (!row) throw new ForbiddenException('Table token not found.');
    await tx.$executeRaw`SELECT 1 FROM "QrTableOrderToken" WHERE "id"=${row.id} FOR UPDATE`;
    const locked = await tx.qrTableOrderToken.findUnique({ where: { id: row.id } });
    if (
      !locked ||
      locked.revokedAt ||
      locked.expiresAt.getTime() <= Date.now() ||
      locked.expiresAt.getTime() !== payload.e ||
      locked.useCount >= locked.maxUses
    ) {
      throw new ForbiddenException('Table token is revoked, expired, or exhausted.');
    }
    return locked;
  }

  private verifyQrToken(token: string): QrPayload {
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) throw new ForbiddenException('Invalid table token.');
    const expected = createHmac('sha256', this.qrSecret()).update(encoded).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new ForbiddenException('Invalid table token signature.');
    }
    let payload: QrPayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as QrPayload;
    } catch {
      throw new ForbiddenException('Invalid table token payload.');
    }
    if (
      payload.v !== 1 ||
      !payload.s ||
      !payload.r ||
      !Number.isFinite(payload.e) ||
      payload.e <= Date.now()
    ) {
      throw new ForbiddenException('Table token is expired or malformed.');
    }
    return payload;
  }

  private qrSecret() {
    const secret = this.config.get<string>('QR_ORDER_TOKEN_SECRET')?.trim();
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException('QR ordering is not configured.');
    }
    return secret;
  }

  private requireIdempotencyKey(value: string | undefined) {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 200) {
      throw new ConflictException('Idempotency-Key must contain 8-200 characters.');
    }
    return key;
  }

  private assertNonTerminal(status: string) {
    if (['CANCELED', 'COMPLETED', 'REFUNDED'].includes(status)) {
      throw new ConflictException('Terminal order cannot be moved or combined.');
    }
  }

  private availabilityMode(serviceMode: string) {
    if (serviceMode === 'TAKEAWAY') return 'TAKEAWAY';
    if (serviceMode === 'QUICK_SALE') return 'BAR';
    return 'DINE_IN';
  }

  private sumPriced(lines: { subtotalMinor: number; taxMinor: number }[]) {
    const subtotalMinor = lines.reduce((sum, line) => sum + line.subtotalMinor, 0);
    const taxMinor = lines.reduce((sum, line) => sum + line.taxMinor, 0);
    return { subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor };
  }

  private sumStored(lines: { taxMinor: number; totalMinor: number }[]) {
    const taxMinor = lines.reduce((sum, line) => sum + line.taxMinor, 0);
    const totalMinor = lines.reduce((sum, line) => sum + line.totalMinor, 0);
    return { subtotalMinor: totalMinor - taxMinor, taxMinor, totalMinor };
  }

  private routeKey(snapshot: Prisma.JsonValue) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
    const value = (snapshot as Prisma.JsonObject).prepRouteKey;
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((entry) => this.canonicalJson(entry)).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.canonicalJson(record[key])}`)
      .join(',')}}`;
  }
}

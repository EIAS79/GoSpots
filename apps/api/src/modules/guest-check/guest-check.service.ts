import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { GuestCheck, GuestCheckStatus, Prisma } from '@prisma/client';
import { computeGuestCheckRunningTotal } from '../../common/guest-check-total.util';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import type { JwtAccessPayload } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AttachGuestCheckDto,
  CreateGuestCheckDto,
  DetachGuestCheckDto,
  UpdateGuestCheckDto,
} from './dto/guest-check.dto';

const childInclude = {
  shopOrders: {
    select: {
      id: true,
      status: true,
      total: true,
      label: true,
      reservationFee: true,
      guestCount: true,
      createdAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
  playSessions: {
    select: {
      id: true,
      status: true,
      amount: true,
      reservationId: true,
      label: true,
      startedAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
  reservations: {
    select: {
      id: true,
      guestName: true,
      billedAmount: true,
      billedAt: true,
      resourceId: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
    orderBy: { startsAt: 'desc' as const },
  },
} satisfies Prisma.GuestCheckInclude;

type CheckWithChildren = Prisma.GuestCheckGetPayload<{
  include: typeof childInclude;
}>;

@Injectable()
export class GuestCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assert(actor: JwtAccessPayload, perm: string) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (
      hasPermission(
        actor.perms ?? '',
        perm as (typeof PERMISSIONS)[keyof typeof PERMISSIONS],
      )
    ) {
      return;
    }
    throw new ForbiddenException(`Missing ${perm}`);
  }

  private serialize(check: CheckWithChildren) {
    const totals = computeGuestCheckRunningTotal({
      orders: check.shopOrders,
      playSessions: check.playSessions,
      reservations: check.reservations,
    });
    return {
      id: check.id,
      shopId: check.shopId,
      status: check.status,
      guestName: check.guestName,
      guestEmail: check.guestEmail,
      guestPhone: check.guestPhone,
      partySize: check.partySize,
      label: check.label,
      note: check.note,
      currency: check.currency,
      paymentMethod: check.paymentMethod,
      openedAt: check.openedAt.toISOString(),
      settledAt: check.settledAt?.toISOString() ?? null,
      voidedAt: check.voidedAt?.toISOString() ?? null,
      createdById: check.createdById,
      createdAt: check.createdAt.toISOString(),
      updatedAt: check.updatedAt.toISOString(),
      shopOrders: check.shopOrders.map((o) => ({
        id: o.id,
        status: o.status,
        total: o.total.toFixed(4),
        label: o.label,
        reservationFee: o.reservationFee?.toFixed(4) ?? null,
        guestCount: o.guestCount,
        createdAt: o.createdAt.toISOString(),
        completedAt: o.completedAt?.toISOString() ?? null,
      })),
      playSessions: check.playSessions.map((p) => ({
        id: p.id,
        status: p.status,
        amount: p.amount.toFixed(4),
        reservationId: p.reservationId,
        label: p.label,
        startedAt: p.startedAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
      })),
      reservations: check.reservations.map((r) => ({
        id: r.id,
        guestName: r.guestName,
        billedAmount: r.billedAmount?.toFixed(4) ?? null,
        billedAt: r.billedAt?.toISOString() ?? null,
        resourceId: r.resourceId,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        status: r.status,
      })),
      runningTotal: totals.runningTotal,
      menuTotal: totals.menuTotal,
      playTotal: totals.playTotal,
      reservationTotal: totals.reservationTotal,
      totalLines: totals.lines,
    };
  }

  private async loadCheck(shopId: string, id: string): Promise<CheckWithChildren> {
    const check = await this.prisma.guestCheck.findFirst({
      where: { id, shopId },
      include: childInclude,
    });
    if (!check) throw new NotFoundException('Guest check not found');
    return check;
  }

  private assertOpen(check: Pick<GuestCheck, 'status'>) {
    if (check.status !== 'OPEN') {
      throw new ConflictException('Guest check is not open');
    }
  }

  private requireAttachTarget(dto: AttachGuestCheckDto | DetachGuestCheckDto) {
    if (!dto.shopOrderId && !dto.playSessionId && !dto.reservationId) {
      throw new BadRequestException(
        'Provide shopOrderId, playSessionId, or reservationId',
      );
    }
  }

  async list(
    actor: JwtAccessPayload,
    status: GuestCheckStatus | 'ALL' = 'OPEN',
  ) {
    this.assert(actor, PERMISSIONS.TRANSACTION_READ);
    const shopId = requireShopId(actor);
    const where: Prisma.GuestCheckWhereInput = { shopId };
    if (status !== 'ALL') where.status = status;
    const rows = await this.prisma.guestCheck.findMany({
      where,
      include: childInclude,
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
    return {
      checks: rows.map((c) => this.serialize(c)),
      canWrite:
        actor.shopRole === 'OWNER' ||
        hasPermission(actor.perms ?? '', PERMISSIONS.TRANSACTION_WRITE),
    };
  }

  async get(actor: JwtAccessPayload, id: string) {
    this.assert(actor, PERMISSIONS.TRANSACTION_READ);
    const shopId = requireShopId(actor);
    return this.serialize(await this.loadCheck(shopId, id));
  }

  async create(actor: JwtAccessPayload, dto: CreateGuestCheckDto) {
    this.assert(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    const shop = await this.prisma.shop.findFirst({
      where: { id: shopId },
      select: { currency: true },
    });
    if (!shop) throw new NotFoundException('Shop not found');

    const created = await this.prisma.guestCheck.create({
      data: {
        shopId,
        guestName: dto.guestName?.trim() || null,
        guestEmail: dto.guestEmail?.trim() || null,
        guestPhone: dto.guestPhone?.trim() || null,
        partySize: dto.partySize ?? 1,
        label: dto.label?.trim() || null,
        note: dto.note?.trim() || null,
        currency: shop.currency,
        createdById: actor.sub,
      },
      include: childInclude,
    });

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.create',
      summary: `Opened guest check${created.label ? ` (${created.label})` : ''}`,
      meta: { guestCheckId: created.id },
    });

    return this.serialize(created);
  }

  async update(actor: JwtAccessPayload, id: string, dto: UpdateGuestCheckDto) {
    this.assert(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    const existing = await this.loadCheck(shopId, id);
    this.assertOpen(existing);

    await this.prisma.guestCheck.updateMany({
      where: { id, shopId, status: 'OPEN' },
      data: {
        ...(dto.guestName !== undefined
          ? { guestName: dto.guestName?.trim() || null }
          : {}),
        ...(dto.guestEmail !== undefined
          ? { guestEmail: dto.guestEmail?.trim() || null }
          : {}),
        ...(dto.guestPhone !== undefined
          ? { guestPhone: dto.guestPhone?.trim() || null }
          : {}),
        ...(dto.partySize !== undefined ? { partySize: dto.partySize } : {}),
        ...(dto.label !== undefined
          ? { label: dto.label?.trim() || null }
          : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
      },
    });

    return this.serialize(await this.loadCheck(shopId, id));
  }

  async void(actor: JwtAccessPayload, id: string) {
    this.assert(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    const existing = await this.loadCheck(shopId, id);
    this.assertOpen(existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.shopOrder.updateMany({
        where: { guestCheckId: id, shopId },
        data: { guestCheckId: null },
      });
      await tx.playSession.updateMany({
        where: { guestCheckId: id, shopId },
        data: { guestCheckId: null },
      });
      await tx.reservation.updateMany({
        where: { guestCheckId: id, shopId },
        data: { guestCheckId: null },
      });
      await tx.guestCheck.updateMany({
        where: { id, shopId, status: 'OPEN' },
        data: { status: 'VOID', voidedAt: new Date() },
      });
      return tx.guestCheck.findFirst({
        where: { id, shopId },
        include: childInclude,
      });
    });

    if (!updated) throw new NotFoundException('Guest check not found');

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.void',
      summary: 'Voided guest check (children detached)',
      meta: { guestCheckId: id },
    });

    return this.serialize(updated);
  }

  async attach(actor: JwtAccessPayload, id: string, dto: AttachGuestCheckDto) {
    this.assert(actor, PERMISSIONS.TRANSACTION_WRITE);
    this.requireAttachTarget(dto);
    const shopId = requireShopId(actor);
    const check = await this.loadCheck(shopId, id);
    this.assertOpen(check);

    if (dto.shopOrderId) {
      const order = await this.prisma.shopOrder.findFirst({
        where: { id: dto.shopOrderId, shopId },
        select: { id: true, guestCheckId: true },
      });
      if (!order) throw new NotFoundException('Shop order not found');
      if (order.guestCheckId && order.guestCheckId !== id) {
        throw new ConflictException('Shop order already attached to another check');
      }
      await this.prisma.shopOrder.updateMany({
        where: { id: order.id, shopId },
        data: { guestCheckId: id },
      });
    }

    if (dto.playSessionId) {
      const play = await this.prisma.playSession.findFirst({
        where: { id: dto.playSessionId, shopId },
        select: { id: true, guestCheckId: true },
      });
      if (!play) throw new NotFoundException('Play session not found');
      if (play.guestCheckId && play.guestCheckId !== id) {
        throw new ConflictException(
          'Play session already attached to another check',
        );
      }
      await this.prisma.playSession.updateMany({
        where: { id: play.id, shopId },
        data: { guestCheckId: id },
      });
    }

    if (dto.reservationId) {
      const reservation = await this.prisma.reservation.findFirst({
        where: { id: dto.reservationId, shopId },
        select: { id: true, guestCheckId: true },
      });
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (reservation.guestCheckId && reservation.guestCheckId !== id) {
        throw new ConflictException(
          'Reservation already attached to another check',
        );
      }
      await this.prisma.reservation.updateMany({
        where: { id: reservation.id, shopId },
        data: { guestCheckId: id },
      });
    }

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.attach',
      summary: 'Attached child to guest check',
      meta: {
        guestCheckId: id,
        shopOrderId: dto.shopOrderId ?? null,
        playSessionId: dto.playSessionId ?? null,
        reservationId: dto.reservationId ?? null,
      },
    });

    return this.serialize(await this.loadCheck(shopId, id));
  }

  async detach(actor: JwtAccessPayload, id: string, dto: DetachGuestCheckDto) {
    this.assert(actor, PERMISSIONS.TRANSACTION_WRITE);
    this.requireAttachTarget(dto);
    const shopId = requireShopId(actor);
    const check = await this.loadCheck(shopId, id);
    this.assertOpen(check);

    if (dto.shopOrderId) {
      const result = await this.prisma.shopOrder.updateMany({
        where: { id: dto.shopOrderId, shopId, guestCheckId: id },
        data: { guestCheckId: null },
      });
      if (result.count === 0) {
        throw new NotFoundException('Shop order not attached to this check');
      }
    }
    if (dto.playSessionId) {
      const result = await this.prisma.playSession.updateMany({
        where: { id: dto.playSessionId, shopId, guestCheckId: id },
        data: { guestCheckId: null },
      });
      if (result.count === 0) {
        throw new NotFoundException('Play session not attached to this check');
      }
    }
    if (dto.reservationId) {
      const result = await this.prisma.reservation.updateMany({
        where: { id: dto.reservationId, shopId, guestCheckId: id },
        data: { guestCheckId: null },
      });
      if (result.count === 0) {
        throw new NotFoundException('Reservation not attached to this check');
      }
    }

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.detach',
      summary: 'Detached child from guest check',
      meta: {
        guestCheckId: id,
        shopOrderId: dto.shopOrderId ?? null,
        playSessionId: dto.playSessionId ?? null,
        reservationId: dto.reservationId ?? null,
      },
    });

    return this.serialize(await this.loadCheck(shopId, id));
  }
}

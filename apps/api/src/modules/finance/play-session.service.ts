import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assertNoReservationOverlap,
  assertNoWalkInOverlap,
  assertResourceBookable,
} from '../../common/booking-overlap.util';
import { withResourceBookingLock } from '../../common/booking-lock.util';
import { loadShopCurrency } from '../../common/currency-stamp.util';
import { postWalkInPlaySessionPaid } from '../../common/ledger-post.util';
import { applyBillingDiscount } from '../../common/play-billing.util';
import {
  serializeMoney,
  toMoneyNumber,
  type MoneyInput,
} from '../../common/money.util';
import { assertWithinOpeningHours } from '../../common/opening-hours.util';
import { requireShopId } from '../../common/tenant';
import { walkInEffectiveEnd } from '../../common/walk-in-block.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreatePlaySessionDto,
  UpdatePlaySessionDto,
} from './dto/play-sessions.dto';
import {
  assertFinancePerm,
  requireFinanceFeature,
} from './finance-guard.util';
import { PlayBillingService } from './play-billing.service';
import type { PlaySessionStatus, Prisma } from '@prisma/client';

@Injectable()
export class PlaySessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly playBilling: PlayBillingService,
  ) {}

  private serializePlaySession<T extends { amount: MoneyInput }>(session: T) {
    return { ...session, amount: serializeMoney(session.amount) };
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
    assertFinancePerm(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
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
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
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
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
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
      const mapped = this.playBilling.mapWalkInBillingRow(row, now);
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

    return this.playBilling.mapWalkInBillingRow(updated, now);
  }

  async cancelPlaySession(actor: JwtAccessPayload, id: string) {
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');

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
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
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

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ACTIVE_RESERVATION } from '../../common/booking-floor-status';
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
import { loadShopCurrency } from '../../common/currency-stamp.util';
import { postReservationBilled } from '../../common/ledger-post.util';
import {
  addMoney,
  serializeMoney,
  serializeMoneyOrNull,
  toMoneyNumber,
  type MoneyInput,
} from '../../common/money.util';
import {
  applyBillingDiscount,
  classifyPlayBillingRow,
  classifyWalkInBillingRow,
  computePlayBillingAmount,
} from '../../common/play-billing.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CancelPlayBillingDto,
  MarkPlayBillingPaidDto,
  UpdatePlayBillingDto,
  type PlayBillingTabDto,
} from './dto/play-billing.dto';
import {
  assertFinancePerm,
  requireFinanceFeature,
} from './finance-guard.util';
import {
  ReservationStatus,
  ResourceStatus,
  type BookingMode,
  type Prisma,
  type ResourceType,
} from '@prisma/client';

/** Default list window when client omits from/to (matches web `defaultPlayBillingRange`). */
const PLAY_BILLING_DEFAULT_WINDOW_DAYS = 30;
/**
 * Upper bound per source for merged pagination: page N may need up to pageSize×N rows
 * from a single source after merge-sort by session start.
 */
const PLAY_BILLING_MAX_PER_SOURCE = 500;
/** Cap rows per source when aggregating summary money totals in the active window/tab. */
const PLAY_BILLING_SUMMARY_MONEY_CAP = 500;

type PlayBillingListTab = PlayBillingTabDto | 'all';

function playBillingEndOfDay(d: Date): Date {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end;
}

function playBillingDaysAgo(days: number, from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class PlayBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  mapPlayBillingRow(
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

  /** Shared with play-session pay mapping (facade still on FinanceService). */
  mapWalkInBillingRow(
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

  /**
   * Date window for list queries. When the client omits from/to we default to the last
   * 30 days (web panel default). The in-progress tab intentionally omits dates on the
   * client — active sessions are small and filtered by live bucket predicates instead.
   */
  private resolvePlayBillingDateRange(
    opts: {
      from?: string;
      to?: string;
      tab?: PlayBillingTabDto;
    },
    now: Date,
  ): Prisma.DateTimeFilter | undefined {
    if (opts.from || opts.to) {
      const range: Prisma.DateTimeFilter = {};
      if (opts.from) range.gte = new Date(opts.from);
      if (opts.to) range.lte = playBillingEndOfDay(new Date(opts.to));
      return range;
    }
    if (opts.tab === 'in_progress') {
      return undefined;
    }
    return {
      gte: playBillingDaysAgo(PLAY_BILLING_DEFAULT_WINDOW_DAYS, now),
      lte: playBillingEndOfDay(now),
    };
  }

  private playBillingListFetchLimit(pageSize: number, page: number): number {
    return Math.min(
      Math.max(pageSize * page, pageSize),
      PLAY_BILLING_MAX_PER_SOURCE,
    );
  }

  private reservationPlayBillingBaseWhere(
    shopId: string,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.ReservationWhereInput {
    const where: Prisma.ReservationWhereInput = {
      shopId,
      resourceId: { not: null },
      status: { notIn: ['CANCELED', 'NO_SHOW'] },
    };
    if (dateRange) {
      where.startsAt = dateRange;
    }
    return where;
  }

  private walkInPlayBillingBaseWhere(
    shopId: string,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.PlaySessionWhereInput {
    const where: Prisma.PlaySessionWhereInput = {
      shopId,
      reservationId: null,
      status: { not: 'CANCELED' },
      archivedAt: null,
    };
    if (dateRange) {
      where.startedAt = dateRange;
    }
    return where;
  }

  /** SQL predicates aligned with `classifyPlayBillingRow` for list/count push-down. */
  private reservationPlayBillingTabWhere(
    tab: PlayBillingListTab,
    now: Date,
  ): Prisma.ReservationWhereInput {
    switch (tab) {
      case 'in_progress':
        return { startsAt: { lte: now }, endsAt: { gt: now } };
      case 'paid':
        return {
          billedAt: { not: null },
          startsAt: { lte: now },
          endsAt: { lte: now },
        };
      case 'awaiting_payment':
        return {
          billedAt: null,
          startsAt: { lte: now },
          endsAt: { lte: now },
        };
      case 'all':
        return { startsAt: { lte: now } };
    }
  }

  /**
   * Walk-ins need JS bucket refinement because a planned duration is stored as
   * `startedAt + durationMinutes`; Prisma cannot express that column arithmetic in a
   * portable where clause. These predicates are therefore supersets and
   * `mergePlayBillingItems` performs the authoritative classification.
   */
  private walkInPlayBillingTabWhere(
    tab: PlayBillingListTab,
    _now: Date,
  ): Prisma.PlaySessionWhereInput {
    switch (tab) {
      case 'in_progress':
      case 'awaiting_payment':
        return { status: 'ACTIVE' };
      case 'paid':
        return {
          OR: [{ status: 'COMPLETED' }, { completedAt: { not: null } }],
        };
      case 'all':
        return {};
    }
  }

  private playBillingReservationListInclude() {
    return {
      resource: {
        include: {
          category: {
            include: { rates: { orderBy: { sortOrder: 'asc' as const } } },
          },
        },
      },
    } as const;
  }

  private mergePlayBillingItems(
    reservationRows: Parameters<PlayBillingService['mapPlayBillingRow']>[0][],
    walkInRows: Parameters<PlayBillingService['mapWalkInBillingRow']>[0][],
    now: Date,
    tab: PlayBillingListTab,
  ) {
    const bookingItems = reservationRows
      .map((r) => this.mapPlayBillingRow(r, now))
      .filter((x): x is NonNullable<typeof x> => x != null);
    const walkInItems = walkInRows
      .map((r) => this.mapWalkInBillingRow(r, now))
      .filter((x): x is NonNullable<typeof x> => x != null);

    const merged = [...bookingItems, ...walkInItems].sort(
      (a, b) =>
        new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );

    return tab === 'all'
      ? merged.filter((i) => i.bucket != null)
      : merged.filter((i) => i.bucket === tab);
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
    assertFinancePerm(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    const now = new Date();
    const pageSize = Math.min(Math.max(opts.pageSize ?? 10, 1), 100);
    const page = Math.max(opts.page ?? 1, 1);
    const tab: PlayBillingListTab = opts.tab ?? 'all';
    const dateRange = this.resolvePlayBillingDateRange(opts, now);
    const fetchLimit = this.playBillingListFetchLimit(pageSize, page);
    const listTake = Math.min(
      Math.max(fetchLimit, PLAY_BILLING_SUMMARY_MONEY_CAP),
      PLAY_BILLING_MAX_PER_SOURCE,
    );

    const reservationWhere: Prisma.ReservationWhereInput = {
      AND: [
        this.reservationPlayBillingBaseWhere(shopId, dateRange),
        this.reservationPlayBillingTabWhere(tab, now),
      ],
    };
    const walkInWhere: Prisma.PlaySessionWhereInput = {
      AND: [
        this.walkInPlayBillingBaseWhere(shopId, dateRange),
        this.walkInPlayBillingTabWhere(tab, now),
      ],
    };

    const reservationInclude = this.playBillingReservationListInclude();
    const walkInInclude = this.walkInBillingInclude();

    const summaryDateRange = dateRange;
    const summaryReservationBase =
      this.reservationPlayBillingBaseWhere(shopId, summaryDateRange);
    const summaryWalkInBase =
      this.walkInPlayBillingBaseWhere(shopId, summaryDateRange);

    const [
      reservationRows,
      walkInRows,
      summaryInProgressRes,
      summaryAwaitingRes,
      summaryPaidRes,
      summaryActiveWalkIns,
      summaryCompletedWalkIns,
    ] = await Promise.all([
      this.prisma.reservation.findMany({
        where: reservationWhere,
        include: reservationInclude,
        orderBy: { startsAt: 'desc' },
        take: listTake,
      }),
      this.prisma.playSession.findMany({
        where: walkInWhere,
        include: walkInInclude,
        orderBy: { startedAt: 'desc' },
        take: listTake,
      }),
      this.prisma.reservation.count({
        where: {
          AND: [
            summaryReservationBase,
            this.reservationPlayBillingTabWhere('in_progress', now),
          ],
        },
      }),
      this.prisma.reservation.count({
        where: {
          AND: [
            summaryReservationBase,
            this.reservationPlayBillingTabWhere('awaiting_payment', now),
          ],
        },
      }),
      this.prisma.reservation.count({
        where: {
          AND: [
            summaryReservationBase,
            this.reservationPlayBillingTabWhere('paid', now),
          ],
        },
      }),
      this.prisma.playSession.findMany({
        where: {
          AND: [summaryWalkInBase, { status: 'ACTIVE' }],
        },
        select: {
          status: true,
          completedAt: true,
          startedAt: true,
          endedAt: true,
          durationMinutes: true,
        },
      }),
      this.prisma.playSession.count({
        where: {
          AND: [summaryWalkInBase, { status: 'COMPLETED' }],
        },
      }),
    ]);

    const activeWalkInBuckets = summaryActiveWalkIns.map((row) =>
      classifyWalkInBillingRow(
        row.status,
        row.completedAt,
        row.startedAt,
        row.endedAt,
        row.durationMinutes,
        now,
      ),
    );
    const summaryInProgressWi = activeWalkInBuckets.filter(
      (bucket) => bucket === 'in_progress',
    ).length;
    const summaryAwaitingWi = activeWalkInBuckets.filter(
      (bucket) => bucket === 'awaiting_payment',
    ).length;
    const summaryPaidWi =
      summaryCompletedWalkIns +
      activeWalkInBuckets.filter((bucket) => bucket === 'paid').length;

    const filtered = this.mergePlayBillingItems(
      reservationRows,
      walkInRows,
      now,
      tab,
    );

    // SQL is only a candidate query for walk-ins. The mapped bucket is authoritative,
    // so totals/pagination must be based on the exact same filtered collection that is
    // rendered. This prevents `total: 1` with `items: []` after a timed walk-in expires.
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
        inProgress: summaryInProgressRes + summaryInProgressWi,
        awaitingPayment: summaryAwaitingRes + summaryAwaitingWi,
        paid: summaryPaidRes + summaryPaidWi,
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
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
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
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
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
    assertFinancePerm(actor, 'transaction.write');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
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

  private walkInBillingInclude() {
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
}

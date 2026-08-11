import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { listOpeningWindows } from '../../common/opening-hours.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { clipSeconds } from './growth.rules';

const ANALYTICS_SOURCE_VERSION = 'growth-analytics-v2-ledger-2026-08-11';

@Injectable()
export class GrowthAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(actor: JwtAccessPayload, from: Date, to: Date) {
    this.assertRange(from, to);
    const [finance, operations, guests] = await Promise.all([
      this.finance(actor, from, to),
      this.operations(actor, from, to),
      this.guests(actor, from, to),
    ]);
    return {
      from,
      to,
      sourceVersion: ANALYTICS_SOURCE_VERSION,
      cards: {
        netSettledRevenueByCurrency: Object.fromEntries(
          finance.currencies.map((row) => [
            row.currency,
            row.netSettledRevenueMinor,
          ]),
        ),
        resourceUtilizationPct: operations.resources.utilizationPct,
        repeatVisitRatePct: guests.repeatVisits.ratePct,
        acquisitionToSettledVisitPct: guests.acquisition.overall.ratePct,
        kdsSlaPct: operations.kds.slaPct,
      },
      alerts: [
        ...finance.currencies
          .filter((row) => row.reconciliationVarianceMinor !== 0)
          .map((row) => ({
            kind: 'FINANCE_RECONCILIATION',
            currency: row.currency,
            varianceMinor: row.reconciliationVarianceMinor,
          })),
        ...(operations.resources.utilizationPct != null &&
        operations.resources.utilizationPct > 100
          ? [
              {
                kind: 'RESOURCE_UTILIZATION_OVER_100',
                utilizationPct: operations.resources.utilizationPct,
              },
            ]
          : []),
      ],
      finance,
      operations,
      guests,
    };
  }

  async finance(actor: JwtAccessPayload, from: Date, to: Date) {
    this.assertRange(from, to);
    const shopId = requireShopId(actor);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    const [ledger, payments, refunds, snapshotsRaw, tips, movements, punches] =
      await Promise.all([
        this.prisma.ledgerEntry.findMany({
          where: { shopId, occurredAt: { gte: from, lt: to } },
          orderBy: { occurredAt: 'asc' },
        }),
        this.prisma.payment.findMany({
          where: {
            shopId,
            status: 'SUCCESS',
            succeededAt: { gte: from, lt: to },
          },
        }),
        this.prisma.refund.findMany({
          where: {
            shopId,
            state: 'SUCCEEDED',
            succeededAt: { gte: from, lt: to },
          },
        }),
        this.prisma.pricingSnapshot.findMany({
          where: { shopId, createdAt: { gte: from, lt: to } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.tipLedgerEntry.findMany({
          where: { shopId, createdAt: { gte: from, lt: to } },
        }),
        this.prisma.stockMovement.findMany({
          where: {
            shopId,
            occurredAt: { gte: from, lt: to },
            kind: { in: ['SALE_CONSUMPTION', 'SALE_REVERSAL'] },
          },
        }),
        this.prisma.timePunch.findMany({
          where: {
            shopId,
            startedAt: { lt: to },
            OR: [{ endedAt: null }, { endedAt: { gt: from } }],
          },
        }),
      ]);

    const breaks = punches.length
      ? await this.prisma.breakRecord.findMany({
          where: {
            shopId,
            timePunchId: { in: punches.map((punch) => punch.id) },
            paid: false,
            startedAt: { lt: to },
            OR: [{ endedAt: null }, { endedAt: { gt: from } }],
          },
        })
      : [];

    const latestSnapshots = new Map<string, (typeof snapshotsRaw)[number]>();
    for (const snapshot of snapshotsRaw) {
      latestSnapshots.set(`${snapshot.sourceType}:${snapshot.sourceId}`, snapshot);
    }
    const snapshots = [...latestSnapshots.values()];

    const currencies = new Set<string>([
      shop?.currency ?? 'EUR',
      ...ledger.map((row) => row.currency),
      ...payments.map((row) => row.currency),
      ...refunds.map((row) => row.currency),
      ...snapshots.map((row) => row.currency),
      ...tips.map((row) => row.currency),
      ...punches.map((row) => row.currency),
    ]);

    const rows = [...currencies].sort().map((currency) => {
      const ledgerRows = ledger.filter((row) => row.currency === currency);
      const ledgerGrossMinor = ledgerRows
        .filter((row) => row.kind === 'SALE')
        .reduce(
          (sum, row) => sum + Math.abs(this.decimalToMinor(row.amount)),
          0,
        );
      const ledgerRefundMinor = ledgerRows
        .filter((row) => row.kind === 'REFUND')
        .reduce(
          (sum, row) => sum + Math.abs(this.decimalToMinor(row.amount)),
          0,
        );
      const netSettledRevenueMinor = ledgerGrossMinor - ledgerRefundMinor;

      const providerGrossMinor = payments
        .filter((payment) => payment.currency === currency)
        .reduce(
          (sum, payment) => sum + this.decimalToMinor(payment.amount),
          0,
        );
      const providerRefundMinor = refunds
        .filter((refund) => refund.currency === currency)
        .reduce(
          (sum, refund) => sum + this.decimalToMinor(refund.amount),
          0,
        );
      const providerNetMinor = providerGrossMinor - providerRefundMinor;

      const pricingRows = snapshots.filter(
        (snapshot) => snapshot.currency === currency,
      );
      const discountMinor = pricingRows.reduce(
        (sum, snapshot) => sum + snapshot.discountMinor,
        0,
      );
      const tipMinor = tips
        .filter((tip) => tip.currency === currency)
        .reduce((sum, tip) => sum + tip.amountMinor, 0);

      const cogsMinor =
        currency === (shop?.currency ?? 'EUR')
          ? movements.reduce((sum, movement) => {
              if (movement.kind === 'SALE_REVERSAL') {
                return sum - Math.abs(movement.totalCostMinor);
              }
              return sum + Math.abs(movement.totalCostMinor);
            }, 0)
          : 0;
      const labor = punches.filter((punch) => punch.currency === currency);
      const laborCostMinor = labor.reduce((sum, punch) => {
        const grossSeconds = clipSeconds(
          punch.startedAt,
          punch.endedAt ?? to,
          from,
          to,
        );
        const unpaidSeconds = breaks
          .filter((row) => row.timePunchId === punch.id)
          .reduce(
            (breakSum, row) =>
              breakSum +
              clipSeconds(row.startedAt, row.endedAt ?? to, from, to),
            0,
          );
        return (
          sum +
          Math.round(
            (Math.max(0, grossSeconds - unpaidSeconds) *
              punch.hourlyRateMinor) /
              3600,
          )
        );
      }, 0);
      const contributionMinor =
        netSettledRevenueMinor - cogsMinor - laborCostMinor;
      return {
        currency,
        ledgerGrossMinor,
        ledgerRefundMinor,
        netSettledRevenueMinor,
        providerGrossMinor,
        providerRefundMinor,
        providerNetMinor,
        reconciliationVarianceMinor:
          netSettledRevenueMinor - providerNetMinor,
        reconciliationOk: netSettledRevenueMinor === providerNetMinor,
        discountMinor,
        tipMinor,
        cogsMinor,
        laborCostMinor,
        laborPct:
          netSettledRevenueMinor > 0
            ? (laborCostMinor / netSettledRevenueMinor) * 100
            : null,
        contributionMinor,
        contributionMarginPct:
          netSettledRevenueMinor > 0
            ? (contributionMinor / netSettledRevenueMinor) * 100
            : null,
        pricingSnapshotCount: pricingRows.length,
      };
    });

    const workedSeconds = punches.reduce((sum, punch) => {
      const grossSeconds = clipSeconds(
        punch.startedAt,
        punch.endedAt ?? to,
        from,
        to,
      );
      const unpaidSeconds = breaks
        .filter((row) => row.timePunchId === punch.id)
        .reduce(
          (breakSum, row) =>
            breakSum +
            clipSeconds(row.startedAt, row.endedAt ?? to, from, to),
          0,
        );
      return sum + Math.max(0, grossSeconds - unpaidSeconds);
    }, 0);

    return {
      from,
      to,
      sourceOfTruth: 'LedgerEntry',
      sourceVersion: ANALYTICS_SOURCE_VERSION,
      currencies: rows,
      ledgerEntryCount: ledger.length,
      providerPaymentCount: payments.length,
      providerRefundCount: refunds.length,
      workedSeconds,
      tipLedgerEntryCount: tips.length,
      latestPricingSnapshotCount: snapshots.length,
      reconciliation: {
        ok: rows.every((row) => row.reconciliationOk),
        byCurrency: Object.fromEntries(
          rows.map((row) => [row.currency, row.reconciliationVarianceMinor]),
        ),
      },
    };
  }

  async operations(actor: JwtAccessPayload, from: Date, to: Date) {
    this.assertRange(from, to);
    const shopId = requireShopId(actor);
    const [
      resources,
      windows,
      sessions,
      maintenance,
      reservations,
      waitlist,
      tickets,
      stations,
    ] = await Promise.all([
      this.prisma.resource.findMany({
        where: { shopId },
        select: { id: true, name: true, type: true, categoryId: true },
      }),
      listOpeningWindows(this.prisma, shopId, from, to),
      this.prisma.operationsSession.findMany({
        where: {
          shopId,
          startedAt: { lt: to },
          OR: [{ finishedAt: null }, { finishedAt: { gt: from } }],
        },
      }),
      this.prisma.resourceMaintenancePeriod.findMany({
        where: {
          shopId,
          startsAt: { lt: to },
          OR: [{ endsAt: null }, { endsAt: { gt: from } }],
        },
      }),
      this.prisma.reservation.findMany({
        where: { shopId, startsAt: { gte: from, lt: to } },
      }),
      this.prisma.reservationWaitlistEntry.findMany({
        where: {
          shopId,
          OR: [
            { createdAt: { gte: from, lt: to } },
            { offeredAt: { gte: from, lt: to } },
          ],
        },
      }),
      this.prisma.prepTicket.findMany({
        where: {
          shopId,
          readyAt: { gte: from, lt: to },
          canceledAt: null,
        },
      }),
      this.prisma.prepStation.findMany({ where: { shopId } }),
    ]);

    const pauses = sessions.length
      ? await this.prisma.operationsSessionPause.findMany({
          where: {
            shopId,
            sessionId: { in: sessions.map((session) => session.id) },
            startedAt: { lt: to },
            OR: [{ endedAt: null }, { endedAt: { gt: from } }],
          },
        })
      : [];

    const resourceRows = resources.map((resource) => {
      const maintenanceRows = maintenance.filter(
        (period) => period.resourceId === resource.id,
      );
      const resourceSessions = sessions.filter(
        (session) => session.resourceId === resource.id,
      );
      const openSeconds = windows.reduce(
        (sum, window) =>
          sum + clipSeconds(window.opensAt, window.closesAt, from, to),
        0,
      );
      const maintenanceSeconds = this.coveredSeconds(
        maintenanceRows.map((period) => ({
          start: period.startsAt,
          end: period.endsAt ?? to,
        })),
        windows.map((window) => ({
          start: window.opensAt,
          end: window.closesAt,
        })),
        from,
        to,
      );
      const availableSeconds = Math.max(0, openSeconds - maintenanceSeconds);
      const occupiedSeconds = resourceSessions.reduce((sum, session) => {
        const gross = clipSeconds(
          session.startedAt,
          session.finishedAt ?? to,
          from,
          to,
        );
        const paused = pauses
          .filter((pause) => pause.sessionId === session.id)
          .reduce(
            (pauseSum, pause) =>
              pauseSum +
              clipSeconds(pause.startedAt, pause.endedAt ?? to, from, to),
            0,
          );
        return sum + Math.max(0, gross - paused);
      }, 0);
      return {
        resourceId: resource.id,
        resourceName: resource.name,
        resourceType: resource.type,
        categoryId: resource.categoryId,
        availableMinutes: availableSeconds / 60,
        occupiedMinutes: occupiedSeconds / 60,
        utilizationPct:
          availableSeconds > 0
            ? (occupiedSeconds / availableSeconds) * 100
            : null,
        sessionCount: resourceSessions.length,
        accruedResourceRevenueMinor: resourceSessions.reduce(
          (sum, session) => sum + session.accruedMinor,
          0,
        ),
      };
    });
    const availableMinutes = resourceRows.reduce(
      (sum, row) => sum + row.availableMinutes,
      0,
    );
    const occupiedMinutes = resourceRows.reduce(
      (sum, row) => sum + row.occupiedMinutes,
      0,
    );
    const accruedResourceRevenueMinor = resourceRows.reduce(
      (sum, row) => sum + row.accruedResourceRevenueMinor,
      0,
    );

    const sessionGuestCheckIds = [
      ...new Set(
        sessions.flatMap((session) =>
          session.guestCheckId ? [session.guestCheckId] : [],
        ),
      ),
    ];
    const activityChecks: Array<{ id: string; partySize: number }> =
      sessionGuestCheckIds.length
        ? await this.prisma.guestCheck.findMany({
            where: { shopId, id: { in: sessionGuestCheckIds } },
            select: { id: true, partySize: true },
          })
        : [];
    const venueOrderWhere: Prisma.VenueOrderWhereInput = {
      shopId,
      status: 'COMPLETED',
      completedAt: { gte: from, lt: to },
      OR: [
        ...(sessions.length
          ? [
              {
                operationsSessionId: {
                  in: sessions.map((session) => session.id),
                },
              },
            ]
          : []),
        ...(sessionGuestCheckIds.length
          ? [{ guestCheckId: { in: sessionGuestCheckIds } }]
          : []),
      ],
    };
    const venueOrders: Array<{ id: string }> =
      venueOrderWhere.OR?.length
        ? await this.prisma.venueOrder.findMany({
            where: venueOrderWhere,
            select: { id: true },
          })
        : [];
    const orderLines: Array<{ quantity: number }> = venueOrders.length
      ? await this.prisma.venueOrderLine.findMany({
          where: {
            shopId,
            orderId: { in: venueOrders.map((order) => order.id) },
            canceledAt: null,
          },
          select: { quantity: true },
        })
      : [];
    const players = activityChecks.reduce(
      (sum, check) => sum + Math.max(1, check.partySize),
      0,
    );
    const menuQuantity = orderLines.reduce(
      (sum, line) => sum + line.quantity,
      0,
    );

    const stationById = new Map(
      stations.map((station) => [station.id, station]),
    );
    const prepDurations = tickets
      .filter((ticket) => ticket.readyAt != null)
      .map((ticket) => ({
        seconds: Math.max(
          0,
          Math.floor(
            (ticket.readyAt!.getTime() -
              (ticket.startedAt ?? ticket.openedAt).getTime()) /
              1000,
          ),
        ),
        targetSeconds:
          stationById.get(ticket.stationId)?.targetSeconds ?? 600,
      }));
    const slaMet = prepDurations.filter(
      (duration) => duration.seconds <= duration.targetSeconds,
    ).length;

    const byStatus = Object.fromEntries(
      [...new Set(reservations.map((reservation) => reservation.status))].map(
        (status) => [
          status,
          reservations.filter((reservation) => reservation.status === status)
            .length,
        ],
      ),
    );
    const finalizedReservations = reservations.filter(
      (reservation) => reservation.startsAt < new Date(),
    );
    const noShows = finalizedReservations.filter(
      (reservation) => reservation.status === 'NO_SHOW',
    ).length;
    const offeredWaitlist = waitlist.filter(
      (entry) => entry.offeredAt != null,
    );
    const claimedWaitlist = offeredWaitlist.filter((entry) =>
      ['CLAIMED', 'CONVERTED'].includes(entry.status),
    ).length;

    return {
      from,
      to,
      sourceVersion: ANALYTICS_SOURCE_VERSION,
      resources: {
        resourceCount: resources.length,
        availableMinutes,
        occupiedMinutes,
        utilizationPct:
          availableMinutes > 0
            ? (occupiedMinutes / availableMinutes) * 100
            : null,
        accruedResourceRevenueMinor,
        revPahAccruedMinor:
          availableMinutes > 0
            ? accruedResourceRevenueMinor / (availableMinutes / 60)
            : null,
        rows: resourceRows,
      },
      menuAttachment: {
        activityGuestCheckCount: activityChecks.length,
        players,
        menuQuantity,
        quantityPerPlayer: players > 0 ? menuQuantity / players : null,
      },
      reservations: {
        count: reservations.length,
        byStatus,
        noShowRatePct:
          finalizedReservations.length > 0
            ? (noShows / finalizedReservations.length) * 100
            : null,
        waitlistClaimRatePct:
          offeredWaitlist.length > 0
            ? (claimedWaitlist / offeredWaitlist.length) * 100
            : null,
      },
      kds: {
        completedTicketCount: prepDurations.length,
        averagePrepSeconds:
          prepDurations.length > 0
            ? Math.round(
                prepDurations.reduce(
                  (sum, duration) => sum + duration.seconds,
                  0,
                ) / prepDurations.length,
              )
            : null,
        slaMetCount: slaMet,
        slaPct:
          prepDurations.length > 0
            ? (slaMet / prepDurations.length) * 100
            : null,
      },
    };
  }

  async guests(actor: JwtAccessPayload, from: Date, to: Date) {
    this.assertRange(from, to);
    const shopId = requireShopId(actor);
    const [visits, loyaltyAll, storedAll, evidence, applications, snapshots] =
      await Promise.all([
        this.prisma.customerVisit.findMany({
          where: { shopId, completedAt: { gte: from, lt: to } },
          orderBy: { completedAt: 'asc' },
        }),
        this.prisma.loyaltyLedgerEntry.findMany({
          where: { shopId, createdAt: { lt: to } },
        }),
        this.prisma.storedValueLedgerEntry.findMany({
          where: { shopId, createdAt: { lt: to } },
        }),
        this.prisma.reservationBookingEvidence.findMany({
          where: { shopId, createdAt: { gte: from, lt: to } },
        }),
        this.prisma.ruleApplication.findMany({
          where: { shopId, createdAt: { gte: from, lt: to } },
        }),
        this.prisma.pricingSnapshot.findMany({
          where: { shopId, createdAt: { gte: from, lt: to } },
        }),
      ]);

    const customerIds = [...new Set(visits.map((visit) => visit.customerId))];
    const priorVisits = customerIds.length
      ? await this.prisma.customerVisit.findMany({
          where: {
            shopId,
            customerId: { in: customerIds },
            completedAt: { lt: from },
          },
          select: { customerId: true },
        })
      : [];
    const priorCustomerIds = new Set(
      priorVisits.map((visit) => visit.customerId),
    );
    const repeatCustomers = customerIds.filter((id) =>
      priorCustomerIds.has(id),
    );

    const reservationIds = evidence.map((row) => row.reservationId);
    const reservations = reservationIds.length
      ? await this.prisma.reservation.findMany({
          where: { shopId, id: { in: reservationIds } },
          select: {
            id: true,
            status: true,
            billedAmount: true,
            guestCheckId: true,
          },
        })
      : [];
    const guestCheckIds = [
      ...new Set(
        reservations.flatMap((reservation) =>
          reservation.guestCheckId ? [reservation.guestCheckId] : [],
        ),
      ),
    ];
    const settledChecks = guestCheckIds.length
      ? await this.prisma.guestCheck.findMany({
          where: {
            shopId,
            id: { in: guestCheckIds },
            status: 'SETTLED',
          },
          select: { id: true },
        })
      : [];
    const settledCheckIds = new Set(settledChecks.map((check) => check.id));
    const visitByReservation = new Map(
      visits
        .filter((visit) => visit.reservationId != null)
        .map((visit) => [visit.reservationId!, visit]),
    );

    const acquisitionByChannel = new Map<
      string,
      { touches: number; settledVisits: number; revenueMinor: number }
    >();
    for (const row of evidence) {
      if (['STAFF', 'EVENT'].includes(row.sourceChannel)) continue;
      const bucket = acquisitionByChannel.get(row.sourceChannel) ?? {
        touches: 0,
        settledVisits: 0,
        revenueMinor: 0,
      };
      bucket.touches += 1;
      const reservation = reservations.find(
        (item) => item.id === row.reservationId,
      );
      const visit = visitByReservation.get(row.reservationId);
      const settled =
        Boolean(visit) ||
        Boolean(
          reservation?.guestCheckId &&
            settledCheckIds.has(reservation.guestCheckId),
        ) ||
        Boolean(
          reservation?.status === 'COMPLETED' &&
            reservation.billedAmount != null,
        );
      if (settled) {
        bucket.settledVisits += 1;
        bucket.revenueMinor +=
          visit?.settledAmountMinor ??
          (reservation?.billedAmount
            ? this.decimalToMinor(reservation.billedAmount)
            : 0);
      }
      acquisitionByChannel.set(row.sourceChannel, bucket);
    }
    const channelRows = [...acquisitionByChannel.entries()].map(
      ([channel, bucket]) => ({
        channel,
        ...bucket,
        ratePct:
          bucket.touches > 0
            ? (bucket.settledVisits / bucket.touches) * 100
            : null,
      }),
    );
    const acquisitionTotal = channelRows.reduce(
      (acc, row) => ({
        touches: acc.touches + row.touches,
        settledVisits: acc.settledVisits + row.settledVisits,
        revenueMinor: acc.revenueMinor + row.revenueMinor,
      }),
      { touches: 0, settledVisits: 0, revenueMinor: 0 },
    );

    const snapshotById = new Map(
      snapshots.map((snapshot) => [snapshot.id, snapshot]),
    );
    const promotionGroups = new Map<
      string,
      {
        promotionId: string;
        applications: number;
        discountMinor: number;
        attributedRevenueMinor: number;
        directPackageCostMinor: number;
      }
    >();
    for (const application of applications) {
      const bucket = promotionGroups.get(application.promotionId) ?? {
        promotionId: application.promotionId,
        applications: 0,
        discountMinor: 0,
        attributedRevenueMinor: 0,
        directPackageCostMinor: 0,
      };
      bucket.applications += 1;
      bucket.discountMinor += application.discountMinor;
      const snapshot = application.pricingSnapshotId
        ? snapshotById.get(application.pricingSnapshotId)
        : undefined;
      if (snapshot) {
        bucket.attributedRevenueMinor += snapshot.totalMinor;
        bucket.directPackageCostMinor += this.packageCostFromRules(
          snapshot.rules,
        );
      }
      promotionGroups.set(application.promotionId, bucket);
    }
    const promotionProfitability = [...promotionGroups.values()].map(
      (bucket) => ({
        ...bucket,
        partialContributionMinor:
          bucket.attributedRevenueMinor -
          bucket.discountMinor -
          bucket.directPackageCostMinor,
        costCoverage:
          'pricing+package-direct-cost; COGS/labor only when separately attributed',
      }),
    );

    const storedByCurrency = new Map<string, number>();
    for (const row of storedAll) {
      storedByCurrency.set(
        row.currency,
        (storedByCurrency.get(row.currency) ?? 0) + row.amountMinor,
      );
    }

    return {
      from,
      to,
      sourceVersion: ANALYTICS_SOURCE_VERSION,
      visits: {
        completedVisitCount: visits.length,
        identifiedCustomerCount: customerIds.length,
      },
      repeatVisits: {
        repeatCustomerCount: repeatCustomers.length,
        eligibleCustomerCount: customerIds.length,
        ratePct:
          customerIds.length > 0
            ? (repeatCustomers.length / customerIds.length) * 100
            : null,
      },
      loyalty: {
        outstandingPoints: loyaltyAll.reduce(
          (sum, row) => sum + row.points,
          0,
        ),
      },
      storedValue: {
        liabilityByCurrency: Object.fromEntries(storedByCurrency),
      },
      acquisition: {
        channels: channelRows,
        overall: {
          ...acquisitionTotal,
          ratePct:
            acquisitionTotal.touches > 0
              ? (acquisitionTotal.settledVisits /
                  acquisitionTotal.touches) *
                100
              : null,
        },
      },
      promotions: {
        rows: promotionProfitability,
      },
    };
  }

  async rebuildFacts(actor: JwtAccessPayload, from: Date, to: Date) {
    this.assertRange(from, to);
    const shopId = requireShopId(actor);
    const [finance, operations, guests] = await Promise.all([
      this.finance(actor, from, to),
      this.operations(actor, from, to),
      this.guests(actor, from, to),
    ]);
    const currency =
      finance.currencies.length === 1
        ? finance.currencies[0]!.currency
        : null;
    const facts = [
      {
        factKind: 'RANGE_FINANCE',
        dimensionKey: 'shop',
        currency,
        measures: finance,
      },
      {
        factKind: 'RANGE_OPERATIONS',
        dimensionKey: 'shop',
        currency: null,
        measures: operations,
      },
      {
        factKind: 'RANGE_GUESTS',
        dimensionKey: 'shop',
        currency: null,
        measures: guests,
      },
    ];

    return this.prisma.$transaction(async (tx) => {
      const stored = [];
      for (const fact of facts) {
        const dimensionKey = `${fact.dimensionKey}:currency=${fact.currency ?? 'N/A'}`;
        const existing = await tx.analyticsFact.findFirst({
          where: {
            shopId,
            factKind: fact.factKind,
            bucketStart: from,
            bucketEnd: to,
            dimensionKey,
          },
        });
        const row = existing
          ? await tx.analyticsFact.update({
              where: { id: existing.id },
              data: {
                currency: fact.currency,
                measures:
                  fact.measures as unknown as Prisma.InputJsonValue,
                sourceVersion: ANALYTICS_SOURCE_VERSION,
                rebuiltAt: new Date(),
              },
            })
          : await tx.analyticsFact.create({
              data: {
                shopId,
                factKind: fact.factKind,
                bucketStart: from,
                bucketEnd: to,
                dimensionKey,
                currency: fact.currency,
                measures:
                  fact.measures as unknown as Prisma.InputJsonValue,
                sourceVersion: ANALYTICS_SOURCE_VERSION,
              },
            });
        stored.push(row);
      }
      return { sourceVersion: ANALYTICS_SOURCE_VERSION, facts: stored };
    });
  }

  private coveredSeconds(
    blocked: Array<{ start: Date; end: Date }>,
    availability: Array<{ start: Date; end: Date }>,
    from: Date,
    to: Date,
  ) {
    const clipped: Array<{ start: number; end: number }> = [];
    for (const block of blocked) {
      for (const open of availability) {
        const start = Math.max(
          block.start.getTime(),
          open.start.getTime(),
          from.getTime(),
        );
        const end = Math.min(
          block.end.getTime(),
          open.end.getTime(),
          to.getTime(),
        );
        if (end > start) clipped.push({ start, end });
      }
    }
    clipped.sort((a, b) => a.start - b.start || a.end - b.end);
    let totalMs = 0;
    let current: { start: number; end: number } | null = null;
    for (const interval of clipped) {
      if (!current) {
        current = { ...interval };
        continue;
      }
      if (interval.start <= current.end) {
        current.end = Math.max(current.end, interval.end);
      } else {
        totalMs += current.end - current.start;
        current = { ...interval };
      }
    }
    if (current) totalMs += current.end - current.start;
    return Math.floor(totalMs / 1000);
  }

  private packageCostFromRules(value: Prisma.JsonValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
    const record = value as Record<string, Prisma.JsonValue>;
    const cost = Number(record.packageCostMinor ?? 0);
    return Number.isFinite(cost) ? Math.max(0, Math.round(cost)) : 0;
  }

  private assertRange(from: Date, to: Date) {
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to <= from
    ) {
      throw new BadRequestException('Analytics end must be after start.');
    }
    if (to.getTime() - from.getTime() > 370 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Interactive Analytics 2.0 ranges are limited to 370 days.',
      );
    }
  }

  private decimalToMinor(value: { toString(): string }) {
    return Math.round(Number(value.toString()) * 100);
  }
}

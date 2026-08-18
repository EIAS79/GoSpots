import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import { Phase10AccountabilityService } from './phase10-accountability.service';
import { WorkforceService } from './workforce.service';

type WorkforceReport = {
  rows: Array<{
    membershipId: string;
    laborCostMinor?: number;
  }>;
};

/**
 * Phase 10 staff-performance projection. This service only derives metrics from
 * canonical operational/workforce/cash/KDS facts; it never writes or invents a
 * second financial total.
 */
@Injectable()
export class Phase10PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountability: Phase10AccountabilityService,
    private readonly workforce: WorkforceService,
  ) {}

  async performance(actor: JwtAccessPayload, days = 30) {
    const boundedDays = Math.min(Math.max(1, Math.trunc(days)), 366);
    const base = await this.accountability.performance(actor, boundedDays);
    const shopId = requireShopId(actor);
    const since = new Date(Date.now() - boundedDays * 86_400_000);
    const now = new Date();
    if (!base.length) return base;

    const membershipIds = base.map((row) => row.membershipId);
    const memberships = await this.prisma.membership.findMany({
      where: { shopId, id: { in: membershipIds } },
      select: { id: true, userId: true },
    });
    const membershipByUser = new Map(
      memberships.map((row) => [row.userId, row.id]),
    );
    const userIds = memberships.map((row) => row.userId);

    const [resourceSessions, cashSessions, kdsReadyEvents, shop, workforceReport] =
      await Promise.all([
        this.prisma.operationsSession.findMany({
          where: {
            shopId,
            startedAt: { gte: since },
            createdById: { in: userIds },
          },
          select: { createdById: true },
        }),
        this.prisma.cashSession.findMany({
          where: {
            shopId,
            closedAt: { gte: since },
            closedById: { in: userIds },
            variance: { not: null },
          },
          select: { closedById: true, variance: true },
        }),
        this.prisma.prepStatusEvent.findMany({
          where: {
            shopId,
            createdAt: { gte: since },
            actorUserId: { in: userIds },
            toStatus: 'READY',
          },
          select: { actorUserId: true, ticketId: true, createdAt: true },
        }),
        this.prisma.shop.findUnique({
          where: { id: shopId },
          select: { currency: true },
        }),
        this.workforce.report(actor, since, now) as Promise<WorkforceReport>,
      ]);

    const ticketIds = [...new Set(kdsReadyEvents.map((event) => event.ticketId))];
    const tickets = ticketIds.length
      ? await this.prisma.prepTicket.findMany({
          where: { shopId, id: { in: ticketIds } },
          select: { id: true, openedAt: true, startedAt: true },
        })
      : [];
    const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));

    const sessionCounts = new Map<string, number>();
    for (const row of resourceSessions) {
      const membershipId = membershipByUser.get(row.createdById);
      if (membershipId) {
        sessionCounts.set(membershipId, (sessionCounts.get(membershipId) ?? 0) + 1);
      }
    }

    const cashVarianceByMembership = new Map<string, Prisma.Decimal>();
    const cashVarianceCloseCount = new Map<string, number>();
    for (const row of cashSessions) {
      const membershipId = row.closedById
        ? membershipByUser.get(row.closedById)
        : undefined;
      if (!membershipId || row.variance == null) continue;
      const current = cashVarianceByMembership.get(membershipId) ?? new Prisma.Decimal(0);
      cashVarianceByMembership.set(membershipId, current.plus(row.variance));
      cashVarianceCloseCount.set(
        membershipId,
        (cashVarianceCloseCount.get(membershipId) ?? 0) + 1,
      );
    }

    const kdsDurations = new Map<string, number[]>();
    for (const event of kdsReadyEvents) {
      const membershipId = membershipByUser.get(event.actorUserId);
      const ticket = ticketById.get(event.ticketId);
      if (!membershipId || !ticket) continue;
      const start = ticket.startedAt ?? ticket.openedAt;
      const seconds = Math.max(
        0,
        Math.floor((event.createdAt.getTime() - start.getTime()) / 1000),
      );
      const values = kdsDurations.get(membershipId) ?? [];
      values.push(seconds);
      kdsDurations.set(membershipId, values);
    }

    const laborCostByMembership = new Map(
      workforceReport.rows.map((row) => [row.membershipId, row.laborCostMinor]),
    );
    const maySeeLaborCost = actor.shopRole === 'OWNER';

    return base.map((row) => {
      const durations = kdsDurations.get(row.membershipId) ?? [];
      const kdsAverageReadySeconds = durations.length
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null;
      const laborCostMinor = maySeeLaborCost
        ? (laborCostByMembership.get(row.membershipId) ?? 0)
        : null;
      const laborToSalesBasisPoints =
        laborCostMinor != null && row.salesMinor > 0
          ? Number(
              (BigInt(laborCostMinor) * 10_000n + BigInt(row.salesMinor) / 2n) /
                BigInt(row.salesMinor),
            )
          : null;

      return {
        ...row,
        resourceSessionCount: sessionCounts.get(row.membershipId) ?? 0,
        cashVariance: (
          cashVarianceByMembership.get(row.membershipId) ?? new Prisma.Decimal(0)
        ).toFixed(4),
        cashVarianceCurrency: shop?.currency ?? null,
        cashVarianceCloseCount: cashVarianceCloseCount.get(row.membershipId) ?? 0,
        laborCostMinor,
        laborToSalesBasisPoints,
        kdsReadyCount: durations.length,
        kdsAverageReadySeconds,
        serviceTimingSeconds: kdsAverageReadySeconds,
      };
    });
  }
}
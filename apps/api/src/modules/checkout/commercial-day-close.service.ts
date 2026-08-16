import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CloseCommercialDayDto } from './dto/phase4-commercial.dto';

@Injectable()
export class CommercialDayCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertCanClose(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.CASH_CLOSE)) return;
    throw new ForbiddenException(`Missing ${PERMISSIONS.CASH_CLOSE}`);
  }

  async guard(actor: JwtAccessPayload) {
    this.assertCanClose(actor);
    const shopId = requireShopId(actor);
    const [policy, openChecks] = await Promise.all([
      this.prisma.commercialPolicy.upsert({
        where: { shopId },
        create: { shopId },
        update: {},
      }),
      this.prisma.guestCheck.findMany({
        where: { shopId, status: 'OPEN' },
        select: { id: true, label: true, guestName: true, openedAt: true },
        orderBy: { openedAt: 'asc' },
        take: 200,
      }),
    ]);
    const manager = actor.shopRole === 'OWNER' || actor.shopRole === 'MANAGER';
    return {
      allowed:
        openChecks.length === 0 ||
        policy.allowCashShiftCloseWithOpenTabs ||
        manager,
      openTabCount: openChecks.length,
      policyAllowsOpenTabs: policy.allowCashShiftCloseWithOpenTabs,
      managerOverrideAvailable:
        openChecks.length > 0 &&
        !policy.allowCashShiftCloseWithOpenTabs &&
        manager,
      openChecks,
    };
  }

  async close(actor: JwtAccessPayload, dto: CloseCommercialDayDto) {
    this.assertCanClose(actor);
    const shopId = requireShopId(actor);
    const manager = actor.shopRole === 'OWNER' || actor.shopRole === 'MANAGER';

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Shop" WHERE "id"=${shopId} FOR UPDATE`,
      );
      const existing = await tx.commercialDayClose.findUnique({
        where: {
          shopId_businessDate: { shopId, businessDate: dto.businessDate },
        },
      });
      if (existing) return { row: existing, replay: true };

      const [policy, openChecks] = await Promise.all([
        tx.commercialPolicy.upsert({
          where: { shopId },
          create: { shopId },
          update: {},
        }),
        tx.guestCheck.findMany({
          where: { shopId, status: 'OPEN' },
          select: { id: true },
          orderBy: { openedAt: 'asc' },
        }),
      ]);

      const hasOpenTabs = openChecks.length > 0;
      const policyOverride = policy.allowCashShiftCloseWithOpenTabs;
      const managerOverride = hasOpenTabs && !policyOverride && manager;
      if (hasOpenTabs && !policyOverride && !manager) {
        throw new ConflictException(
          'Commercial day close is blocked by unresolved GuestChecks',
        );
      }
      if (managerOverride && !dto.reason?.trim()) {
        throw new BadRequestException(
          'Manager override requires a reason when unresolved GuestChecks remain',
        );
      }

      const row = await tx.commercialDayClose.create({
        data: {
          shopId,
          businessDate: dto.businessDate,
          openTabCount: openChecks.length,
          overrideUsed: hasOpenTabs,
          overrideReason: hasOpenTabs
            ? dto.reason?.trim() || 'VENUE_POLICY_ALLOW_OPEN_TABS'
            : null,
          closedById: actor.sub,
        },
      });
      return { row, replay: false };
    });

    if (!result.replay) {
      await this.audit.record(actor, {
        section: 'finance',
        action: 'commercial.day-close',
        summary: result.row.overrideUsed
          ? 'Closed commercial day with explicit unresolved-tab override'
          : 'Closed commercial day with no unresolved tabs',
        meta: {
          businessDate: result.row.businessDate,
          openTabCount: result.row.openTabCount,
          overrideUsed: result.row.overrideUsed,
          overrideReason: result.row.overrideReason,
        },
      });
    }

    return {
      id: result.row.id,
      businessDate: result.row.businessDate,
      openTabCount: result.row.openTabCount,
      overrideUsed: result.row.overrideUsed,
      overrideReason: result.row.overrideReason,
      closedAt: result.row.closedAt.toISOString(),
      replay: result.replay,
    };
  }
}

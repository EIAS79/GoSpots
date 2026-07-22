import { Injectable } from '@nestjs/common';
import { serializeMoney } from '../../common/money.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import {
  aggregateTopItems,
  buildFinanceAnalytics,
} from './finance-analytics.util';
import {
  assertFinancePerm,
  requireFinanceFeature,
} from './finance-guard.util';

@Injectable()
export class FinanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async salesByItem(actor: JwtAccessPayload, days = 30) {
    assertFinancePerm(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'reports');
    const since = new Date(Date.now() - days * 86400000);
    const merged = await aggregateTopItems(this.prisma, shopId, since, 50);
    await this.audit.record(actor, {
      section: 'reports',
      action: 'reports.sales_by_item',
      summary: `Generated sales-by-item report (${days} days)`,
      meta: { days, rowCount: merged.length },
    });
    return merged.map((row) => ({
      ...row,
      revenue: serializeMoney(row.revenue),
    }));
  }

  async getFinanceAnalytics(actor: JwtAccessPayload, days = 30) {
    assertFinancePerm(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'reports');
    return buildFinanceAnalytics(this.prisma, shopId, days);
  }

  async getTopSellers(actor: JwtAccessPayload, days = 30, limit = 10) {
    assertFinancePerm(actor, 'transaction.read');
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'reports');
    const since = new Date(Date.now() - days * 86400000);
    const rows = await aggregateTopItems(this.prisma, shopId, since, limit);
    return rows.map((row) => ({
      ...row,
      revenue: serializeMoney(row.revenue),
    }));
  }
}

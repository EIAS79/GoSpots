import { BadRequestException, Injectable } from '@nestjs/common';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CapabilityService } from '../foundation/capability.service';
import { Phase14AnalyticsService } from '../growth/phase14-analytics.service';
import type { DeterministicInsightsDto } from './dto/deterministic-insights.dto';

type Insight = {
  type: string;
  severity: 'INFO' | 'OPPORTUNITY' | 'WARNING' | 'CRITICAL';
  title: string;
  summary: string;
  evidence: {
    metric: string;
    period: { fromDate: string; toDate: string };
    value: unknown;
    comparison: unknown;
    dataScope: { shopId: string; source: string; tenantScoped: true };
    relevantEntities: Array<{ type: string; id: string | null }>;
    limitations: string[];
  };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
}
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function str(value: unknown): string { return typeof value === 'string' ? value : ''; }

@Injectable()
export class Phase15DeterministicInsightsService {
  constructor(
    private readonly analytics: Phase14AnalyticsService,
    private readonly capabilities: CapabilityService,
  ) {}

  async generate(actor: JwtAccessPayload, dto: DeterministicInsightsDto) {
    if (!actor.shopId) throw new BadRequestException('Venue context is required.');
    const capability = await this.capabilities.snapshot(actor.shopId);
    if (!capability.canUseAiInsights) throw new BadRequestException('AI insights capability is unavailable for this venue.');

    const current = record(await this.analytics.workspace(actor, dto.fromDate, dto.toDate));
    const resources = record(current.resources);
    const inventory = record(current.inventory);
    const reservations = record(current.reservations);
    const restaurant = record(current.restaurant);
    const financial = record(current.financial);
    const attention = record(current.attention);
    const out: Insight[] = [];
    const make = (type: string, severity: Insight['severity'], title: string, summary: string, metric: string, value: unknown, comparison: unknown, limitations: string[], relevantEntities: Insight['evidence']['relevantEntities'] = []): Insight => ({
      type, severity, title, summary,
      evidence: { metric, period: { fromDate: dto.fromDate, toDate: dto.toDate }, value, comparison, dataScope: { shopId: actor.shopId!, source: 'Phase14AnalyticsService/canonical domain facts', tenantScoped: true }, relevantEntities, limitations },
    });

    const utilization = num(resources.utilizationPct);
    if (utilization != null && utilization < 50) out.push(make('LOW_RESOURCE_UTILIZATION', utilization < 30 ? 'WARNING' : 'OPPORTUNITY', 'Resource utilization is below target', `Measured utilization is ${utilization}%.`, 'resource.utilizationPct', utilization, { thresholdPct: 50 }, ['Threshold is a deterministic attention threshold, not an AI forecast.']));

    const variance = record(inventory.variance);
    const varianceCost = num(variance.costMinor) ?? 0;
    const varianceQty = num(variance.quantityMilli) ?? 0;
    if (varianceCost !== 0 || varianceQty !== 0) out.push(make('STOCK_VARIANCE', Math.abs(varianceCost) >= 10_000 ? 'WARNING' : 'OPPORTUNITY', 'Inventory variance needs review', 'Stocktake/adjustment variance is non-zero in the selected period.', 'inventory.variance', variance, null, ['Variance comes from immutable stock movement facts.']));

    const noShow = num(reservations.noShowRatePct);
    if (noShow != null && noShow >= 15) out.push(make('NO_SHOW_RATE_RISING', noShow >= 30 ? 'WARNING' : 'OPPORTUNITY', 'Reservation no-show rate is elevated', `Measured no-show rate is ${noShow}%.`, 'reservation.noShowRatePct', noShow, { thresholdPct: 15 }, ['This flags the current period; a rising trend requires an explicit comparison period.']));

    const kds = record(restaurant.kds);
    const sla = num(kds.slaPct);
    if (sla != null && sla < 80) out.push(make('KDS_PREP_DEGRADATION', sla < 60 ? 'WARNING' : 'OPPORTUNITY', 'KDS preparation performance needs review', `Measured KDS SLA attainment is ${sla}%.`, 'restaurant.kds.slaPct', sla, { thresholdPct: 80 }, ['Measured KDS workflow facts only; no causal claim is made.']));

    const attentionItems = rows(attention.items);
    const deviceIssues = attentionItems.filter((item) => /DEVICE|OFFLINE_DEVICE/i.test(`${str(item.domain)} ${str(item.title)} ${str(item.detail)}`));
    if (deviceIssues.length) out.push(make('DEVICE_OUTAGE', 'WARNING', 'Device outages need attention', `${deviceIssues.length} device-related attention item(s) are open.`, 'attention.deviceIssues', deviceIssues.length, null, ['This reports open evidence-backed attention items; repeated historical outage frequency needs dedicated device event history.'], deviceIssues.map((item) => ({ type: 'ATTENTION', id: str(item.id) || null }))));

    const currencies = rows(financial.currencies);
    const refunds = currencies.reduce((sum, row) => sum + (num(row.refundsMinor) ?? 0), 0);
    const netSales = currencies.reduce((sum, row) => sum + (num(row.netSalesMinor) ?? 0), 0);
    const refundRate = netSales + refunds > 0 ? Math.round((refunds / (netSales + refunds)) * 10_000) / 100 : null;
    if (refundRate != null && refundRate >= 5) out.push(make('REFUND_RATE_ELEVATED', refundRate >= 10 ? 'WARNING' : 'OPPORTUNITY', 'Refund rate is elevated', `Refunds are ${refundRate}% of net sales plus refunds for this period.`, 'financial.refundRatePct', refundRate, { thresholdPct: 5 }, ['This is a deterministic ratio from canonical finance facts; it does not infer staff intent or fraud.']));

    if (dto.compareFromDate && dto.compareToDate) {
      const previous = record(await this.analytics.workspace(actor, dto.compareFromDate, dto.compareToDate));
      const previousRows = rows(record(previous.financial).currencies);
      const comparison = currencies.map((row) => {
        const currency = str(row.currency);
        const currentNet = num(row.netSalesMinor) ?? 0;
        const previousNet = num(previousRows.find((item) => str(item.currency) === currency)?.netSalesMinor) ?? 0;
        return { currency, currentNetSalesMinor: currentNet, comparisonNetSalesMinor: previousNet, deltaMinor: currentNet - previousNet, deltaPct: previousNet === 0 ? null : Math.round(((currentNet - previousNet) / previousNet) * 10_000) / 100 };
      });
      if (comparison.some((item) => item.deltaMinor < 0)) out.push(make('REVENUE_DOWN_COMPARISON', 'OPPORTUNITY', 'Revenue is down versus the selected comparison', 'At least one currency has lower canonical net sales than the explicit comparison period.', 'financial.netSalesComparison', comparison, { fromDate: dto.compareFromDate, toDate: dto.compareToDate }, ['Comparison is descriptive. It does not claim a causal explanation without additional evidence.']));
    }

    return { generatedAt: new Date(), source: 'GOSPOTS_CANONICAL_FACTS', generatedBy: 'DETERMINISTIC_INSIGHT_ENGINE', count: out.length, insights: out.slice(0, 20) };
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CapabilityService } from '../foundation/capability.service';
import { Phase14AnalyticsService } from '../growth/phase14-analytics.service';
import type { OwnerAssistantQuestionDto } from './dto/owner-assistant.dto';

type Evidence = {
  metric: string;
  period: { fromDate: string; toDate: string };
  value: unknown;
  comparison: unknown;
  dataScope: { shopId: string; source: string; tenantScoped: true };
  relevantEntities: Array<{ type: string; id: string | null; label?: string }>;
  limitations: string[];
};

type AssistantAnswer = {
  status: 'ANSWERED' | 'UNSUPPORTED';
  intent: string;
  answer: string;
  evidence: Evidence[];
  source: 'GOSPOTS_CANONICAL_FACTS';
  generatedBy: 'DETERMINISTIC_GROUNDED_ASSISTANT';
  limitations: string[];
};

const INJECTION_OR_SQL = /(?:ignore\s+(?:all\s+)?previous|system\s+prompt|developer\s+message|reveal\s+prompt|\bselect\b.+\bfrom\b|\bdrop\s+table\b|\bdelete\s+from\b|\binsert\s+into\b|\bupdate\b.+\bset\b)/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row))) : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

@Injectable()
export class Phase15OwnerAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: Phase14AnalyticsService,
    private readonly capabilities: CapabilityService,
  ) {}

  private shopId(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new BadRequestException('Venue context is required.');
    return actor.shopId;
  }

  private async assertEnabled(shopId: string) {
    const capability = await this.capabilities.snapshot(shopId);
    if (!capability.canUseAiInsights) throw new BadRequestException('AI insights capability is unavailable for this venue.');
  }

  private evidence(
    shopId: string,
    dto: OwnerAssistantQuestionDto,
    metric: string,
    value: unknown,
    comparison: unknown = null,
    relevantEntities: Evidence['relevantEntities'] = [],
    limitations: string[] = [],
  ): Evidence {
    return {
      metric,
      period: { fromDate: dto.fromDate, toDate: dto.toDate },
      value,
      comparison,
      dataScope: { shopId, source: 'Phase14AnalyticsService/canonical domain facts', tenantScoped: true },
      relevantEntities,
      limitations,
    };
  }

  private unsupported(intent: string, answer: string, limitations: string[]): AssistantAnswer {
    return {
      status: 'UNSUPPORTED',
      intent,
      answer,
      evidence: [],
      source: 'GOSPOTS_CANONICAL_FACTS',
      generatedBy: 'DETERMINISTIC_GROUNDED_ASSISTANT',
      limitations,
    };
  }

  async ask(actor: JwtAccessPayload, dto: OwnerAssistantQuestionDto): Promise<AssistantAnswer> {
    const shopId = this.shopId(actor);
    await this.assertEnabled(shopId);
    const question = dto.question.trim();
    if (INJECTION_OR_SQL.test(question)) {
      return this.unsupported('SECURITY_REJECTED', 'I can only answer from approved GoSpots semantic facts. Instructions that request prompt disclosure or direct database commands are not executed.', [
        'The owner assistant never executes arbitrary SQL.',
        'External or imported text cannot change tenant scope, permissions, or evidence requirements.',
      ]);
    }

    const workspace = asRecord(await this.analytics.workspace(actor, dto.fromDate, dto.toDate));
    const resources = asRecord(workspace.resources);
    const financial = asRecord(workspace.financial);
    const restaurant = asRecord(workspace.restaurant);
    const inventory = asRecord(workspace.inventory);
    const reconciliation = asRecord(workspace.reconciliation);
    const attention = asRecord(workspace.attention);
    const q = question.toLowerCase();

    if (/(table|resource).*(money|revenue|profitable)|most.*(money|revenue).*(table|resource)/i.test(q)) {
      const rows = asRows(resources.profitability).slice(0, 5);
      const evidence = this.evidence(
        shopId,
        dto,
        'resource.profitability',
        rows,
        null,
        rows.map((row) => ({ type: 'RESOURCE', id: text(row.id) || null, label: text(row.name) || undefined })),
        ['Ranking uses Phase 14 revenue-per-available-hour profitability and only the requested venue/date range.'],
      );
      return { status: 'ANSWERED', intent: 'TOP_RESOURCE_PROFITABILITY', answer: rows.length ? 'The highest-ranked resources are returned in evidence, ordered by canonical revenue-per-available-hour profitability.' : 'There is not enough resource-session revenue data in this period to rank resources.', evidence: [evidence], source: 'GOSPOTS_CANONICAL_FACTS', generatedBy: 'DETERMINISTIC_GROUNDED_ASSISTANT', limitations: evidence.limitations };
    }

    if (/busiest|busy.*hour|peak.*hour/i.test(q)) {
      const rows = asRows(resources.peakHours).slice(0, 8);
      const evidence = this.evidence(shopId, dto, 'resource.peakHours', rows, null, [], ['Peak hours are based on session start counts in the venue timezone, not total occupancy minutes.']);
      return { status: 'ANSWERED', intent: 'BUSIEST_HOURS', answer: rows.length ? 'The busiest session-start hours are listed in evidence, highest count first.' : 'No session-start activity was recorded for the requested period.', evidence: [evidence], source: 'GOSPOTS_CANONICAL_FACTS', generatedBy: 'DETERMINISTIC_GROUNDED_ASSISTANT', limitations: evidence.limitations };
    }

    if (/before.*clos|check.*clos|closing/i.test(q)) {
      const items = asRows(attention.items);
      const evidence = this.evidence(shopId, dto, 'attention.openItems', items, null, items.slice(0, 25).map((row) => ({ type: text(row.domain) || 'ATTENTION', id: text(row.id) || null, label: text(row.title) || undefined })), ['Attention items are evidence-backed operational/reconciliation alerts; absence of an item is not a substitute for the venue close checklist.']);
      return { status: 'ANSWERED', intent: 'CLOSE_CHECK', answer: items.length ? `There are ${items.length} attention items to review before close; the exact items and next actions are in evidence.` : 'The Phase 14 attention center has no open items for this period.', evidence: [evidence], source: 'GOSPOTS_CANONICAL_FACTS', generatedBy: 'DETERMINISTIC_GROUNDED_ASSISTANT', limitations: evidence.limitations };
    }

    if (/(unresolved|issue).*(payment|cash)|(payment|cash).*(unresolved|issue)/i.test(q)) {
      const issues = asRows(reconciliation.issues).filter((row) => /PAYMENT|PROVIDER|CASH/i.test(`${text(row.type)} ${text(row.message)}`));
      const evidence = this.evidence(shopId, dto, 'reconciliation.paymentCashIssues', issues, null, issues.map((row) => ({ type: text(row.type) || 'RECONCILIATION', id: text(row.id) || null })), ['Only canonical reconciliation issues whose type/message is payment-, provider-, or cash-related are included.']);
      return { status: 'ANSWERED', intent: 'PAYMENT_CASH_ISSUES', answer: issues.length ? `There are ${issues.length} unresolved payment/cash reconciliation issues in evidence.` : 'No unresolved payment/cash reconciliation issues are present in the canonical reconciliation center for this period.', evidence: [evidence], source: 'GOSPOTS_CANONICAL_FACTS', generatedBy: 'DETERMINISTIC_GROUNDED_ASSISTANT', limitations: evidence.limitations };
    }

    if (/worst.*margin|margin.*item/i.test(q)) {
      return this.unsupported('ITEM_MARGIN_RANKING', 'GoSpots currently has canonical aggregate COGS/gross-margin facts and item sales mix, but Phase 14 does not expose attributable item-level historical cost. Ranking item margin from incomplete cost attribution would violate the evidence contract.', [
        `Aggregate gross margin for this period is ${String(numberOrNull(inventory.grossMarginPct) ?? 'not available')}%, but it is not evidence for per-item ranking.`,
        'Item-level margin ranking requires historical recipe/ingredient cost attribution per sold item.',
      ]);
    }

    if (/member.*(not returned|inactive|haven.?t returned|have not returned)/i.test(q)) {
      const end = new Date(`${dto.toDate}T23:59:59.999Z`);
      const threshold = new Date(end.getTime() - 30 * 86_400_000);
      const memberships = await this.prisma.customerMembership.findMany({ where: { shopId, status: 'ACTIVE' }, select: { customerId: true, expiresAt: true } });
      const customerIds = memberships.map((row) => row.customerId);
      const visits = customerIds.length ? await this.prisma.customerVisit.findMany({ where: { shopId, customerId: { in: customerIds }, completedAt: { lt: end } }, select: { customerId: true, completedAt: true }, orderBy: { completedAt: 'desc' } }) : [];
      const profiles = customerIds.length ? await this.prisma.customerProfile.findMany({ where: { shopId, id: { in: customerIds } }, select: { id: true, name: true } }) : [];
      const lastVisit = new Map<string, Date>();
      for (const visit of visits) if (!lastVisit.has(visit.customerId)) lastVisit.set(visit.customerId, visit.completedAt);
      const names = new Map(profiles.map((row) => [row.id, row.name]));
      const inactive = memberships.filter((row) => !lastVisit.get(row.customerId) || lastVisit.get(row.customerId)! < threshold).map((row) => ({ customerId: row.customerId, name: names.get(row.customerId) ?? null, lastVisitAt: lastVisit.get(row.customerId)?.toISOString() ?? null, expiresAt: row.expiresAt?.toISOString() ?? null })).slice(0, 100);
      const evidence = this.evidence(shopId, dto, 'membership.activeNoVisit30Days', inactive, { inactivityThresholdDays: 30, cutoff: threshold.toISOString() }, inactive.map((row) => ({ type: 'CUSTOMER', id: row.customerId, label: row.name ?? undefined })), ['Inactive means an ACTIVE membership with no completed CustomerVisit in the 30 days before the report end; this is descriptive, not churn prediction.']);
      return { status: 'ANSWERED', intent: 'INACTIVE_MEMBERS', answer: inactive.length ? `${inactive.length} active members in the returned evidence have no completed visit in the last 30 days.` : 'No active member in scope lacks a completed visit in the last 30 days.', evidence: [evidence], source: 'GOSPOTS_CANONICAL_FACTS', generatedBy: 'DETERMINISTIC_GROUNDED_ASSISTANT', limitations: evidence.limitations };
    }

    if (/revenue|sales|lower|down|compare|comparison|last friday|yesterday/i.test(q)) {
      if (!dto.compareFromDate || !dto.compareToDate) {
        return this.unsupported('REVENUE_COMPARISON', 'A revenue comparison requires explicit comparison dates so the assistant does not guess business-day boundaries.', ['Provide compareFromDate and compareToDate as venue business dates.']);
      }
      const comparisonWorkspace = asRecord(await this.analytics.workspace(actor, dto.compareFromDate, dto.compareToDate));
      const currentRows = asRows(financial.currencies);
      const comparisonRows = asRows(asRecord(comparisonWorkspace.financial).currencies);
      const values = currentRows.map((row) => {
        const currency = text(row.currency);
        const current = numberOrNull(row.netSalesMinor) ?? 0;
        const previous = numberOrNull(comparisonRows.find((item) => text(item.currency) === currency)?.netSalesMinor) ?? 0;
        return { currency, currentNetSalesMinor: current, comparisonNetSalesMinor: previous, deltaMinor: current - previous, deltaPct: previous === 0 ? null : Math.round(((current - previous) / previous) * 10_000) / 100 };
      });
      const evidence = this.evidence(shopId, dto, 'financial.netSalesComparison', values, { fromDate: dto.compareFromDate, toDate: dto.compareToDate }, [], ['Comparison uses canonical net settled revenue and explicit venue business-date ranges. It does not infer causal reasons from correlation.']);
      return { status: 'ANSWERED', intent: 'REVENUE_COMPARISON', answer: 'The exact current-versus-comparison revenue deltas are in evidence. GoSpots does not claim a causal reason unless a separate canonical operational fact supports it.', evidence: [evidence], source: 'GOSPOTS_CANONICAL_FACTS', generatedBy: 'DETERMINISTIC_GROUNDED_ASSISTANT', limitations: evidence.limitations };
    }

    if (/stock.*variance|variance.*stock/i.test(q)) {
      const variance = asRecord(inventory.variance);
      const evidence = this.evidence(shopId, dto, 'inventory.variance', variance, null, [], ['Variance is derived from stock movement/stocktake adjustment facts; it is not an AI estimate.']);
      return { status: 'ANSWERED', intent: 'STOCK_VARIANCE', answer: 'Inventory variance facts for the requested period are in evidence.', evidence: [evidence], source: 'GOSPOTS_CANONICAL_FACTS', generatedBy: 'DETERMINISTIC_GROUNDED_ASSISTANT', limitations: evidence.limitations };
    }

    if (/kds|prep.*time|kitchen.*slow/i.test(q)) {
      const kds = asRecord(restaurant.kds);
      const evidence = this.evidence(shopId, dto, 'restaurant.kds', kds, null, [], ['KDS figures are measured workflow facts from the requested period.']);
      return { status: 'ANSWERED', intent: 'KDS_PERFORMANCE', answer: 'Measured KDS performance is returned in evidence.', evidence: [evidence], source: 'GOSPOTS_CANONICAL_FACTS', generatedBy: 'DETERMINISTIC_GROUNDED_ASSISTANT', limitations: evidence.limitations };
    }

    return this.unsupported('UNSUPPORTED_QUESTION', 'This question is outside the currently grounded owner-assistant intent catalog. I will not invent an answer or query production arbitrarily.', [
      'Supported areas include resource profitability, busiest hours, close attention, payment/cash reconciliation, explicit revenue comparisons, inactive members, stock variance, and KDS performance.',
    ]);
  }
}

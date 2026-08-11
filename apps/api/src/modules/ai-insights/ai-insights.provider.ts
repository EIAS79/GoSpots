import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redactProviderInput, sha256, stableJson } from '../../common/platform-security.util';

export type InsightCandidate = {
  type: string;
  severity: 'INFO' | 'OPPORTUNITY' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  actionKey?: 'VIEW_ANALYTICS' | 'REVIEW_TICKETING' | 'OPEN_AUTOMATION' | 'REVIEW_OPERATIONS';
};

export type InsightSnapshotMetrics = {
  analyticsFacts: number;
  analyticsKinds: Record<string, number>;
  ticketScans: number;
  ticketAccepted: number;
  ticketDuplicate: number;
  ticketRejected: number;
  activeRfidWallets: number;
  storedValueLiabilityMinor: number;
  automationFailures24h: number;
  automationDeadLetters: number;
  recentFactMeasures: unknown[];
};

export interface AiInsightProvider {
  readonly name: string;
  generate(metrics: InsightSnapshotMetrics): Promise<InsightCandidate[]>;
}

@Injectable()
export class DeterministicInsightProvider implements AiInsightProvider {
  readonly name = 'DETERMINISTIC';

  async generate(metrics: InsightSnapshotMetrics): Promise<InsightCandidate[]> {
    const out: InsightCandidate[] = [];
    if (metrics.automationDeadLetters > 0) {
      out.push({
        type: 'AUTOMATION_DEAD_LETTER',
        severity: metrics.automationDeadLetters >= 5 ? 'CRITICAL' : 'WARNING',
        title: 'Automation failures need review',
        body: `${metrics.automationDeadLetters} automation execution(s) are in the dead-letter queue. Review the failed action and replay only after the dependency is healthy.`,
        evidence: { deadLetters: metrics.automationDeadLetters, failed24h: metrics.automationFailures24h },
        actionKey: 'OPEN_AUTOMATION',
      });
    }
    if (metrics.ticketScans >= 5) {
      const problemScans = metrics.ticketDuplicate + metrics.ticketRejected;
      const ratio = problemScans / metrics.ticketScans;
      if (ratio >= 0.15) {
        out.push({
          type: 'TICKET_SCAN_ANOMALY',
          severity: ratio >= 0.4 ? 'WARNING' : 'OPPORTUNITY',
          title: 'Ticket scan exceptions are elevated',
          body: `${Math.round(ratio * 100)}% of recent ticket scans were duplicate or rejected. Check gate workflow, scanner behavior, and ticket policy before peak traffic.`,
          evidence: {
            scans: metrics.ticketScans,
            accepted: metrics.ticketAccepted,
            duplicate: metrics.ticketDuplicate,
            rejected: metrics.ticketRejected,
            exceptionRatio: Number(ratio.toFixed(4)),
          },
          actionKey: 'REVIEW_TICKETING',
        });
      }
    }
    if (metrics.analyticsFacts === 0) {
      out.push({
        type: 'ANALYTICS_COVERAGE',
        severity: 'INFO',
        title: 'Not enough operational history for deeper insights',
        body: 'No canonical analytics facts exist in the selected window yet. Keep normal operations running and regenerate insights after data has accumulated.',
        evidence: { analyticsFacts: 0 },
        actionKey: 'VIEW_ANALYTICS',
      });
    } else {
      out.push({
        type: 'DATA_COVERAGE',
        severity: 'INFO',
        title: 'Operational insight snapshot is current',
        body: `The current snapshot is backed by ${metrics.analyticsFacts} canonical analytics fact(s) across ${Object.keys(metrics.analyticsKinds).length} metric families.`,
        evidence: { analyticsFacts: metrics.analyticsFacts, analyticsKinds: metrics.analyticsKinds },
        actionKey: 'VIEW_ANALYTICS',
      });
    }
    if (metrics.storedValueLiabilityMinor > 0) {
      out.push({
        type: 'STORED_VALUE_LIABILITY',
        severity: 'INFO',
        title: 'RFID stored-value liability is visible',
        body: 'Outstanding RFID wallet balances are tracked as an operational liability. Reconcile wallet loads, spends, refunds, and reversals with finance reporting.',
        evidence: {
          activeWallets: metrics.activeRfidWallets,
          storedValueLiabilityMinor: metrics.storedValueLiabilityMinor,
        },
        actionKey: 'REVIEW_OPERATIONS',
      });
    }
    return out.slice(0, 8);
  }
}

@Injectable()
export class ExternalInsightProvider implements AiInsightProvider {
  readonly name = 'EXTERNAL';

  constructor(private readonly config: ConfigService) {}

  configured(): boolean {
    return Boolean(
      this.config.get<string>('AI_INSIGHTS_ENDPOINT')?.trim() &&
        this.config.get<string>('AI_INSIGHTS_API_KEY')?.trim(),
    );
  }

  async generate(metrics: InsightSnapshotMetrics): Promise<InsightCandidate[]> {
    const endpoint = this.config.get<string>('AI_INSIGHTS_ENDPOINT')?.trim();
    const apiKey = this.config.get<string>('AI_INSIGHTS_API_KEY')?.trim();
    if (!endpoint || !apiKey) throw new Error('External AI insights provider is not configured.');
    const safeMetrics = redactProviderInput(metrics);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'x-gospots-contract': 'ai-insights-v1',
        },
        body: JSON.stringify({
          contract: 'gospots.ai-insights.v1',
          instructions:
            'Return JSON only: {"insights":[{"type":string,"severity":"INFO|OPPORTUNITY|WARNING|CRITICAL","title":string,"body":string,"evidence":object,"actionKey"?:"VIEW_ANALYTICS|REVIEW_TICKETING|OPEN_AUTOMATION|REVIEW_OPERATIONS"}]}. Recommendations only. Never request or suggest direct financial mutation.',
          metrics: safeMetrics,
          inputHash: sha256(stableJson(safeMetrics)),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`External AI provider returned HTTP ${response.status}.`);
      const body = (await response.json()) as { insights?: unknown };
      if (!Array.isArray(body.insights)) throw new Error('External AI provider response is invalid.');
      return body.insights
        .slice(0, 8)
        .map((item) => normalizeCandidate(item))
        .filter((item): item is InsightCandidate => Boolean(item));
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeCandidate(value: unknown): InsightCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const severity = String(item.severity ?? 'INFO').toUpperCase();
  if (!['INFO', 'OPPORTUNITY', 'WARNING', 'CRITICAL'].includes(severity)) return null;
  const title = typeof item.title === 'string' ? item.title.trim().slice(0, 180) : '';
  const body = typeof item.body === 'string' ? item.body.trim().slice(0, 1200) : '';
  if (!title || !body) return null;
  const allowedAction = ['VIEW_ANALYTICS', 'REVIEW_TICKETING', 'OPEN_AUTOMATION', 'REVIEW_OPERATIONS'];
  const actionKey = typeof item.actionKey === 'string' && allowedAction.includes(item.actionKey)
    ? (item.actionKey as InsightCandidate['actionKey'])
    : undefined;
  return {
    type: typeof item.type === 'string' ? item.type.trim().slice(0, 100) : 'EXTERNAL_RECOMMENDATION',
    severity: severity as InsightCandidate['severity'],
    title,
    body,
    evidence: item.evidence && typeof item.evidence === 'object' && !Array.isArray(item.evidence)
      ? (redactProviderInput(item.evidence) as Record<string, unknown>)
      : {},
    actionKey,
  };
}

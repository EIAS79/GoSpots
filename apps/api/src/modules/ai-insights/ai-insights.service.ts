import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { redactProviderInput, sha256, stableJson } from '../../common/platform-security.util';
import type { AiInsightFeedbackDto, RunAiInsightsDto } from './dto/ai-insights.dto';
import {
  DeterministicInsightProvider,
  ExternalInsightProvider,
  type InsightCandidate,
  type InsightSnapshotMetrics,
} from './ai-insights.provider';

@Injectable()
export class AiInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deterministic: DeterministicInsightProvider,
    private readonly external: ExternalInsightProvider,
  ) {}

  private shopId(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new BadRequestException('Venue context is required.');
    return actor.shopId;
  }

  private resolveWindow(dto: RunAiInsightsDto) {
    const end = dto.windowEnd ? new Date(dto.windowEnd) : new Date();
    const start = dto.windowStart
      ? new Date(dto.windowStart)
      : new Date(end.getTime() - 7 * 86_400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      throw new BadRequestException('Insight window is invalid.');
    }
    if (end.getTime() - start.getTime() > 93 * 86_400_000) {
      throw new BadRequestException('Insight window cannot exceed 93 days.');
    }
    return { start, end };
  }

  private async collectMetrics(shopId: string, start: Date, end: Date): Promise<InsightSnapshotMetrics> {
    const [facts, scanGroups, wallets, automationFailures24h, automationDeadLetters] = await Promise.all([
      this.prisma.analyticsFact.findMany({
        where: { shopId, bucketStart: { gte: start, lt: end } },
        orderBy: { bucketStart: 'desc' },
        take: 250,
        select: { factKind: true, bucketStart: true, bucketEnd: true, dimensionKey: true, currency: true, measures: true },
      }),
      this.prisma.ticketScan.groupBy({
        by: ['result'],
        where: { shopId, scannedAt: { gte: start, lt: end } },
        _count: { _all: true },
      }),
      this.prisma.rfidWallet.aggregate({
        where: { shopId, active: true },
        _count: { _all: true },
        _sum: { balanceMinor: true },
      }),
      this.prisma.automationExecution.count({
        where: {
          shopId,
          status: { in: ['FAILED', 'DEAD_LETTER'] },
          createdAt: { gte: new Date(Date.now() - 86_400_000) },
        },
      }),
      this.prisma.automationDeadLetter.count({ where: { shopId, resolvedAt: null } }),
    ]);

    const scans = new Map(scanGroups.map((row) => [row.result, row._count._all]));
    const analyticsKinds: Record<string, number> = {};
    for (const fact of facts) analyticsKinds[fact.factKind] = (analyticsKinds[fact.factKind] ?? 0) + 1;
    const metrics: InsightSnapshotMetrics = {
      analyticsFacts: facts.length,
      analyticsKinds,
      ticketScans: [...scans.values()].reduce((a, b) => a + b, 0),
      ticketAccepted: scans.get('ACCEPTED') ?? 0,
      ticketDuplicate: scans.get('DUPLICATE') ?? 0,
      ticketRejected:
        (scans.get('REJECTED') ?? 0) +
        (scans.get('EXPIRED') ?? 0) +
        (scans.get('VOIDED') ?? 0),
      activeRfidWallets: wallets._count._all,
      storedValueLiabilityMinor: wallets._sum.balanceMinor ?? 0,
      automationFailures24h,
      automationDeadLetters,
      recentFactMeasures: facts.slice(0, 50).map((fact) => ({
        kind: fact.factKind,
        bucketStart: fact.bucketStart.toISOString(),
        bucketEnd: fact.bucketEnd.toISOString(),
        dimensionKey: fact.dimensionKey,
        currency: fact.currency,
        measures: fact.measures,
      })),
    };
    return redactProviderInput(metrics) as InsightSnapshotMetrics;
  }

  async list(actor: JwtAccessPayload) {
    const shopId = this.shopId(actor);
    const [insights, runs, snapshots] = await Promise.all([
      this.prisma.aiInsight.findMany({ where: { shopId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.aiInsightRun.findMany({ where: { shopId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.insightSnapshot.findMany({ where: { shopId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return {
      insights: insights.map((row) => ({ ...row, evidence: JSON.parse(row.evidenceJson) as unknown })),
      runs,
      snapshots: snapshots.map((row) => ({ ...row, metrics: JSON.parse(row.metricsJson) as unknown })),
    };
  }

  async run(actor: JwtAccessPayload, dto: RunAiInsightsDto) {
    const shopId = this.shopId(actor);
    const { start, end } = this.resolveWindow(dto);
    const metrics = await this.collectMetrics(shopId, start, end);
    const metricsJson = stableJson(metrics);
    const metricsHash = sha256(metricsJson);
    let snapshot = await this.prisma.insightSnapshot.findUnique({
      where: {
        shopId_windowStart_windowEnd_metricsHash: {
          shopId,
          windowStart: start,
          windowEnd: end,
          metricsHash,
        },
      },
    });
    if (!snapshot) {
      snapshot = await this.prisma.insightSnapshot.create({
        data: { shopId, windowStart: start, windowEnd: end, metricsJson, metricsHash },
      });
    }

    const requested = dto.provider ?? 'AUTO';
    const useExternal = requested === 'EXTERNAL' || (requested === 'AUTO' && this.external.configured());
    const providerName = useExternal ? this.external.name : this.deterministic.name;
    const inputHash = sha256(stableJson({ snapshot: metricsHash, provider: providerName }));
    const existingRun = await this.prisma.aiInsightRun.findUnique({
      where: {
        shopId_snapshotId_provider_inputHash: {
          shopId,
          snapshotId: snapshot.id,
          provider: providerName,
          inputHash,
        },
      },
    });
    if (existingRun) {
      const insights = await this.prisma.aiInsight.findMany({ where: { shopId, runId: existingRun.id }, orderBy: { createdAt: 'asc' } });
      return { snapshot, run: existingRun, insights, replayed: true };
    }

    const run = await this.prisma.aiInsightRun.create({
      data: { shopId, snapshotId: snapshot.id, provider: providerName, status: 'RUNNING', inputHash },
    });
    let candidates: InsightCandidate[] = [];
    let status: 'SUCCEEDED' | 'DEGRADED' | 'FAILED' = 'SUCCEEDED';
    let failureCode: string | null = null;
    let failureMessage: string | null = null;
    try {
      candidates = useExternal
        ? await this.external.generate(metrics)
        : await this.deterministic.generate(metrics);
      if (useExternal && candidates.length === 0) {
        status = 'DEGRADED';
        failureCode = 'EMPTY_PROVIDER_RESPONSE';
        candidates = await this.deterministic.generate(metrics);
      }
    } catch (error) {
      status = 'DEGRADED';
      failureCode = 'PROVIDER_FAILURE';
      failureMessage = error instanceof Error ? error.message.slice(0, 500) : 'AI provider failed.';
      candidates = await this.deterministic.generate(metrics);
    }

    const persisted = [];
    for (const candidate of candidates.slice(0, 8)) {
      const evidenceJson = stableJson(redactProviderInput(candidate.evidence));
      const fingerprint = sha256(
        stableJson({ type: candidate.type, title: candidate.title, evidence: evidenceJson }),
      );
      persisted.push(
        await this.prisma.aiInsight.upsert({
          where: { shopId_fingerprint: { shopId, fingerprint } },
          create: {
            shopId,
            runId: run.id,
            fingerprint,
            type: candidate.type,
            severity: candidate.severity,
            title: candidate.title,
            body: candidate.body,
            evidenceJson,
            actionKey: candidate.actionKey ?? null,
          },
          update: {
            runId: run.id,
            severity: candidate.severity,
            title: candidate.title,
            body: candidate.body,
            evidenceJson,
            actionKey: candidate.actionKey ?? null,
            dismissedAt: null,
          },
        }),
      );
    }
    const outputHash = sha256(stableJson(persisted.map((row) => row.fingerprint)));
    const completed = await this.prisma.aiInsightRun.update({
      where: { id: run.id },
      data: {
        status,
        outputHash,
        failureCode,
        failureMessage,
        completedAt: new Date(),
      },
    });
    return { snapshot, run: completed, insights: persisted, replayed: false };
  }

  async feedback(actor: JwtAccessPayload, insightId: string, dto: AiInsightFeedbackDto) {
    const shopId = this.shopId(actor);
    const insight = await this.prisma.aiInsight.findFirst({ where: { id: insightId, shopId } });
    if (!insight) throw new NotFoundException('AI insight not found.');
    return this.prisma.aiInsightFeedback.upsert({
      where: { shopId_insightId_actorId: { shopId, insightId, actorId: actor.sub } },
      create: { shopId, insightId, actorId: actor.sub, rating: dto.rating, reason: dto.reason ?? null },
      update: { rating: dto.rating, reason: dto.reason ?? null },
    });
  }

  async dismiss(actor: JwtAccessPayload, insightId: string) {
    const shopId = this.shopId(actor);
    const insight = await this.prisma.aiInsight.findFirst({ where: { id: insightId, shopId } });
    if (!insight) throw new NotFoundException('AI insight not found.');
    return this.prisma.aiInsight.update({ where: { id: insight.id }, data: { dismissedAt: new Date() } });
  }

  async readiness(actor: JwtAccessPayload) {
    const shopId = this.shopId(actor);
    const [snapshots, runs, activeInsights] = await Promise.all([
      this.prisma.insightSnapshot.count({ where: { shopId } }),
      this.prisma.aiInsightRun.count({ where: { shopId } }),
      this.prisma.aiInsight.count({ where: { shopId, dismissedAt: null } }),
    ]);
    return {
      status: 'ok',
      deterministicProvider: 'ready',
      externalProvider: this.external.configured() ? 'ready' : 'optional',
      directMutationAllowed: false,
      piiPolicy: 'metrics-only-redacted',
      snapshots,
      runs,
      activeInsights,
    };
  }
}
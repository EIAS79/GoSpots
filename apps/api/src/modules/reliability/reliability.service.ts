import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluateReliabilityConfig } from './reliability.config';

@Injectable()
export class ReliabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async readiness(actor: JwtAccessPayload) {
    const shopId = actor.shopId;
    const started = Date.now();
    const config = evaluateReliabilityConfig({
      nodeEnv: this.config.get<string>('NODE_ENV'),
      webAppUrl:
        this.config.get<string>('WEB_APP_URL') ??
        this.config.get<string>('WEB_ORIGIN'),
      databaseUrl: this.config.get<string>('DATABASE_URL'),
      jwtSecret: this.config.get<string>('JWT_SECRET'),
      opaqueIdentifierSecret: this.config.get<string>('OPAQUE_IDENTIFIER_SECRET'),
      aiProvider: this.config.get<string>('AI_INSIGHTS_PROVIDER'),
      aiApiKey:
        this.config.get<string>('AI_INSIGHTS_API_KEY') ??
        this.config.get<string>('OPENAI_API_KEY'),
    });

    let database: 'up' | 'down' = 'up';
    let schema: 'ready' | 'missing' = 'ready';
    let databaseError: string | null = null;
    let deadLetters = 0;
    let failedAutomations24h = 0;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await Promise.all([
        this.prisma.ticketProduct.count({ where: shopId ? { shopId } : undefined }),
        this.prisma.automationRule.count({ where: shopId ? { shopId } : undefined }),
        this.prisma.insightSnapshot.count({ where: shopId ? { shopId } : undefined }),
      ]);
      if (shopId) {
        [deadLetters, failedAutomations24h] = await Promise.all([
          this.prisma.automationDeadLetter.count({ where: { shopId, resolvedAt: null } }),
          this.prisma.automationExecution.count({
            where: {
              shopId,
              status: { in: ['FAILED', 'DEAD_LETTER'] },
              createdAt: { gte: new Date(Date.now() - 86_400_000) },
            },
          }),
        ]);
      }
    } catch (error) {
      databaseError = error instanceof Error ? error.message.slice(0, 240) : 'Database readiness check failed.';
      if (/does not exist|unknown|column|relation/i.test(databaseError)) schema = 'missing';
      else database = 'down';
    }

    const blocking = [...config.blocking];
    if (database === 'down') blocking.push('Database connectivity check failed.');
    if (schema === 'missing') blocking.push('Chunks 24–27 database schema is not applied.');

    return {
      status: blocking.length ? 'degraded' : 'ok',
      service: 'GoSpots-api',
      database,
      schema,
      config: {
        production: config.production,
        checks: config.checks,
        blocking,
        warnings: config.warnings,
      },
      automation: { deadLetters, failedExecutions24h: failedAutomations24h },
      error: databaseError,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    };
  }
}

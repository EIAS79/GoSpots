import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  live() {
    return {
      status: 'ok' as const,
      check: 'live',
      service: 'Locora-api',
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok' as const,
        check: 'ready',
        service: 'Locora-api',
        database: 'up' as const,
        latencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'database check failed';
      return {
        status: 'error' as const,
        check: 'ready',
        service: 'Locora-api',
        database: 'down' as const,
        latencyMs: Date.now() - started,
        error: message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

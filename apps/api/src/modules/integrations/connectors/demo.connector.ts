import { Injectable } from '@nestjs/common';
import type {
  IntegrationConnector,
  IntegrationConnectorContext,
  IntegrationConnectorResult,
  IntegrationJobCommand,
} from './integration-connector';

@Injectable()
export class DemoIntegrationConnector implements IntegrationConnector {
  readonly provider = 'demo';

  capabilities() {
    return {
      jobs: ['session.charge', 'payment.metadata', 'catalog.sync'],
      health: true,
      idempotent: true,
      mode: 'local-demo',
    };
  }

  async health(_context: IntegrationConnectorContext) {
    return { ok: true, detail: 'Demo connector ready' };
  }

  async execute(
    _context: IntegrationConnectorContext,
    command: IntegrationJobCommand,
  ): Promise<IntegrationConnectorResult> {
    return {
      externalId: `demo:${command.idempotencyKey}`,
      metadata: { accepted: true, jobType: command.jobType },
    };
  }
}

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  IntegrationConnector,
  IntegrationConnectorContext,
  IntegrationJobCommand,
} from './integration-connector';

/**
 * GoPOS connector boundary.
 *
 * GoPOS publishes API access only after a partner/license approval and exposes
 * the actual API documentation inside the licensed application. We therefore
 * deliberately do not guess private endpoint paths or request schemas here.
 * This adapter owns capability/mapping boundaries now and fails closed until
 * the licensed contract is supplied and implemented against official docs.
 */
@Injectable()
export class GoPosIntegrationConnector implements IntegrationConnector {
  readonly provider = 'gopos';

  capabilities() {
    return {
      plannedJobs: ['session.charge', 'payment.metadata', 'reconciliation.pull'],
      requiresLicensedApi: true,
      sourceOfTruth: {
        resourceSessions: 'gospots',
        guestChecks: 'gospots',
      },
    };
  }

  async health(context: IntegrationConnectorContext) {
    const contractVersion = String(context.config.apiContractVersion ?? '').trim();
    if (!contractVersion) {
      return {
        ok: false,
        detail: 'GoPOS licensed API contract has not been configured',
      };
    }
    return {
      ok: false,
      detail: `GoPOS contract ${contractVersion} recorded; live adapter remains locked until official endpoint implementation is reviewed`,
    };
  }

  async execute(
    _context: IntegrationConnectorContext,
    _command: IntegrationJobCommand,
  ): Promise<never> {
    throw new ServiceUnavailableException(
      'GoPOS live API execution is locked until licensed official API documentation and credentials are supplied',
    );
  }
}

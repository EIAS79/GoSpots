import { apiConflictException } from './api-error.util';
import { ApiDomainErrorCode } from './api-error.codes';

export type VersionConflictDetails = {
  aggregateType?: string;
  aggregateId?: string;
};

/**
 * Shared optimistic-concurrency convention for mutable aggregates.
 * Call before a versioned mutation when the client supplied an expected version.
 */
export function assertExpectedVersion(
  actualVersion: number,
  expectedVersion: number,
  details: VersionConflictDetails = {},
): void {
  if (!Number.isInteger(actualVersion) || actualVersion < 1) {
    throw new TypeError('actualVersion must be an integer >= 1');
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new TypeError('expectedVersion must be an integer >= 1');
  }
  if (actualVersion === expectedVersion) return;

  throw apiConflictException(
    ApiDomainErrorCode.VERSION_CONFLICT,
    'Resource version is stale; refresh and retry',
    {
      ...details,
      expectedVersion,
      actualVersion,
    },
  );
}

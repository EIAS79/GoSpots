import { ApiProperty } from '@nestjs/swagger';
import {
  API_ERROR_CODE_CATALOG,
  ApiDomainErrorCode,
  ApiErrorCode,
} from '../api-error.codes';

/**
 * OpenAPI mirror of {@link ApiErrorBody} from `api-error.util.ts`.
 * All HTTP errors use this envelope via `SentryExceptionFilter`.
 */
export class ApiErrorBodyDto {
  @ApiProperty({
    description:
      'Stable machine-readable error code (UPPER_SNAKE). Defaults by HTTP status when throw site omits custom code. Unmapped 4xx may use dynamic `HTTP_<status>` (e.g. `HTTP_429`) — not listed in the catalog enum. Domain codes are documented for integrators; not all are emitted at throw sites yet.',
    example: ApiDomainErrorCode.RESERVATION_OVERLAP,
    enum: API_ERROR_CODE_CATALOG,
    enumName: 'ApiErrorCode',
  })
  code: string;

  @ApiProperty({
    description: 'Human-readable message safe for UI display (no stack traces on 5xx).',
    example: 'This unit already has a booking that overlaps that time.',
  })
  message: string;

  @ApiProperty({
    description:
      'Optional structured context (validation messages, Nest legacy `error`, domain fields).',
    type: 'object',
    additionalProperties: true,
    example: {},
  })
  details: Record<string, unknown>;

  @ApiProperty({
    description:
      'Request correlation id — also returned in the `x-request-id` response header.',
    example: 'req_m2k9x7_abc123',
  })
  requestId: string;
}

/** Re-export for route decorators that reference default status codes. */
export { ApiErrorCode };

import { HttpStatus } from '@nestjs/common';

/** Stable machine codes for the §36 API error envelope (default when no custom `code`). */
export const ApiErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
} as const;

export type ApiErrorCodeValue = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/**
 * Domain-specific codes (registry for integrators / OpenAPI).
 * Additive aliases preserve existing public codes while Chunk 01 establishes
 * the cross-cutting taxonomy used by new mutation paths.
 */
export const ApiDomainErrorCode = {
  // Cross-cutting Chunk 01 taxonomy
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  STATE_CONFLICT: 'STATE_CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_STATUS_UNKNOWN: 'PROVIDER_STATUS_UNKNOWN',
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  COMPLIANCE_REQUIRED: 'COMPLIANCE_REQUIRED',
  OFFLINE_UNSUPPORTED: 'OFFLINE_UNSUPPORTED',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  // Booking
  RESERVATION_OVERLAP: 'RESERVATION_OVERLAP',
  WALK_IN_ACTIVE: 'WALK_IN_ACTIVE',
  WALK_IN_OVERLAP: 'WALK_IN_OVERLAP',
  RESOURCE_MAINTENANCE: 'RESOURCE_MAINTENANCE',
  RESOURCE_NOT_BOOKABLE: 'RESOURCE_NOT_BOOKABLE',
  // Auth / tenant
  CSRF_INVALID: 'CSRF_INVALID',
  SESSION_REVOKED: 'SESSION_REVOKED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  MFA_INVALID: 'MFA_INVALID',
  VENUE_ACCESS_DENIED: 'VENUE_ACCESS_DENIED',
  // Commerce (legacy codes retained for compatibility)
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
  MENU_STOCK_INSUFFICIENT: 'MENU_STOCK_INSUFFICIENT',
  SHOP_ORDER_STATE: 'SHOP_ORDER_STATE',
  PLAY_SESSION_ACTIVE: 'PLAY_SESSION_ACTIVE',
  GUEST_CHECK_CLOSED: 'GUEST_CHECK_CLOSED',
  // Guest / public
  GUEST_TOKEN_EXPIRED: 'GUEST_TOKEN_EXPIRED',
  GUEST_TOKEN_REVOKED: 'GUEST_TOKEN_REVOKED',
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  CAPTCHA_FAILED: 'CAPTCHA_FAILED',
  // Onboarding / billing
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  SLUG_TAKEN: 'SLUG_TAKEN',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
} as const;

export type ApiDomainErrorCodeValue =
  (typeof ApiDomainErrorCode)[keyof typeof ApiDomainErrorCode];

/** Full OpenAPI catalog: HTTP defaults + documented domain registry. */
export const API_ERROR_CODE_CATALOG = [
  ...Object.values(ApiErrorCode),
  ...Object.values(ApiDomainErrorCode),
] as const;

export type ApiErrorCodeCatalogValue =
  (typeof API_ERROR_CODE_CATALOG)[number];

const STATUS_TO_CODE: Partial<Record<number, ApiErrorCodeValue>> = {
  [HttpStatus.BAD_REQUEST]: ApiErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ApiErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ApiErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ApiErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ApiErrorCode.CONFLICT,
};

/**
 * Map HTTP status → stable envelope code.
 * Known 4xx use ApiErrorCode; 5xx → INTERNAL; others → `HTTP_<status>`.
 */
export function errorCodeForHttpStatus(status: number): string {
  if (status === HttpStatus.INTERNAL_SERVER_ERROR || status >= 500) {
    return ApiErrorCode.INTERNAL;
  }
  return STATUS_TO_CODE[status] ?? `HTTP_${status}`;
}

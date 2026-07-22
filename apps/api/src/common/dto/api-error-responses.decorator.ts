import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiDomainErrorCode, ApiErrorCode } from '../api-error.codes';
import { ApiErrorBodyDto } from './api-error-body.dto';

const DEFAULT_DESCRIPTIONS: Record<number, string> = {
  400: `Validation failed (\`${ApiErrorCode.VALIDATION_FAILED}\`)`,
  401: `Authentication required (\`${ApiErrorCode.UNAUTHORIZED}\` or domain e.g. \`${ApiDomainErrorCode.MFA_REQUIRED}\`)`,
  403: `Forbidden (\`${ApiErrorCode.FORBIDDEN}\` or domain e.g. \`${ApiDomainErrorCode.CAPTCHA_REQUIRED}\`)`,
  404: `Resource not found (\`${ApiErrorCode.NOT_FOUND}\`)`,
  409: `Conflict (\`${ApiErrorCode.CONFLICT}\` or domain e.g. \`${ApiDomainErrorCode.RESERVATION_OVERLAP}\`, \`${ApiDomainErrorCode.MENU_STOCK_INSUFFICIENT}\`)`,
  500: `Internal server error (\`${ApiErrorCode.INTERNAL}\`)`,
  503: `Service unavailable (\`${ApiErrorCode.INTERNAL}\`)`,
};

type ApiErrorStatus = keyof typeof DEFAULT_DESCRIPTIONS;

/**
 * Document §36 error envelope responses on a route.
 * Pass only the HTTP statuses that apply to the handler.
 */
export function ApiStandardErrorResponses(...statuses: ApiErrorStatus[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DEFAULT_DESCRIPTIONS[status],
        type: ApiErrorBodyDto,
      }),
    ),
  );
}

/** Common staff-route errors: validation, auth, permission, not-found, conflict. */
export function ApiStaffErrorResponses() {
  return ApiStandardErrorResponses(400, 401, 403, 404, 409);
}

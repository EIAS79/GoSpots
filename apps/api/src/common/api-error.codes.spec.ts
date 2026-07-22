import { HttpStatus } from '@nestjs/common';
import {
  API_ERROR_CODE_CATALOG,
  ApiDomainErrorCode,
  ApiErrorCode,
  errorCodeForHttpStatus,
} from './api-error.codes';

describe('api-error.codes', () => {
  describe('API_ERROR_CODE_CATALOG', () => {
    it('includes all default ApiErrorCode values', () => {
      for (const code of Object.values(ApiErrorCode)) {
        expect(API_ERROR_CODE_CATALOG).toContain(code);
      }
    });

    it('has unique entries', () => {
      expect(new Set(API_ERROR_CODE_CATALOG).size).toBe(
        API_ERROR_CODE_CATALOG.length,
      );
    });

    it('documents booking domain codes for OpenAPI', () => {
      expect(API_ERROR_CODE_CATALOG).toContain(
        ApiDomainErrorCode.RESERVATION_OVERLAP,
      );
    });

    it('documents commerce stock domain codes for OpenAPI', () => {
      expect(API_ERROR_CODE_CATALOG).toContain(
        ApiDomainErrorCode.MENU_STOCK_INSUFFICIENT,
      );
    });
  });

  describe('errorCodeForHttpStatus', () => {
    it('maps common 4xx to stable ApiErrorCode values', () => {
      expect(errorCodeForHttpStatus(HttpStatus.BAD_REQUEST)).toBe(
        ApiErrorCode.VALIDATION_FAILED,
      );
      expect(errorCodeForHttpStatus(HttpStatus.UNAUTHORIZED)).toBe(
        ApiErrorCode.UNAUTHORIZED,
      );
      expect(errorCodeForHttpStatus(HttpStatus.FORBIDDEN)).toBe(
        ApiErrorCode.FORBIDDEN,
      );
      expect(errorCodeForHttpStatus(HttpStatus.NOT_FOUND)).toBe(
        ApiErrorCode.NOT_FOUND,
      );
      expect(errorCodeForHttpStatus(HttpStatus.CONFLICT)).toBe(
        ApiErrorCode.CONFLICT,
      );
    });

    it('maps 5xx to INTERNAL', () => {
      expect(errorCodeForHttpStatus(500)).toBe(ApiErrorCode.INTERNAL);
      expect(errorCodeForHttpStatus(503)).toBe(ApiErrorCode.INTERNAL);
    });

    it('falls back to HTTP_N for unmapped 4xx', () => {
      expect(errorCodeForHttpStatus(429)).toBe('HTTP_429');
      expect(errorCodeForHttpStatus(422)).toBe('HTTP_422');
    });
  });
});

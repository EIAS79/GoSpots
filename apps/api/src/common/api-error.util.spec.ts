import { HttpStatus } from '@nestjs/common';
import { ApiDomainErrorCode, ApiErrorCode } from './api-error.codes';
import {
  apiConflictException,
  apiForbiddenException,
  apiUnauthorizedException,
  buildApiErrorBody,
  defaultErrorCodeForStatus,
  resolveRequestIdFromRequest,
  sanitizeClientMessage,
} from './api-error.util';
import { BadRequestException } from '@nestjs/common';

describe('api-error.util', () => {
  describe('defaultErrorCodeForStatus', () => {
    it('maps 5xx to INTERNAL', () => {
      expect(defaultErrorCodeForStatus(500)).toBe(ApiErrorCode.INTERNAL);
      expect(defaultErrorCodeForStatus(503)).toBe(ApiErrorCode.INTERNAL);
    });
    it('maps common 4xx to stable ApiErrorCode values', () => {
      expect(defaultErrorCodeForStatus(409)).toBe(ApiErrorCode.CONFLICT);
      expect(defaultErrorCodeForStatus(404)).toBe(ApiErrorCode.NOT_FOUND);
      expect(defaultErrorCodeForStatus(400)).toBe(ApiErrorCode.VALIDATION_FAILED);
    });
  });

  describe('buildApiErrorBody', () => {
    it('uses custom code from HttpException response object', () => {
      const err = apiConflictException(
        ApiDomainErrorCode.RESERVATION_OVERLAP,
        'Slot taken',
        { resourceId: 'r1' },
      );
      const body = buildApiErrorBody(err, 'req_abc', 409);
      expect(body).toEqual({
        code: ApiDomainErrorCode.RESERVATION_OVERLAP,
        message: 'Slot taken',
        details: { resourceId: 'r1' },
        requestId: 'req_abc',
      });
    });

    it('maps apiForbiddenException to domain code on 403', () => {
      const err = apiForbiddenException(
        ApiDomainErrorCode.CAPTCHA_REQUIRED,
        'Complete the CAPTCHA challenge to continue.',
      );
      const body = buildApiErrorBody(err, 'req_cap', 403);
      expect(body).toEqual({
        code: ApiDomainErrorCode.CAPTCHA_REQUIRED,
        message: 'Complete the CAPTCHA challenge to continue.',
        details: {},
        requestId: 'req_cap',
      });
    });

    it('maps apiUnauthorizedException to domain code on 401', () => {
      const err = apiUnauthorizedException(
        ApiDomainErrorCode.MFA_INVALID,
        'Invalid MFA code.',
      );
      const body = buildApiErrorBody(err, 'req_mfa', 401);
      expect(body).toEqual({
        code: ApiDomainErrorCode.MFA_INVALID,
        message: 'Invalid MFA code.',
        details: {},
        requestId: 'req_mfa',
      });
    });

    it('maps guest token apiUnauthorizedException to domain code on 401', () => {
      const err = apiUnauthorizedException(
        ApiDomainErrorCode.GUEST_TOKEN_EXPIRED,
        'This link has expired.',
      );
      const body = buildApiErrorBody(err, 'req_guest', 401);
      expect(body).toEqual({
        code: ApiDomainErrorCode.GUEST_TOKEN_EXPIRED,
        message: 'This link has expired.',
        details: {},
        requestId: 'req_guest',
      });
    });

    it('falls back to HTTP_N for plain Nest exceptions', () => {
      const body = buildApiErrorBody(
        new BadRequestException('bad input'),
        'req_1',
        400,
      );
      expect(body.code).toBe(ApiErrorCode.VALIDATION_FAILED);
      expect(body.message).toBe('bad input');
      expect(body.requestId).toBe('req_1');
    });

    it('hides unexpected Error message on 500', () => {
      const body = buildApiErrorBody(
        new Error('prisma connection failed'),
        'req_x',
        500,
      );
      expect(body.code).toBe(ApiErrorCode.INTERNAL);
      expect(body.message).toBe('An unexpected error occurred.');
    });
  });

  describe('sanitizeClientMessage', () => {
    it('redacts prisma-like 5xx messages', () => {
      expect(sanitizeClientMessage('PrismaClientKnownRequestError', 500)).toBe(
        'An unexpected error occurred.',
      );
    });
    it('keeps normal 4xx messages', () => {
      expect(sanitizeClientMessage('Missing permission', 403)).toBe(
        'Missing permission',
      );
    });
  });

  describe('resolveRequestIdFromRequest', () => {
    it('prefers req.requestId', () => {
      expect(
        resolveRequestIdFromRequest({ requestId: 'abcd1234-req' }),
      ).toBe('abcd1234-req');
    });
    it('reads x-request-id header', () => {
      expect(
        resolveRequestIdFromRequest({
          headers: { 'x-request-id': 'header-id-99' },
        }),
      ).toBe('header-id-99');
    });
    it('generates when missing', () => {
      const id = resolveRequestIdFromRequest({ headers: {} });
      expect(id.startsWith('req_')).toBe(true);
    });
  });
});

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { ApiErrorCode } from './api-error.codes';
import {
  httpStatusFromException,
  isSentryClientActive,
  shouldCaptureExceptionForSentry,
  SentryExceptionFilter,
} from './sentry-exception.filter';

jest.mock('@sentry/node', () => ({
  getClient: jest.fn(),
  captureException: jest.fn(),
}));

const getClient = Sentry.getClient as jest.MockedFunction<
  typeof Sentry.getClient
>;
const captureException = Sentry.captureException as jest.MockedFunction<
  typeof Sentry.captureException
>;

describe('httpStatusFromException', () => {
  it('reads HttpException status', () => {
    expect(httpStatusFromException(new NotFoundException())).toBe(404);
    expect(httpStatusFromException(new BadRequestException('x'))).toBe(400);
    expect(
      httpStatusFromException(
        new HttpException('gone', HttpStatus.SERVICE_UNAVAILABLE),
      ),
    ).toBe(503);
  });

  it('treats plain Error / unknown as 500', () => {
    expect(httpStatusFromException(new Error('boom'))).toBe(500);
    expect(httpStatusFromException('string-throw')).toBe(500);
    expect(httpStatusFromException(null)).toBe(500);
  });

  it('reads status property on plain objects', () => {
    expect(httpStatusFromException({ status: 502 })).toBe(502);
  });
});

describe('shouldCaptureExceptionForSentry', () => {
  it('skips 4xx', () => {
    expect(shouldCaptureExceptionForSentry(new ForbiddenException())).toBe(
      false,
    );
    expect(shouldCaptureExceptionForSentry(new NotFoundException())).toBe(
      false,
    );
    expect(shouldCaptureExceptionForSentry({ status: 429 })).toBe(false);
  });

  it('captures 5xx and unexpected', () => {
    expect(
      shouldCaptureExceptionForSentry(
        new HttpException('x', HttpStatus.INTERNAL_SERVER_ERROR),
      ),
    ).toBe(true);
    expect(shouldCaptureExceptionForSentry(new Error('unexpected'))).toBe(
      true,
    );
  });
});

describe('isSentryClientActive', () => {
  afterEach(() => {
    getClient.mockReset();
  });

  it('is false without client (no DSN / init skipped)', () => {
    getClient.mockReturnValue(undefined);
    expect(isSentryClientActive()).toBe(false);
  });

  it('is true when client exists', () => {
    getClient.mockReturnValue({} as ReturnType<typeof Sentry.getClient>);
    expect(isSentryClientActive()).toBe(true);
  });
});

describe('SentryExceptionFilter.catch', () => {
  const reply = jest.fn();
  const setHeader = jest.fn();

  beforeEach(() => {
    reply.mockReset();
    setHeader.mockReset();
    getClient.mockReset();
    captureException.mockReset();
  });

  function makeFilter() {
    return new SentryExceptionFilter({
      httpAdapter: { reply, setHeader },
    } as never);
  }

  function makeHost(req: Record<string, unknown> = {}) {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
      }),
    } as never;
  }

  it('does not capture 4xx even when Sentry is active; replies envelope', () => {
    getClient.mockReturnValue({} as ReturnType<typeof Sentry.getClient>);
    makeFilter().catch(new BadRequestException('nope'), makeHost());
    expect(captureException).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        code: ApiErrorCode.VALIDATION_FAILED,
        message: 'nope',
        requestId: expect.any(String),
      }),
      400,
    );
  });

  it('does not capture 5xx when Sentry client is absent', () => {
    getClient.mockReturnValue(undefined);
    makeFilter().catch(new Error('server'), makeHost({ requestId: 'req_fixed1' }));
    expect(captureException).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        code: ApiErrorCode.INTERNAL,
        message: 'An unexpected error occurred.',
        requestId: 'req_fixed1',
      }),
      500,
    );
  });

  it('captures unexpected Error when Sentry is active', () => {
    getClient.mockReturnValue({} as ReturnType<typeof Sentry.getClient>);
    const err = new Error('server boom');
    makeFilter().catch(err, makeHost({ requestId: 'req_boom99' }));
    expect(captureException).toHaveBeenCalledWith(err);
    expect(reply).toHaveBeenCalled();
  });

  it('captures HttpException 503 when Sentry is active', () => {
    getClient.mockReturnValue({} as ReturnType<typeof Sentry.getClient>);
    const err = new HttpException('down', HttpStatus.SERVICE_UNAVAILABLE);
    makeFilter().catch(err, makeHost({ requestId: 'req_503xxx' }));
    expect(captureException).toHaveBeenCalledWith(err);
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: ApiErrorCode.INTERNAL, requestId: 'req_503xxx' }),
      503,
    );
  });
});

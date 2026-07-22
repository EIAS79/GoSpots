import type * as Sentry from '@sentry/node';
import {
  redactDeep,
  scrubRequestHeaders,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubUrl,
} from './sentry';

describe('sentry scrub helpers', () => {
  it('redacts sensitive nested keys', () => {
    expect(
      redactDeep({
        shopId: 's1',
        email: 'a@b.c',
        nested: { refreshToken: 'abc', ok: 1 },
      }),
    ).toEqual({
      shopId: 's1',
      email: '[Redacted]',
      nested: { refreshToken: '[Redacted]', ok: 1 },
    });
  });

  it('scrubs cookie and auth headers', () => {
    expect(
      scrubRequestHeaders({
        'content-type': 'application/json',
        cookie: 'access_token=x',
        Authorization: 'Bearer y',
        'x-csrf-token': 'z',
      }),
    ).toEqual({
      'content-type': 'application/json',
      cookie: '[Redacted]',
      Authorization: '[Redacted]',
      'x-csrf-token': '[Redacted]',
    });
  });

  it('strips query strings from urls', () => {
    expect(scrubUrl('/api/v1/guest?token=secret')).toBe(
      '/api/v1/guest?[Redacted]',
    );
    expect(scrubUrl('/api/v1/live')).toBe('/api/v1/live');
  });

  it('beforeSend drops bodies, cookies, and PII user fields', () => {
    const event = scrubSentryEvent({
      request: {
        url: 'https://api.example/x?token=1',
        headers: { cookie: 'a=b', 'content-type': 'application/json' },
        cookies: { access_token: 'x' },
        data: { email: 'a@b.c' },
        query_string: 'token=1',
      },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
      extra: { password: 'nope', shopId: 's1' },
    } as Sentry.ErrorEvent);

    expect(event).not.toBeNull();
    expect(event!.request?.url).toBe('https://api.example/x?[Redacted]');
    expect(event!.request?.cookies).toBeUndefined();
    expect(event!.request?.data).toBeUndefined();
    expect(event!.request?.query_string).toBe('[Redacted]');
    expect(event!.request?.headers).toEqual({
      cookie: '[Redacted]',
      'content-type': 'application/json',
    });
    expect(event!.user).toEqual({ id: 'u1' });
    expect(event!.extra).toEqual({ password: '[Redacted]', shopId: 's1' });
  });

  it('beforeBreadcrumb redacts http urls', () => {
    const crumb = scrubSentryBreadcrumb({
      category: 'http',
      data: { url: '/path?guest=token', method: 'GET' },
    });
    expect(crumb?.data).toEqual({
      url: '/path?[Redacted]',
      method: 'GET',
    });
  });
});

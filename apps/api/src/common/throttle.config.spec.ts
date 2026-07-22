import {
  authThrottle,
  isThrottleDisabled,
  parsePositiveInt,
  publicThrottle,
  resolveThrottleConfig,
} from './throttle.config';

describe('throttle.config', () => {
  it('parsePositiveInt falls back on empty / invalid', () => {
    expect(parsePositiveInt(undefined, 10)).toBe(10);
    expect(parsePositiveInt('', 10)).toBe(10);
    expect(parsePositiveInt('0', 10)).toBe(10);
    expect(parsePositiveInt('-3', 10)).toBe(10);
    expect(parsePositiveInt('nope', 10)).toBe(10);
    expect(parsePositiveInt('25', 10)).toBe(25);
  });

  it('isThrottleDisabled accepts true/1', () => {
    expect(isThrottleDisabled(undefined)).toBe(false);
    expect(isThrottleDisabled('false')).toBe(false);
    expect(isThrottleDisabled('true')).toBe(true);
    expect(isThrottleDisabled('1')).toBe(true);
  });

  it('resolveThrottleConfig uses production-safe defaults', () => {
    const cfg = resolveThrottleConfig({});
    expect(cfg.disabled).toBe(false);
    expect(cfg.ttlMs).toBe(60_000);
    expect(cfg.globalLimit).toBe(100);
    expect(cfg.auth.strict).toEqual({ limit: 5, ttl: 60_000 });
    expect(cfg.auth.login).toEqual({ limit: 10, ttl: 60_000 });
    expect(cfg.auth.refresh).toEqual({ limit: 30, ttl: 60_000 });
    expect(cfg.auth.csrf).toEqual({ limit: 60, ttl: 60_000 });
    expect(cfg.public.booking).toEqual({ limit: 5, ttl: 60_000 });
    expect(cfg.public.event).toEqual({ limit: 5, ttl: 60_000 });
    expect(cfg.public.contact).toEqual({ limit: 5, ttl: 60_000 });
    expect(cfg.public.review).toEqual({ limit: 5, ttl: 60_000 });
    expect(cfg.public.chatOpen).toEqual({ limit: 5, ttl: 60_000 });
  });

  it('resolveThrottleConfig honors env overrides', () => {
    const cfg = resolveThrottleConfig({
      THROTTLE_DISABLED: 'true',
      THROTTLE_TTL_MS: '120000',
      THROTTLE_GLOBAL_LIMIT: '500',
      AUTH_THROTTLE_STRICT_LIMIT: '20',
      AUTH_THROTTLE_LOGIN_LIMIT: '40',
      AUTH_THROTTLE_REFRESH_LIMIT: '90',
      AUTH_THROTTLE_CSRF_LIMIT: '120',
      PUBLIC_THROTTLE_BOOKING_LIMIT: '3',
      PUBLIC_THROTTLE_EVENT_LIMIT: '4',
      PUBLIC_THROTTLE_CONTACT_LIMIT: '6',
      PUBLIC_THROTTLE_REVIEW_LIMIT: '7',
      PUBLIC_THROTTLE_CHAT_OPEN_LIMIT: '8',
    });
    expect(cfg.disabled).toBe(true);
    expect(cfg.ttlMs).toBe(120_000);
    expect(cfg.globalLimit).toBe(500);
    expect(cfg.auth.strict.limit).toBe(20);
    expect(cfg.auth.login.limit).toBe(40);
    expect(cfg.auth.refresh.limit).toBe(90);
    expect(cfg.auth.csrf.limit).toBe(120);
    expect(cfg.auth.strict.ttl).toBe(120_000);
    expect(cfg.public.booking.limit).toBe(3);
    expect(cfg.public.event.limit).toBe(4);
    expect(cfg.public.contact.limit).toBe(6);
    expect(cfg.public.review.limit).toBe(7);
    expect(cfg.public.chatOpen.limit).toBe(8);
    expect(cfg.public.booking.ttl).toBe(120_000);
  });

  it('authThrottle returns Resolvable limit/ttl bound to kind', () => {
    const prev = process.env.AUTH_THROTTLE_LOGIN_LIMIT;
    process.env.AUTH_THROTTLE_LOGIN_LIMIT = '7';
    try {
      const opts = authThrottle('login');
      const limit = opts.default.limit;
      const ttl = opts.default.ttl;
      expect(typeof limit).toBe('function');
      expect(typeof ttl).toBe('function');
      expect(limit()).toBe(7);
      expect(ttl()).toBe(resolveThrottleConfig().ttlMs);
    } finally {
      if (prev === undefined) delete process.env.AUTH_THROTTLE_LOGIN_LIMIT;
      else process.env.AUTH_THROTTLE_LOGIN_LIMIT = prev;
    }
  });

  it('publicThrottle returns Resolvable limit/ttl bound to kind', () => {
    const prev = process.env.PUBLIC_THROTTLE_BOOKING_LIMIT;
    process.env.PUBLIC_THROTTLE_BOOKING_LIMIT = '3';
    try {
      const opts = publicThrottle('booking');
      const limit = opts.default.limit;
      const ttl = opts.default.ttl;
      expect(typeof limit).toBe('function');
      expect(typeof ttl).toBe('function');
      expect(limit()).toBe(3);
      expect(ttl()).toBe(resolveThrottleConfig().ttlMs);
    } finally {
      if (prev === undefined) delete process.env.PUBLIC_THROTTLE_BOOKING_LIMIT;
      else process.env.PUBLIC_THROTTLE_BOOKING_LIMIT = prev;
    }
  });
});

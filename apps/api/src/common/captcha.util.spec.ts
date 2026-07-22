import { ForbiddenException } from '@nestjs/common';
import {
  assertCaptchaOrThrow,
  captchaEnforcementActive,
  captchaTokenRequired,
  readCaptchaToken,
  resolveCaptchaConfig,
  verifyCaptchaToken,
  type CaptchaFetch,
} from './captcha.util';

describe('captcha.util', () => {
  it('resolveCaptchaConfig defaults to off / after_throttle', () => {
    const cfg = resolveCaptchaConfig({});
    expect(cfg).toEqual({
      provider: 'off',
      mode: 'after_throttle',
      siteKey: null,
      secretKey: null,
    });
    expect(captchaEnforcementActive(cfg)).toBe(false);
    expect(captchaTokenRequired(cfg)).toBe(false);
    expect(captchaTokenRequired(cfg, { escalated: true })).toBe(false);
  });

  it('resolveCaptchaConfig reads turnstile keys and always mode', () => {
    const cfg = resolveCaptchaConfig({
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_MODE: 'always',
      TURNSTILE_SITE_KEY: 'site',
      TURNSTILE_SECRET_KEY: 'sec',
    });
    expect(cfg.provider).toBe('turnstile');
    expect(cfg.mode).toBe('always');
    expect(cfg.siteKey).toBe('site');
    expect(cfg.secretKey).toBe('sec');
    expect(captchaEnforcementActive(cfg)).toBe(true);
    expect(captchaTokenRequired(cfg)).toBe(true);
  });

  it('provider without secret is not enforced', () => {
    const cfg = resolveCaptchaConfig({
      CAPTCHA_PROVIDER: 'hcaptcha',
      CAPTCHA_MODE: 'always',
      HCAPTCHA_SITE_KEY: 'site',
    });
    expect(cfg.provider).toBe('hcaptcha');
    expect(captchaEnforcementActive(cfg)).toBe(false);
    expect(captchaTokenRequired(cfg)).toBe(false);
  });

  it('after_throttle requires token only when escalated', () => {
    const cfg = resolveCaptchaConfig({
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_MODE: 'after_throttle',
      TURNSTILE_SECRET_KEY: 'sec',
    });
    expect(captchaTokenRequired(cfg)).toBe(false);
    expect(captchaTokenRequired(cfg, { escalated: true })).toBe(true);
  });

  it('readCaptchaToken prefers body over header', () => {
    expect(
      readCaptchaToken({ bodyToken: ' from-body ', headerToken: 'from-header' }),
    ).toBe('from-body');
    expect(readCaptchaToken({ bodyToken: '  ', headerToken: ' hdr ' })).toBe(
      'hdr',
    );
    expect(readCaptchaToken({ bodyToken: null, headerToken: ['a', 'b'] })).toBe(
      'a',
    );
    expect(readCaptchaToken({})).toBeNull();
  });

  it('verifyCaptchaToken no-ops when off', async () => {
    const fetchImpl = jest.fn() as unknown as CaptchaFetch;
    const result = await verifyCaptchaToken({
      config: resolveCaptchaConfig({}),
      token: null,
      fetchImpl,
    });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('verifyCaptchaToken rejects missing token when active', async () => {
    const cfg = resolveCaptchaConfig({
      CAPTCHA_PROVIDER: 'turnstile',
      TURNSTILE_SECRET_KEY: 'sec',
    });
    const result = await verifyCaptchaToken({ config: cfg, token: '  ' });
    expect(result).toEqual({ ok: false, reason: 'missing_token' });
  });

  it('verifyCaptchaToken posts to Turnstile siteverify', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as CaptchaFetch;

    const cfg = resolveCaptchaConfig({
      CAPTCHA_PROVIDER: 'turnstile',
      TURNSTILE_SECRET_KEY: 'sec',
    });
    const result = await verifyCaptchaToken({
      config: cfg,
      token: 'tok',
      remoteIp: '1.2.3.4',
      fetchImpl,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('secret=sec'),
      }),
    );
    const body = (fetchImpl as jest.Mock).mock.calls[0][1].body as string;
    expect(body).toContain('response=tok');
    expect(body).toContain('remoteip=1.2.3.4');
  });

  it('verifyCaptchaToken posts to hCaptcha siteverify', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    }) as CaptchaFetch;

    const cfg = resolveCaptchaConfig({
      CAPTCHA_PROVIDER: 'hcaptcha',
      HCAPTCHA_SECRET_KEY: 'hsec',
    });
    const result = await verifyCaptchaToken({
      config: cfg,
      token: 'bad',
      fetchImpl,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'invalid-input-response',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.hcaptcha.com/siteverify',
      expect.any(Object),
    );
  });

  it('assertCaptchaOrThrow no-ops when provider off', async () => {
    await expect(
      assertCaptchaOrThrow({
        config: resolveCaptchaConfig({}),
        token: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('assertCaptchaOrThrow throws Forbidden when always + bad token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    }) as CaptchaFetch;

    await expect(
      assertCaptchaOrThrow({
        config: resolveCaptchaConfig({
          CAPTCHA_PROVIDER: 'turnstile',
          CAPTCHA_MODE: 'always',
          TURNSTILE_SECRET_KEY: 'sec',
        }),
        token: 'bad',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assertCaptchaOrThrow after_throttle skips until escalated', async () => {
    const fetchImpl = jest.fn() as unknown as CaptchaFetch;
    const cfg = resolveCaptchaConfig({
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_MODE: 'after_throttle',
      TURNSTILE_SECRET_KEY: 'sec',
    });

    await expect(
      assertCaptchaOrThrow({ config: cfg, token: null, fetchImpl }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(
      assertCaptchaOrThrow({
        config: cfg,
        token: null,
        escalated: true,
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

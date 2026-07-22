import {
  buildDashboardPath,
  classifyVenuePath,
  dashboardKeyPersistFields,
  hashDashboardKey,
  parseDashboardPath,
  toPublicVenuePath,
} from './dashboard-path';
import { hashToken } from './security/token';

describe('dashboard-path', () => {
  it('parses slug--key', () => {
    expect(parseDashboardPath('acme--abc123XYZ')).toEqual({
      slug: 'acme',
      dashboardKey: 'abc123XYZ',
    });
  });

  it('toPublicVenuePath strips secret', () => {
    expect(toPublicVenuePath(buildDashboardPath('acme', 'k'))).toBe('acme');
    expect(toPublicVenuePath('acme')).toBe('acme');
  });

  it('classifyVenuePath strips legacy capability to slug-only', () => {
    expect(classifyVenuePath('acme--secretKey')).toEqual({
      mode: 'slug',
      slug: 'acme',
    });
    expect(classifyVenuePath('acme')).toEqual({ mode: 'slug', slug: 'acme' });
    expect(classifyVenuePath('  arcade  ')).toEqual({
      mode: 'slug',
      slug: 'arcade',
    });
    expect(classifyVenuePath('')).toBeNull();
    expect(classifyVenuePath('a/b')).toBeNull();
  });

  it('hashDashboardKey matches hashToken / persist fields', () => {
    expect(hashDashboardKey('rawKey')).toBe(hashToken('rawKey'));
    expect(dashboardKeyPersistFields('rawKey')).toEqual({
      dashboardKey: 'rawKey',
      dashboardKeyHash: hashToken('rawKey'),
    });
  });
});

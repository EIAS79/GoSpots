import {
  concurrencyTestsEnabled,
  type ConcurrencyEnv,
} from './concurrency.harness';

describe('concurrencyTestsEnabled (skip gate)', () => {
  const base: ConcurrencyEnv = {
    RUN_CONCURRENCY_TESTS: undefined,
    DATABASE_URL: undefined,
  };

  it('is false when RUN_CONCURRENCY_TESTS is unset', () => {
    expect(
      concurrencyTestsEnabled({
        ...base,
        DATABASE_URL: 'postgresql://gospots:gospots_dev@127.0.0.1:5432/gospots',
      }),
    ).toBe(false);
  });

  it('is false when RUN_CONCURRENCY_TESTS is not exactly 1', () => {
    expect(
      concurrencyTestsEnabled({
        RUN_CONCURRENCY_TESTS: 'true',
        DATABASE_URL: 'postgresql://gospots:gospots_dev@127.0.0.1:5432/gospots',
      }),
    ).toBe(false);
  });

  it('is false when DATABASE_URL is missing', () => {
    expect(
      concurrencyTestsEnabled({
        RUN_CONCURRENCY_TESTS: '1',
        DATABASE_URL: '',
      }),
    ).toBe(false);
  });

  it('is false for CI prisma-generate placeholder URLs', () => {
    expect(
      concurrencyTestsEnabled({
        RUN_CONCURRENCY_TESTS: '1',
        DATABASE_URL: 'postgresql://ci:ci@localhost:5432/ci?schema=public',
      }),
    ).toBe(false);
  });

  it('is false for Neon hosts even when opted in', () => {
    expect(
      concurrencyTestsEnabled({
        RUN_CONCURRENCY_TESTS: '1',
        DATABASE_URL:
          'postgresql://u:p@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require',
      }),
    ).toBe(false);
  });

  it('is true when opted in with a real-looking local DATABASE_URL', () => {
    expect(
      concurrencyTestsEnabled({
        RUN_CONCURRENCY_TESTS: '1',
        DATABASE_URL:
          'postgresql://gospots:gospots_dev@127.0.0.1:5432/gospots?schema=public',
      }),
    ).toBe(true);
  });
});

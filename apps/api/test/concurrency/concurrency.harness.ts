/**
 * Opt-in live-Postgres concurrency suite harness (bible #2 / #4 / #5).
 * Design: docs/audit/GO_SPOTS_CONCURRENCY_TESTS.md
 *
 * Default CI / `pnpm test` never loads these files (dedicated Jest config).
 * `pnpm test:concurrency` without RUN_CONCURRENCY_TESTS=1 skips live recipes.
 */

export type ConcurrencyEnv = {
  RUN_CONCURRENCY_TESTS?: string;
  DATABASE_URL?: string;
};

/** True only when explicitly opted in with a non-placeholder local DATABASE_URL. */
export function concurrencyTestsEnabled(
  env: ConcurrencyEnv = process.env,
): boolean {
  if (env.RUN_CONCURRENCY_TESTS !== '1') return false;
  const url = env.DATABASE_URL?.trim();
  if (!url) return false;
  // Placeholder used for `prisma generate` / CI unit jobs — not a real DB.
  if (
    url.includes('@localhost:5432/ci') ||
    url.includes('postgresql://ci:ci@') ||
    /@localhost:5432\/ci(\?|$)/.test(url)
  ) {
    return false;
  }
  // Never hammer shared Neon from apps/api/.env — local Docker / ephemeral only.
  if (/neon\.tech|neon\.build|\.neon\./i.test(url)) {
    return false;
  }
  return true;
}

/**
 * `describe` when enabled; `describe.skip` otherwise (clear skip reason).
 * Live C1–C3 bodies: util/lock path in booking-double-book + stock-last-unit specs
 * (Lane HHHHHH). Still requires local DATABASE_URL — Neon refused.
 */
export function describeConcurrency(
  name: string,
  fn: () => void,
  env: ConcurrencyEnv = process.env,
): void {
  const enabled = concurrencyTestsEnabled(env);
  if (!enabled) {
    describe.skip(
      `${name} [set RUN_CONCURRENCY_TESTS=1 + local DATABASE_URL (not Neon)]`,
      fn,
    );
    return;
  }
  describe(name, fn);
}

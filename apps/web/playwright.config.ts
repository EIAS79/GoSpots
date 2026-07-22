import { defineConfig, devices } from "@playwright/test";

/**
 * Optional Playwright smoke — not wired into CI this wave.
 *
 * Run (web server must already be up, or the smoke test skips):
 *   pnpm --filter @gospots/web run dev          # terminal 1
 *   pnpm --filter @gospots/web run test:e2e:smoke  # terminal 2
 *
 * Or from repo root: `pnpm test:e2e:smoke` / `pnpm test:a11y:smoke`
 * Override base URL: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`
 *
 * First-time browsers: `pnpm --filter @gospots/web exec playwright install chromium`
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // No webServer — keep CI green without a Next process; skip when unreachable.
});

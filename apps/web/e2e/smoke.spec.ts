import { test, expect } from "@playwright/test";

/**
 * Smoke: load /login and assert Locora brand (title + visible name).
 * Skips when no Next server is listening — does not fail CI / local without `dev`.
 *
 * How to run:
 *   1. pnpm --filter @gospots/web run dev
 *   2. pnpm --filter @gospots/web run test:e2e:smoke
 *   (first time) pnpm --filter @gospots/web exec playwright install chromium
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

async function isWebServerUp(): Promise<boolean> {
  try {
    const res = await fetch(baseURL, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(2500),
    });
    // Any HTTP response means the server is accepting connections.
    return res.status > 0;
  } catch {
    return false;
  }
}

test.describe("web smoke", () => {
  test.beforeAll(async () => {
    const up = await isWebServerUp();
    test.skip(
      !up,
      `No web server at ${baseURL}. Start Next (pnpm --filter @gospots/web run dev), then re-run test:e2e:smoke.`,
    );
  });

  test("login page shows Locora brand", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(/Locora/i);
    await expect(page.getByText("Locora", { exact: true }).first()).toBeVisible();
  });
});

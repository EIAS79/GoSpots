import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Optional a11y smoke: axe-core on key public routes.
 * Skips when no Next server is listening — does not fail CI / local without `dev`.
 * Soft on first wave: logs serious/moderate/minor as known noise; fails only on critical.
 *
 * How to run:
 *   1. pnpm --filter @gospots/web run dev
 *   2. pnpm --filter @gospots/web run test:a11y:smoke
 *   (first time) pnpm --filter @gospots/web exec playwright install chromium
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

/**
 * Public surfaces covered by Lane UU + EEE + YYY + JJJJJ (bible #29).
 * Guest status paths use placeholder slug/token — no auth; pages settle on
 * load-error / not-found UI (API may be down; still an axe-able shell).
 */
const A11Y_ROUTES = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/staff/activate",
  "/venues",
  "/for-venues",
  "/privacy",
  "/terms",
  "/venue/a11y-smoke/gaming-status/a11y-placeholder",
  "/venue/a11y-smoke/dining-status/a11y-placeholder",
  "/venue/a11y-smoke/event-status/a11y-placeholder",
] as const;

async function isWebServerUp(): Promise<boolean> {
  // Prefer Node `http` over `fetch` — undici fetch can hang/abort on some
  // Windows + Node 20+/26 setups while the Next server is healthy (curl/http.get OK).
  const http = await import("node:http");
  const https = await import("node:https");
  return await new Promise((resolve) => {
    try {
      const url = new URL(baseURL);
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: "/",
          method: "GET",
          timeout: 30_000,
        },
        (res) => {
          res.resume();
          resolve((res.statusCode ?? 0) > 0);
        },
      );
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.on("error", () => resolve(false));
      req.end();
    } catch {
      resolve(false);
    }
  });
}

function formatViolation(v: {
  id: string;
  impact?: string | null;
  help: string;
  nodes: { target: unknown[] }[];
}): string {
  const targets = v.nodes
    .slice(0, 3)
    .map((n) => JSON.stringify(n.target))
    .join("; ");
  return `[${v.impact ?? "?"}] ${v.id}: ${v.help} → ${targets}`;
}

test.describe("web a11y smoke", () => {
  test.beforeAll(async () => {
    const up = await isWebServerUp();
    test.skip(
      !up,
      `No web server at ${baseURL}. Start Next (pnpm --filter @gospots/web run dev), then re-run test:a11y:smoke.`,
    );
  });

  for (const route of A11Y_ROUTES) {
    test(`${route} — axe (critical only hard-fail)`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const critical = results.violations.filter((v) => v.impact === "critical");
      const soft = results.violations.filter(
        (v) =>
          v.impact === "serious" ||
          v.impact === "moderate" ||
          v.impact === "minor",
      );

      if (soft.length > 0) {
        // Soft assert: document known/noisy issues without failing the stub run.
        // eslint-disable-next-line no-console
        console.warn(
          `[a11y soft] ${route}: ${soft.length} non-critical violation(s) (logged, not failing):\n` +
            soft.map(formatViolation).join("\n"),
        );
      }

      if (critical.length > 0) {
        // eslint-disable-next-line no-console
        console.error(
          `[a11y critical] ${route}:\n` + critical.map(formatViolation).join("\n"),
        );
      }

      expect(
        critical,
        critical.map(formatViolation).join("\n") ||
          `no critical axe violations on ${route}`,
      ).toEqual([]);
    });
  }
});

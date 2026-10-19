/**
 * Dedicated browser acceptance of the actual HardwareWorkspace component.
 * Bundles only this test fixture and uses intercepted, nonproduction API data.
 * Does not add a public Next.js route, call a printer, or require live customers.
 */
import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";

const webRoot = path.resolve(__dirname, "../..");
const fixtureEntry = path.resolve(
  __dirname,
  "../fixtures/t009-hardware-mount.tsx",
);
const requireWeb = createRequire(path.join(webRoot, "package.json"));
const tsxEntry = requireWeb.resolve("tsx");
const esbuild = createRequire(tsxEntry)("esbuild") as typeof import("esbuild");

let browserBundle = "";
test.beforeAll(async () => {
  const result = await esbuild.build({
    entryPoints: [fixtureEntry],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    loader: { ".tsx": "tsx" },
    absWorkingDir: webRoot,
    plugins: [
      {
        name: "t009-intercept-api-client",
        setup(build) {
          build.onResolve({ filter: /^@\/lib\/api-client$/ }, () => ({
            path: "t009-test-only-client",
            namespace: "t009-mock",
          }));
          build.onLoad({ filter: /.*/, namespace: "t009-mock" }, () => ({
            contents: `
            async function request(path, method, body) {
              const response = await fetch('/api' + path, {
                method, headers: {'Content-Type':'application/json'},
                body: body === undefined ? undefined : JSON.stringify(body),
              });
              if (!response.ok) throw new Error(await response.text());
              return response.json();
            }
            export const api = {
              get: (path) => request(path, 'GET'),
              post: (path, body) => request(path, 'POST', body),
            };
          `,
            loader: "js",
          }));
        },
      },
    ],
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
  });
  browserBundle = result.outputFiles[0].text;
});

type Incident = {
  id: string;
  shopId: string;
  type: string;
  status: string;
  sourceType: string;
  sourceId: string;
  printerDeviceId: string;
  claimedByEdgeDeviceId: string;
  claimedAt: string;
  printingAt: string;
  printedAt: null;
  createdAt: string;
  updatedAt: string;
  lastErrorCode: string;
  lastError: string;
  attemptCount: number;
};
const time = "2026-10-15T04:00:00.000Z";
const incident = (index: number): Incident => ({
  id: `t009-job-${String(index).padStart(4, "0")}`,
  shopId: "shop-A",
  type: "CUSTOMER_RECEIPT",
  status: "PRINTING",
  sourceType: "GuestCheck",
  sourceId: `check-${index}`,
  printerDeviceId: "printer-1",
  claimedByEdgeDeviceId: "edge-1",
  claimedAt: time,
  printingAt: time,
  printedAt: null,
  createdAt: time,
  updatedAt: time,
  lastErrorCode: "EDGE_PRINT_OUTCOME_UNKNOWN",
  lastError:
    "Physical print outcome is uncertain. Inspect output before any action.",
  attemptCount: 1,
});

type Fixture = {
  incidents: Incident[];
  denied?: boolean;
  failIncidentFetch?: boolean;
  failMoreOnce?: boolean;
  requests: string[];
  duplicateOnSecondPage?: boolean;
  caseState?: {
    id: string; state: string; physicalOutcome: string | null; version: number;
    events: Array<{ id: string; kind: string; reason: string; actorUserId: string; occurredAt: string;
      evidence: Record<string, string> | null; physicalOutcome: string | null }>;
  } | null;
};
function fixture(incidents: Incident[]): Fixture {
  return { incidents, requests: [] };
}
const overview = {
  printers: [
    {
      deviceId: "printer-1",
      adapter: "tcp-escpos",
      host: "127.0.0.1",
      port: 9100,
      paperWidthMm: 80,
      enabled: true,
      lastError: null,
    },
  ],
  routes: [
    {
      id: "route-1",
      name: "Kitchen",
      jobType: "KITCHEN",
      sourceKey: null,
      printerDeviceId: "printer-1",
      priority: 100,
      enabled: true,
    },
  ],
  recentJobs: [
    {
      id: "recent-uncertain",
      type: "CUSTOMER_RECEIPT",
      sourceType: "GuestCheck",
      sourceId: "guest-1",
      status: "FAILED",
      attemptCount: 1,
      maxAttempts: 5,
      lastError: "Physical outcome uncertain",
      lastErrorCode: "EDGE_PRINT_OUTCOME_UNKNOWN",
      claimedAt: time,
      createdAt: time,
    },
  ],
  displays: [],
  barcodeAliasCount: 0,
};

async function mount(page: import("@playwright/test").Page, state: Fixture) {
  // The mocked http://t009.test origin is intentionally insecure. Browser
  // crypto.randomUUID is HTTPS-only, so supply deterministic test-only IDs.
  await page.addInitScript(() => {
    let nextId = 0;
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true, value: () => `t009-browser-test-${++nextId}`,
    });
  });
  await page.route("http://t009.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (!pathname.startsWith("/api/")) {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><html><body><div id="t009-app"></div></body></html>',
      });
      return;
    }
    state.requests.push(`${request.method()} ${pathname}`);
    if (state.denied) {
      await route.fulfill({
        status: 403,
        body: "Bearer secret=private",
        contentType: "text/plain",
      });
      return;
    }
    const caseMatch = pathname.match(/^\/api\/hardware\/print-incidents\/([^/]+)\/(case|investigate|evidence|decision)$/);
    if (caseMatch) {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as Record<string, string | number>;
        if (!state.caseState) {
          state.caseState = { id: "case-1", version: 1, state: "OPEN", physicalOutcome: null, events: [] };
        }
        const kind = caseMatch[2] === "investigate" ? "INVESTIGATION_STARTED"
          : caseMatch[2] === "evidence" ? "EVIDENCE_RECORDED" : "DECISION_RECORDED";
        state.caseState.version += 1;
        if (kind === "INVESTIGATION_STARTED") state.caseState.state = "INVESTIGATING";
        if (kind === "DECISION_RECORDED") {
          state.caseState.physicalOutcome = String(body.physicalOutcome);
          if (body.physicalOutcome !== "UNDETERMINED") state.caseState.state = "RESOLVED";
        }
        state.caseState.events.push({
          id: "event-" + state.caseState.version, kind,
          reason: String(body.reason), actorUserId: "synthetic-manager",
          occurredAt: time, evidence: kind === "EVIDENCE_RECORDED"
            ? { method: String(body.method), reference: String(body.reference), observedAt: String(body.observedAt) }
            : null,
          physicalOutcome: kind === "DECISION_RECORDED" ? String(body.physicalOutcome) : null,
        });
      }
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(caseMatch[2] === "case"
          ? { originalJob: { id: caseMatch[1], status: "PRINTING", printedAt: null }, incident: state.caseState ?? null }
          : state.caseState) });
      return;
    }
    if (pathname === "/api/hardware") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overview),
      });
      return;
    }
    if (pathname === "/api/hardware/print-incidents") {
      if (state.failIncidentFetch) {
        await route.fulfill({
          status: 503,
          body: "token=hidden; customer@example.test",
        });
        return;
      }
      const offset = Number(url.searchParams.get("cursor") ?? 0);
      if (state.failMoreOnce && offset > 0) {
        state.failMoreOnce = false;
        await route.fulfill({
          status: 503,
          body: "https://secret/?apikey=hidden",
        });
        return;
      }
      const take = Number(url.searchParams.get("take") ?? 25);
      const items = state.incidents.slice(offset, offset + take);
      if (state.duplicateOnSecondPage && offset > 0)
        items.unshift(state.incidents[offset - 1]);
      const next = offset + take;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items,
          hasMore: next < state.incidents.length,
          nextCursor: next < state.incidents.length ? String(next) : null,
        }),
      });
      return;
    }
    // Safe stub for form-triggered UI reload; never performs hardware I/O.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  await page.goto("http://t009.test/");
  await page.addScriptTag({ content: browserBundle });
}

const panel = (page: import("@playwright/test").Page) =>
  page
    .locator("section")
    .filter({
      has: page.getByText(/Print incidents requiring physical review/),
    });
const incidentCards = (page: import("@playwright/test").Page) =>
  panel(page).locator("div.mt-3.space-y-2 > div");

test("authorized venue manager sees incident uncertainty and hardware controls without reprint", async ({
  page,
}) => {
  const state = fixture([incident(1)]);
  await mount(page, state);
  await expect(panel(page)).toContainText("1 loaded");
  await expect(incidentCards(page)).toHaveCount(1);
  await expect(panel(page)).toContainText("Potentially printed");
  await expect(panel(page)).toContainText("Original Edge edge-1");
  await expect(panel(page)).toContainText("Physical output is uncertain");
  await expect(
    page.getByRole("heading", { name: "Printer configuration" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Print routing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
  expect(state.requests).toContain("GET /api/hardware/print-incidents");
});

test("unauthorized staff receives no incident data and no raw server error", async ({
  page,
}) => {
  const state = fixture([incident(1)]);
  state.denied = true;
  await mount(page, state);
  await expect(panel(page).getByRole("alert")).toBeVisible();
  await expect(panel(page).getByRole("alert")).not.toContainText("Bearer");
  await expect(incidentCards(page)).toHaveCount(0);
});

test("empty state and first-page failure retry", async ({ page }) => {
  const state = fixture([]);
  state.failIncidentFetch = true;
  await mount(page, state);
  await expect(panel(page).getByRole("alert")).toContainText(
    "Unable to retrieve",
  );
  await expect(panel(page)).not.toContainText("customer@example.test");
  state.failIncidentFetch = false;
  await panel(page)
    .getByRole("button", { name: "Retry loading incidents" })
    .click();
  await expect(panel(page)).toContainText(
    "No unresolved physical print incidents",
  );
});

test("137 incident records paginate with load-more and unique rendered IDs", async ({
  page,
}) => {
  const state = fixture(Array.from({ length: 137 }, (_, i) => incident(i)));
  state.duplicateOnSecondPage = true;
  await mount(page, state);
  await expect(incidentCards(page)).toHaveCount(25);
  for (let i = 0; i < 5; i++) {
    await panel(page)
      .getByRole("button", { name: "Load more incidents" })
      .click();
    await expect(incidentCards(page)).toHaveCount(Math.min(137, (i + 2) * 25));
  }
  await expect(incidentCards(page)).toHaveCount(137);
  const text = await incidentCards(page).allTextContents();
  const ids = text.map((x) => x.match(/t009-job-\d{4}/)?.[0]);
  expect(new Set(ids).size).toBe(137);
  expect(ids).toEqual([...ids].sort());
  await expect(
    panel(page).getByRole("button", { name: "Load more incidents" }),
  ).toHaveCount(0);
});

test("load-more transient API failure preserves loaded incidents and allows retry", async ({
  page,
}) => {
  const state = fixture(Array.from({ length: 54 }, (_, i) => incident(i)));
  state.failMoreOnce = true;
  await mount(page, state);
  await expect(incidentCards(page)).toHaveCount(25);
  await panel(page)
    .getByRole("button", { name: "Load more incidents" })
    .click();
  await expect(panel(page).getByRole("alert")).toContainText(
    "Unable to retrieve more",
  );
  await expect(incidentCards(page)).toHaveCount(25);
  await panel(page)
    .getByRole("button", { name: "Load more incidents" })
    .click();
  await expect(incidentCards(page)).toHaveCount(50);
});

test("late original Edge success is absent after operator refresh; no printer dispatch", async ({
  page,
}) => {
  const state = fixture([incident(1)]);
  await mount(page, state);
  await expect(incidentCards(page)).toHaveCount(1);
  state.incidents = [];
  // This existing form invokes a mocked API only; its success refreshes hardware and incidents.
  await page.getByPlaceholder("Barcode").fill("t009-test-barcode");
  await page.getByPlaceholder("Entity type").fill("MENU_ITEM");
  await page.getByPlaceholder("Entity ID").fill("t009-test-item");
  await page.getByRole("button", { name: "Save alias" }).click();
  await expect(panel(page)).toContainText(
    "No unresolved physical print incidents",
  );
  expect(
    state.requests.every((x) => !x.includes("/retry") && !x.includes("/edge/")),
  ).toBe(true);
});


test("Change A records investigation, physical evidence and classification without any print or retry API", async ({ page }) => {
  const state = fixture([incident(1)]);
  await mount(page, state);
  await page.getByLabel("Review original print job").selectOption("t009-job-0001");
  await expect(page.getByText("Physical incident investigation — no reprint authorization")).toBeVisible();
  await page.getByLabel(/Reason \(required/).fill("Investigated physical output and spool records");
  await page.getByRole("button", { name: "Begin authorized investigation" }).click();
  await expect.poll(() => state.caseState?.state).toBe("INVESTIGATING");
  await expect(page.getByText("State: INVESTIGATING", { exact: false })).toBeVisible();
  await page.getByLabel(/Reason \(required/).fill("Inspected physical tray and verified Edge journal");
  await page.getByLabel("Evidence reference").fill("ticket-physical-inspection-01");
  await page.getByLabel("Observed date/time").fill("2026-10-15T04:15");
  await page.getByRole("button", { name: "Record physical evidence" }).click();
  await expect(page.getByText("EVIDENCE_RECORDED", { exact: false })).toBeVisible();
  await page.getByLabel(/Reason \(required/).fill("Operator confirms no physical print was emitted");
  await page.getByLabel("Verified physical outcome").selectOption("CONFIRMED_NOT_PRINTED");
  await page.getByRole("button", { name: "Record outcome (no reprint)" }).click();
  await expect(page.getByText("Classification: CONFIRMED_NOT_PRINTED", { exact: false }).first()).toBeVisible();
  expect(state.caseState?.state).toBe("RESOLVED");
  expect(state.caseState?.events.map(e => e.kind)).toEqual([
    "INVESTIGATION_STARTED", "EVIDENCE_RECORDED", "DECISION_RECORDED",
  ]);
  expect(state.requests.filter(req => req.startsWith("POST /api/hardware/print-jobs"))).toEqual([]);
  expect(state.requests.filter(req => req.includes("/retry"))).toEqual([]);
});

test("Change A can inspect historical incident after it disappears from active list", async ({ page }) => {
  const state = fixture([]);
  state.caseState = { id: "case-archive", state: "CONFLICT", physicalOutcome: "CONFIRMED_NOT_PRINTED",
    version: 5, events: [{ id: "event-late", kind: "LATE_EDGE_SUCCESS", reason: "Original Edge succeeded",
      actorUserId: "SYSTEM", occurredAt: time, evidence: null, physicalOutcome: null }] };
  await mount(page, state);
  await page.getByPlaceholder("Original print job ID").fill("archived-original-job");
  await page.getByRole("button", { name: "Open incident history" }).click();
  await expect(page.getByText("LATE_EDGE_SUCCESS", { exact: false })).toBeVisible();
  expect(state.requests.filter(req => req.startsWith("POST"))).toHaveLength(0);
});

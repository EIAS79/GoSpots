import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { elapsedSeconds, formatElapsed } from "./local-elapsed-time";
import { offlinePayloadHash } from "./offline-outbox";
import { offlinePolicy } from "./offline-policy";

test("offline payload hashes are deterministic across object key ordering", async () => {
  const first = await offlinePayloadHash({ label: "A", partySize: 2 });
  const second = await offlinePayloadHash({ partySize: 2, label: "A" });
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("Offline Lite blocks money/provider/compliance operations explicitly", () => {
  for (const capability of [
    "card_payment",
    "fiscal_receipt",
    "ksef_submit",
    "refund",
    "subscription_billing",
    "financial_reconciliation",
  ] as const) {
    const decision = offlinePolicy(capability);
    assert.equal(decision.allowed, false, capability);
    assert.ok(decision.reason.length > 10);
  }
  assert.equal(offlinePolicy("check_create").allowed, true);
  assert.equal(offlinePolicy("check_update").allowed, true);
});

test("gaming/order candidates stay disabled until conflict semantics are implemented", () => {
  assert.equal(offlinePolicy("order_add").allowed, false);
  assert.equal(offlinePolicy("gaming_session_start").allowed, false);
  assert.equal(offlinePolicy("gaming_session_end").allowed, false);
});

test("elapsed timers are derived locally from startedAt instead of server ticks", () => {
  const started = "2026-08-10T10:00:00.000Z";
  const now = "2026-08-10T11:02:03.900Z";
  assert.equal(elapsedSeconds(started, now), 3723);
  assert.equal(formatElapsed(started, now), "01:02:03");
});

test("service worker never cache-intercepts API requests and keeps one private dashboard shell", async () => {
  const source = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8");
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(source, /if \(isApiRequest\(url\) \|\| request\.method !== "GET"\) return;/);
  assert.match(source, /PRIVATE_NAV_CACHE/);
  assert.match(source, /replacePrivateNavigation/);
  assert.match(source, /previous\.map\(\(key\) => cache\.delete\(key\)\)/);
  assert.match(source, /_next\/static/);
});

test("hard-refresh WAN recovery uses credential-free auth and venue snapshots", async () => {
  const auth = await readFile(new URL("./use-auth.tsx", import.meta.url), "utf8");
  const gate = await readFile(
    new URL("../components/layout/venue-gate.tsx", import.meta.url),
    "utf8",
  );
  assert.match(auth, /readOfflineAuthSnapshot/);
  assert.match(auth, /error\.status === 0/);
  assert.match(gate, /readOfflineShopSnapshot/);
  assert.match(gate, /requestError\.status === 0/);
  assert.match(gate, /offlineLiteEnabledFor/);
});

test("auth cold-start recovery is bounded and never performs a second manual refresh", async () => {
  const authClient = await readFile(new URL("./auth-client.ts", import.meta.url), "utf8");
  const auth = await readFile(new URL("./use-auth.tsx", import.meta.url), "utf8");

  assert.match(authClient, /SESSION_REQUEST_TIMEOUT_MS = 12_000/);
  assert.match(authClient, /AbortSignal\.timeout\(SESSION_REQUEST_TIMEOUT_MS\)/);
  assert.match(authClient, /sessionRequest\(\{ method: "GET" \}\)/);
  assert.match(auth, /TRANSIENT_AUTH_RETRY_MS = 3_000/);
  assert.match(auth, /isTransientAuthFailure/);
  assert.match(auth, /error\.status >= 500/);
  assert.match(auth, /readOfflineAuthSnapshot/);

  const reloadStart = auth.indexOf("const reload = useCallback");
  const signOutStart = auth.indexOf("const signOut = useCallback", reloadStart);
  assert.ok(reloadStart >= 0 && signOutStart > reloadStart);
  const reloadBlock = auth.slice(reloadStart, signOutStart);
  assert.doesNotMatch(reloadBlock, /apiRefresh\(/);
});

test("readiness probes and Render wakes have bounded recovery paths", async () => {
  const connectivity = await readFile(
    new URL("./connectivity-context.tsx", import.meta.url),
    "utf8",
  );
  const render = await readFile(
    new URL("../../../../render.yaml", import.meta.url),
    "utf8",
  );

  assert.match(connectivity, /READY_POLL_MS = 30_000/);
  assert.match(connectivity, /READY_PROBE_TIMEOUT_MS = 8_000/);
  assert.match(connectivity, /AbortSignal\.timeout\(READY_PROBE_TIMEOUT_MS\)/);
  assert.match(render, /pnpm --filter @gospots\/api exec prisma migrate deploy/);

  const startCommand = render.slice(render.indexOf("startCommand:"), render.indexOf("healthCheckPath:"));
  assert.doesNotMatch(startCommand, /prisma migrate deploy/);
  assert.match(startCommand, /node dist\/main\.js/);
});

test("an ambiguous online GuestCheck mutation is not converted into a second local create", async () => {
  const source = await readFile(new URL("./guest-check-client.ts", import.meta.url), "utf8");
  const createStart = source.indexOf("export async function createGuestCheck");
  const updateStart = source.indexOf("export async function updateGuestCheck", createStart);
  assert.ok(createStart >= 0 && updateStart > createStart);
  const createBlock = source.slice(createStart, updateStart);
  assert.match(createBlock, /if \(offlineNow\(\)\) return createGuestCheckOffline\(body\)/);
  assert.equal((createBlock.match(/createGuestCheckOffline\(body\)/g) ?? []).length, 1);
  assert.doesNotMatch(createBlock, /isNetworkFailure/);
});

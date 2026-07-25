/**
 * Lightweight homepage perf smoke — verifies motion modules exist and
 * optionally hits a running production server.
 *
 * Usage:
 *   pnpm --filter @gospots/web run build
 *   pnpm --filter @gospots/web run start   # terminal A
 *   pnpm --filter @gospots/web run perf:smoke
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "src/lib/motion-system.ts",
  "src/lib/motion-capability.ts",
  "src/lib/use-active-when-visible.ts",
  "src/components/effects/section-reveal.tsx",
  "src/components/effects/motion-provider.tsx",
];

let failed = false;
for (const rel of required) {
  const p = resolve(root, rel);
  if (!existsSync(p)) {
    console.error("missing", rel);
    failed = true;
  } else {
    console.log("ok", rel);
  }
}

const base = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000";
try {
  const res = await fetch(base + "/", { redirect: "follow" });
  const text = await res.text();
  console.log("GET /", res.status, "html_chars≈", text.length);
  if (!res.ok) failed = true;
  if (!text.includes("GoSpots") && !text.includes("gospots")) {
    console.warn("homepage HTML missing brand string (may be client-only)");
  }
} catch (e) {
  console.warn(
    "Server not reachable at",
    base,
    "— start production server to complete HTTP smoke.",
  );
  console.warn(String(e?.message ?? e));
}

if (failed) process.exit(1);
console.log("perf smoke passed");

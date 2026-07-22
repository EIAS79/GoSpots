/**
 * Run: pnpm --filter @gospots/web exec tsx --test src/lib/format.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDate } from "./format";

describe("formatDate", () => {
  it("accepts optional venue IANA timeZone", () => {
    const iso = "2026-07-20T23:30:00.000Z";
    const inUtc = formatDate(iso, "en-US", "UTC");
    const inWarsaw = formatDate(iso, "en-US", "Europe/Warsaw");
    assert.notEqual(inUtc, inWarsaw);
    assert.match(inWarsaw, /Jul 21/);
  });

  it("ignores invalid timeZone and keeps browser-default semantics", () => {
    const iso = "2026-07-20T12:00:00.000Z";
    const withoutTz = formatDate(iso, "en-US");
    const withInvalid = formatDate(iso, "en-US", "Not/A/Zone");
    assert.equal(withInvalid, withoutTz);
  });
});

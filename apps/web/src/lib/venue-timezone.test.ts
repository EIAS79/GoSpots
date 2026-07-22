/**
 * Minimal parity checks vs API `venue-timezone.util.spec.ts`.
 * Run: pnpm --filter @gospots/web run test:venue-tz
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addVenueCalendarDays,
  calendarDayInTimeZone,
  resolveVenueTimeZone,
  venueDayKey,
} from "./venue-timezone";

describe("venue-timezone", () => {
  it("formats calendar day in zone", () => {
    const nearMidnightUtc = new Date("2026-07-20T23:30:00.000Z");
    assert.equal(
      calendarDayInTimeZone("America/New_York", nearMidnightUtc),
      "2026-07-20",
    );
    assert.equal(
      calendarDayInTimeZone("Asia/Tokyo", nearMidnightUtc),
      "2026-07-21",
    );
  });

  it("resolves venue timezone from shop settings shape", () => {
    assert.equal(
      resolveVenueTimeZone({ timezone: "Europe/Paris", locale: "en" }),
      "Europe/Paris",
    );
    assert.equal(resolveVenueTimeZone({ timezone: null, locale: "pl" }), "Europe/Warsaw");
    assert.equal(resolveVenueTimeZone({ timezone: "bogus", locale: "fr" }), "Europe/Paris");
    assert.equal(resolveVenueTimeZone({}), "UTC");
  });

  it("venueDayKey accepts IANA or locale fallback", () => {
    const at = new Date("2026-07-20T23:30:00.000Z");
    assert.equal(venueDayKey("America/New_York", at), "2026-07-20");
    assert.equal(venueDayKey("pl", at), "2026-07-21");
  });

  it("addVenueCalendarDays shifts keys", () => {
    assert.equal(addVenueCalendarDays("2026-07-20", 1), "2026-07-21");
    assert.equal(addVenueCalendarDays("2026-07-20", -1), "2026-07-19");
  });
});

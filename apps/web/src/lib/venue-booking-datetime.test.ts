import { strict as assert } from "node:assert";
import { test } from "node:test";
import { utcIsoToVenueWall, venueWallToUtc, venueWallToUtcIso } from "./venue-booking-datetime";

test("traveling visitor selects venue Warsaw time, not device-local time", () => {
  assert.equal(venueWallToUtcIso("2027-06-02", "18:30", "Europe/Warsaw"), "2027-06-02T16:30:00.000Z");
  assert.equal(utcIsoToVenueWall("2027-06-02T16:30:00.000Z", "Europe/Warsaw").time, "18:30");
  assert.equal(utcIsoToVenueWall("2027-06-02T16:30:00.000Z", "America/Los_Angeles").time, "09:30");
});

test("venue day can differ from UTC and customer browser day", () => {
  assert.deepEqual(utcIsoToVenueWall("2026-06-01T23:30:00.000Z", "Europe/Warsaw"), { date: "2026-06-02", time: "01:30" });
  assert.deepEqual(utcIsoToVenueWall("2026-06-01T23:30:00.000Z", "America/New_York"), { date: "2026-06-01", time: "19:30" });
});

test("spring-forward missing wall time is rejected, never shifted", () => {
  assert.deepEqual(venueWallToUtc("2026-03-29", "02:30", "Europe/Warsaw"), { kind: "nonexistent" });
  assert.equal(venueWallToUtcIso("2026-03-29", "03:30", "Europe/Warsaw"), "2026-03-29T01:30:00.000Z");
});

test("fall-back ambiguous local time is rejected, not silently assigned an offset", () => {
  assert.deepEqual(venueWallToUtc("2026-10-25", "02:30", "Europe/Warsaw"), { kind: "ambiguous" });
  assert.equal(venueWallToUtcIso("2026-10-25", "03:30", "Europe/Warsaw"), "2026-10-25T02:30:00.000Z");
  assert.deepEqual(utcIsoToVenueWall("2026-10-25T00:30:00Z", "Europe/Warsaw"), { date: "2026-10-25", time: "02:30" });
  assert.deepEqual(utcIsoToVenueWall("2026-10-25T01:30:00Z", "Europe/Warsaw"), { date: "2026-10-25", time: "02:30" });
});

test("malformed civil dates and invalid IANA zone cannot become bookings", () => {
  assert.deepEqual(venueWallToUtc("2027-02-30", "10:30", "Europe/Warsaw"), { kind: "invalid" });
  assert.deepEqual(venueWallToUtc("2027-06-02", "24:00", "Europe/Warsaw"), { kind: "invalid" });
  assert.deepEqual(venueWallToUtc("2027-06-02", "10:30", "Unknown/Location"), { kind: "invalid" });
});

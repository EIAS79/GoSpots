import assert from "node:assert/strict";
import test from "node:test";
import { formatChartDayLabel } from "./chart-label";

test("formats canonical API day keys without producing Invalid Date", () => {
  const label = formatChartDayLabel("2026-08-10", "en-US");
  assert.notEqual(label, "Invalid Date");
  assert.match(label, /10/);
});

test("leaves already-localized finance labels untouched", () => {
  assert.equal(formatChartDayLabel("Mon, Aug 10", "en-US"), "Mon, Aug 10");
  assert.equal(formatChartDayLabel("pon., 10 sie", "pl"), "pon., 10 sie");
});

test("does not normalize malformed or impossible day keys", () => {
  assert.equal(formatChartDayLabel("2026-02-30", "en-US"), "2026-02-30");
  assert.equal(formatChartDayLabel("not-a-date", "en-US"), "not-a-date");
});

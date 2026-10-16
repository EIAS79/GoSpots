/**
 * Converts a venue's civil date/time into an unambiguous UTC instant.
 * Never interpret a booked wall clock in the traveling visitor's device zone.
 * Ambiguous DST overlap and nonexistent spring-gap inputs fail closed.
 */
type Wall = { year: number; month: number; day: number; hour: number; minute: number };
export type VenueWallTimeResult =
  | { kind: "ok"; iso: string }
  | { kind: "invalid" | "nonexistent" | "ambiguous" };

function formatParts(at: Date, zone: string): Wall {
  const pieces = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(pieces.find((piece) => piece.type === type)?.value);
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour: get("hour"), minute: get("minute"),
  };
}

function wallEqual(a: Wall, b: Wall): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day &&
    a.hour === b.hour && a.minute === b.minute;
}

export function utcIsoToVenueWall(iso: string, zone: string): { date: string; time: string } {
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) return { date: "", time: "" };
  const p = formatParts(instant, zone);
  const pad = (v: number) => String(v).padStart(2, "0");
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export function venueWallToUtc(date: string, time: string, zone: string): VenueWallTimeResult {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) return { kind: "invalid" };
  const wall: Wall = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: Number(t[1]), minute: Number(t[2]) };
  if (wall.year < 2000 || wall.year > 2100 || wall.hour > 23 || wall.minute > 59) return { kind: "invalid" };
  const utc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const probe = new Date(utc);
  if (probe.getUTCFullYear() !== wall.year || probe.getUTCMonth() + 1 !== wall.month || probe.getUTCDate() !== wall.day) return { kind: "invalid" };
  let formatterValid = true;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(probe); }
  catch { formatterValid = false; }
  if (!formatterValid) return { kind: "invalid" };
  const offsets = new Set<number>();
  // Offset transitions can occur anywhere within the previous/following day.
  for (let hours = -36; hours <= 36; hours += 3) {
    const sample = new Date(utc + hours * 3_600_000);
    const parts = formatParts(sample, zone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    offsets.add(asUtc - sample.getTime());
  }
  const candidates = [...offsets].map((offset) => new Date(utc - offset))
    .filter((candidate) => wallEqual(formatParts(candidate, zone), wall));
  if (candidates.length === 0) return { kind: "nonexistent" };
  if (candidates.length > 1) return { kind: "ambiguous" };
  return { kind: "ok", iso: candidates[0].toISOString() };
}

export function venueWallToUtcIso(date: string, time: string, zone: string): string | undefined {
  const result = venueWallToUtc(date, time, zone);
  return result.kind === "ok" ? result.iso : undefined;
}

/** Dining no-show grace is elapsed real time, not an invented DST wall clock. */
export function venueHoldEndUtcIso(date: string, time: string, zone: string, minutes: number): string | undefined {
  const start = venueWallToUtcIso(date, time, zone);
  if (!start || !Number.isInteger(minutes) || minutes < 1) return undefined;
  return new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
}

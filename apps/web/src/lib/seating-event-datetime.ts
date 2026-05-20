/** Today's date as YYYY-MM-DD in local timezone */
export function todayDateInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function defaultEventTimes() {
  return { start: "18:00", end: "23:00" };
}

export function combineLocalDateTime(
  date: string,
  time: string,
): string | undefined {
  if (!date.trim() || !time.trim()) return undefined;
  const d = new Date(`${date}T${time}`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function splitIsoToDateAndTime(iso: string | null | undefined): {
  date: string;
  time: string;
} {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function formatEventWindow(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  locale?: string,
): string | null {
  if (!startsAt) return null;
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  if (Number.isNaN(start.getTime())) return null;

  const dateFmt = start.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFmt = (d: Date) =>
    d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  if (end && !Number.isNaN(end.getTime())) {
    const sameDay =
      start.toDateString() === end.toDateString();
    if (sameDay) {
      return `${dateFmt} · ${timeFmt(start)} – ${timeFmt(end)}`;
    }
    return `${dateFmt} ${timeFmt(start)} → ${end.toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
    })} ${timeFmt(end)}`;
  }
  return `${dateFmt} · ${timeFmt(start)}`;
}

export function eventStatus(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): "upcoming" | "live" | "ended" | null {
  if (!startsAt) return null;
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  if (Number.isNaN(start.getTime())) return null;
  const now = Date.now();
  if (now < start.getTime()) return "upcoming";
  if (end && !Number.isNaN(end.getTime()) && now > end.getTime()) return "ended";
  if (!end || now <= end.getTime()) return "live";
  return "ended";
}

import type { PublicOpeningHour } from "@/lib/shop-settings-client";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function VenueWeeklyHours({
  hours,
}: {
  hours?: PublicOpeningHour[];
}) {
  if (!hours?.length) {
    return (
      <p className="text-sm text-zinc-500">
        Opening hours haven&apos;t been published yet.
      </p>
    );
  }

  const today = new Date().getDay();

  return (
    <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/10 bg-zinc-900/40">
      {hours.map((row) => {
        const isToday = row.weekday === today;
        return (
          <li
            key={row.weekday}
            className={cnRow(isToday)}
          >
            <span className="min-w-0 font-medium text-zinc-200">
              <span className="sm:hidden">{WEEKDAYS_SHORT[row.weekday]}</span>
              <span className="hidden sm:inline">{WEEKDAYS[row.weekday]}</span>
              {isToday ? (
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-400/90">
                  Today
                </span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-xs text-zinc-400 sm:text-sm">
              {row.isClosed ? (
                <span className="text-zinc-500">Closed</span>
              ) : (
                `${row.opensAt} – ${row.closesAt}`
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function cnRow(isToday: boolean) {
  return [
    "flex flex-col items-start gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-3",
    isToday ? "bg-amber-500/[0.06]" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

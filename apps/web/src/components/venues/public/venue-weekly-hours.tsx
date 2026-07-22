"use client";

import type { PublicOpeningHour } from "@/lib/shop-settings-client";
import { usePublicPrefs } from "@/lib/public-prefs-context";

export function VenueWeeklyHours({
  hours,
}: {
  hours?: PublicOpeningHour[];
}) {
  const { t } = usePublicPrefs();

  if (!hours?.length) {
    return (
      <p className="text-sm text-zinc-500">
        {t("venuePage.overview.hoursUnpublished")}
      </p>
    );
  }

  const today = new Date().getDay();

  return (
    <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/50">
      {hours.map((row) => {
        const isToday = row.weekday === today;
        return (
          <li key={row.weekday} className={cnRow(isToday)}>
            <span className="min-w-0 font-medium text-[var(--color-foreground)]">
              <span className="sm:hidden">
                {t(`venuePage.weekdayShort.${row.weekday}`)}
              </span>
              <span className="hidden sm:inline">
                {t(`venuePage.weekday.${row.weekday}`)}
              </span>
              {isToday ? (
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400/90">
                  {t("venuePage.overview.today")}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-xs text-zinc-600 dark:text-zinc-400 sm:text-sm">
              {row.isClosed ? (
                <span className="text-zinc-500">
                  {t("venuePage.overview.closed")}
                </span>
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
    isToday ? "bg-amber-500/[0.08]" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

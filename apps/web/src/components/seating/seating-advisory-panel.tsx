"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  fetchSeatingTables,
  isAdvisoryDiningMirror,
  type SeatingTablesResponse,
} from "@/lib/seating-tables-client";
import { SEATING_ZONES, seatingZoneLabel } from "@/lib/seating-zone";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

type SeatingAdvisoryPanelProps = {
  diningLayoutHref: string;
};

export function SeatingAdvisoryPanel({
  diningLayoutHref,
}: SeatingAdvisoryPanelProps) {
  const t = useVenueSettingsOptional()?.t ?? ((k: string) => k);
  const [data, setData] = useState<SeatingTablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSeatingTables());
    } catch {
      setError(t("seating.advisory.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const mirroredGroups =
    data?.groups.filter((group) => isAdvisoryDiningMirror(group)) ?? [];

  return (
    <section
      className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5"
      aria-label={t("seating.advisory.title")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-amber-100/90">
            {t("seating.advisory.title")}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {t("seating.advisory.subtitlePrefix")}{" "}
            <Link
              href={diningLayoutHref}
              className="text-amber-300/90 hover:underline"
            >
              {t("nav.dining")}
            </Link>
            {t("seating.advisory.subtitleSuffix")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-2 flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
        </div>
      ) : error ? (
        <p className="mt-2 text-[11px] text-rose-300">{error}</p>
      ) : !data || data.summary.totalTables === 0 ? (
        <p className="mt-2 text-[11px] text-zinc-500">
          {t("seating.advisory.empty")}
        </p>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SEATING_ZONES.map((zone) => {
            const summary = data.byZone[zone];
            if (summary.totalTables <= 0) return null;
            return (
              <div
                key={zone}
                className="rounded-lg border border-white/5 bg-zinc-950/40 px-2.5 py-2"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  {seatingZoneLabel(t, zone)}
                </p>
                <p className="mt-1 text-xs text-zinc-200">
                  {t("seating.advisory.tablesFree", {
                    available: summary.availableTables,
                    total: summary.totalTables,
                  })}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {t("seating.advisory.seatsFree", {
                    available: summary.availableSeats,
                    total: summary.totalSeats,
                  })}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {mirroredGroups.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {mirroredGroups.slice(0, 4).map((group) => (
            <li
              key={group.id}
              className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400"
            >
              <span>{group.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  "bg-amber-500/15 text-amber-200/90",
                )}
              >
                {t("seating.advisory.mirroredBadge")}
              </span>
              <span className="text-zinc-500">
                {group.availableCount}/{group.totalCount}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

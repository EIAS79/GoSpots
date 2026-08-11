"use client";

import { CloudOff, History, WifiOff } from "lucide-react";
import Link from "next/link";
import { useConnectivityOptional } from "@/lib/connectivity-context";
import { translate } from "@/lib/i18n";
import { usePublicPrefsOptional } from "@/lib/public-prefs-context";
import { useVenueHrefOptional } from "@/lib/venue-context";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

const MODE_META = {
  offline: { Icon: WifiOff, key: "opsOutage.modeADesc" },
  api_unreachable: { Icon: CloudOff, key: "opsOutage.modeBDesc" },
  api_unavailable: { Icon: CloudOff, key: "opsOutage.modeCDesc" },
  stale: { Icon: History, key: "opsOutage.modeFDesc" },
} as const;

export function OfflineBanner() {
  const connectivity = useConnectivityOptional();
  const venue = useVenueSettingsOptional();
  const publicPrefs = usePublicPrefsOptional();
  const locale = venue?.locale ?? publicPrefs?.locale ?? "en";
  const syncHref = useVenueHrefOptional("/offline-sync");
  const mode = connectivity?.mode ?? "ok";
  const pending = connectivity?.pending ?? 0;
  const conflict = connectivity?.conflict ?? 0;
  const failed = connectivity?.failed ?? 0;
  const hasQueue = pending + conflict + failed > 0;
  if (mode === "ok" && !hasQueue) return null;

  const meta = mode === "ok" ? null : MODE_META[mode];
  const Icon = meta?.Icon ?? History;
  const text = meta ? translate(locale, meta.key) : "Offline work is waiting for sync review.";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-amber-400/35 bg-amber-500/15 px-4 py-2.5 text-sm text-amber-50 sm:px-5 md:px-6 lg:px-8"
    >
      <Icon size={16} className="shrink-0 text-amber-300" aria-hidden />
      <p className="min-w-0 flex-1 leading-snug">{text}</p>
      {hasQueue && syncHref ? (
        <Link
          href={syncHref}
          className="rounded-lg border border-amber-200/25 bg-black/15 px-2.5 py-1 text-xs font-semibold text-amber-100 hover:bg-black/25"
        >
          {pending} pending · {conflict} conflicts · {failed} failed
        </Link>
      ) : null}
    </div>
  );
}

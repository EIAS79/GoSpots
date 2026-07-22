"use client";

import { CloudOff, History, WifiOff } from "lucide-react";
import { useConnectivityOptional } from "@/lib/connectivity-context";
import { translate } from "@/lib/i18n";
import { usePublicPrefsOptional } from "@/lib/public-prefs-context";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

const MODE_META = {
  offline: { Icon: WifiOff, key: "opsOutage.modeADesc" },
  api_unreachable: { Icon: CloudOff, key: "opsOutage.modeBDesc" },
  api_unavailable: { Icon: CloudOff, key: "opsOutage.modeCDesc" },
  stale: { Icon: History, key: "opsOutage.modeFDesc" },
} as const;

/**
 * App-wide banner for bible #32 Modes A–C + F
 * (browser offline / API unreachable / DB down / stale live polls).
 * Requires ConnectivityProvider (mounted in AppProviders).
 * Copy follows venue locale in dashboard, else guest public prefs (en/pl).
 */
export function OfflineBanner() {
  const connectivity = useConnectivityOptional();
  const venue = useVenueSettingsOptional();
  const publicPrefs = usePublicPrefsOptional();
  const locale = venue?.locale ?? publicPrefs?.locale ?? "en";
  const mode = connectivity?.mode ?? "ok";
  if (mode === "ok") return null;

  const { Icon, key } = MODE_META[mode];
  const text = translate(locale, key);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center gap-2.5 border-b border-amber-400/35 bg-amber-500/15 px-4 py-2.5 text-sm text-amber-50 sm:px-5 md:px-6 lg:px-8"
    >
      <Icon size={16} className="shrink-0 text-amber-300" aria-hidden />
      <p className="min-w-0 leading-snug">{text}</p>
    </div>
  );
}

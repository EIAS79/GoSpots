"use client";

import { cn } from "@/lib/cn";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

export function ManagerAccessExtras({
  venueSettings,
  subscription,
  onChange,
  allowSubscriptionGrant = true,
  disabled = false,
}: {
  venueSettings: boolean;
  subscription: boolean;
  onChange: (next: { venueSettings: boolean; subscription: boolean }) => void;
  /** Owners can grant billing; managers editing others cannot newly grant it. */
  allowSubscriptionGrant?: boolean;
  disabled?: boolean;
}) {
  const vs = useVenueSettingsOptional();
  const t = vs?.t ?? ((key: string) => key);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/5 px-4 py-3">
        <p className="text-sm font-medium text-emerald-100">
          {t("team.fullAccessTitle")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          {t("team.fullAccessHint")}
        </p>
      </div>

      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {t("team.optionalGrants")}
      </p>

      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition",
          venueSettings
            ? "border-emerald-400/35 bg-emerald-500/10"
            : "border-white/10 bg-zinc-950/60 hover:border-white/20",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 rounded border-white/20"
          checked={venueSettings}
          disabled={disabled}
          onChange={(e) =>
            onChange({ venueSettings: e.target.checked, subscription })
          }
        />
        <span>
          <span className="block text-sm text-zinc-100">
            {t("team.venueSettings")}
          </span>
          <span className="mt-0.5 block text-[11px] text-zinc-500">
            {t("team.venueSettingsHint")}
          </span>
        </span>
      </label>

      <label
        className={cn(
          "flex items-start gap-3 rounded-xl border px-3 py-3 transition",
          !allowSubscriptionGrant || disabled
            ? "cursor-default opacity-60"
            : "cursor-pointer",
          subscription
            ? "border-cyan-400/35 bg-cyan-500/10"
            : "border-white/10 bg-zinc-950/60 hover:border-white/20",
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 rounded border-white/20"
          checked={subscription}
          disabled={disabled || !allowSubscriptionGrant}
          onChange={(e) =>
            onChange({ venueSettings, subscription: e.target.checked })
          }
        />
        <span>
          <span className="block text-sm text-zinc-100">
            {t("team.subscriptionBilling")}
          </span>
          <span className="mt-0.5 block text-[11px] text-zinc-500">
            {t("team.subscriptionBillingHint")}
          </span>
        </span>
      </label>
    </div>
  );
}

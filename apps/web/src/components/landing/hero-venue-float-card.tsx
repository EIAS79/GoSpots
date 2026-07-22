"use client";

import { motion } from "framer-motion";
import { MapPin, Star } from "lucide-react";
import { VenueCoverImage } from "@/components/ui/venue-cover-image";
import {
  formatVenueLocation,
  type ShopStatus,
  type VenueCard,
} from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import { usePublicPrefs } from "@/lib/public-prefs-context";

function statusBadgeClass(status: ShopStatus) {
  if (status === "open")
    return "border-emerald-500/40 bg-emerald-500/95 text-emerald-50 shadow-[0_0_20px_rgba(16,185,129,0.35)]";
  if (status === "closing_soon")
    return "border-amber-400/50 bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 shadow-[0_0_18px_rgba(245,158,11,0.45)]";
  return "border-white/15 bg-zinc-900/90 text-zinc-400";
}

function statusI18nKey(status: ShopStatus) {
  if (status === "closing_soon") return "status.closingSoon";
  return `status.${status}`;
}

/** Compact venue card for hero atmosphere layer (demo data). */
export function HeroVenueFloatCard({ venue }: { venue: VenueCard }) {
  const { t, formatMoney } = usePublicPrefs();
  const fillPct = Math.min(
    100,
    Math.round((venue.visitorsInside / Math.max(1, venue.maxVisitors)) * 100),
  );
  const unit = t(
    venue.rateUnit === "hr" ? "homeVenues.unitHr" : "homeVenues.unitSession",
  );
  const rateText = t("homeVenues.fromRate", {
    price: formatMoney(venue.rateFromEur, "EUR"),
    unit,
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/55 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] backdrop-blur-md",
        "dark:shadow-[0_24px_70px_-18px_rgba(232,140,43,0.12)]",
      )}
    >
      <div className="relative h-[72px] w-full overflow-hidden">
        <VenueCoverImage
          src={venue.image}
          alt=""
          sizes="240px"
          className="opacity-90 saturate-[0.92]"
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-background)]/90 via-transparent to-transparent",
          )}
        />
        <span
          className={cn(
            "absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            statusBadgeClass(venue.shopStatus),
          )}
        >
          {t(statusI18nKey(venue.shopStatus))}
        </span>
        <span className="absolute bottom-1.5 right-2 inline-flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200 backdrop-blur">
          <Star size={9} className="fill-amber-300 text-amber-300" />
          {venue.rating}
        </span>
      </div>

      <div className="space-y-1.5 p-2.5">
        <p className="truncate text-[11px] font-semibold text-[var(--color-foreground)]">
          {venue.name}
        </p>
        <p className="flex items-start gap-1 text-[9px] leading-snug text-zinc-500 dark:text-zinc-400">
          <MapPin size={10} className="mt-0.5 shrink-0 text-amber-600/80 dark:text-amber-300/70" />
          <span className="line-clamp-2">{formatVenueLocation(venue)}</span>
        </p>
        <p className="text-[9px] font-medium text-amber-700 dark:text-amber-300/90">
          {rateText}
        </p>
        <p className="line-clamp-2 text-[8.5px] leading-relaxed text-zinc-500 dark:text-zinc-500">
          {venue.description}
        </p>
        <div className="flex flex-wrap gap-0.5">
          {venue.tags.slice(0, 3).map((tag) => {
            const key = `homeVenues.tag.${tag}`;
            const label = t(key);
            return (
              <span
                key={tag}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-1 py-px text-[8px] text-zinc-600 dark:text-zinc-400"
              >
                {label === key ? tag : label}
              </span>
            );
          })}
        </div>

        <div className="pt-1">
          <div className="flex items-center justify-between text-[8px] text-zinc-500 dark:text-zinc-500">
            <span>{t("homeVenues.visitorsInside")}</span>
            <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
              {venue.visitorsInside} / {venue.maxVisitors}
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-300 dark:from-orange-500 dark:via-amber-400 dark:to-yellow-200"
              initial={{ width: 0 }}
              animate={{ width: `${fillPct}%` }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import type { VenueTabDef, VenueTabId } from "@/lib/public-venue-tabs";

export function VenueTabBar({
  tabs,
  active,
  onChange,
  wide = false,
}: {
  tabs: VenueTabDef[];
  active: VenueTabId;
  onChange: (id: VenueTabId) => void;
  /** Match wide tab panels (menu / maps / reviews). */
  wide?: boolean;
}) {
  const { t } = usePublicPrefs();

  if (tabs.length <= 1) return null;

  return (
    <nav
      className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/70"
      aria-label="Venue sections"
    >
      <div
        className={cn(
          "venue-tab-scroll relative mx-auto flex gap-0.5 overflow-x-auto snap-x snap-mandatory px-3 sm:px-4 md:px-6",
          wide ? "max-w-7xl" : "max-w-5xl",
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative shrink-0 snap-start px-3 py-3 text-[13px] font-medium transition-colors duration-200 sm:px-4 sm:py-3.5 sm:text-sm",
                isActive
                  ? "text-amber-200"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {t(tab.labelKey)}
              {isActive ? (
                <motion.span
                  layoutId="venue-tab-underline"
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-orange-400 shadow-[0_0_12px_rgba(251,191,36,0.45)]"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

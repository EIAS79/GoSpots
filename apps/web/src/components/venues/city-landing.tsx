"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, MapPin, Sparkles, Store } from "lucide-react";
import Link from "next/link";
import { LocoraLogo } from "@/components/brand/locora-logo";
import { LocaleCurrencySwitcher } from "@/components/public/locale-currency-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  type PilotCity,
  pilotCityDirectoryHref,
} from "@/lib/pilot-cities";
import { usePublicPrefs } from "@/lib/public-prefs-context";

const EASE = [0.22, 1, 0.36, 1] as const;

type Props = {
  city: PilotCity;
};

/** SEO / GTM city landing — supply-first copy; directory browse is secondary until density. */
export function CityLanding({ city }: Props) {
  const { t } = usePublicPrefs();
  const reduce = useReducedMotion();
  const directoryHref = pilotCityDirectoryHref(city);

  const pillars = [
    t("cityLanding.pillar1"),
    t("cityLanding.pillar2"),
    t("cityLanding.pillar3"),
  ];

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="aurora-mesh absolute inset-0 opacity-40 dark:opacity-50" />
        {!reduce && (
          <>
            <motion.div
              className="absolute -left-32 top-20 h-96 w-96 rounded-full bg-amber-500/15 blur-[100px] dark:bg-amber-500/20"
              animate={{ x: [0, 40, 0], y: [0, 20, 0] }}
              transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-emerald-500/10 blur-[90px] dark:bg-emerald-500/15"
              animate={{ x: [0, -30, 0], y: [0, -25, 0] }}
              transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
            />
          </>
        )}
      </div>

      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-background)_88%,transparent)] backdrop-blur-xl dark:border-white/5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 md:px-8">
          <LocoraLogo
            href="/"
            size="md"
            showTagline
            animated
            tone="auto"
            className="hidden min-w-0 sm:inline-flex"
          />
          <LocoraLogo
            href="/"
            size="sm"
            tone="auto"
            className="min-w-0 sm:hidden"
          />
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <LocaleCurrencySwitcher tone="auto" compact />
            <ThemeToggle />
            <Link
              href="/venues"
              className="hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-amber-400/40 sm:inline-flex sm:text-sm dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-200"
            >
              {t("nav.allVenues")}
            </Link>
            <Link
              href="/for-venues"
              className="shrink-0 rounded-full bg-amber-400 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 sm:px-4 sm:text-sm"
            >
              {t("nav.iOwnVenue")}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 md:px-8 md:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="max-w-3xl"
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            <MapPin size={14} />
            {t("cityLanding.badge", {
              city: city.name,
              country: city.countryName,
            })}
          </p>
          <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight md:text-6xl">
            <span className="text-gradient">
              {t("cityLanding.title", { city: city.name })}
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            {t("cityLanding.subtitle", { city: city.name })}
          </p>
          <p className="mt-3 max-w-xl text-sm text-zinc-500">
            {t("cityLanding.supplyNote", { city: city.name })}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.4, ease: EASE }}
          className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
        >
          <Link
            href="/register"
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            {t("cityLanding.ctaOwner", { city: city.name })}
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            href={directoryHref}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-6 py-3 text-sm font-medium text-zinc-800 transition hover:border-amber-400/40 dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-100"
          >
            <Store size={16} />
            {t("cityLanding.ctaBrowse", { city: city.name })}
          </Link>
        </motion.div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-3">
          {pillars.map((label, i) => (
            <motion.li
              key={label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.06, duration: 0.4, ease: EASE }}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-5 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <Sparkles
                size={18}
                className="text-amber-600 dark:text-amber-300"
              />
              <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {label}
              </p>
            </motion.li>
          ))}
        </ul>

        <p className="mt-12 text-center text-sm text-zinc-500">
          {t("cityLanding.footerHint")}{" "}
          <Link
            href="/for-venues"
            className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
          >
            {t("footer.forVenues")}
          </Link>
          {" · "}
          <Link
            href="/venues"
            className="font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
          >
            {t("venues.browse")}
          </Link>
        </p>
      </main>
    </div>
  );
}

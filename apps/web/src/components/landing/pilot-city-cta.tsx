"use client";

import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import {
  DEFAULT_PILOT_CITY,
  pilotCityLandingHref,
} from "@/lib/pilot-cities";
import { usePublicPrefs } from "@/lib/public-prefs-context";

/**
 * Owner landing strip — Join the pilot-city directory (marketplace M2).
 * Mounted on `/` and `/for-venues` via LandingPage.
 */
export function PilotCityCta() {
  const { t } = usePublicPrefs();
  const city = DEFAULT_PILOT_CITY;
  const href = pilotCityLandingHref(city);

  return (
    <section className="relative py-10 md:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] px-5 py-5 sm:flex-row sm:items-center sm:px-8 dark:border-emerald-400/20 dark:bg-emerald-500/10">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              <MapPin size={12} />
              {t("pilotCity.eyebrow")}
            </p>
            <p className="mt-1.5 text-balance text-lg font-semibold text-zinc-900 dark:text-white md:text-xl">
              {t("pilotCity.title", { city: city.name })}
            </p>
            <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
              {t("pilotCity.body", { city: city.name })}
            </p>
          </div>
          <Link
            href={href}
            className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            {t("pilotCity.cta", { city: city.name })}
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}

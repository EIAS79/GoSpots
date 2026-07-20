"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Beer,
  Coffee,
  Dices,
  Film,
  Gamepad2,
  Glasses,
  Martini,
  Monitor,
  Music,
  Sparkles,
  Target,
  Trophy,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/effects/reveal";
import { cn } from "@/lib/cn";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { venuesSearchHref } from "@/lib/venue-search";

const EASE = [0.22, 1, 0.36, 1] as const;

type CategoryTile = {
  slug: string;
  icon: LucideIcon;
  glow: string;
  iconTone: string;
  span?: string;
};

const TILES: CategoryTile[] = [
  {
    slug: "billiard-hall",
    icon: Target,
    glow: "from-emerald-500/25 to-emerald-500/0",
    iconTone: "text-emerald-700 dark:text-emerald-300",
    span: "sm:col-span-2 lg:col-span-1",
  },
  {
    slug: "restaurant",
    icon: UtensilsCrossed,
    glow: "from-rose-500/25 to-rose-500/0",
    iconTone: "text-rose-700 dark:text-rose-300",
    span: "sm:col-span-2 lg:col-span-1",
  },
  {
    slug: "gaming-lounge",
    icon: Gamepad2,
    glow: "from-cyan-500/25 to-cyan-500/0",
    iconTone: "text-cyan-700 dark:text-cyan-300",
  },
  {
    slug: "cafe",
    icon: Coffee,
    glow: "from-amber-500/25 to-amber-500/0",
    iconTone: "text-amber-700 dark:text-amber-300",
  },
  {
    slug: "bar",
    icon: Martini,
    glow: "from-orange-500/25 to-orange-500/0",
    iconTone: "text-orange-700 dark:text-orange-300",
  },
  {
    slug: "esports-cafe",
    icon: Monitor,
    glow: "from-indigo-500/25 to-indigo-500/0",
    iconTone: "text-indigo-700 dark:text-indigo-300",
  },
  {
    slug: "karaoke",
    icon: Music,
    glow: "from-pink-500/25 to-pink-500/0",
    iconTone: "text-pink-700 dark:text-pink-300",
  },
  {
    slug: "bowling",
    icon: Dices,
    glow: "from-violet-500/25 to-violet-500/0",
    iconTone: "text-violet-700 dark:text-violet-300",
  },
  {
    slug: "sports-bar",
    icon: Trophy,
    glow: "from-lime-500/25 to-lime-500/0",
    iconTone: "text-lime-700 dark:text-lime-300",
  },
  {
    slug: "pub",
    icon: Beer,
    glow: "from-yellow-500/25 to-yellow-500/0",
    iconTone: "text-yellow-700 dark:text-yellow-300",
  },
  {
    slug: "night-club",
    icon: Sparkles,
    glow: "from-fuchsia-500/25 to-fuchsia-500/0",
    iconTone: "text-fuchsia-700 dark:text-fuchsia-300",
  },
  {
    slug: "vr-experience",
    icon: Glasses,
    glow: "from-purple-500/25 to-purple-500/0",
    iconTone: "text-purple-700 dark:text-purple-300",
  },
  {
    slug: "cinema",
    icon: Film,
    glow: "from-blue-500/25 to-blue-500/0",
    iconTone: "text-blue-700 dark:text-blue-300",
  },
  {
    slug: "family-entertainment",
    icon: Users,
    glow: "from-teal-500/25 to-teal-500/0",
    iconTone: "text-teal-700 dark:text-teal-300",
    span: "sm:col-span-2 lg:col-span-1",
  },
];

/** Guest view — browse the directory by the kind of night you want. */
export function CategoryShowcase() {
  const { t } = usePublicPrefs();

  return (
    <section id="categories" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-widest text-cyan-700 dark:text-cyan-400">
            {t("cat.eyebrow")}
          </span>
          <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
            {t("cat.title")}{" "}
            <span className="text-gradient">{t("cat.titleAccent")}</span>
          </h2>
          <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 md:text-lg">
            {t("cat.subtitle")}
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
          {TILES.map((tile, i) => {
            const Icon = tile.icon;
            return (
              <motion.div
                key={tile.slug}
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 6) * 0.05, ease: EASE }}
                className={cn(tile.span)}
              >
                <Link
                  href={venuesSearchHref({ categories: [tile.slug] })}
                  className="group relative flex h-full flex-col justify-between gap-3 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-3 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-black/25 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/25 sm:gap-6 sm:p-5"
                >
                  <div
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br blur-2xl transition-opacity duration-500",
                      tile.glow,
                      "opacity-40 group-hover:opacity-90",
                    )}
                  />
                  <div className="relative flex items-center justify-between">
                    <span
                      className={cn(
                        "grid h-10 w-10 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 transition-transform duration-300 group-hover:scale-110 dark:border-white/10 dark:bg-zinc-900/80",
                        tile.iconTone,
                      )}
                    >
                      <Icon size={18} />
                    </span>
                    <ArrowRight
                      size={14}
                      className="text-zinc-400 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:text-zinc-600 dark:group-hover:text-zinc-300"
                    />
                  </div>
                  <div className="relative">
                    <h3 className="text-sm font-semibold text-[var(--color-foreground)] dark:text-white sm:text-base">
                      {t(`cat.${tile.slug}.name`)}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-zinc-500 sm:text-xs">
                      {t(`cat.${tile.slug}.blurb`)}
                    </p>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <Reveal delay={0.1} className="mt-8 flex justify-center">
          <Link
            href="/venues"
            className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-5 py-2.5 text-sm font-medium text-[var(--color-foreground)] backdrop-blur transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-700 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:text-cyan-200"
          >
            {t("cat.cta")}
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

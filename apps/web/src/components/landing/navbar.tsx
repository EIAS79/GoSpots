"use client";

import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "framer-motion";
import { Crown, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GoSpotsLogo } from "@/components/brand/gospots-logo";
import { LocaleCurrencySwitcher } from "@/components/public/locale-currency-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { navLinks } from "@/lib/mock-data";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { useMode } from "./mode-context";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { mode, setMode } = useMode();
  const { t } = usePublicPrefs();
  const isPlay = mode === "play";

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 18);
  });

  const visibleLinks = isPlay
    ? navLinks.filter(
        (l) =>
          l.labelKey === "nav.explore" ||
          l.labelKey === "nav.how" ||
          l.labelKey === "nav.faq",
      )
    : navLinks;

  return (
    <motion.header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-background)_88%,transparent)] backdrop-blur-xl"
          : // Over the hero photo collage: soft dark gradient keeps nav readable
            "border-transparent bg-gradient-to-b from-zinc-950/72 via-zinc-950/35 to-transparent",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2.5 sm:px-6 sm:py-3 md:px-8">
        <GoSpotsLogo
          href="/"
          size="md"
          showTagline
          className="hidden min-w-0 lg:inline-flex"
        />
        <GoSpotsLogo href="/" size="sm" className="min-w-0 lg:hidden" />

        {/* Center links — only when there's room */}
        <nav
          className={cn(
            "hidden items-center gap-1 rounded-full border px-2 py-1 backdrop-blur-md lg:flex",
            scrolled
              ? "border-[var(--color-border)] bg-[var(--color-surface)]/50 dark:border-white/10 dark:bg-white/5"
              : "border-white/12 bg-zinc-950/35",
          )}
        >
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition",
                scrolled
                  ? "text-zinc-600 hover:bg-black/5 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
                  : "text-zinc-300 hover:bg-white/10 hover:text-white",
              )}
            >
              {t(link.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <LocaleCurrencySwitcher
            className="hidden sm:block"
            tone={scrolled ? "light" : "dark"}
          />
          <ThemeToggle className="hidden lg:grid" />
          <div className="hidden items-center gap-2 md:flex">
            <AnimatePresence mode="wait">
              {isPlay ? (
                <motion.div
                  key="nav-play"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => setMode("manage")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm backdrop-blur-md transition lg:px-4",
                      scrolled
                        ? "border-[var(--color-border)] bg-[var(--color-surface)]/60 text-zinc-700 hover:border-amber-500/40 hover:text-zinc-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:border-white/25 dark:hover:text-white"
                        : "border-white/15 bg-white/[0.06] text-zinc-200 hover:border-white/30 hover:text-white",
                    )}
                  >
                    <Crown size={14} className="text-amber-400" />
                    {t("nav.iOwnVenue")}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="nav-manage"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2"
                >
                  <Link
                    href="/login"
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-sm font-medium backdrop-blur-md transition lg:px-4",
                      scrolled
                        ? "border-[var(--color-border)] bg-[var(--color-surface)]/60 text-zinc-800 hover:border-zinc-400/40 dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-white/30 dark:hover:bg-white/10"
                        : "border-white/15 bg-white/[0.06] text-zinc-200 hover:border-white/30 hover:bg-white/10",
                    )}
                  >
                    {t("nav.signIn")}
                  </Link>
                  <Link
                    href="/register"
                    className="group relative overflow-hidden rounded-full bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 lg:px-4 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
                  >
                    <span className="relative z-10">{t("nav.listVenue")}</span>
                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <LocaleCurrencySwitcher className="sm:hidden" tone="dark" compact />
          <ThemeToggle className="lg:hidden" />

          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-lg border backdrop-blur-md lg:hidden",
              scrolled
                ? "border-[var(--color-border)] bg-[var(--color-surface)]/70 dark:border-white/10 dark:bg-white/5"
                : "border-white/15 bg-zinc-950/40 text-zinc-100",
            )}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="overflow-hidden border-t border-white/10 bg-zinc-950/92 backdrop-blur-xl lg:hidden"
      >
        <div className="flex flex-col gap-1 px-4 py-3">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              {t(link.labelKey)}
            </Link>
          ))}

          <div className="my-2 h-px bg-white/10" />

          {/* Mode toggle inside the mobile panel */}
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => setMode("manage")}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                !isPlay
                  ? "bg-emerald-400 text-zinc-950"
                  : "text-zinc-300",
              )}
            >
              {t("hero.play.ctaSecondary")}
            </button>
            <button
              type="button"
              onClick={() => setMode("play")}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                isPlay ? "bg-cyan-400 text-zinc-950" : "text-zinc-300",
              )}
            >
              {t("venues.tagline")}
            </button>
          </div>

          {isPlay ? null : (
            <>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 text-center text-sm text-zinc-200"
              >
                {t("nav.signIn")}
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="rounded-full bg-emerald-400 px-4 py-2.5 text-center text-sm font-semibold text-zinc-950"
              >
                {t("nav.listVenue")}
              </Link>
            </>
          )}
        </div>
      </motion.div>
    </motion.header>
  );
}

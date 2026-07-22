"use client";

import {
  motion,
  useMotionValueEvent,
  useScroll,
} from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LocoraLogo } from "@/components/brand/locora-logo";
import { LocaleCurrencySwitcher } from "@/components/public/locale-currency-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { navLinks } from "@/lib/mock-data";
import { usePublicPrefs } from "@/lib/public-prefs-context";

/** Owner-landing navbar — Explore → guest `/venues`; CTAs stay owner-focused. */
export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { t } = usePublicPrefs();

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 18);
  });

  return (
    <motion.header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-background)_88%,transparent)] backdrop-blur-xl"
          : "border-transparent bg-gradient-to-b from-zinc-950/72 via-zinc-950/35 to-transparent",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5 md:px-8">
        <LocoraLogo
          href="/"
          size="md"
          showTagline
          tone={scrolled ? "auto" : "onDark"}
          className="hidden shrink-0 lg:inline-flex"
        />
        <LocoraLogo
          href="/"
          size="sm"
          tone={scrolled ? "auto" : "onDark"}
          className="shrink-0 lg:hidden"
        />

        <nav
          className={cn(
            "hidden items-center gap-1 rounded-full border px-2 py-1 backdrop-blur-md lg:flex",
            scrolled
              ? "border-[var(--color-border)] bg-[var(--color-surface)]/50 dark:border-white/10 dark:bg-white/5"
              : "border-white/12 bg-zinc-950/35",
          )}
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition",
                scrolled
                  ? "text-zinc-700 hover:bg-black/5 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-white/10 dark:hover:text-white"
                  : "text-zinc-200 hover:bg-white/10 hover:text-white",
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
          <ThemeToggle
            className={cn(
              "hidden lg:grid",
              !scrolled &&
                "border-white/20 bg-zinc-950/45 text-zinc-100 hover:border-amber-400/40 hover:text-amber-200",
            )}
          />
          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/login"
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm font-medium backdrop-blur-md transition lg:px-4",
                scrolled
                  ? "border-[var(--color-border)] bg-[var(--color-surface)]/60 text-zinc-800 hover:border-zinc-400/40 dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-100 dark:hover:border-white/30 dark:hover:bg-white/10"
                  : "border-white/15 bg-white/[0.06] text-zinc-100 hover:border-white/30 hover:bg-white/10",
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
          </div>

          <LocaleCurrencySwitcher
            className="sm:hidden"
            tone={scrolled ? "light" : "dark"}
            compact
          />
          <ThemeToggle
            className={cn(
              "lg:hidden",
              !scrolled &&
                "border-white/20 bg-zinc-950/45 text-zinc-100 hover:border-amber-400/40 hover:text-amber-200",
            )}
          />

          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-lg border backdrop-blur-md lg:hidden",
              scrolled
                ? "border-[var(--color-border)] bg-[var(--color-surface)]/70 text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
                : "border-white/15 bg-zinc-950/40 text-zinc-100",
            )}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="overflow-hidden border-t border-white/10 bg-zinc-950/92 backdrop-blur-xl lg:hidden"
      >
        <div className="flex flex-col gap-1 px-4 py-3">
          {navLinks.map((link) => (
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

          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 text-center text-sm text-zinc-200"
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
        </div>
      </motion.div>
    </motion.header>
  );
}

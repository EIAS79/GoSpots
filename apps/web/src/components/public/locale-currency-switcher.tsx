"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { PUBLIC_CURRENCIES, PUBLIC_LOCALES } from "@/lib/public-prefs";

export function LocaleCurrencySwitcher({
  className,
  compact = false,
  tone = "dark",
}: {
  className?: string;
  compact?: boolean;
  /** dark = on dark public headers; light = on scrolled/light nav */
  tone?: "dark" | "light" | "auto";
}) {
  const { locale, currency, setLocale, setCurrency, t } = usePublicPrefs();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const localeMeta = PUBLIC_LOCALES.find((l) => l.code === locale);
  const currencyMeta = PUBLIC_CURRENCIES.find((c) => c.code === currency);

  const btnTone =
    tone === "light"
      ? "border-zinc-300/50 bg-white/70 text-zinc-800 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10"
      : tone === "auto"
        ? "border-[var(--color-border)] bg-[var(--color-surface)]/70 text-[var(--color-foreground)] hover:bg-[var(--color-surface)]"
        : "border-white/20 bg-zinc-950/55 text-zinc-100 hover:bg-white/10";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition",
          btnTone,
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${t("nav.language")} / ${t("nav.currency")}`}
      >
        <Languages size={14} className="shrink-0 opacity-80" />
        <span>{localeMeta?.short ?? locale.toUpperCase()}</span>
        <span className="text-zinc-500">·</span>
        <span>{currencyMeta?.code ?? currency}</span>
        <ChevronDown
          size={12}
          className={cn("opacity-60 transition", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div
          role="dialog"
          className={cn(
            "absolute end-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-white/15 bg-zinc-950/98 p-3 shadow-2xl backdrop-blur-md",
            compact && "w-[min(16rem,calc(100vw-1.5rem))]",
          )}
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            {t("nav.language")}
          </p>
          <ul className="mb-3 grid grid-cols-2 gap-1">
            {PUBLIC_LOCALES.map((l) => {
              const active = l.code === locale;
              return (
                <li key={l.code}>
                  <button
                    type="button"
                    onClick={() => {
                      setLocale(l.code);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 text-left text-xs transition",
                      active
                        ? "bg-emerald-500/15 text-emerald-200"
                        : "text-zinc-300 hover:bg-white/5",
                    )}
                  >
                    <span>{l.label}</span>
                    {active ? <Check size={12} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            {t("nav.currency")}
          </p>
          <ul className="grid grid-cols-2 gap-1">
            {PUBLIC_CURRENCIES.map((c) => {
              const active = c.code === currency;
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrency(c.code);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 text-left text-xs transition",
                      active
                        ? "bg-amber-500/15 text-amber-100"
                        : "text-zinc-300 hover:bg-white/5",
                    )}
                  >
                    <span>
                      {c.code}{" "}
                      <span className="text-zinc-500">{c.symbol}</span>
                    </span>
                    {active ? <Check size={12} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

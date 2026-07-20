"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { VENUE_CATEGORY_PRESETS } from "@/lib/venue-categories";

export type VenueSearchFormValues = {
  q: string;
  city: string;
  country: string;
  categories: Set<string>;
};

type VenueSearchFormProps = {
  values: VenueSearchFormValues;
  onChange: (patch: Partial<VenueSearchFormValues>) => void;
  onSubmit: () => void;
  facets?: { countries: string[]; cities: string[] };
  compact?: boolean;
  showCategories?: boolean;
  className?: string;
};

const fieldClass =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-base text-[var(--color-foreground)] outline-none placeholder:text-zinc-500 focus:border-amber-500/50 sm:text-sm dark:bg-zinc-950/80 dark:focus:border-amber-400/50";

export function VenueSearchForm({
  values,
  onChange,
  onSubmit,
  facets,
  compact = false,
  showCategories = true,
  className,
}: VenueSearchFormProps) {
  function toggleCategory(slug: string) {
    const next = new Set(values.categories);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange({ categories: next });
  }

  const countries = facets?.countries ?? [];
  const cities = facets?.cities ?? [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={cn(
        "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/90 shadow-xl backdrop-blur dark:border-white/10 dark:bg-zinc-900/60 dark:shadow-black/40",
        compact ? "p-3" : "p-4 md:p-5",
        className,
      )}
    >
      <div
        className={cn(
          "grid gap-3",
          compact
            ? "md:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_minmax(0,8rem)_auto]"
            : "md:grid-cols-[minmax(0,1.4fr)_minmax(0,9rem)_minmax(0,9rem)_auto]",
        )}
      >
        <label className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={values.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder="Search name or description…"
            className={cn(fieldClass, "py-3 pl-10 pr-4")}
          />
        </label>
        <label className="min-w-0">
          <span className="sr-only">City</span>
          <input
            value={values.city}
            onChange={(e) => onChange({ city: e.target.value })}
            placeholder="City"
            list="venue-search-cities"
            className={fieldClass}
          />
        </label>
        <label className="min-w-0">
          <span className="sr-only">Country</span>
          <input
            value={values.country}
            onChange={(e) => onChange({ country: e.target.value })}
            placeholder="Country"
            list="venue-search-countries"
            className={fieldClass}
          />
        </label>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
        >
          <Search size={16} className="md:hidden" />
          <span className="md:inline">Search</span>
        </button>
      </div>

      <datalist id="venue-search-cities">
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="venue-search-countries">
        {countries.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {showCategories ? (
        <div
          className={cn(
            "venue-tab-scroll mt-4 -mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 snap-x snap-mandatory",
            compact && "mt-3",
          )}
        >
          {VENUE_CATEGORY_PRESETS.slice(0, compact ? 8 : undefined).map((p) => {
            const on = values.categories.has(p.slug);
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => toggleCategory(p.slug)}
                className={cn(
                  "shrink-0 snap-start rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  on
                    ? "border-amber-400/50 bg-amber-500/15 text-amber-800 dark:text-amber-100"
                    : "border-[var(--color-border)] bg-[var(--color-background)]/60 text-zinc-700 hover:border-amber-400/30 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300",
                )}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      ) : null}
    </form>
  );
}

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
        "rounded-2xl border border-white/10 bg-zinc-900/60 shadow-2xl shadow-black/40 backdrop-blur",
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
            className="w-full rounded-xl border border-white/10 bg-zinc-950/80 py-3 pl-10 pr-4 text-base text-white outline-none focus:border-amber-400/50 sm:text-sm"
          />
        </label>
        <label className="min-w-0">
          <span className="sr-only">City</span>
          <input
            value={values.city}
            onChange={(e) => onChange({ city: e.target.value })}
            placeholder="City"
            list="venue-search-cities"
            className="w-full rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-base text-white outline-none focus:border-amber-400/50 sm:text-sm"
          />
        </label>
        <label className="min-w-0">
          <span className="sr-only">Country</span>
          <input
            value={values.country}
            onChange={(e) => onChange({ country: e.target.value })}
            placeholder="Country"
            list="venue-search-countries"
            className="w-full rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-base text-white outline-none focus:border-amber-400/50 sm:text-sm"
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
                  "snap-start shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  on
                    ? "border-amber-400/60 bg-amber-500/20 text-amber-100"
                    : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300",
                )}
                style={on ? { boxShadow: `0 0 14px ${p.color}55` } : undefined}
              >
                {p.name}
              </button>
            );
          })}
          {values.categories.size > 0 ? (
            <button
              type="button"
              onClick={() => onChange({ categories: new Set() })}
              className="snap-start shrink-0 rounded-full px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear categories
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

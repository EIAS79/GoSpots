"use client";

import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MediaImage } from "@/components/ui/media-image";
import {
  MenuAvailabilityPill,
} from "@/components/venues/public/venue-menu-item-modal";
import { cn } from "@/lib/cn";
import { mealPeriodLabel, type MealPeriod } from "@/lib/menu-periods";
import {
  getPublicMenuItemAvailability,
  publicMenuScheduleLabel,
} from "@/lib/menu-timing";
import type {
  PublicMenuItem,
  PublicMenuSection,
} from "@/lib/shop-settings-client";

const ITEMS_PER_PAGE = 5;
const UNCATEGORIZED_ID = "__none";

type CatalogSection = PublicMenuSection & { id: string };

function buildCatalogSections(
  sections: PublicMenuSection[],
  uncategorized: PublicMenuItem[],
): CatalogSection[] {
  const list: CatalogSection[] = [...sections].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  if (uncategorized.length > 0) {
    list.push({
      id: UNCATEGORIZED_ID,
      name: "More to explore",
      sortOrder: 999,
      mealPeriod: null,
      availableFrom: null,
      availableTo: null,
      availableDays: "0,1,2,3,4,5,6",
      imageUrl: null,
    });
  }
  return list;
}

function itemMatchesQuery(item: PublicMenuItem, q: string) {
  if (!q) return true;
  const hay = `${item.name} ${item.description ?? ""}`.toLowerCase();
  return hay.includes(q);
}

function sectionMatchesQuery(
  section: CatalogSection,
  q: string,
  items: PublicMenuItem[],
) {
  if (!q) return true;
  if (section.name.toLowerCase().includes(q)) return true;
  return items.some((i) => itemMatchesQuery(i, q));
}

function sectionScheduleLabel(section: PublicMenuSection) {
  return publicMenuScheduleLabel(
    {
      useSectionTiming: true,
      availableFrom: section.availableFrom,
      availableTo: section.availableTo,
      availableDays: section.availableDays,
    },
    section,
  );
}

export function PublicMenuBoard({
  sections,
  items,
  formatPrice,
  onOpenItem,
}: {
  sections: PublicMenuSection[];
  items: PublicMenuItem[];
  formatPrice: (n: number) => string;
  onOpenItem: (item: PublicMenuItem, section: PublicMenuSection | null) => void;
}) {
  const itemsBySection = useMemo(() => {
    const map = new Map<string, PublicMenuItem[]>();
    const uncategorized: PublicMenuItem[] = [];
    for (const item of items) {
      if (item.sectionId) {
        const list = map.get(item.sectionId) ?? [];
        list.push(item);
        map.set(item.sectionId, list);
      } else {
        uncategorized.push(item);
      }
    }
    return { map, uncategorized };
  }, [items]);

  const catalogSections = useMemo(
    () =>
      buildCatalogSections(sections, itemsBySection.uncategorized),
    [sections, itemsBySection.uncategorized],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [sectionSearch, setSectionSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [page, setPage] = useState(0);

  const sectionQ = sectionSearch.trim().toLowerCase();
  const itemQ = itemSearch.trim().toLowerCase();

  const getSectionItems = (sectionId: string) =>
    sectionId === UNCATEGORIZED_ID
      ? itemsBySection.uncategorized
      : (itemsBySection.map.get(sectionId) ?? []);

  const visibleSections = useMemo(() => {
    return catalogSections.filter((s) =>
      sectionMatchesQuery(s, sectionQ, getSectionItems(s.id)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogSections, sectionQ, itemsBySection]);

  const activeSection =
    visibleSections.find((s) => s.id === activeId) ??
    visibleSections[0] ??
    null;

  useEffect(() => {
    if (!visibleSections.length) {
      setActiveId(null);
      return;
    }
    if (!activeId || !visibleSections.some((s) => s.id === activeId)) {
      setActiveId(visibleSections[0]!.id);
    }
  }, [visibleSections, activeId]);

  useEffect(() => {
    setPage(0);
  }, [activeId, itemQ]);

  const activeItems = activeSection ? getSectionItems(activeSection.id) : [];
  const filteredItems = useMemo(
    () => activeItems.filter((i) => itemMatchesQuery(i, itemQ)),
    [activeItems, itemQ],
  );

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filteredItems.slice(
    safePage * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
  );

  const totalItemMatches = useMemo(() => {
    if (!itemQ) return 0;
    let n = 0;
    for (const s of catalogSections) {
      n += getSectionItems(s.id).filter((i) => itemMatchesQuery(i, itemQ))
        .length;
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogSections, itemQ, itemsBySection]);

  if (!items.length) {
    return (
      <div className="mx-auto w-full max-w-lg">
        <div className="overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-[#faf8f5] px-6 py-16 text-center text-stone-700 shadow-2xl shadow-black/30">
          <p className="font-serif text-2xl text-stone-900">Menu coming soon</p>
          <p className="mt-2 text-sm text-stone-500">
            This venue is still setting up their menu.
          </p>
        </div>
      </div>
    );
  }

  const activeRealSection =
    activeSection && activeSection.id !== UNCATEGORIZED_ID
      ? activeSection
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div
        className={cn(
          "menu-catalog flex max-h-[70dvh] min-h-[22rem] flex-col overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-[#faf8f5] text-stone-900 shadow-2xl shadow-black/40 sm:h-[min(calc(100dvh-14rem),680px)] sm:max-h-none",
          "lg:grid lg:h-[min(calc(100dvh-10rem),720px)] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]",
        )}
      >
        {/* Sections — desktop sidebar only */}
        <div
          className={cn(
            "hidden min-h-0 flex-col border-stone-200/70 bg-[#f5f2ec] lg:flex lg:border-r",
            "lg:relative lg:shadow-[inset_-12px_0_24px_-20px_rgba(0,0,0,0.25)]",
          )}
        >
          <div className="shrink-0 border-b border-stone-200/80 bg-[#ebe6dc] px-4 py-3 sm:px-5">
            <p className="font-serif text-xl tracking-tight text-stone-800">
              Menu
            </p>
            <label className="relative mt-2.5 block">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="search"
                value={sectionSearch}
                onChange={(e) => setSectionSearch(e.target.value)}
                placeholder="Search sections…"
                className="w-full rounded-full border border-stone-200 bg-white py-2.5 pl-9 pr-9 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30"
              />
              {sectionSearch ? (
                <button
                  type="button"
                  aria-label="Clear"
                  onClick={() => setSectionSearch("")}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-stone-400 hover:bg-stone-100"
                >
                  <X size={14} />
                </button>
              ) : null}
            </label>
          </div>

          <ul className="min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3 flex">
            {visibleSections.map((s) => {
              const count = getSectionItems(s.id).length;
              const active = s.id === activeSection?.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                      active
                        ? "bg-white shadow-md ring-1 ring-amber-200"
                        : "hover:bg-white/60",
                    )}
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-stone-200 ring-2 ring-white">
                      {s.imageUrl ? (
                        <MediaImage
                          src={s.imageUrl}
                          alt=""
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <span className="grid h-full place-items-center text-xs font-semibold text-stone-400">
                          {s.name.slice(0, 1)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-stone-800">
                        {s.name}
                      </span>
                      <span className="text-[11px] text-stone-500">
                        {count} item{count === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Items */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#faf8f5]">
          {/* Mobile section picker */}
          <div className="venue-tab-scroll flex shrink-0 gap-2 overflow-x-auto border-b border-stone-200/70 bg-[#f5f2ec] px-3 py-2.5 snap-x snap-mandatory lg:hidden">
            {visibleSections.map((s) => {
              const count = getSectionItems(s.id).length;
              const active = s.id === activeSection?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-amber-500 text-white shadow-md shadow-amber-500/25"
                      : "bg-white text-stone-600 ring-1 ring-stone-200",
                  )}
                >
                  {s.name}
                  <span className="ml-1 opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

          {activeSection ? (
            <>
              <SectionHero section={activeSection} />

              <div className="shrink-0 border-b border-stone-200/80 px-3 py-2.5 sm:px-5">
                <label className="relative block">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />
                  <input
                    type="search"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Search dishes in this section…"
                    className="w-full rounded-full border border-stone-200 bg-white py-2 pl-9 pr-9 text-sm outline-none placeholder:text-stone-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30"
                  />
                  {itemSearch ? (
                    <button
                      type="button"
                      aria-label="Clear"
                      onClick={() => setItemSearch("")}
                      className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-stone-400 hover:bg-stone-100"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </label>
                {itemQ && totalItemMatches > 0 ? (
                  <p className="mt-2 text-[11px] text-stone-500">
                    {totalItemMatches} match{totalItemMatches === 1 ? "" : "es"}{" "}
                    across menu
                  </p>
                ) : null}
              </div>

              {filteredItems.length > ITEMS_PER_PAGE ? (
                <div className="flex shrink-0 items-center border-b border-stone-200/60 px-4 py-2.5 sm:px-5">
                  <PaginationBar
                    page={safePage}
                    pageCount={pageCount}
                    total={filteredItems.length}
                    onPage={setPage}
                  />
                </div>
              ) : (
                <p className="border-b border-stone-200/60 px-4 py-2.5 text-xs text-stone-500 sm:px-5">
                  {filteredItems.length} item
                  {filteredItems.length === 1 ? "" : "s"}
                </p>
              )}

              <ul className="min-h-0 flex-1 divide-y divide-stone-200/80 overflow-y-auto overscroll-contain">
                {pageItems.length === 0 ? (
                  <li className="px-5 py-12 text-center text-sm text-stone-500">
                    {itemQ
                      ? "No items match your search."
                      : "No items in this section yet."}
                  </li>
                ) : (
                  pageItems.map((item) => (
                    <PublicMenuItemRow
                      key={item.id}
                      item={item}
                      section={activeRealSection}
                      formatPrice={formatPrice}
                      onOpen={() =>
                        onOpenItem(item, activeRealSection)
                      }
                    />
                  ))
                )}
              </ul>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-sm text-stone-500">
              Select a section
            </div>
          )}
        </div>
      </div>

      <p className="mt-2 text-center text-[10px] text-zinc-500">
        Scroll inside the menu · tap a dish for details
      </p>
    </div>
  );
}

function SectionHero({ section }: { section: CatalogSection }) {
  const timing =
    section.id === UNCATEGORIZED_ID
      ? null
      : sectionScheduleLabel(section);
  const period =
    section.mealPeriod && section.id !== UNCATEGORIZED_ID
      ? mealPeriodLabel(section.mealPeriod as MealPeriod)
      : null;

  return (
    <>
      <div className="shrink-0 border-b border-stone-200/80 bg-white/80 px-3 py-2.5 sm:px-5 lg:hidden">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-stone-900">
          {section.name}
        </h2>
        {period || timing ? (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-stone-500">
            {[period, timing].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="relative hidden shrink-0 lg:block">
        <div className="relative aspect-[2.8/1] w-full overflow-hidden bg-stone-200">
          {section.imageUrl ? (
            <MediaImage src={section.imageUrl} alt="" fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-amber-100 via-stone-100 to-amber-50" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#faf8f5] via-black/10 to-transparent" />
        </div>
        <div className="relative -mt-6 px-4 pb-1 sm:px-5">
          <div className="rounded-xl border border-stone-200/90 bg-white/95 px-3 py-2.5 shadow-lg shadow-stone-300/30 backdrop-blur sm:px-4">
            <h2 className="font-serif text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
              {section.name}
            </h2>
            {period ? (
              <p className="mt-0.5 text-xs font-medium text-amber-700">{period}</p>
            ) : null}
            {timing ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-500">
                <Clock size={11} className="shrink-0 text-amber-600" />
                <span className="line-clamp-1">{timing}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function PublicMenuItemRow({
  item,
  section,
  formatPrice,
  onOpen,
}: {
  item: PublicMenuItem;
  section: PublicMenuSection | null;
  formatPrice: (n: number) => string;
  onOpen: () => void;
}) {
  const imageSrc = item.imageUrl ?? item.imageUrl2;
  const availability = getPublicMenuItemAvailability(item, section);
  const schedule = publicMenuScheduleLabel(item, section);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-start gap-3 px-3 py-3 text-left transition hover:bg-amber-50/40 sm:gap-4 sm:px-5 sm:py-3.5"
      >
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-stone-200 ring-2 ring-white shadow-md transition group-hover:ring-amber-200 sm:h-16 sm:w-16">
          {imageSrc ? (
            <MediaImage src={imageSrc} alt="" fill className="object-cover" />
          ) : (
            <span className="grid h-full place-items-center text-lg font-serif text-stone-400">
              {item.name.slice(0, 1)}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 py-1">
          <span className="flex items-start justify-between gap-2 sm:gap-3">
            <span
              className={cn(
                "min-w-0 pr-2 font-semibold leading-snug text-stone-900",
                !availability.availableNow && "text-stone-500",
              )}
            >
              {item.name}
            </span>
            <span className="shrink-0 text-sm font-bold tabular-nums text-amber-600">
              {formatPrice(item.price)}
            </span>
          </span>
          {item.description ? (
            <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-stone-500">
              {item.description}
            </span>
          ) : null}
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <MenuAvailabilityPill
              availability={availability}
              variant="light"
              className="text-[10px] shadow-sm"
            />
            {item.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600"
                style={{ color: tag.color ?? undefined }}
              >
                {tag.name}
              </span>
            ))}
            {!availability.availableNow && schedule ? (
              <span className="text-[10px] text-stone-400">{schedule}</span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

function PaginationBar({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const from = page * ITEMS_PER_PAGE + 1;
  const to = Math.min(total, (page + 1) * ITEMS_PER_PAGE);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <p className="text-xs text-stone-500">
        <span className="sm:hidden">
          {page + 1}/{pageCount}
        </span>
        <span className="hidden sm:inline">
          {from}–{to} of {total}
        </span>
      </p>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
          className="grid h-9 w-9 place-items-center rounded-full border border-stone-200 bg-white text-stone-600 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex gap-1 px-1">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPage(i)}
              className={cn(
                "h-2 w-2 rounded-full transition",
                i === page ? "w-5 bg-amber-500" : "bg-stone-300 hover:bg-stone-400",
              )}
              aria-label={`Page ${i + 1}`}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          className="grid h-9 w-9 place-items-center rounded-full border border-stone-200 bg-white text-stone-600 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

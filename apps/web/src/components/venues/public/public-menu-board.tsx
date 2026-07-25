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
import { MenuAvailabilityPill } from "@/components/venues/public/venue-menu-item-modal";
import { cn } from "@/lib/cn";
import { type MealPeriod } from "@/lib/menu-periods";
import {
  getPublicMenuItemAvailability,
  publicMenuScheduleLabel,
} from "@/lib/menu-timing";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import type {
  PublicMenuItem,
  PublicMenuSection,
} from "@/lib/shop-settings-client";

const ITEMS_PER_PAGE = 10;
const UNCATEGORIZED_ID = "__none";

type CatalogSection = PublicMenuSection & { id: string };

function buildCatalogSections(
  sections: PublicMenuSection[],
  uncategorized: PublicMenuItem[],
  moreExploreLabel: string,
): CatalogSection[] {
  const list: CatalogSection[] = [...sections].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  if (uncategorized.length > 0) {
    list.push({
      id: UNCATEGORIZED_ID,
      name: moreExploreLabel,
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

function sectionScheduleLabel(
  section: PublicMenuSection,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  return publicMenuScheduleLabel(
    {
      useSectionTiming: true,
      availableFrom: section.availableFrom,
      availableTo: section.availableTo,
      availableDays: section.availableDays,
    },
    section,
    t,
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
  formatPrice: (n: import("@/lib/money").MoneyWire) => string;
  onOpenItem: (item: PublicMenuItem, section: PublicMenuSection | null) => void;
}) {
  const { t } = usePublicPrefs();

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
      buildCatalogSections(
        sections,
        itemsBySection.uncategorized,
        t("menu.moreExplore"),
      ),
    [sections, itemsBySection.uncategorized, t],
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
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-14 text-center">
        <p className="text-lg font-semibold text-[var(--color-foreground)]">
          {t("menu.comingSoon")}
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {t("menu.comingSoonBody")}
        </p>
      </div>
    );
  }

  const activeRealSection =
    activeSection && activeSection.id !== UNCATEGORIZED_ID
      ? activeSection
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3">
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-[var(--color-border)]",
          "bg-[var(--color-surface)] text-[var(--color-foreground)]",
          "shadow-sm dark:shadow-none",
          "lg:grid lg:min-h-[min(70vh,800px)] lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]",
        )}
      >
        {/* Sections sidebar */}
        <aside className="flex flex-col border-b border-[var(--color-border)] lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-[var(--color-border)] p-3 sm:p-4">
            <h2 className="text-sm font-semibold tracking-tight">
              {t("menu.title")}
            </h2>
            <label className="relative hidden lg:block">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="search"
                value={sectionSearch}
                onChange={(e) => setSectionSearch(e.target.value)}
                placeholder={t("menu.searchSections")}
                className={cn(
                  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]",
                  "py-2 pl-8 pr-8 text-sm text-[var(--color-foreground)] outline-none",
                  "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                  "focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/25",
                )}
              />
              {sectionSearch ? (
                <button
                  type="button"
                  aria-label={t("menu.clear")}
                  onClick={() => setSectionSearch("")}
                  className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <X size={12} />
                </button>
              ) : null}
            </label>
          </div>

          {/* Mobile section chips — with thumbnails */}
          <div className="flex gap-2 overflow-x-auto border-b border-[var(--color-border)] px-3 py-3 scrollbar-hide lg:hidden">
            {visibleSections.map((s) => {
              const count = getSectionItems(s.id).length;
              const active = s.id === activeSection?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/30 dark:text-emerald-200"
                      : "bg-[var(--color-background)] text-zinc-600 ring-1 ring-[var(--color-border)] dark:text-zinc-300",
                  )}
                >
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-zinc-200/80 dark:bg-zinc-800">
                    {s.imageUrl ? (
                      <MediaImage
                        src={s.imageUrl}
                        alt=""
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <span className="grid h-full place-items-center text-[10px] font-semibold text-zinc-500">
                        {s.name.slice(0, 1)}
                      </span>
                    )}
                  </span>
                  <span className="max-w-[7rem] truncate">{s.name}</span>
                  <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Desktop section list */}
          <ul className="hidden min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 lg:flex">
            {visibleSections.map((s) => {
              const count = getSectionItems(s.id).length;
              const active = s.id === activeSection?.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition",
                      active
                        ? "bg-emerald-500/12 ring-1 ring-emerald-500/25"
                        : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
                    )}
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-200/80 ring-1 ring-[var(--color-border)] dark:bg-zinc-800">
                      {s.imageUrl ? (
                        <MediaImage
                          src={s.imageUrl}
                          alt=""
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <span className="grid h-full place-items-center text-sm font-medium text-zinc-500">
                          {s.name.slice(0, 1)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          active &&
                            "text-emerald-800 dark:text-emerald-200",
                        )}
                      >
                        {s.name}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {t(count === 1 ? "menu.itemOne" : "menu.items", {
                          count,
                        })}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Items pane */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {activeSection ? (
            <>
              <SectionHero section={activeSection} t={t} />

              <div className="border-b border-[var(--color-border)] px-3 py-3 sm:px-4">
                <label className="relative block">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                  />
                  <input
                    type="search"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder={t("menu.searchItems")}
                    className={cn(
                      "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]",
                      "py-2.5 pl-8 pr-8 text-sm text-[var(--color-foreground)] outline-none",
                      "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                      "focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/25",
                    )}
                  />
                  {itemSearch ? (
                    <button
                      type="button"
                      aria-label={t("menu.clear")}
                      onClick={() => setItemSearch("")}
                      className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <X size={12} />
                    </button>
                  ) : null}
                </label>
                {itemQ && totalItemMatches > 0 ? (
                  <p className="mt-2 text-[11px] text-zinc-500">
                    {t(
                      totalItemMatches === 1
                        ? "menu.matchOne"
                        : "menu.matchesAcross",
                      { count: totalItemMatches },
                    )}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2.5 sm:px-4">
                {filteredItems.length > ITEMS_PER_PAGE ? (
                  <PaginationBar
                    page={safePage}
                    pageCount={pageCount}
                    total={filteredItems.length}
                    onPage={setPage}
                  />
                ) : (
                  <p className="text-xs text-zinc-500">
                    {t(
                      filteredItems.length === 1
                        ? "menu.itemOne"
                        : "menu.items",
                      { count: filteredItems.length },
                    )}
                  </p>
                )}
              </div>

              <ul className="min-h-[16rem] flex-1 divide-y divide-[var(--color-border)] overflow-y-auto overscroll-contain">
                {pageItems.length === 0 ? (
                  <li className="px-4 py-12 text-center text-sm text-zinc-500">
                    {itemQ ? t("menu.noMatch") : t("menu.emptySection")}
                  </li>
                ) : (
                  pageItems.map((item) => (
                    <PublicMenuItemRow
                      key={item.id}
                      item={item}
                      section={activeRealSection}
                      formatPrice={formatPrice}
                      onOpen={() => onOpenItem(item, activeRealSection)}
                    />
                  ))
                )}
              </ul>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-sm text-zinc-500">
              {t("menu.selectSection")}
            </div>
          )}
        </section>
      </div>

      <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-500">
        {t("menu.scrollHint")}
      </p>
    </div>
  );
}

function SectionHero({
  section,
  t,
}: {
  section: CatalogSection;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const timing =
    section.id !== UNCATEGORIZED_ID
      ? sectionScheduleLabel(section, t)
      : null;
  const period =
    section.id !== UNCATEGORIZED_ID && section.mealPeriod != null
      ? t(`meal.${section.mealPeriod as MealPeriod}`)
      : null;
  const meta = [period, timing].filter(Boolean).join(" · ");

  return (
    <div className="shrink-0 border-b border-[var(--color-border)]">
      <div className="relative aspect-[3/1] max-h-40 w-full overflow-hidden bg-zinc-200 dark:bg-zinc-800 sm:aspect-[4/1] sm:max-h-48">
        {section.imageUrl ? (
          <MediaImage
            src={section.imageUrl}
            alt=""
            fill
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 via-zinc-100 to-emerald-100/40 dark:from-zinc-800 dark:via-zinc-900 dark:to-emerald-950/40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
          <h2 className="truncate text-xl font-semibold text-white sm:text-2xl">
            {section.name}
          </h2>
          {meta ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/75">
              {timing ? (
                <Clock size={12} className="shrink-0 text-emerald-300/90" />
              ) : null}
              <span className="truncate">{meta}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
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
  formatPrice: (n: import("@/lib/money").MoneyWire) => string;
  onOpen: () => void;
}) {
  const { t } = usePublicPrefs();
  const imageSrc = item.imageUrl ?? item.imageUrl2;
  const availability = getPublicMenuItemAvailability(item, section, { t });
  const schedule = publicMenuScheduleLabel(item, section, t);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "group flex w-full items-center gap-2.5 px-3 py-2 text-left transition sm:gap-3 sm:px-4",
          "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
        )}
      >
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-200/80 ring-1 ring-[var(--color-border)] dark:bg-zinc-800 sm:h-12 sm:w-12">
          {imageSrc ? (
            <MediaImage src={imageSrc} alt="" fill className="object-cover" />
          ) : (
            <span className="grid h-full place-items-center text-xs font-medium text-zinc-500">
              {item.name.slice(0, 1)}
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm font-medium leading-tight",
              !availability.availableNow &&
                "text-zinc-500 line-through dark:text-zinc-500",
            )}
          >
            {item.name}
          </span>
          {item.description ? (
            <span className="mt-0.5 block truncate text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              {item.description}
            </span>
          ) : null}
          {item.tags.length > 0 || (!availability.availableNow && schedule) ? (
            <span className="mt-1 flex flex-wrap items-center gap-1">
              {item.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="rounded bg-zinc-100 px-1 py-px text-[9px] font-medium text-zinc-600 dark:bg-white/5 dark:text-zinc-400"
                >
                  {tag.name}
                </span>
              ))}
              {!availability.availableNow && schedule ? (
                <span className="inline-flex items-center gap-0.5 text-[9px] text-zinc-400">
                  <Clock size={8} />
                  {schedule}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1 self-center">
          <span className="text-sm font-semibold tabular-nums leading-none text-emerald-700 dark:text-emerald-300">
            {formatPrice(item.price)}
          </span>
          <MenuAvailabilityPill
            availability={availability}
            variant="auto"
            className="gap-1 px-1.5 py-px text-[9px] leading-none"
          />
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
  const { t } = usePublicPrefs();
  const from = page * ITEMS_PER_PAGE + 1;
  const to = Math.min(total, (page + 1) * ITEMS_PER_PAGE);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <p className="text-xs text-zinc-500">
        <span className="sm:hidden">
          {page + 1}/{pageCount}
        </span>
        <span className="hidden sm:inline">
          {t("menu.pageOf", { from, to, total })}
        </span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
          className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--color-border)] text-zinc-600 disabled:opacity-40 dark:text-zinc-300"
          aria-label={t("menu.prevPage")}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--color-border)] text-zinc-600 disabled:opacity-40 dark:text-zinc-300"
          aria-label={t("menu.nextPage")}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

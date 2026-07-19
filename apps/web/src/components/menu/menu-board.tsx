"use client";

import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MediaImage } from "@/components/ui/media-image";
import { cn } from "@/lib/cn";
import type { MenuItem, MenuSection } from "@/lib/menu-client";
import { itemTimingLabel, sectionTimingLabel } from "@/lib/menu-timing";

const ITEMS_PER_PAGE = 10;
const UNCATEGORIZED_ID = "__none";

type CatalogSection = MenuSection & { id: string };

function buildCatalogSections(
  sections: MenuSection[],
  uncategorized: MenuItem[],
): CatalogSection[] {
  const list: CatalogSection[] = [...sections];
  if (uncategorized.length > 0) {
    list.push({
      id: UNCATEGORIZED_ID,
      name: "Other items",
      imageUrl: null,
      sortOrder: 999,
      mealPeriod: null,
      availableFrom: null,
      availableTo: null,
      availableDays: "0,1,2,3,4,5,6",
    });
  }
  return list;
}

function isRealSection(section: CatalogSection) {
  return section.id !== UNCATEGORIZED_ID;
}

function itemMatchesQuery(item: MenuItem, q: string) {
  if (!q) return true;
  const hay = `${item.name} ${item.description ?? ""}`.toLowerCase();
  return hay.includes(q);
}

function sectionMatchesQuery(
  section: CatalogSection,
  q: string,
  items: MenuItem[],
) {
  if (!q) return true;
  if (section.name.toLowerCase().includes(q)) return true;
  return items.some((i) => itemMatchesQuery(i, q));
}

export function MenuBoard({
  sections,
  itemsBySection,
  uncategorized,
  formatPrice,
  canWrite,
  onAddSection,
  onEditSection,
  onRemoveSections,
  onEditItem,
  onAddItem,
  onDeleteItem,
}: {
  sections: MenuSection[];
  itemsBySection: Map<string, MenuItem[]>;
  uncategorized: MenuItem[];
  formatPrice: (n: number) => string;
  canWrite: boolean;
  onAddSection: () => void;
  onEditSection: (section: MenuSection) => void;
  onRemoveSections: (sections: MenuSection[]) => void;
  onEditItem: (item: MenuItem) => void;
  onAddItem: (sectionId: string) => void;
  onDeleteItem: (item: MenuItem) => void;
}) {
  const catalogSections = useMemo(
    () => buildCatalogSections(sections, uncategorized),
    [sections, uncategorized],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [sectionSearch, setSectionSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [page, setPage] = useState(0);
  const [removeMode, setRemoveMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  function exitRemoveMode() {
    setRemoveMode(false);
    setSelectedIds(new Set());
  }

  function toggleSectionSelection(sectionId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function confirmRemoveSelection() {
    const picked = sections.filter((s) => selectedIds.has(s.id));
    if (picked.length === 0) return;
    exitRemoveMode();
    onRemoveSections(picked);
  }

  const sectionQ = sectionSearch.trim().toLowerCase();
  const itemQ = itemSearch.trim().toLowerCase();

  const getSectionItems = (sectionId: string) =>
    sectionId === UNCATEGORIZED_ID
      ? uncategorized
      : (itemsBySection.get(sectionId) ?? []);

  const visibleSections = useMemo(() => {
    return catalogSections.filter((s) =>
      sectionMatchesQuery(s, sectionQ, getSectionItems(s.id)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogSections, sectionQ, itemsBySection, uncategorized]);

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
  }, [catalogSections, itemQ, itemsBySection, uncategorized]);

  if (sections.length === 0 && uncategorized.length === 0) {
    return (
      <div className="mx-auto w-full max-w-lg rounded-xl border border-dashed border-white/15 bg-zinc-900/40 px-6 py-14 text-center">
        <p className="text-lg font-medium text-zinc-100">Your menu is empty</p>
        <p className="mt-2 text-sm text-zinc-500">
          Start with a section — Drinks, Food, Desserts — then add dishes inside
          it.
        </p>
        {canWrite ? (
          <button
            type="button"
            onClick={onAddSection}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            <Plus size={16} />
            Add first section
          </button>
        ) : null}
      </div>
    );
  }

  const activeIsReal =
    activeSection && isRealSection(activeSection) ? activeSection : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3">
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-white/10 bg-zinc-900/50",
          "lg:grid lg:min-h-[min(70vh,800px)] lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]",
        )}
      >
        {/* Sections sidebar */}
        <aside className="flex flex-col border-b border-white/10 lg:border-b-0 lg:border-r lg:border-white/10">
          <div className="space-y-3 border-b border-white/10 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-zinc-200">Sections</h2>
              {canWrite && !removeMode ? (
                <button
                  type="button"
                  onClick={onAddSection}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20"
                >
                  <Plus size={12} />
                  Add
                </button>
              ) : null}
            </div>
            <label className="relative hidden lg:block">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="search"
                value={sectionSearch}
                onChange={(e) => setSectionSearch(e.target.value)}
                placeholder="Search sections…"
                className="w-full rounded-lg border border-white/10 bg-zinc-950 py-2 pl-8 pr-8 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-emerald-400/40"
              />
              {sectionSearch ? (
                <button
                  type="button"
                  aria-label="Clear"
                  onClick={() => setSectionSearch("")}
                  className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-zinc-500 hover:bg-white/5"
                >
                  <X size={12} />
                </button>
              ) : null}
            </label>
          </div>

          {/* Mobile chips */}
          <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-3 py-3 scrollbar-hide lg:hidden">
            {visibleSections.map((s) => {
              const count = getSectionItems(s.id).length;
              const active = s.id === activeSection?.id;
              const real = isRealSection(s);
              const selected = selectedIds.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (removeMode && real) {
                      toggleSectionSelection(s.id);
                      return;
                    }
                    setActiveId(s.id);
                  }}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    removeMode && real && selected
                      ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40"
                      : active
                        ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
                        : "bg-zinc-950 text-zinc-400 ring-1 ring-white/10",
                  )}
                >
                  {s.name}
                  <span className="ml-1 opacity-60">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Desktop list */}
          <ul className="hidden min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 lg:flex">
            {visibleSections.map((s) => {
              const count = getSectionItems(s.id).length;
              const active = s.id === activeSection?.id;
              const real = isRealSection(s);
              const selected = selectedIds.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (removeMode && real) {
                        toggleSectionSelection(s.id);
                        return;
                      }
                      setActiveId(s.id);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                      removeMode && real && selected
                        ? "bg-rose-500/10 ring-1 ring-rose-400/30"
                        : active
                          ? "bg-white/[0.06] ring-1 ring-emerald-400/25"
                          : "hover:bg-white/[0.03]",
                    )}
                  >
                    {removeMode && real ? (
                      <span
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px]",
                          selected
                            ? "border-rose-400 bg-rose-500 text-white"
                            : "border-white/20 bg-zinc-950",
                        )}
                      >
                        {selected ? "✓" : null}
                      </span>
                    ) : null}
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-white/10">
                      {s.imageUrl ? (
                        <MediaImage
                          src={s.imageUrl}
                          alt=""
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <span className="grid h-full place-items-center text-xs font-medium text-zinc-500">
                          {s.name.slice(0, 1)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-200">
                        {s.name}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {count} item{count === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {canWrite ? (
            <div
              className={cn(
                "shrink-0 space-y-2 border-t border-white/10 p-3",
                !removeMode && "hidden lg:block",
              )}
            >
              {removeMode ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={exitRemoveMode}
                    className="flex flex-1 items-center justify-center rounded-lg border border-white/10 py-2 text-xs text-zinc-400 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={selectedIds.size === 0}
                    onClick={confirmRemoveSelection}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-400/30 bg-rose-500/10 py-2 text-xs text-rose-200 disabled:opacity-40"
                  >
                    <Trash2 size={12} />
                    Remove{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {activeIsReal ? (
                    <button
                      type="button"
                      onClick={() => onEditSection(activeIsReal)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 py-2 text-xs text-zinc-300 hover:bg-white/5"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  ) : null}
                  {sections.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setRemoveMode(true)}
                      className={cn(
                        "flex items-center justify-center gap-1 rounded-lg border border-rose-400/20 py-2 text-xs text-rose-300 hover:bg-rose-500/10",
                        activeIsReal ? "flex-1" : "w-full",
                      )}
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </aside>

        {/* Items pane */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {activeSection ? (
            <>
              <SectionHero
                section={activeSection}
                canWrite={canWrite && !!activeIsReal && !removeMode}
                onEdit={
                  activeIsReal ? () => onEditSection(activeIsReal) : undefined
                }
                onAddItem={
                  activeIsReal ? () => onAddItem(activeIsReal.id) : undefined
                }
              />

              <div className="border-b border-white/10 px-3 py-3 sm:px-4">
                <label className="relative block">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
                  />
                  <input
                    type="search"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Search items in this section…"
                    className="w-full rounded-lg border border-white/10 bg-zinc-950 py-2 pl-8 pr-8 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-emerald-400/40"
                  />
                  {itemSearch ? (
                    <button
                      type="button"
                      aria-label="Clear"
                      onClick={() => setItemSearch("")}
                      className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-zinc-500 hover:bg-white/5"
                    >
                      <X size={12} />
                    </button>
                  ) : null}
                </label>
                {itemQ && totalItemMatches > 0 ? (
                  <p className="mt-2 text-[11px] text-zinc-500">
                    {totalItemMatches} match
                    {totalItemMatches === 1 ? "" : "es"} across menu
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
                {filteredItems.length > ITEMS_PER_PAGE ? (
                  <PaginationBar
                    page={safePage}
                    pageCount={pageCount}
                    total={filteredItems.length}
                    onPage={setPage}
                  />
                ) : (
                  <p className="text-xs text-zinc-500">
                    {filteredItems.length} item
                    {filteredItems.length === 1 ? "" : "s"}
                  </p>
                )}
                {activeIsReal && canWrite && !removeMode ? (
                  <button
                    type="button"
                    onClick={() => onAddItem(activeIsReal.id)}
                    className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 sm:hidden"
                  >
                    <Plus size={14} />
                    Add item
                  </button>
                ) : null}
              </div>

              <ul className="min-h-[16rem] flex-1 divide-y divide-white/5 overflow-y-auto overscroll-contain">
                {pageItems.length === 0 ? (
                  <li className="px-4 py-12 text-center text-sm text-zinc-500">
                    {itemQ
                      ? "No items match your search."
                      : activeIsReal
                        ? "No items yet — use Add item above."
                        : "Items here have no section. Edit an item to assign one."}
                  </li>
                ) : (
                  pageItems.map((item) => (
                    <MenuItemRow
                      key={item.id}
                      item={item}
                      section={
                        activeSection.id === UNCATEGORIZED_ID
                          ? undefined
                          : activeSection
                      }
                      formatPrice={formatPrice}
                      canWrite={canWrite}
                      onEdit={() => onEditItem(item)}
                      onDelete={() => onDeleteItem(item)}
                    />
                  ))
                )}
              </ul>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-sm text-zinc-500">
              Select a section
            </div>
          )}
        </section>
      </div>

      {canWrite ? (
        <p className="text-center text-[11px] text-zinc-600">
          Tap a dish to edit · remove with the trash icon
        </p>
      ) : null}
    </div>
  );
}

function SectionHero({
  section,
  canWrite,
  onEdit,
  onAddItem,
}: {
  section: CatalogSection;
  canWrite: boolean;
  onEdit?: () => void;
  onAddItem?: () => void;
}) {
  const timing = sectionTimingLabel(section);

  return (
    <div className="shrink-0 border-b border-white/10">
      <div className="relative aspect-[3/1] max-h-40 w-full overflow-hidden bg-zinc-800 sm:aspect-[4/1] sm:max-h-48">
        {section.imageUrl ? (
          <MediaImage
            src={section.imageUrl}
            alt=""
            fill
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-emerald-950/40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-3 sm:p-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-white sm:text-2xl">
              {section.name}
            </h2>
            {timing ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                <Clock size={12} className="shrink-0 text-emerald-400/80" />
                {timing}
              </p>
            ) : null}
          </div>
          {canWrite ? (
            <div className="flex shrink-0 gap-2">
              {onEdit ? (
                <button
                  type="button"
                  onClick={onEdit}
                  className="hidden items-center gap-1 rounded-lg border border-white/15 bg-zinc-950/70 px-2.5 py-1.5 text-[11px] text-zinc-200 backdrop-blur hover:bg-zinc-900 sm:inline-flex"
                >
                  <Pencil size={12} />
                  Edit section
                </button>
              ) : null}
              {onAddItem ? (
                <button
                  type="button"
                  onClick={onAddItem}
                  className="hidden items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-500 sm:inline-flex"
                >
                  <Plus size={12} />
                  Add item
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MenuItemRow({
  item,
  section,
  formatPrice,
  canWrite,
  onEdit,
  onDelete,
}: {
  item: MenuItem;
  section?: MenuSection;
  formatPrice: (n: number) => string;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const imageSrc = item.imageUrl ?? item.imageUrl2;
  const timing = itemTimingLabel(item, section);
  const outOfStock = item.trackStock && item.stock <= 0;

  return (
    <li className="group flex items-start gap-3 px-3 py-3 sm:gap-4 sm:px-4">
      <button
        type="button"
        onClick={onEdit}
        disabled={!canWrite}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-3 text-left sm:gap-4",
          canWrite && "hover:opacity-90",
        )}
      >
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-white/10 sm:h-16 sm:w-16">
          {imageSrc ? (
            <MediaImage src={imageSrc} alt="" fill className="object-cover" />
          ) : (
            <span className="grid h-full place-items-center text-sm font-medium text-zinc-500">
              {item.name.slice(0, 1)}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 py-0.5">
          <span className="flex items-start justify-between gap-3">
            <span
              className={cn(
                "text-sm font-medium leading-snug text-zinc-100",
                !item.isAvailable && "text-zinc-500 line-through",
              )}
            >
              {item.name}
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-300">
              {formatPrice(item.price)}
            </span>
          </span>
          {item.description ? (
            <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-zinc-500">
              {item.description}
            </span>
          ) : null}
          <span className="mt-2 flex flex-wrap gap-1.5">
            {!item.isAvailable ? <Badge tone="muted">Hidden</Badge> : null}
            {item.trackStock ? (
              <Badge tone={outOfStock ? "danger" : "ok"}>
                <Package size={9} />
                {outOfStock ? "Out of stock" : `${item.stock} left`}
              </Badge>
            ) : null}
            {timing ? (
              <Badge tone="muted">
                <Clock size={9} />
                <span className="max-w-[12rem] truncate">{timing}</span>
              </Badge>
            ) : null}
          </span>
        </span>
      </button>
      {canWrite ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Remove ${item.name}`}
          className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-transparent text-zinc-600 transition hover:border-rose-400/20 hover:bg-rose-500/10 hover:text-rose-300"
        >
          <Trash2 size={14} />
        </button>
      ) : null}
    </li>
  );
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "muted" | "ok" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        tone === "muted" && "bg-white/5 text-zinc-500",
        tone === "ok" && "bg-emerald-500/10 text-emerald-300",
        tone === "danger" && "bg-rose-500/10 text-rose-300",
      )}
    >
      {children}
    </span>
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
      <p className="text-xs text-zinc-500">
        <span className="sm:hidden">
          {page + 1}/{pageCount}
        </span>
        <span className="hidden sm:inline">
          {from}–{to} of {total}
        </span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-zinc-400 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="hidden gap-1 px-1 sm:flex">
          {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
            const pageIndex =
              pageCount <= 7
                ? i
                : Math.min(
                    Math.max(0, page - 3),
                    pageCount - 7,
                  ) + i;
            return (
              <button
                key={pageIndex}
                type="button"
                onClick={() => onPage(pageIndex)}
                className={cn(
                  "h-1.5 rounded-full transition",
                  pageIndex === page
                    ? "w-4 bg-emerald-400"
                    : "w-1.5 bg-zinc-600 hover:bg-zinc-500",
                )}
                aria-label={`Page ${pageIndex + 1}`}
              />
            );
          })}
        </div>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-zinc-400 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

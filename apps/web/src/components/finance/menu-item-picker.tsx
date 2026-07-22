"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MediaImage } from "@/components/ui/media-image";
import { cn } from "@/lib/cn";
import type { FullMenu, MenuItem, MenuSection } from "@/lib/menu-client";
import {
  isItemOrderableNow,
  itemOutOfStock,
} from "@/lib/menu-timing";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

const UNCATEGORIZED_ID = "__other__";
const ITEMS_PER_PAGE = 6;

type SectionBucket = {
  id: string;
  name: string;
  section?: MenuSection;
  items: MenuItem[];
};

function buildSections(
  menu: FullMenu,
  search: string,
  otherLabel: string,
): SectionBucket[] {
  const q = search.trim().toLowerCase();
  const sectionById = new Map(menu.sections.map((s) => [s.id, s]));
  const buckets = new Map<string, SectionBucket>();

  for (const s of menu.sections) {
    buckets.set(s.id, { id: s.id, name: s.name, section: s, items: [] });
  }
  buckets.set(UNCATEGORIZED_ID, {
    id: UNCATEGORIZED_ID,
    name: otherLabel,
    items: [],
  });

  for (const item of menu.items) {
    const section = item.sectionId
      ? sectionById.get(item.sectionId)
      : undefined;
    if (!isItemOrderableNow(item, section)) continue;

    const secId = item.sectionId ?? UNCATEGORIZED_ID;
    const bucket = buckets.get(secId) ?? buckets.get(UNCATEGORIZED_ID)!;
    if (q) {
      const hay = `${bucket.name} ${item.name} ${item.description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    bucket.items.push(item);
  }

  return [...buckets.values()].filter((s) => s.items.length > 0);
}

export function MenuItemPicker({
  menu,
  formatMoney,
  onPick,
  disabled,
}: {
  menu: FullMenu | null;
  formatMoney: (n: import("@/lib/money").MoneyWire) => string;
  onPick: (itemId: string, qty: number) => void;
  disabled?: boolean;
}) {
  const t = useVenueSettingsOptional()?.t ?? ((k: string) => k);
  const [search, setSearch] = useState("");
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);

  const sections = useMemo(
    () => (menu ? buildSections(menu, search, t("orders.pickerOther")) : []),
    [menu, search, t],
  );

  const activeSection =
    sections.find((s) => s.id === activeSectionId) ?? sections[0] ?? null;

  useEffect(() => {
    if (!sections.length) {
      setActiveSectionId(null);
      return;
    }
    if (!activeSectionId || !sections.some((s) => s.id === activeSectionId)) {
      setActiveSectionId(sections[0]!.id);
    }
  }, [sections, activeSectionId]);

  useEffect(() => {
    setPage(0);
  }, [activeSectionId, search]);

  if (!menu) {
    return <p className="text-xs text-zinc-500">{t("common.loading")}</p>;
  }

  const items = activeSection?.items ?? [];
  const pageCount = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = items.slice(
    safePage * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
  );

  function addItem(item: MenuItem) {
    if (disabled || itemOutOfStock(item)) return;
    onPick(item.id, 1);
    setFlashId(item.id);
    window.setTimeout(() => setFlashId((cur) => (cur === item.id ? null : cur)), 450);
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <label className="relative block shrink-0">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("orders.pickerSearch")}
          className="w-full rounded-xl border border-white/10 bg-zinc-950 py-2.5 pl-9 pr-9 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        {search ? (
          <button
            type="button"
            aria-label={t("orders.pickerClearSearch")}
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-zinc-500 hover:bg-white/5"
          >
            <X size={14} />
          </button>
        ) : null}
      </label>

      {sections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 py-10 text-center text-xs text-zinc-500">
          {t("orders.pickerEmpty")}
        </p>
      ) : (
        <>
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            {sections.map((s) => {
              const active = s.id === activeSection?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSectionId(s.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition",
                    active
                      ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/25"
                      : "bg-zinc-950 text-zinc-400 ring-1 ring-white/10 hover:text-zinc-200",
                  )}
                >
                  {s.name}
                  <span className="ml-1.5 opacity-70">({s.items.length})</span>
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2">
            {pageCount > 1 ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-zinc-950 text-zinc-300 disabled:opacity-40"
                  aria-label={t("orders.prevPage")}
                >
                  ‹
                </button>
                <span className="text-[11px] tabular-nums text-zinc-500">
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-zinc-950 text-zinc-300 disabled:opacity-40"
                  aria-label={t("orders.nextPage")}
                >
                  ›
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-zinc-500">
                {items.length === 1
                  ? t("orders.pickerItemCountOne", { count: items.length })
                  : t("orders.pickerItemCountMany", { count: items.length })}
              </span>
            )}
            <p className="text-[10px] text-zinc-600">
              {t("orders.pickerTapHint")}
            </p>
          </div>

          <ul className="grid max-h-[min(42vh,360px)] grid-cols-2 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-3">
            {pageItems.map((item) => {
              const oos = itemOutOfStock(item);
              const image = item.imageUrl ?? item.imageUrl2;
              const flashed = flashId === item.id;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={disabled || oos}
                    onClick={() => addItem(item)}
                    className={cn(
                      "flex h-full w-full flex-col overflow-hidden rounded-xl border bg-zinc-950/80 text-left transition active:scale-[0.98] disabled:opacity-50",
                      flashed
                        ? "border-emerald-400/60 ring-2 ring-emerald-400/30"
                        : "border-white/10 hover:border-emerald-500/30 hover:bg-zinc-900",
                    )}
                  >
                    <span className="relative aspect-[4/3] w-full bg-zinc-900">
                      {image ? (
                        <MediaImage
                          src={image}
                          alt=""
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <span className="grid h-full place-items-center font-serif text-2xl text-zinc-600">
                          {item.name.slice(0, 1)}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-1 flex-col p-2.5">
                      <span className="line-clamp-2 text-xs font-semibold leading-snug text-zinc-100">
                        {item.name}
                      </span>
                      <span className="mt-1 text-xs font-bold tabular-nums text-emerald-300">
                        {formatMoney(item.price)}
                      </span>
                      {item.trackStock ? (
                        <span
                          className={cn(
                            "mt-1 text-[10px]",
                            oos ? "text-rose-400" : "text-zinc-500",
                          )}
                        >
                          {oos ? t("orders.pickerOutOfStock") : t("orders.pickerStockLeft", { n: item.stock })}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

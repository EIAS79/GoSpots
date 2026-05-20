"use client";

import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { FullMenu, MenuItem } from "@/lib/menu-client";

function itemOutOfStock(item: MenuItem): boolean {
  return Boolean(item.trackStock && item.stock <= 0);
}

function itemAvailable(item: MenuItem): boolean {
  return item.isAvailable && !itemOutOfStock(item);
}

export function MenuItemPicker({
  menu,
  formatMoney,
  onPick,
  disabled,
}: {
  menu: FullMenu | null;
  formatMoney: (n: number) => string;
  onPick: (itemId: string, qty: number) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [qty, setQty] = useState("1");

  const sections = useMemo(() => {
    if (!menu) return [];
    const q = search.trim().toLowerCase();
    const bySection = new Map<
      string,
      { id: string; name: string; items: MenuItem[] }
    >();

    for (const s of menu.sections) {
      bySection.set(s.id, { id: s.id, name: s.name, items: [] });
    }
    bySection.set("__other__", { id: "__other__", name: "Other", items: [] });

    for (const item of menu.items) {
      if (!item.isAvailable && !item.trackStock) continue;
      const secId = item.sectionId ?? "__other__";
      const bucket = bySection.get(secId) ?? bySection.get("__other__")!;
      if (q) {
        const hay = `${bucket.name} ${item.name} ${item.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      bucket.items.push(item);
    }

    return [...bySection.values()].filter((s) => s.items.length > 0);
  }, [menu, search]);

  if (!menu) {
    return <p className="text-xs text-zinc-500">Loading menu…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu items or sections…"
          className="w-full rounded-lg border border-white/10 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-zinc-500">
          Qty
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="ml-2 w-16 rounded-lg border border-white/10 bg-zinc-950 px-2 py-1 text-sm text-white"
          />
        </label>
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-zinc-950/80 p-1">
        {sections.length === 0 ? (
          <p className="p-4 text-center text-xs text-zinc-500">No items match.</p>
        ) : (
          sections.map((section) => {
            const open = openSectionId === section.id;
            return (
              <div key={section.id} className="rounded-lg border border-white/5">
                <button
                  type="button"
                  onClick={() =>
                    setOpenSectionId((cur) =>
                      cur === section.id ? null : section.id,
                    )
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-zinc-200 hover:bg-white/5"
                >
                  <span>
                    {section.name}
                    <span className="ml-2 text-xs font-normal text-zinc-500">
                      ({section.items.length})
                    </span>
                  </span>
                  <ChevronDown
                    size={16}
                    className={cn(
                      "shrink-0 text-zinc-500 transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </button>
                {open ? (
                  <ul className="border-t border-white/5 pb-1">
                    {section.items.map((item) => {
                      const oos = itemOutOfStock(item);
                      const ok = itemAvailable(item);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            disabled={disabled || !ok}
                            onClick={() => {
                              const n = Math.max(1, parseInt(qty, 10) || 1);
                              if (
                                item.trackStock &&
                                item.stock > 0 &&
                                n > item.stock
                              ) {
                                onPick(item.id, item.stock);
                              } else {
                                onPick(item.id, n);
                              }
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                              ok
                                ? "text-zinc-200 hover:bg-emerald-500/10"
                                : "cursor-not-allowed text-zinc-600",
                            )}
                          >
                            <span className="min-w-0 truncate">{item.name}</span>
                            <span className="shrink-0 text-xs">
                              {formatMoney(item.price)}
                              {item.trackStock ? (
                                <span
                                  className={cn(
                                    "ml-2",
                                    oos ? "text-rose-400" : "text-zinc-500",
                                  )}
                                >
                                  {oos ? "Out of stock" : `${item.stock} left`}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

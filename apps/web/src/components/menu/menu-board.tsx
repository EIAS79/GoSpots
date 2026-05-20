"use client";

import { Clock, Package } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import type { MenuItem, MenuSection } from "@/lib/menu-client";
import { itemTimingLabel, sectionTimingLabel } from "@/lib/menu-timing";
import { resolveMediaUrl } from "@/lib/media-url";

export function MenuBoard({
  sections,
  itemsBySection,
  uncategorized,
  formatPrice,
  canWrite,
  onEditSection,
  onEditItem,
  onAddItem,
}: {
  sections: MenuSection[];
  itemsBySection: Map<string, MenuItem[]>;
  uncategorized: MenuItem[];
  formatPrice: (n: number) => string;
  canWrite: boolean;
  onEditSection: (section: MenuSection) => void;
  onEditItem: (item: MenuItem) => void;
  onAddItem: (sectionId: string | null) => void;
}) {
  const hasAny =
    sections.length > 0 || uncategorized.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-zinc-900/30 px-6 py-16 text-center">
        <p className="text-sm text-zinc-400">
          Your menu is empty. Add a section (e.g. Drinks, Snacks) then add items
          with prices and photos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          items={itemsBySection.get(section.id) ?? []}
          formatPrice={formatPrice}
          canWrite={canWrite}
          onEditSection={() => onEditSection(section)}
          onEditItem={onEditItem}
          onAddItem={() => onAddItem(section.id)}
        />
      ))}
      {uncategorized.length > 0 ? (
        <SectionBlock
          section={{
            id: "__none",
            name: "Other items",
            sortOrder: 999,
            mealPeriod: null,
            availableFrom: null,
            availableTo: null,
            availableDays: "0,1,2,3,4,5,6",
          }}
          items={uncategorized}
          formatPrice={formatPrice}
          canWrite={canWrite}
          onEditSection={() => {}}
          onEditItem={onEditItem}
          onAddItem={() => onAddItem(null)}
          hideSectionEdit
        />
      ) : null}
    </div>
  );
}

function SectionBlock({
  section,
  items,
  formatPrice,
  canWrite,
  onEditSection,
  onEditItem,
  onAddItem,
  hideSectionEdit,
}: {
  section: MenuSection;
  items: MenuItem[];
  formatPrice: (n: number) => string;
  canWrite: boolean;
  onEditSection: () => void;
  onEditItem: (item: MenuItem) => void;
  onAddItem: () => void;
  hideSectionEdit?: boolean;
}) {
  const timing = sectionTimingLabel(section);

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-emerald-500/20 pb-3">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-white md:text-3xl">
            {section.name}
          </h2>
          {timing ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock size={12} className="shrink-0 text-emerald-500/80" />
              {timing}
            </p>
          ) : null}
        </div>
        {canWrite ? (
          <div className="flex shrink-0 gap-2">
            {!hideSectionEdit ? (
              <button
                type="button"
                onClick={onEditSection}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
              >
                Edit section
              </button>
            ) : null}
            <button
              type="button"
              onClick={onAddItem}
              className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
            >
              Add item
            </button>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No items in this section yet.</p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              section={section.id === "__none" ? undefined : section}
              formatPrice={formatPrice}
              canWrite={canWrite}
              onEdit={() => onEditItem(item)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MenuItemCard({
  item,
  section,
  formatPrice,
  canWrite,
  onEdit,
}: {
  item: MenuItem;
  section?: MenuSection;
  formatPrice: (n: number) => string;
  canWrite: boolean;
  onEdit: () => void;
}) {
  const img1 = resolveMediaUrl(item.imageUrl);
  const img2 = resolveMediaUrl(item.imageUrl2);
  const timing = itemTimingLabel(item, section);
  const outOfStock =
    item.trackStock && item.stock <= 0;
  const lowStock =
    item.trackStock && item.stock > 0 && item.stock <= 5;

  const inner = (
    <>
      {(img1 || img2) && (
        <div className="flex shrink-0 gap-1.5">
          {img1 ? (
            <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-zinc-800">
              <Image
                src={img1}
                alt=""
                fill
                className="object-cover"
                sizes="64px"
                unoptimized
              />
            </div>
          ) : null}
          {img2 ? (
            <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-zinc-800">
              <Image
                src={img2}
                alt=""
                fill
                className="object-cover"
                sizes="64px"
                unoptimized
              />
            </div>
          ) : null}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              "font-medium leading-snug text-white",
              !item.isAvailable && "text-zinc-500 line-through",
            )}
          >
            {item.name}
          </h3>
          <span className="shrink-0 text-sm font-semibold text-emerald-300">
            {formatPrice(item.price)}
          </span>
        </div>
        {item.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
            {item.description}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {!item.isAvailable ? (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
              Hidden
            </span>
          ) : null}
          {item.trackStock ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
                outOfStock
                  ? "bg-rose-500/15 text-rose-300"
                  : lowStock
                    ? "bg-amber-500/15 text-amber-200"
                    : "bg-emerald-500/10 text-emerald-300",
              )}
            >
              <Package size={10} />
              {outOfStock ? "Out of stock" : `${item.stock} in stock`}
            </span>
          ) : null}
          {timing ? (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-500">
              <Clock size={10} className="shrink-0" />
              <span className="truncate">{timing}</span>
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  if (canWrite) {
    return (
      <li>
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full min-w-0 gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-3 text-left transition hover:border-emerald-400/25 hover:bg-zinc-900/80"
        >
          {inner}
        </button>
      </li>
    );
  }

  return (
    <li className="flex min-w-0 gap-3 rounded-xl border border-white/10 bg-zinc-900/40 p-3">
      {inner}
    </li>
  );
}

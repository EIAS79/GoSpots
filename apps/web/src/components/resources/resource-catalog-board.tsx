"use client";

import Image from "next/image";
import { Gamepad2, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ResourceCategory } from "@/lib/resources-client";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  RESOURCE_STATUS_COLORS,
  RESOURCE_STATUS_LABELS,
  RESOURCE_TYPE_LABELS,
  type ResourceStatus,
} from "@/lib/resource-types";

export function ResourceCatalogBoard({
  categories,
  formatPrice,
  canWrite,
  onEditCategory,
  onAddUnits,
  onEditUnit,
}: {
  categories: ResourceCategory[];
  formatPrice: (n: number) => string;
  canWrite: boolean;
  onEditCategory: (c: ResourceCategory) => void;
  onAddUnits: (c: ResourceCategory) => void;
  onEditUnit: (category: ResourceCategory, unitId: string) => void;
}) {
  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 px-6 py-14 text-center">
        <Gamepad2 className="mx-auto mb-3 text-zinc-600" size={32} />
        <p className="text-sm text-zinc-400">
          Add your first game or activity — PC stations, bowling lanes, billiard
          tables, PlayStation booths, and more.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {categories.map((cat) => (
        <CategoryCard
          key={cat.id}
          category={cat}
          formatPrice={formatPrice}
          canWrite={canWrite}
          onEdit={() => onEditCategory(cat)}
          onAddUnits={() => onAddUnits(cat)}
          onEditUnit={(unitId) => onEditUnit(cat, unitId)}
        />
      ))}
    </div>
  );
}

function CategoryCard({
  category,
  formatPrice,
  canWrite,
  onEdit,
  onAddUnits,
  onEditUnit,
}: {
  category: ResourceCategory;
  formatPrice: (n: number) => string;
  canWrite: boolean;
  onEdit: () => void;
  onAddUnits: () => void;
  onEditUnit: (unitId: string) => void;
}) {
  const img = resolveMediaUrl(category.imageUrl);
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/50">
      <div className="flex flex-wrap gap-4 border-b border-white/5 p-5">
        {img ? (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10">
            <Image src={img} alt="" fill className="object-cover" unoptimized />
          </div>
        ) : (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-white/10 bg-zinc-800">
            <Gamepad2 className="text-zinc-500" size={28} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-emerald-500/80">
            {RESOURCE_TYPE_LABELS[category.type]}
          </p>
          <h2 className="text-xl font-semibold text-white">{category.name}</h2>
          {category.description ? (
            <p className="mt-1 text-sm text-zinc-500">{category.description}</p>
          ) : null}
          {category.rates.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {category.rates.map((r) => (
                <li
                  key={r.id}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-zinc-400"
                >
                  {r.label}: {formatPrice(r.price)}
                  {r.durationMinutes ? ` / ${r.durationMinutes}m` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {canWrite ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
            >
              Edit offering
            </button>
            <button
              type="button"
              onClick={onAddUnits}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
            >
              <Plus size={12} />
              Add units
            </button>
          </div>
        ) : null}
      </div>

      <div className="p-5">
        <p className="mb-3 text-xs text-zinc-500">
          {category.resources.length} unit
          {category.resources.length === 1 ? "" : "s"} — shown on reservations
        </p>
        {category.resources.length === 0 ? (
          <p className="text-sm text-zinc-600">
            No units yet. Add PCs, lanes, or tables.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {category.resources.map((unit) => (
              <li key={unit.id}>
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => onEditUnit(unit.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition",
                    canWrite
                      ? "border-white/10 hover:border-emerald-400/25 hover:bg-white/[0.03]"
                      : "cursor-default border-white/5",
                  )}
                >
                  <span className="truncate font-medium text-zinc-200">
                    {unit.name}
                  </span>
                  <StatusPill status={unit.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: ResourceStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[10px]",
        RESOURCE_STATUS_COLORS[status],
      )}
    >
      {RESOURCE_STATUS_LABELS[status]}
    </span>
  );
}

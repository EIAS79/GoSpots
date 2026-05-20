"use client";

import {
  CircleDot,
  Gamepad2,
  Monitor,
  Plus,
  RectangleHorizontal,
} from "lucide-react";
import type { ComponentType } from "react";
import { MediaImage } from "@/components/ui/media-image";
import { cn } from "@/lib/cn";
import type { ResourceType } from "@/lib/resource-types";
import { RESOURCE_TYPE_LABELS } from "@/lib/resource-types";
import {
  formatGamingRateDuration,
  type GamingMenuResponse,
  type GamingOffering,
} from "@/lib/gaming-menu-client";

const TYPE_ICONS: Partial<
  Record<ResourceType, ComponentType<{ size?: number; className?: string }>>
> = {
  PC: Monitor,
  PLAYSTATION: Gamepad2,
  BILLIARD: CircleDot,
  BOWLING: RectangleHorizontal,
};

export function GamingMenuPanel({
  menu,
  formatPrice,
  canWrite,
  onEdit,
  onAddType,
}: {
  menu: GamingMenuResponse;
  formatPrice: (n: number) => string;
  canWrite: boolean;
  onEdit: (offering: GamingOffering) => void;
  onAddType: (type: ResourceType) => void;
}) {
  const { offerings, availableToAdd } = menu;

  return (
    <div className="space-y-6">
      {offerings.length === 0 && availableToAdd.length === 0 ? (
        <p className="text-sm text-zinc-500">No gaming data loaded.</p>
      ) : null}

      {offerings.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {offerings.map((o) => (
            <OfferingCard
              key={o.id}
              offering={o}
              formatPrice={formatPrice}
              canWrite={canWrite}
              onEdit={() => onEdit(o)}
            />
          ))}
        </div>
      ) : null}

      {canWrite && availableToAdd.length > 0 ? (
        <section className="rounded-xl border border-dashed border-white/15 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Add a game your venue offers
          </p>
          <div className="flex flex-wrap gap-2">
            {availableToAdd.map((type) => {
              const Icon = TYPE_ICONS[type] ?? Gamepad2;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onAddType(type)}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-500/20"
                >
                  <Icon size={14} />
                  <Plus size={12} className="opacity-70" />
                  {RESOURCE_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-zinc-600">
            Only add what you have — venues can run just PC, only bowling, or any mix.
          </p>
        </section>
      ) : null}

      {offerings.length === 0 && availableToAdd.length > 0 ? (
        <p className="text-center text-sm text-zinc-500">
          Pick a game above to set up seats, pricing, and a photo.
        </p>
      ) : null}
    </div>
  );
}

function OfferingCard({
  offering: o,
  formatPrice,
  canWrite,
  onEdit,
}: {
  offering: GamingOffering;
  formatPrice: (n: number) => string;
  canWrite: boolean;
  onEdit: () => void;
}) {
  const Icon = TYPE_ICONS[o.type] ?? Gamepad2;
  const { inventory, unitLabels } = o;
  const inUse = inventory.reservedNow + inventory.inUseNow;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/50">
      <div className="flex gap-4 p-4">
        {o.imageUrl ? (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-white/10">
            <MediaImage src={o.imageUrl} alt="" fill />
          </div>
        ) : (
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-lg border border-white/10 bg-zinc-800 text-emerald-400/80">
            <Icon size={28} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-emerald-500/80">
            {RESOURCE_TYPE_LABELS[o.type]}
          </p>
          <h3 className="text-lg font-semibold text-white">{o.name}</h3>
          {o.description ? (
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-500">
              {o.description}
            </p>
          ) : (
            <p className="mt-1 text-xs italic text-zinc-600">No specs added yet</p>
          )}
        </div>
      </div>

      <div className="border-t border-white/5 bg-black/20 px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-200">
            {inventory.availableNow} / {inventory.total} {unitLabels.plural} free now
          </span>
          {inUse > 0 ? (
            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-200">
              {inUse} booked
            </span>
          ) : null}
          {inventory.maintenance > 0 ? (
            <span className="text-[11px] text-zinc-500">
              {inventory.maintenance} maintenance
            </span>
          ) : null}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              inventory.total === 0
                ? "w-0"
                : inventory.availableNow / inventory.total > 0.5
                  ? "bg-emerald-500"
                  : inventory.availableNow > 0
                    ? "bg-amber-500"
                    : "bg-rose-500/80",
            )}
            style={{
              width:
                inventory.total > 0
                  ? `${Math.round((inventory.availableNow / inventory.total) * 100)}%`
                  : "0%",
            }}
          />
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">
          Game bookings subtract from this stock automatically.
        </p>
      </div>

      {o.rates.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 border-t border-white/5 px-4 py-3">
          {o.rates.map((r) => (
            <li
              key={r.id}
              className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400"
            >
              {r.label}: {formatPrice(r.price)}
              {formatGamingRateDuration(r.durationMinutes)}
            </li>
          ))}
        </ul>
      ) : null}

      {canWrite ? (
        <div className="border-t border-white/5 p-3">
          <button
            type="button"
            onClick={onEdit}
            className="w-full rounded-lg border border-white/10 py-2 text-xs text-zinc-300 hover:bg-white/5"
          >
            Edit {unitLabels.plural}, pricing &amp; photo
          </button>
        </div>
      ) : null}
    </article>
  );
}

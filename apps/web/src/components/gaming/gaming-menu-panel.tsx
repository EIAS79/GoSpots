"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Gamepad2,
  Map,
  Monitor,
  Plus,
} from "lucide-react";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { DiningTableIcon } from "@/components/icons/dining-table-icon";
import { BilliardTableIcon } from "@/components/icons/billiard-table-icon";
import { BowlingLaneIcon } from "@/components/icons/bowling-lane-icon";
import { ArcadeCabinetIcon } from "@/components/icons/arcade-cabinet-icon";
import { FoosballTableIcon } from "@/components/icons/foosball-table-icon";
import { PingPongTableIcon } from "@/components/icons/ping-pong-table-icon";
import { MediaImage } from "@/components/ui/media-image";
import { SeatFloorMap } from "@/components/reservations/seat-floor-map";
import { BowlingLaneFloorMap } from "@/components/reservations/bowling-lane-floor-map";
import { cn } from "@/lib/cn";
import {
  getFloorMapVisualType,
  supportsGamingLayout,
} from "@/lib/gaming-floor-visual";
import type { ResourceType } from "@/lib/resource-types";
import { resourceTypeLabel } from "@/lib/resource-types";
import {
  formatGamingRateDuration,
  type GamingMenuResponse,
  type GamingOffering,
} from "@/lib/gaming-menu-client";
import type { DaySchedule, ScheduleUnit } from "@/lib/reservations-client";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import {
  staffBowlingChromeLabels,
  staffFloorStatusLabels,
  staffFloorT,
  type StaffFloorTranslate,
  staffLayoutMapLabel,
} from "@/lib/staff-floor-i18n";

const ADD_TYPE_KEYS: Partial<Record<ResourceType, string>> = {
  PC: "gamingSetup.addType.PC",
  PLAYSTATION: "gamingSetup.addType.PLAYSTATION",
  BILLIARD: "gamingSetup.addType.BILLIARD",
  BOWLING: "gamingSetup.addType.BOWLING",
  TABLE_TENNIS: "gamingSetup.addType.TABLE_TENNIS",
  FOOSBALL: "gamingSetup.addType.FOOSBALL",
  ARCADE: "gamingSetup.addType.ARCADE",
  DINING: "gamingSetup.addType.DINING",
};

const TYPE_ICONS: Partial<
  Record<ResourceType, ComponentType<{ size?: number; className?: string }>>
> = {
  PC: Monitor,
  PLAYSTATION: Gamepad2,
  BILLIARD: ({ className }) => (
    <BilliardTableIcon status="AVAILABLE" className={className ?? "h-5 w-9"} />
  ),
  BOWLING: ({ className }) => (
    <BowlingLaneIcon status="AVAILABLE" className={className ?? "h-5 w-3"} />
  ),
  TABLE_TENNIS: ({ className }) => (
    <PingPongTableIcon status="AVAILABLE" className={className ?? "h-5 w-8"} />
  ),
  FOOSBALL: ({ className }) => (
    <FoosballTableIcon status="AVAILABLE" className={className ?? "h-5 w-9"} />
  ),
  ARCADE: ({ className }) => (
    <ArcadeCabinetIcon status="AVAILABLE" className={className ?? "h-6 w-5"} />
  ),
  DINING: ({ className }) => (
    <DiningTableIcon
      status="AVAILABLE"
      seats={4}
      className={className ?? "h-6 w-6"}
    />
  ),
};

function formatBookingMode(
  t: StaffFloorTranslate,
  mode: GamingOffering["bookingMode"],
) {
  switch (mode) {
    case "GAME":
      return t("gamingSetup.bookingMode.game");
    case "PERSON":
      return t("gamingSetup.bookingMode.person");
    case "MIXED":
      return t("gamingSetup.bookingMode.mixed");
    default:
      return t("gamingSetup.bookingMode.time");
  }
}

export function GamingMenuPanel({
  menu,
  schedule,
  formatPrice,
  canWrite,
  variant = "gaming",
  onEdit,
  onEditLayout,
  onAddType,
}: {
  menu: GamingMenuResponse;
  schedule?: DaySchedule | null;
  formatPrice: (n: import("@/lib/money").MoneyWire) => string;
  canWrite: boolean;
  variant?: "gaming" | "dining";
  onEdit: (offering: GamingOffering) => void;
  onEditLayout?: (offering: GamingOffering) => void;
  onAddType: (type: ResourceType) => void;
}) {
  const { offerings, availableToAdd } = menu;
  const isDining = variant === "dining";
  const vs = useVenueSettingsOptional();
  const t = useMemo(
    () => vs?.t ?? staffFloorT(vs?.locale),
    [vs?.t, vs?.locale],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {offerings.length === 0 && availableToAdd.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {isDining
            ? t("gamingSetup.panel.emptyDining")
            : t("gamingSetup.panel.emptyGaming")}
        </p>
      ) : null}

      {offerings.length > 0 ? (
        <div className="grid gap-3 md:gap-4 lg:grid-cols-2">
          {offerings.map((o) => (
            <OfferingCard
              key={o.id}
              offering={o}
              schedule={schedule}
              formatPrice={formatPrice}
              canWrite={canWrite}
              onEdit={() => onEdit(o)}
              onEditLayout={onEditLayout ? () => onEditLayout(o) : undefined}
            />
          ))}
        </div>
      ) : null}

      {canWrite && availableToAdd.length > 0 ? (
        <section className="rounded-xl border border-dashed border-white/15 p-3 md:p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 md:mb-3">
            {isDining
              ? t("gamingSetup.panel.addTitleDining")
              : t("gamingSetup.panel.addTitleGaming")}
          </p>
          <div className="flex flex-wrap gap-2">
            {availableToAdd.map((type) => {
              const Icon = TYPE_ICONS[type] ?? Gamepad2;
              const addTypeKey = ADD_TYPE_KEYS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onAddType(type)}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-500/20"
                >
                  <Icon size={14} />
                  <Plus size={12} className="opacity-70" />
                  {addTypeKey ? t(addTypeKey) : resourceTypeLabel(t, type)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-zinc-600 md:mt-3">
            {isDining
              ? t("gamingSetup.panel.addHintDining")
              : t("gamingSetup.panel.addHintGaming")}
          </p>
        </section>
      ) : null}

      {offerings.length === 0 && availableToAdd.length > 0 ? (
        <p className="text-center text-sm text-zinc-500">
          {isDining
            ? t("gamingSetup.panel.emptyHintDining")
            : t("gamingSetup.panel.emptyHintGaming")}
        </p>
      ) : null}
    </div>
  );
}

function OfferingCard({
  offering: o,
  schedule,
  formatPrice,
  canWrite,
  onEdit,
  onEditLayout,
}: {
  offering: GamingOffering;
  schedule?: DaySchedule | null;
  formatPrice: (n: import("@/lib/money").MoneyWire) => string;
  canWrite: boolean;
  onEdit: () => void;
  onEditLayout?: () => void;
}) {
  const Icon = TYPE_ICONS[o.type] ?? Gamepad2;
  const { inventory, unitLabels } = o;
  const inUse = inventory.reservedNow + inventory.inUseNow;
  const isBowling = o.type === "BOWLING";
  const floorVisualType = getFloorMapVisualType(o.type);
  const supportsLayout = supportsGamingLayout(o.unitKind);
  const liveCategory = schedule?.categories.find((c) => c.id === o.id);
  const liveUnits = liveCategory?.units ?? [];
  const layoutSections = liveCategory?.sections ?? o.sections ?? [];
  const gamesPreview = o.playstationGames.slice(0, 4);
  const [mapOpen, setMapOpen] = useState(false);
  const vs = useVenueSettingsOptional();
  const t = useMemo(
    () => vs?.t ?? staffFloorT(vs?.locale),
    [vs?.t, vs?.locale],
  );
  const floorStatusLabels = useMemo(() => staffFloorStatusLabels(t), [t]);
  const bowlingChrome = useMemo(() => staffBowlingChromeLabels(t), [t]);
  const mapLabel = staffLayoutMapLabel(t, o.type, o.unitKind);

  const availabilityPct =
    inventory.total > 0
      ? Math.round((inventory.availableNow / inventory.total) * 100)
      : 0;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/50">
      {/* Header — compact on mobile */}
      <div className="flex items-start gap-3 p-3 md:gap-4 md:p-4">
        {o.imageUrl ? (
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 md:h-20 md:w-20">
            <MediaImage src={o.imageUrl} alt="" fill />
          </div>
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-white/10 bg-zinc-800 text-emerald-400/80 md:h-20 md:w-20">
            <Icon size={22} className="md:hidden" />
            <Icon size={26} className="hidden md:block" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-wide text-emerald-500/80 md:text-[10px]">
            {resourceTypeLabel(t, o.type)}
          </p>
          <h3 className="text-base font-semibold text-white md:text-lg">
            {o.name}
          </h3>
          {o.description ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500 md:mt-1 md:line-clamp-3 md:text-xs">
              {o.description}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] italic text-zinc-600 md:text-xs">
              {t("gamingSetup.card.noSpecs")}
            </p>
          )}
          {o.type === "PLAYSTATION" && gamesPreview.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {gamesPreview.map((game) => (
                <span
                  key={game}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] text-zinc-400"
                >
                  {game}
                </span>
              ))}
              {o.playstationGames.length > gamesPreview.length ? (
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] text-zinc-500">
                  {t("gamingSetup.card.moreGames", {
                    n: o.playstationGames.length - gamesPreview.length,
                  })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Stats strip */}
      <div className="border-t border-white/5 bg-black/20 px-3 py-2.5 md:px-4 md:py-3">
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200 md:px-2.5 md:text-[11px]">
            {t("gamingSetup.card.freeOfTotal", {
              free: inventory.availableNow,
              total: inventory.total,
            })}
          </span>
          {inUse > 0 ? (
            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200 md:text-[11px]">
              {t("gamingSetup.card.booked", { n: inUse })}
            </span>
          ) : null}
          {inventory.maintenance > 0 ? (
            <span className="text-[10px] text-zinc-500 md:text-[11px]">
              {t("gamingSetup.card.maint", { n: inventory.maintenance })}
            </span>
          ) : null}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800 md:h-1.5">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              inventory.total === 0
                ? "w-0"
                : availabilityPct > 50
                  ? "bg-emerald-500"
                  : inventory.availableNow > 0
                    ? "bg-amber-500"
                    : "bg-rose-500/80",
            )}
            style={{ width: `${availabilityPct}%` }}
          />
        </div>

        {layoutSections.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {layoutSections.map((s) => (
              <span
                key={s.id}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] text-zinc-500"
              >
                {s.name}
                {s.isVip ? t("gamingSetup.card.vipSuffix") : ""}
              </span>
            ))}
          </div>
        ) : null}
        {isBowling ? (
          <p className="mt-2 text-[10px] text-zinc-500">
            {t("gamingSetup.card.bowlingMode", {
              mode: formatBookingMode(t, o.bookingMode),
            })}
          </p>
        ) : null}
      </div>

      {/* Rates — horizontal scroll on mobile */}
      {o.rates.length > 0 ? (
        <ul className="flex gap-1.5 overflow-x-auto border-t border-white/5 px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:px-4 md:py-3 [&::-webkit-scrollbar]:hidden">
          {o.rates.map((r) => (
            <li
              key={r.id}
              className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400"
            >
              {r.label}: {formatPrice(r.price)}
              {formatGamingRateDuration(r.durationMinutes)}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Live map — collapsed by default on phone, always visible on desktop */}
      {supportsLayout && liveUnits.length > 0 ? (
        <div className="border-t border-white/5 bg-black/30">
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left md:pointer-events-none md:px-4 md:pt-3"
            aria-expanded={mapOpen}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {mapLabel}
            </span>
            <span className="text-zinc-500 md:hidden">
              {mapOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          <div className={cn(!mapOpen && "max-md:hidden")}>
            {isBowling ? (
              <LaneMapPreview
                units={liveUnits}
                chromeLabels={bowlingChrome}
                statusLabels={floorStatusLabels}
              />
            ) : (
              <SeatFloorMap
                units={liveUnits}
                sections={layoutSections}
                categoryLabel={o.name}
                displayOnly
                variant="compact"
                pageSize={floorVisualType === "dining" ? 6 : 12}
                visualType={floorVisualType}
                guestStatusLabels={floorStatusLabels}
                mainAreaLabel={t("floor.mainArea")}
              />
            )}
          </div>
        </div>
      ) : null}

      {canWrite ? (
        <div className="grid gap-2 border-t border-white/5 p-2.5 sm:grid-cols-2 md:p-3">
          {supportsLayout && onEditLayout ? (
            <button
              type="button"
              onClick={onEditLayout}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-500/10 py-2 text-[11px] text-emerald-100 hover:bg-emerald-500/20 md:text-xs"
            >
              <Map size={13} />
              {t("gamingSetup.card.layoutZones")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEdit}
            className={cn(
              "rounded-lg border border-white/10 py-2 text-[11px] text-zinc-300 hover:bg-white/5 md:text-xs",
              supportsLayout && onEditLayout ? "" : "sm:col-span-2",
            )}
          >
            {t("gamingSetup.card.editUnitsPricingPhoto", {
              plural: unitLabels.plural,
            })}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function LaneMapPreview({
  units,
  chromeLabels,
  statusLabels,
}: {
  units: ScheduleUnit[];
  chromeLabels: ReturnType<typeof staffBowlingChromeLabels>;
  statusLabels: ReturnType<typeof staffFloorStatusLabels>;
}) {
  return (
    <BowlingLaneFloorMap
      units={units}
      displayOnly
      showLegend={false}
      lanesPerPage={6}
      chromeLabels={chromeLabels}
      guestStatusLabels={statusLabels}
    />
  );
}

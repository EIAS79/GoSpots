"use client";

import {
  Home,
  Layers,
  Loader2,
  Minus,
  Plus,
  Sun,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { cn } from "@/lib/cn";
import {
  combineLocalDateTime,
  defaultEventTimes,
  eventStatus,
  formatEventWindow,
  splitIsoToDateAndTime,
  todayDateInput,
} from "@/lib/seating-event-datetime";
import {
  createSeatingTableGroup,
  deleteSeatingTableGroup,
  fetchSeatingTables,
  normalizeSeatingTablesResponse,
  recalcSeatingSummary,
  updateSeatingTableGroup,
  type SeatingTableGroup,
  type SeatingTablesResponse,
  type SeatingTablesSummary,
} from "@/lib/seating-tables-client";
import {
  floorLabel,
  floorRange,
  normalizeFloor,
} from "@/lib/seating-floor";
import {
  SEATING_ZONE_HINTS,
  SEATING_ZONE_LABELS,
  SEATING_ZONES,
  type SeatingZone,
} from "@/lib/seating-zone";
import { useLiveData } from "@/lib/use-live-data";

const { start: defaultStartTime, end: defaultEndTime } = defaultEventTimes();

function initialCustomDraft(zone: SeatingZone = "INDOOR", floor = 1) {
  return {
    zone,
    floor,
    label: "",
    capacity: 10,
    totalCount: 1,
    availableCount: 1,
    note: "",
    eventDate: todayDateInput(),
    eventStartTime: defaultStartTime,
    eventEndTime: defaultEndTime,
  };
}

const ZONE_ICONS: Record<
  SeatingZone,
  ComponentType<{ size?: number; className?: string }>
> = {
  INDOOR: Home,
  OUTDOOR: Sun,
};

const ZONE_ACCENT: Record<SeatingZone, string> = {
  INDOOR: "border-sky-400/25 bg-sky-500/[0.06]",
  OUTDOOR: "border-amber-400/25 bg-amber-500/[0.06]",
};

const PRESET_CAPACITIES = [2, 4, 6, 8] as const;

function clampAvailable(total: number, available: number) {
  return Math.min(Math.max(0, available), Math.max(0, total));
}

export function SeatingTablesPanel({ canWrite }: { canWrite: boolean }) {
  const [data, setData] = useState<SeatingTablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const [customDraft, setCustomDraft] = useState(initialCustomDraft);
  const [customForZone, setCustomForZone] = useState<SeatingZone | null>(null);
  const [activeFloor, setActiveFloor] = useState(1);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        setData(await fetchSeatingTables());
      } catch (e) {
        if (!opts.silent) {
          setData(null);
          setError(e instanceof Error ? e.message : "Failed to load seating.");
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
    return () => {
      for (const t of saveTimers.current.values()) clearTimeout(t);
    };
  }, [load]);

  useLiveData(() => load({ silent: true }), [], {
    intervalMs: 30_000,
    refreshOnSections: ["reservation"],
  });

  const patchLocal = (id: string, patch: Partial<SeatingTableGroup>) => {
    setData((prev) => {
      if (!prev) return prev;
      const current = Array.isArray(prev.groups) ? prev.groups : [];
      const groups = current.map((g) =>
        g.id === id ? { ...g, ...patch } : g,
      );
      return normalizeSeatingTablesResponse({
        groups,
        floorCount: prev.floorCount,
        byZone: prev.byZone,
      });
    });
  };

  const scheduleSave = (id: string, body: Parameters<typeof updateSeatingTableGroup>[1]) => {
    const existing = saveTimers.current.get(id);
    if (existing) clearTimeout(existing);
    saveTimers.current.set(
      id,
      setTimeout(() => {
        saveTimers.current.delete(id);
        setBusyId(id);
        updateSeatingTableGroup(id, body)
          .then((row) => {
            patchLocal(id, row);
          })
          .catch((e) => {
            setError(e instanceof Error ? e.message : "Could not save.");
            void load();
          })
          .finally(() => setBusyId(null));
      }, 600),
    );
  };

  async function addPreset(capacity: number, zone: SeatingZone, floor: number) {
    if (!canWrite) return;
    const list = Array.isArray(data?.groups) ? data.groups : [];
    const exists = list.some(
      (g) =>
        !g.isCustom &&
        g.capacity === capacity &&
        g.zone === zone &&
        g.floor === floor,
    );
    if (exists) {
      setError(
        `You already have a table-for-${capacity} on ${floorLabel(floor)} (${SEATING_ZONE_LABELS[zone].toLowerCase()}).`,
      );
      return;
    }
    setBusyId("new");
    try {
      const row = await createSeatingTableGroup({
        capacity,
        zone,
        floor,
        totalCount: 0,
        availableCount: 0,
        isCustom: false,
      });
      setData((prev) =>
        normalizeSeatingTablesResponse({
          groups: [...(Array.isArray(prev?.groups) ? prev.groups : []), row],
          floorCount: prev?.floorCount,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add table type.");
    } finally {
      setBusyId(null);
    }
  }

  async function addCustom() {
    if (!canWrite) return;
    const eventStartsAt = combineLocalDateTime(
      customDraft.eventDate,
      customDraft.eventStartTime,
    );
    const eventEndsAt = combineLocalDateTime(
      customDraft.eventDate,
      customDraft.eventEndTime,
    );
    if (!eventStartsAt) {
      setError("Pick a date and start time for this event.");
      return;
    }
    if (!eventEndsAt) {
      setError("Pick an end time for this event.");
      return;
    }
    if (new Date(eventEndsAt) <= new Date(eventStartsAt)) {
      setError("End time must be after start time.");
      return;
    }
    const label = customDraft.label.trim() || "Custom seating";
    setBusyId("custom");
    try {
      const row = await createSeatingTableGroup({
        label,
        zone: customDraft.zone,
        floor: customDraft.floor,
        capacity: customDraft.capacity,
        totalCount: customDraft.totalCount,
        availableCount: clampAvailable(
          customDraft.totalCount,
          customDraft.availableCount,
        ),
        note: customDraft.note.trim() || undefined,
        isCustom: true,
        eventStartsAt,
        eventEndsAt,
      });
      setData((prev) =>
        normalizeSeatingTablesResponse({
          groups: [...(Array.isArray(prev?.groups) ? prev.groups : []), row],
        }),
      );
      setShowCustom(false);
      setCustomForZone(null);
      setCustomDraft(initialCustomDraft());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add custom group.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeGroup(id: string) {
    if (!canWrite || !confirm("Remove this seating group?")) return;
    setBusyId(id);
    try {
      await deleteSeatingTableGroup(id);
      setData((prev) => {
        if (!prev) return prev;
        const current = Array.isArray(prev.groups) ? prev.groups : [];
        return normalizeSeatingTablesResponse({
          groups: current.filter((g) => g.id !== id),
        });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusyId(null);
    }
  }

  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const floorCount = normalizeFloor(data?.floorCount, 10);
  const floors = floorRange(floorCount);
  const showFloors = floorCount > 1;
  const floorGroups = showFloors
    ? groups.filter((g) => g.floor === activeFloor)
    : groups;
  const summary = recalcSeatingSummary(floorGroups);
  const byZone = {
    INDOOR: recalcSeatingSummary(
      floorGroups.filter((g) => g.zone === "INDOOR"),
    ),
    OUTDOOR: recalcSeatingSummary(
      floorGroups.filter((g) => g.zone === "OUTDOOR"),
    ),
  };

  useEffect(() => {
    if (activeFloor > floorCount) setActiveFloor(floorCount);
  }, [activeFloor, floorCount]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {summary ? (
            <>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                {summary.availableTables} / {summary.totalTables} tables free
                {showFloors ? ` · ${floorLabel(activeFloor)}` : ""}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-400">
                ~{summary.availableSeats} seats
              </span>
            </>
          ) : null}
        </div>
        {showFloors ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-950/60 p-1">
            <Layers size={14} className="ml-1 shrink-0 text-violet-400" />
            {floors.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFloor(f)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  activeFloor === f
                    ? "bg-violet-500/20 text-violet-100"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {floorLabel(f)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showCustom && canWrite ? (
        <div className="rounded-xl border border-amber-400/20 bg-zinc-900/60 p-4">
          <p className="text-sm font-medium text-white">
            Custom seating
            {customForZone ? (
              <span className="ml-2 font-normal text-amber-200/90">
                · {SEATING_ZONE_LABELS[customForZone]}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Private events, combined tables, terrace setups — set when it runs and add a note for your team.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400 sm:col-span-2">
              Area
              <div className="mt-1 flex gap-1 rounded-lg border border-white/10 bg-zinc-950/80 p-0.5">
                {SEATING_ZONES.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() =>
                      setCustomDraft((d) => ({ ...d, zone: z }))
                    }
                    className={cn(
                      "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition",
                      customDraft.zone === z
                        ? "bg-white/10 text-white"
                        : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    {SEATING_ZONE_LABELS[z]}
                  </button>
                ))}
              </div>
            </label>
            {showFloors ? (
              <label className="block text-xs text-zinc-400">
                Floor
                <select
                  value={customDraft.floor}
                  onChange={(e) =>
                    setCustomDraft((d) => ({
                      ...d,
                      floor: normalizeFloor(+e.target.value, floorCount),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                >
                  {floors.map((f) => (
                    <option key={f} value={f}>
                      {floorLabel(f)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block text-xs text-zinc-400 sm:col-span-2">
              Event date
              <input
                type="date"
                value={customDraft.eventDate}
                onChange={(e) =>
                  setCustomDraft((d) => ({ ...d, eventDate: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Start time
              <input
                type="time"
                value={customDraft.eventStartTime}
                onChange={(e) =>
                  setCustomDraft((d) => ({
                    ...d,
                    eventStartTime: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              End time
              <input
                type="time"
                value={customDraft.eventEndTime}
                onChange={(e) =>
                  setCustomDraft((d) => ({
                    ...d,
                    eventEndTime: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Name
              <input
                value={customDraft.label}
                onChange={(e) =>
                  setCustomDraft((d) => ({ ...d, label: e.target.value }))
                }
                placeholder="e.g. Event terrace"
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Seats per table
              <input
                type="number"
                min={1}
                value={customDraft.capacity}
                onChange={(e) =>
                  setCustomDraft((d) => ({
                    ...d,
                    capacity: Number(e.target.value) || 1,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400 sm:col-span-2">
              Note
              <textarea
                value={customDraft.note}
                onChange={(e) =>
                  setCustomDraft((d) => ({ ...d, note: e.target.value }))
                }
                rows={2}
                placeholder="Combined with bar area, reserved until 9pm…"
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busyId === "custom"}
              onClick={() => void addCustom()}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Add group
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCustom(false);
                setCustomForZone(null);
              }}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-8">
        {SEATING_ZONES.map((zone) => {
          const zoneGroups = floorGroups.filter((g) => g.zone === zone);
          const zoneSummary = byZone[zone];
          const Icon = ZONE_ICONS[zone];
          return (
            <SeatingZoneSection
              key={zone}
              zone={zone}
              Icon={Icon}
              summary={zoneSummary}
              groups={zoneGroups}
              floorCount={floorCount}
              showFloors={showFloors}
              canWrite={canWrite}
              busyId={busyId}
              onAddPreset={(cap) => void addPreset(cap, zone, activeFloor)}
              onOpenCustom={() => {
                setCustomDraft(initialCustomDraft(zone, activeFloor));
                setCustomForZone(zone);
                setShowCustom(true);
              }}
              onChangeGroup={(group, patch) => {
                const next = { ...group, ...patch };
                const total = next.totalCount;
                const available = clampAvailable(total, next.availableCount);
                patchLocal(group.id, { ...patch, availableCount: available });
                scheduleSave(group.id, {
                  ...(patch.label != null && { label: patch.label }),
                  ...(patch.capacity != null && { capacity: patch.capacity }),
                  ...(patch.zone != null && { zone: patch.zone }),
                  ...(patch.floor != null && { floor: patch.floor }),
                  ...(patch.totalCount != null && { totalCount: total }),
                  ...(patch.availableCount != null && {
                    availableCount: available,
                  }),
                  ...(patch.note !== undefined && { note: patch.note }),
                  ...(patch.eventStartsAt !== undefined && {
                    eventStartsAt: patch.eventStartsAt,
                  }),
                  ...(patch.eventEndsAt !== undefined && {
                    eventEndsAt: patch.eventEndsAt,
                  }),
                });
              }}
              onDeleteGroup={(id) => void removeGroup(id)}
            />
          );
        })}
      </div>

      {floorGroups.length === 0 && !showCustom ? (
        <p className="rounded-xl border border-dashed border-white/15 px-6 py-8 text-center text-sm text-zinc-500">
          <UtensilsCrossed className="mx-auto mb-2 size-8 opacity-40" />
          Add table types under Indoors or Outdoors so your floor team can track availability in each area.
        </p>
      ) : null}
    </div>
  );
}

function SeatingZoneSection({
  zone,
  Icon,
  summary,
  groups,
  floorCount,
  showFloors,
  canWrite,
  busyId,
  onAddPreset,
  onOpenCustom,
  onChangeGroup,
  onDeleteGroup,
}: {
  zone: SeatingZone;
  Icon: ComponentType<{ size?: number; className?: string }>;
  summary: SeatingTablesSummary;
  groups: SeatingTableGroup[];
  floorCount: number;
  showFloors: boolean;
  canWrite: boolean;
  busyId: string | null;
  onAddPreset: (capacity: number) => void;
  onOpenCustom: () => void;
  onChangeGroup: (group: SeatingTableGroup, patch: Partial<SeatingTableGroup>) => void;
  onDeleteGroup: (id: string) => void;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border",
        ZONE_ACCENT[zone],
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-200">
            <Icon size={20} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-white">
              {SEATING_ZONE_LABELS[zone]}
            </h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {SEATING_ZONE_HINTS[zone]}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-200">
                {summary.availableTables} / {summary.totalTables} tables free
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-0.5 text-[11px] text-zinc-400">
                ~{summary.availableSeats} seats
              </span>
            </div>
          </div>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_CAPACITIES.map((cap) => {
              const taken = groups.some(
                (g) => !g.isCustom && g.capacity === cap,
              );
              return (
                <button
                  key={cap}
                  type="button"
                  disabled={taken || busyId === "new"}
                  onClick={() => onAddPreset(cap)}
                  className="rounded-lg border border-white/10 bg-zinc-950/60 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                >
                  + Table {cap}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onOpenCustom}
              className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-100"
            >
              + Custom
            </button>
          </div>
        ) : null}
      </header>

      {groups.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-zinc-500">
          No {SEATING_ZONE_LABELS[zone].toLowerCase()} table groups yet.
          {canWrite ? " Use the buttons above to add one." : ""}
        </p>
      ) : (
        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <SeatingGroupCard
              key={group.id}
              group={group}
              floorCount={floorCount}
              showFloors={showFloors}
              canWrite={canWrite}
              saving={busyId === group.id}
              onChange={(patch) => onChangeGroup(group, patch)}
              onDelete={() => onDeleteGroup(group.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function eventStatusBadge(status: ReturnType<typeof eventStatus>) {
  if (!status) return null;
  const styles =
    status === "live"
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
      : status === "upcoming"
        ? "border-sky-400/30 bg-sky-500/15 text-sky-200"
        : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
  const label =
    status === "live" ? "Live now" : status === "upcoming" ? "Upcoming" : "Ended";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        styles,
      )}
    >
      {label}
    </span>
  );
}

function SeatingGroupCard({
  group,
  floorCount,
  showFloors,
  canWrite,
  saving,
  onChange,
  onDelete,
}: {
  group: SeatingTableGroup;
  floorCount: number;
  showFloors: boolean;
  canWrite: boolean;
  saving: boolean;
  onChange: (patch: Partial<SeatingTableGroup>) => void;
  onDelete: () => void;
}) {
  const occupied = group.totalCount - group.availableCount;
  const pct =
    group.totalCount > 0
      ? Math.round((group.availableCount / group.totalCount) * 100)
      : 0;
  const status = group.isCustom
    ? eventStatus(group.eventStartsAt, group.eventEndsAt)
    : null;
  const scheduleLabel = group.isCustom
    ? formatEventWindow(group.eventStartsAt, group.eventEndsAt)
    : null;

  const applyEventSchedule = (
    date: string,
    startTime: string,
    endTime: string,
  ) => {
    const eventStartsAt =
      combineLocalDateTime(date, startTime) ?? null;
    const eventEndsAt = combineLocalDateTime(date, endTime) ?? null;
    onChange({ eventStartsAt, eventEndsAt });
  };

  return (
    <article
      className={cn(
        "rounded-xl border bg-zinc-900/50 p-4",
        group.isCustom
          ? "border-amber-400/20"
          : "border-white/10",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {canWrite && group.isCustom ? (
            <input
              value={group.label}
              onChange={(e) => onChange({ label: e.target.value })}
              className="w-full bg-transparent text-sm font-semibold text-white outline-none"
            />
          ) : (
            <h3 className="truncate text-sm font-semibold text-white">
              {group.label}
            </h3>
          )}
          <p className="text-[11px] text-zinc-500">
            {group.capacity} seats per table
            {group.isCustom ? " · custom" : ""}
          </p>
          {canWrite ? (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <div className="flex gap-0.5 rounded-md border border-white/10 bg-zinc-950/80 p-0.5">
                {SEATING_ZONES.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => onChange({ zone: z })}
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-medium transition",
                      group.zone === z
                        ? "bg-white/10 text-white"
                        : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    {z === "INDOOR" ? "In" : "Out"}
                  </button>
                ))}
              </div>
              {showFloors ? (
                <select
                  value={group.floor}
                  onChange={(e) =>
                    onChange({ floor: normalizeFloor(+e.target.value, floorCount) })
                  }
                  className="rounded-md border border-white/10 bg-zinc-950 px-1.5 py-0.5 text-[10px] text-zinc-300"
                  title="Move to another floor"
                >
                  {floorRange(floorCount).map((f) => (
                    <option key={f} value={f}>
                      {floorLabel(f)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-600">
              {SEATING_ZONE_LABELS[group.zone]}
              {showFloors ? ` · ${floorLabel(group.floor)}` : ""}
            </p>
          )}
          {group.isCustom && scheduleLabel ? (
            <p className="mt-1 text-[11px] text-amber-200/90">{scheduleLabel}</p>
          ) : null}
        </div>
        {group.isCustom ? eventStatusBadge(status) : null}
        {canWrite ? (
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300"
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
        {saving ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-emerald-400" />
        ) : null}
      </div>

      {!group.isCustom ? (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                pct > 50 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-rose-500/80",
              )}
              style={{ width: `${group.totalCount > 0 ? pct : 0}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            {group.availableCount} free · {occupied} in use
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <CounterField
              label="Total tables"
              value={group.totalCount}
              disabled={!canWrite}
              onChange={(totalCount) => {
                const availableCount = clampAvailable(
                  totalCount,
                  group.availableCount,
                );
                onChange({ totalCount, availableCount });
              }}
            />
            <CounterField
              label="Free now"
              value={group.availableCount}
              max={group.totalCount}
              disabled={!canWrite}
              onChange={(availableCount) => onChange({ availableCount })}
            />
          </div>
        </>
      ) : null}

      {group.isCustom ? (
        <EventScheduleFields
          startsAt={group.eventStartsAt}
          endsAt={group.eventEndsAt}
          disabled={!canWrite}
          onChange={applyEventSchedule}
        />
      ) : null}

      {group.isCustom || group.note ? (
        canWrite ? (
          <textarea
            value={group.note ?? ""}
            onChange={(e) => onChange({ note: e.target.value || null })}
            rows={2}
            placeholder="Note for staff…"
            className="mt-3 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300"
          />
        ) : group.note ? (
          <p className="mt-3 text-xs text-zinc-400">{group.note}</p>
        ) : null
      ) : null}
    </article>
  );
}

function EventScheduleFields({
  startsAt,
  endsAt,
  disabled,
  onChange,
}: {
  startsAt: string | null;
  endsAt: string | null;
  disabled?: boolean;
  onChange: (date: string, startTime: string, endTime: string) => void;
}) {
  const startParts = splitIsoToDateAndTime(startsAt);
  const endParts = splitIsoToDateAndTime(endsAt);
  const date = startParts.date || todayDateInput();
  const startTime = startParts.time || defaultStartTime;
  const endTime = endParts.time || defaultEndTime;

  const update = (patch: {
    date?: string;
    startTime?: string;
    endTime?: string;
  }) => {
    onChange(
      patch.date ?? date,
      patch.startTime ?? startTime,
      patch.endTime ?? endTime,
    );
  };

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
      <label className="col-span-2 block text-[10px] uppercase tracking-wide text-zinc-500">
        Event schedule
        <input
          type="date"
          disabled={disabled}
          value={date}
          onChange={(e) => update({ date: e.target.value })}
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-white disabled:opacity-60"
        />
      </label>
      <label className="block text-[10px] uppercase tracking-wide text-zinc-500">
        Start
        <input
          type="time"
          disabled={disabled}
          value={startTime}
          onChange={(e) => update({ startTime: e.target.value })}
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-white disabled:opacity-60"
        />
      </label>
      <label className="block text-[10px] uppercase tracking-wide text-zinc-500">
        End
        <input
          type="time"
          disabled={disabled}
          value={endTime}
          onChange={(e) => update({ endTime: e.target.value })}
          className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-white disabled:opacity-60"
        />
      </label>
    </div>
  );
}

function CounterField({
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  const dec = () => onChange(Math.max(0, value - 1));
  const inc = () =>
    onChange(max != null ? Math.min(max, value + 1) : value + 1);

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          disabled={disabled || value <= 0}
          onClick={dec}
          className="grid size-7 place-items-center rounded border border-white/10 text-zinc-400 hover:bg-white/5 disabled:opacity-40"
        >
          <Minus size={12} />
        </button>
        <input
          type="number"
          min={0}
          max={max}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            let n = Number(e.target.value);
            if (Number.isNaN(n)) n = 0;
            if (max != null) n = Math.min(max, n);
            onChange(Math.max(0, n));
          }}
          className="w-full rounded border border-white/10 bg-zinc-950 py-1 text-center text-sm text-white disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled || (max != null && value >= max)}
          onClick={inc}
          className="grid size-7 place-items-center rounded border border-white/10 text-zinc-400 hover:bg-white/5 disabled:opacity-40"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}


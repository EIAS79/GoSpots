"use client";

import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookingDayAgenda } from "@/components/reservations/booking-day-agenda";
import { ReservationDialog } from "@/components/reservations/reservation-dialog";
import { GameBookingSchedule } from "@/components/reservations/game-booking-schedule";
import { SeatingTablesPanel } from "@/components/reservations/seating-tables-panel";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { TenantPage } from "@/components/layout/tenant-page";
import { hasPermission } from "@/lib/auth-client";
import { getBookingUnitKind, getBookingUnitLabels } from "@/lib/booking-unit-kind";
import { cn } from "@/lib/cn";
import { RESOURCE_TYPE_LABELS } from "@/lib/resource-types";
import {
  createReservation,
  deleteReservation,
  fetchDaySchedule,
  updateReservation,
  type DaySchedule,
  type ScheduleAgendaItem,
  type ScheduleBooking,
} from "@/lib/reservations-client";
import {
  fetchResourceCatalog,
  updateResourceUnit,
  type ResourceCatalog,
} from "@/lib/resources-client";
import type { ScheduleBookingLike } from "@/components/reservations/reservation-dialog";
import {
  isFeatureUnlocked,
  resolveEffectiveTier,
  type SubscriptionTier,
} from "@/lib/plan";
import { useAuth } from "@/lib/use-auth";
import { useLiveData } from "@/lib/use-live-data";
import { publishLiveEvent } from "@/lib/live-events";

const GUIDE = {
  title: "Reservations",
  description:
    "Dining seating availability and timed bookings for games, PCs, and lanes — all in one place for your floor team.",
  capabilities: [
    "Seating board: indoors and outdoors sections with table-for-2/4/6 counts.",
    "Custom groups with notes for events or combined tables in either area.",
    "Game bookings: PCs & PlayStation by seat, billiard by table, bowling by lane.",
    "Game board: Available, In use, or Out of service.",
    "Same-day bookings only — no overlaps; tap a slot to edit.",
  ],
};

type ReservationsView = "seating" | "schedule";

function dateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ReservationsPage() {
  const searchParams = useSearchParams();
  const { state } = useAuth();
  const [catalog, setCatalog] = useState<ResourceCatalog | null>(null);
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [day, setDay] = useState(dateOnly(new Date()));
  const [categoryFilter, setCategoryFilter] = useState("");
  const [view, setView] = useState<ReservationsView>("seating");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [dialog, setDialog] = useState<{
    booking?: ScheduleBookingLike;
    unitId?: string;
    unitBookings?: ScheduleBooking[];
  } | null>(null);
  const [focusUnit, setFocusUnit] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const agendaRef = useRef<HTMLDivElement>(null);

  const membership =
    state.status === "authed" ? state.user.memberships[0] : null;
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      membership?.role === "MANAGER" ||
      hasPermission(membership?.permissions ?? "", "reservation.write"));

  const tier = resolveEffectiveTier(
    membership?.shop.subscription
      ? {
          tier: membership.shop.subscription.tier as SubscriptionTier,
          status: membership.shop.subscription.status as
            | "TRIAL"
            | "ACTIVE"
            | "PAST_DUE"
            | "CANCELED",
          trialEndsAt: membership.shop.subscription.trialEndsAt,
        }
      : null,
  );
  const unlocked = isFeatureUnlocked(tier, "reservation");

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const [cat, sched] = await Promise.all([
          fetchResourceCatalog(),
          fetchDaySchedule(day, categoryFilter || undefined),
        ]);
        setCatalog(cat);
        setSchedule({
          ...sched,
          agenda: Array.isArray(sched.agenda) ? sched.agenda : [],
        });
      } catch (e) {
        if (!opts.silent) {
          setError(e instanceof Error ? e.message : "Failed to load schedule.");
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [day, categoryFilter],
  );

  useEffect(() => {
    setFocusUnit(null);
  }, [day, categoryFilter]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const dateParam = searchParams.get("date");
    if (tab === "schedule") setView("schedule");
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) setDay(dateParam);
  }, [searchParams]);

  useEffect(() => {
    if (view === "schedule") void load();
  }, [load, view]);

  useLiveData(() => load({ silent: true }), [view, day, categoryFilter], {
    enabled: view === "schedule",
    intervalMs: 15_000,
    refreshOnSections: ["reservation"],
  });

  function openAgendaItem(item: ScheduleAgendaItem) {
    setDialog({
      unitId: item.resourceId ?? undefined,
      booking: {
        id: item.id,
        resourceId: item.resourceId ?? undefined,
        guestName: item.guestName,
        guestEmail: item.guestEmail,
        guestPhone: item.guestPhone,
        partySize: item.partySize,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        status: item.status,
        notes: item.notes,
        staffAlert: item.staffAlert,
      },
      unitBookings:
        schedule?.categories
          .flatMap((c) => c.units)
          .find((u) => u.id === item.resourceId)?.bookings ?? [],
    });
  }

  const categories = catalog?.categories ?? [];

  const shiftDay = (delta: number) => {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDay(dateOnly(d));
  };

  return (
    <TenantPage
      title={GUIDE.title}
      description={GUIDE.description}
      capabilities={GUIDE.capabilities}
      actions={
        canWrite && view === "schedule" ? (
          <button
            type="button"
            onClick={() => setDialog({})}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
          >
            <Plus size={14} />
            New booking
          </button>
        ) : null
      }
    >
      <FeatureGate feature="reservation" unlocked={unlocked}>
        <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-zinc-950/80 p-1 ring-1 ring-white/10">
          {(
            [
              { id: "seating" as const, label: "Dining seating" },
              { id: "schedule" as const, label: "Game bookings" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                view === id
                  ? "bg-emerald-500/20 text-emerald-100"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "seating" ? (
          <SeatingTablesPanel canWrite={canWrite && unlocked} />
        ) : null}

        {view === "schedule" ? (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900/60 p-1">
                <button
                  type="button"
                  onClick={() => shiftDay(-1)}
                  className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 hover:bg-white/5"
                >
                  <ChevronLeft size={16} />
                </button>
                <input
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="bg-transparent px-2 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => shiftDay(1)}
                  className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 hover:bg-white/5"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                <option value="">All games</option>
                {categories.map((c) => {
                  const labels = getBookingUnitLabels(getBookingUnitKind(c.type));
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} ({RESOURCE_TYPE_LABELS[c.type]} · {labels.plural})
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                onClick={() => setDay(dateOnly(new Date()))}
                className="text-xs text-emerald-400 hover:underline"
              >
                Today
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
              </div>
            ) : error ? (
              <p className="text-sm text-rose-300">{error}</p>
            ) : schedule ? (
              <div className="space-y-6">
              <div ref={agendaRef}>
              <BookingDayAgenda
                items={schedule.agenda}
                scheduleDate={schedule.date}
                highlightUnitId={focusUnit?.id}
                highlightUnitName={focusUnit?.name}
                onClearUnitFilter={() => setFocusUnit(null)}
                canWrite={canWrite && unlocked}
                onEdit={openAgendaItem}
                onCancel={async (item) => {
                  if (!confirm(`Cancel booking for ${item.guestName}?`)) return;
                  setSaving(true);
                  try {
                    await updateReservation(item.id, {
                      status: "CANCELED",
                      staffAlert: item.staffAlert,
                    });
                    await load();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Could not cancel.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
                onEndNow={async (item) => {
                  if (
                    !confirm(
                      `End ${item.guestName}'s session now and free the seat?`,
                    )
                  ) {
                    return;
                  }
                  setSaving(true);
                  try {
                    await updateReservation(item.id, {
                      status: "COMPLETED",
                      endsAt: new Date().toISOString(),
                      staffAlert: item.staffAlert,
                    });
                    await load();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Could not end session.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
                onRemove={async (item) => {
                  if (
                    !confirm(
                      `Permanently remove booking for ${item.guestName}?`,
                    )
                  ) {
                    return;
                  }
                  setSaving(true);
                  try {
                    await deleteReservation(item.id);
                    await load();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Could not remove.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              />
              </div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">Floor map</h3>
                <p className="text-[11px] text-zinc-500">
                  Live status per seat. Tap a card for more actions.
                </p>
              </div>
              <GameBookingSchedule
                schedule={schedule}
                canWrite={canWrite && unlocked}
                highlightedUnitId={focusUnit?.id}
                onFocusUnit={(unitId, unitName) => {
                  setFocusUnit({ id: unitId, name: unitName });
                  agendaRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
                onBookUnit={(unitId) => {
                  const unit = schedule.categories
                    .flatMap((c) => c.units)
                    .find((u) => u.id === unitId);
                  setDialog({
                    unitId,
                    unitBookings: unit?.bookings ?? [],
                  });
                }}
                onEditBooking={(booking, unitId) => {
                  const unit = schedule.categories
                    .flatMap((c) => c.units)
                    .find((u) => u.id === unitId);
                  setDialog({
                    unitId,
                    booking: {
                      ...booking,
                      resourceId: unitId,
                      staffAlert: booking.staffAlert,
                    },
                    unitBookings: unit?.bookings ?? [],
                  });
                }}
                onEndBookingNow={async (booking) => {
                  if (
                    !confirm(
                      `End ${booking.guestName}'s session now and free the seat?`,
                    )
                  ) {
                    return;
                  }
                  setSaving(true);
                  try {
                    await updateReservation(booking.id, {
                      status: "COMPLETED",
                      endsAt: new Date().toISOString(),
                      staffAlert: booking.staffAlert,
                    });
                    await load();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Could not end session.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
                onToggleNotWorking={async (unitId, notWorking) => {
                  try {
                    await updateResourceUnit(unitId, {
                      status: notWorking ? "MAINTENANCE" : "AVAILABLE",
                    });
                    await load();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not update unit status.",
                    );
                  }
                }}
              />
              </div>
            ) : null}
          </>
        ) : null}
      </FeatureGate>

      {dialog && catalog && canWrite && view === "schedule" ? (
        <ReservationDialog
          catalog={catalog}
          initial={dialog.booking}
          defaultUnitId={dialog.unitId}
          defaultDate={day}
          existingBookings={dialog.unitBookings ?? []}
          saving={saving}
          onClose={() => setDialog(null)}
          onSave={async (body) => {
            setSaving(true);
            try {
              if (dialog.booking) {
                await updateReservation(dialog.booking.id, body);
              } else {
                await createReservation(body);
              }
              setDialog(null);
              await load();
              publishLiveEvent({ section: "reservation" });
            } catch (e) {
              throw e;
            } finally {
              setSaving(false);
            }
          }}
          onCancelBooking={
            dialog.booking && dialog.booking.status !== "CANCELED"
              ? async () => {
                  if (!confirm("Cancel this booking? The slot will open up.")) {
                    return;
                  }
                  setSaving(true);
                  try {
                    await updateReservation(dialog.booking!.id, {
                      status: "CANCELED",
                      staffAlert: dialog.booking!.staffAlert,
                    });
                    setDialog(null);
                    await load();
                  } catch (e) {
                    throw e;
                  } finally {
                    setSaving(false);
                  }
                }
              : undefined
          }
          onDelete={
            dialog.booking
              ? async () => {
                  if (
                    !confirm(
                      "Permanently remove this booking? This cannot be undone.",
                    )
                  ) {
                    return;
                  }
                  setSaving(true);
                  try {
                    await deleteReservation(dialog.booking!.id);
                    setDialog(null);
                    await load();
                  } finally {
                    setSaving(false);
                  }
                }
              : undefined
          }
        />
      ) : null}
    </TenantPage>
  );
}

"use client";

import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookingDayAgenda } from "@/components/reservations/booking-day-agenda";
import { EventRequestsPanel } from "@/components/reservations/event-requests-panel";
import { ReservationDialog } from "@/components/reservations/reservation-dialog";
import { GameBookingSchedule } from "@/components/reservations/game-booking-schedule";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { TenantPage } from "@/components/layout/tenant-page";
import { hasPermission } from "@/lib/auth-client";
import {
  getBookingUnitKind,
  getBookingUnitLabels,
  isDiningResourceType,
  isGamingResourceType,
} from "@/lib/booking-unit-kind";
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
import { isFeatureUnlocked } from "@/lib/plan";
import { showsDiningUi, showsGamingUi } from "@/lib/venue-packs";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueHref } from "@/lib/venue-context";
import { useLiveData } from "@/lib/use-live-data";
import { publishLiveEvent } from "@/lib/live-events";
import {
  fetchReservationNotificationBadges,
  markReservationTabNotificationsRead,
  type ReservationNotificationBadges,
} from "@/lib/notifications-client";

const GUIDE = {
  title: "Reservations",
  description:
    "Digital dining floor map and gaming bookings — tap tables or stations to book, mark out of service, and collect payment.",
  capabilities: [
    "Dining bookings: live table map from your Dining layout setup — mixed 1–8 seat tables.",
    "Tap a free table to book · ⋮ menu to mark out of service · agenda for paid / unpaid.",
    "Game bookings: PCs, PlayStation, billiard, bowling — same floor map workflow.",
    "Event requests: approve or decline customer event forms.",
    "Collect payment from the agenda or Game billing for completed sessions.",
  ],
};

type ReservationsView = "dining" | "events" | "schedule";
type FloorBoardPanel = "agenda" | "floor" | "both";

function dateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function filterScheduleForView(
  schedule: DaySchedule,
  view: "dining" | "schedule",
): DaySchedule {
  const keep =
    view === "dining"
      ? (type: string) => isDiningResourceType(type as never)
      : (type: string) => isGamingResourceType(type as never);
  const categories = schedule.categories.filter((c) => keep(c.type));
  const categoryIds = new Set(categories.map((c) => c.id));
  return {
    ...schedule,
    categories,
    agenda: schedule.agenda.filter(
      (item) => !item.categoryId || categoryIds.has(item.categoryId),
    ),
  };
}

function TabNotificationBadge({
  count,
  variant,
}: {
  count: number;
  variant: "amber" | "emerald" | "violet";
}) {
  if (count <= 0) return null;
  const tone =
    variant === "amber"
      ? "bg-amber-500/30 text-amber-100"
      : variant === "violet"
        ? "bg-violet-500/30 text-violet-100"
        : "bg-emerald-500/30 text-emerald-100";
  return (
    <span
      className={cn(
        "ml-1.5 min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold",
        tone,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function ReservationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const playBillingHref = useVenueHref("/play-billing");
  const diningLayoutHref = useVenueHref("/dining");
  const { state } = useAuth();
  const access = useVenueAccess();
  const [catalog, setCatalog] = useState<ResourceCatalog | null>(null);
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [day, setDay] = useState(dateOnly(new Date()));
  const [categoryFilter, setCategoryFilter] = useState("");
  const [floorPanel, setFloorPanel] = useState<FloorBoardPanel>("both");
  const [tabBadges, setTabBadges] = useState<ReservationNotificationBadges>({
    dining: 0,
    gaming: 0,
    events: 0,
    total: 0,
  });
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

  const membership = useCurrentMembership();
  const canWrite =
    state.status === "authed" &&
    (membership?.role === "OWNER" ||
      hasPermission(membership?.permissions ?? "", "reservation.write"));

  const unlocked = isFeatureUnlocked(access.enabledModules, "reservation");
  const diningUi = showsDiningUi(access.packId, access.addOns);
  const gamingUi = showsGamingUi(access.packId, access.addOns);

  const reservationTabs = useMemo(() => {
    const tabs: {
      id: ReservationsView;
      label: string;
      badge: "dining" | "gaming" | "events";
      variant: "amber" | "emerald" | "violet";
    }[] = [];
    if (diningUi) {
      tabs.push({
        id: "dining",
        label: "Dining bookings",
        badge: "dining",
        variant: "amber",
      });
    }
    if (gamingUi) {
      tabs.push({
        id: "schedule",
        label: "Game bookings",
        badge: "gaming",
        variant: "emerald",
      });
    }
    tabs.push({
      id: "events",
      label: "Event requests",
      badge: "events",
      variant: "violet",
    });
    return tabs;
  }, [diningUi, gamingUi]);

  const defaultView: ReservationsView = diningUi && !gamingUi
    ? "dining"
    : gamingUi
      ? "schedule"
      : "events";

  const [view, setView] = useState<ReservationsView>(defaultView);

  useEffect(() => {
    if (!reservationTabs.some((t) => t.id === view)) {
      setView(reservationTabs[0]?.id ?? "events");
    }
  }, [reservationTabs, view]);

  const boardMode = view === "dining" ? "dining" : "gaming";
  const isAmber = boardMode === "dining";

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const [cat, sched] = await Promise.all([
          fetchResourceCatalog(),
          fetchDaySchedule(day),
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
    [day],
  );

  useEffect(() => {
    setFocusUnit(null);
  }, [day, categoryFilter, view]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const dateParam = searchParams.get("date");
    if (tab === "schedule") setView("schedule");
    else if (tab === "events") setView("events");
    else if (tab === "dining") setView("dining");
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) setDay(dateParam);
  }, [searchParams]);

  const loadTabBadges = useCallback(async () => {
    try {
      const data = await fetchReservationNotificationBadges();
      setTabBadges(data);
    } catch {
      /* ignore badge errors */
    }
  }, []);

  useEffect(() => {
    void loadTabBadges();
  }, [loadTabBadges]);

  useLiveData(() => loadTabBadges(), [], {
    intervalMs: 10_000,
    refreshOnSections: ["reservation"],
  });

  useEffect(() => {
    const tab =
      view === "dining"
        ? "dining"
        : view === "schedule"
          ? "schedule"
          : "events";
    void markReservationTabNotificationsRead(tab)
      .then(() => loadTabBadges())
      .catch(() => undefined);
  }, [view, loadTabBadges]);

  useEffect(() => {
    if (view === "dining" || view === "schedule") void load();
  }, [load, view]);

  useLiveData(() => load({ silent: true }), [view, day], {
    enabled: view === "dining" || view === "schedule",
    intervalMs: 10_000,
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

  const catalogCategories = catalog?.categories ?? [];

  const viewCatalogCategories = useMemo(
    () =>
      catalogCategories.filter((c) =>
        boardMode === "dining"
          ? isDiningResourceType(c.type)
          : isGamingResourceType(c.type),
      ),
    [catalogCategories, boardMode],
  );

  const filteredSchedule = useMemo(
    () =>
      schedule
        ? filterScheduleForView(schedule, view === "dining" ? "dining" : "schedule")
        : null,
    [schedule, view],
  );

  const agendaItems = useMemo(() => {
    if (!filteredSchedule?.agenda) return [];
    if (!categoryFilter) return filteredSchedule.agenda;
    return filteredSchedule.agenda.filter(
      (item) => item.categoryId === categoryFilter,
    );
  }, [filteredSchedule?.agenda, categoryFilter]);

  useEffect(() => {
    if (view !== "dining" && view !== "schedule") return;
    const pool = viewCatalogCategories;
    if (!pool.length) {
      setCategoryFilter("");
      return;
    }
    if (categoryFilter && !pool.some((c) => c.id === categoryFilter)) {
      setCategoryFilter(pool[0].id);
    }
  }, [view, viewCatalogCategories, categoryFilter]);

  const shiftDay = (delta: number) => {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDay(dateOnly(d));
  };

  const showFloorBoard = view === "dining" || view === "schedule";

  return (
    <TenantPage
      title={GUIDE.title}
      description={GUIDE.description}
      capabilities={GUIDE.capabilities}
      actions={
        canWrite && showFloorBoard ? (
          <button
            type="button"
            onClick={() => setDialog({})}
            className={cn(
              "inline-flex w-full max-w-full items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs sm:w-auto sm:py-1.5",
              isAmber
                ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
            )}
          >
            <Plus size={14} />
            {boardMode === "dining" ? "New table booking" : "New booking"}
          </button>
        ) : null
      }
    >
      <FeatureGate feature="reservation" unlocked={unlocked}>
        <div className="min-w-0 w-full">
          <div className="mb-4 flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-zinc-950/80 p-1 ring-1 ring-white/10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {reservationTabs.map(({ id, label, badge, variant }) => {
              const badgeCount =
                badge === "dining"
                  ? tabBadges.dining
                  : badge === "gaming"
                    ? tabBadges.gaming
                    : tabBadges.events;
              return (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                  view === id
                    ? id === "events"
                      ? "bg-violet-500/20 text-violet-100"
                      : id === "dining"
                        ? "bg-amber-500/20 text-amber-100"
                        : "bg-emerald-500/20 text-emerald-100"
                    : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
                )}
              >
                {label}
                <TabNotificationBadge count={badgeCount} variant={variant} />
              </button>
            );
            })}
          </div>

          {view === "events" ? (
            <EventRequestsPanel canWrite={canWrite && unlocked} />
          ) : null}

          {showFloorBoard ? (
            <>
              <div className="mb-6 flex w-full min-w-0 flex-col gap-3">
                <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="flex w-full items-center gap-1 rounded-lg border border-white/10 bg-zinc-900/60 p-1 sm:w-auto">
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
                      className="min-w-0 flex-1 bg-transparent px-2 text-sm text-white sm:flex-none"
                    />
                    <button
                      type="button"
                      onClick={() => shiftDay(1)}
                      className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 hover:bg-white/5"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  {viewCatalogCategories.length > 1 ? (
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white sm:max-w-xs"
                      aria-label={
                        boardMode === "dining"
                          ? "Filter by restaurant"
                          : "Filter by game activity"
                      }
                    >
                      <option value="">
                        {boardMode === "dining"
                          ? "All restaurants — day schedule"
                          : "All games — day schedule"}
                      </option>
                      {viewCatalogCategories.map((c) => {
                        const labels = getBookingUnitLabels(
                          getBookingUnitKind(c.type),
                        );
                        return (
                          <option key={c.id} value={c.id}>
                            {c.name} ({RESOURCE_TYPE_LABELS[c.type]} ·{" "}
                            {labels.plural})
                          </option>
                        );
                      })}
                    </select>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setDay(dateOnly(new Date()))}
                    className={cn(
                      "text-xs hover:underline",
                      isAmber ? "text-amber-400" : "text-emerald-400",
                    )}
                  >
                    Today
                  </button>
                </div>

                {boardMode === "dining" ? (
                  <p className="text-[11px] text-zinc-500">
                    Tables come from{" "}
                    <Link
                      href={diningLayoutHref}
                      className="text-amber-300/90 hover:underline"
                    >
                      Dining layout
                    </Link>
                    . Tap a table to book · ⋮ to mark out of service.
                  </p>
                ) : (
                  <p className="text-[11px] text-zinc-500">
                    Tap a station to book · ⋮ to mark out of service · agenda
                    shows paid / awaiting payment.
                  </p>
                )}

                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="inline-flex max-w-full overflow-x-auto rounded-lg bg-zinc-950/80 p-1 ring-1 ring-white/10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {(
                      [
                        { id: "both", label: "Schedule + map" },
                        { id: "agenda", label: "Day schedule" },
                        { id: "floor", label: "Floor map" },
                      ] as const
                    ).map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFloorPanel(id)}
                        className={cn(
                          "shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition",
                          floorPanel === id
                            ? isAmber
                              ? "bg-amber-500/20 text-amber-100"
                              : "bg-emerald-500/20 text-emerald-100"
                            : "text-zinc-500 hover:text-zinc-300",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2
                    className={cn(
                      "h-6 w-6 animate-spin",
                      isAmber ? "text-amber-400" : "text-emerald-400",
                    )}
                  />
                </div>
              ) : error ? (
                <p className="text-sm text-rose-300">{error}</p>
              ) : filteredSchedule ? (
                <div
                  className={cn(
                    "min-w-0 w-full gap-6",
                    floorPanel === "both"
                      ? "grid grid-cols-1 xl:grid-cols-2"
                      : "flex flex-col",
                  )}
                >
                  {floorPanel !== "floor" ? (
                    <div ref={agendaRef} className="min-w-0 w-full">
                      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-sm font-semibold text-white">
                          Day schedule
                        </h3>
                        <p className="text-[11px] text-zinc-500">
                          Search · filter · collect payment
                        </p>
                      </div>
                      <BookingDayAgenda
                        items={agendaItems}
                        scheduleDate={filteredSchedule.date}
                        highlightUnitId={focusUnit?.id}
                        highlightUnitName={focusUnit?.name}
                        canWrite={canWrite && unlocked}
                        variant={boardMode}
                        onEdit={openAgendaItem}
                        onCancel={async (item) => {
                          if (!confirm(`Cancel booking for ${item.guestName}?`))
                            return;
                          setSaving(true);
                          try {
                            await updateReservation(item.id, {
                              status: "CANCELED",
                              staffAlert: item.staffAlert,
                            });
                            await load();
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : "Could not cancel.",
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onCheckIn={async (item) => {
                          setSaving(true);
                          try {
                            await updateReservation(item.id, {
                              status: "CHECKED_IN",
                              staffAlert: item.staffAlert,
                            });
                            await load();
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : "Could not check in guest.",
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onGuestLeft={async (item) => {
                          if (
                            !confirm(
                              `Mark ${item.guestName} as left and free ${item.unitName ?? "the unit"}?`,
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
                              e instanceof Error
                                ? e.message
                                : "Could not free unit.",
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onCollectPayment={(item) => {
                          router.push(
                            `${playBillingHref}?reservationId=${item.id}&tab=awaiting_payment`,
                          );
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
                              e instanceof Error
                                ? e.message
                                : "Could not remove.",
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onClearUnitFilter={() => setFocusUnit(null)}
                      />
                    </div>
                  ) : null}
                  {floorPanel !== "agenda" ? (
                    <div className="min-w-0 w-full">
                      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-sm font-semibold text-white">
                          {boardMode === "dining"
                            ? "Live table map"
                            : "Digital floor map"}
                        </h3>
                        <p className="text-[11px] text-zinc-500">
                          {boardMode === "dining"
                            ? "Areas & mixed table types from your layout"
                            : "Floor & layout tabs inside the map"}
                        </p>
                      </div>
                      <GameBookingSchedule
                        schedule={filteredSchedule}
                        variant={boardMode}
                        canWrite={canWrite && unlocked}
                        highlightedUnitId={focusUnit?.id}
                        selectedCategoryId={categoryFilter || undefined}
                        onCategoryChange={setCategoryFilter}
                        onFocusUnit={(unitId, unitName) => {
                          setFocusUnit({ id: unitId, name: unitName });
                          agendaRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }}
                        onBookUnit={(unitId) => {
                          const unit = filteredSchedule.categories
                            .flatMap((c) => c.units)
                            .find((u) => u.id === unitId);
                          setDialog({
                            unitId,
                            unitBookings: unit?.bookings ?? [],
                          });
                        }}
                        onEditBooking={(booking, unitId) => {
                          const unit = filteredSchedule.categories
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
                        onCheckInBooking={async (booking) => {
                          setSaving(true);
                          try {
                            await updateReservation(booking.id, {
                              status: "CHECKED_IN",
                              staffAlert: booking.staffAlert,
                            });
                            await load();
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : "Could not check in guest.",
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onGuestLeftBooking={async (booking) => {
                          if (
                            !confirm(
                              `Mark ${booking.guestName} as left and free the unit?`,
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
                              e instanceof Error
                                ? e.message
                                : "Could not free unit.",
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
                                : "Could not update table status.",
                            );
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </FeatureGate>

      {dialog && catalog && canWrite && showFloorBoard ? (
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

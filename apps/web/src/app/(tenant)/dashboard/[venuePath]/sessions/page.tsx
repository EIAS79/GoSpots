"use client";

import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookingDayAgenda } from "@/components/reservations/booking-day-agenda";
import { EventRequestsPanel } from "@/components/reservations/event-requests-panel";
import { ReservationDialog } from "@/components/reservations/reservation-dialog";
import { GameBookingSchedule } from "@/components/reservations/game-booking-schedule";
import { SeatingAdvisoryPanel } from "@/components/seating/seating-advisory-panel";
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
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useVenueAccess } from "@/lib/use-venue-access";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import {
  addVenueCalendarDays,
  resolveVenueTimeZone,
  venueDayKey,
} from "@/lib/venue-timezone";
import { useLiveData } from "@/lib/use-live-data";
import { publishLiveEvent } from "@/lib/live-events";
import {
  fetchReservationNotificationBadges,
  markReservationTabNotificationsRead,
  type ReservationNotificationBadges,
} from "@/lib/notifications-client";

type ReservationsView = "dining" | "events" | "schedule";
type FloorBoardPanel = "agenda" | "floor" | "both";

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
  const vs = useVenueSettingsOptional();
  const t = vs?.t ?? ((k: string) => k);
  const locale = vs?.locale ?? "en";
  const venueTimeZone = resolveVenueTimeZone({
    timezone: vs?.shop?.timezone,
    locale: vs?.shop?.locale ?? vs?.locale,
  });
  const searchParams = useSearchParams();
  const router = useRouter();
  const playBillingHref = useVenueHref("/play-billing");
  const diningLayoutHref = useVenueHref("/dining");
  const { state } = useAuth();
  const access = useVenueAccess();
  const guide = useDashboardGuide("sessions");
  const [catalog, setCatalog] = useState<ResourceCatalog | null>(null);
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [day, setDay] = useState(() => venueDayKey(venueTimeZone));
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
        label: t("sessionsPage.tabDining"),
        badge: "dining",
        variant: "amber",
      });
    }
    if (gamingUi) {
      tabs.push({
        id: "schedule",
        label: t("sessionsPage.tabGaming"),
        badge: "gaming",
        variant: "emerald",
      });
    }
    tabs.push({
      id: "events",
      label: t("sessionsPage.tabEvents"),
      badge: "events",
      variant: "violet",
    });
    return tabs;
  }, [diningUi, gamingUi, t]);

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
        return true;
      } catch (e) {
        if (!opts.silent) {
          setError(
            e instanceof Error ? e.message : t("sessionsPage.loadFailed"),
          );
        }
        return false;
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [day, t],
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
        version: item.version,
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
    setDay((current) => addVenueCalendarDays(current, delta));
  };

  const showFloorBoard = view === "dining" || view === "schedule";

  return (
    <TenantPage
      title={guide.title}
      description={guide.description}
      capabilities={guide.capabilities}
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
            {boardMode === "dining"
              ? t("sessionsPage.newTableBooking")
              : t("sessionsPage.newBooking")}
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
                          ? t("sessionsPage.filterByRestaurant")
                          : t("sessionsPage.filterByGameActivity")
                      }
                    >
                      <option value="">
                        {boardMode === "dining"
                          ? t("sessionsPage.allRestaurantsDaySchedule")
                          : t("sessionsPage.allGamesDaySchedule")}
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
                    onClick={() => setDay(venueDayKey(venueTimeZone))}
                    className={cn(
                      "text-xs hover:underline",
                      isAmber ? "text-amber-400" : "text-emerald-400",
                    )}
                  >
                    {t("sessionsPage.today")}
                  </button>
                </div>

                {boardMode === "dining" ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-zinc-500">
                      {t("sessionsPage.diningHintPrefix")}{" "}
                      <Link
                        href={diningLayoutHref}
                        className="text-amber-300/90 hover:underline"
                      >
                        {t("nav.dining")}
                      </Link>
                      {t("sessionsPage.diningHintSuffix")}
                    </p>
                    <SeatingAdvisoryPanel diningLayoutHref={diningLayoutHref} />
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500">
                    {t("sessionsPage.gamingHint")}
                  </p>
                )}

                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="inline-flex max-w-full overflow-x-auto rounded-lg bg-zinc-950/80 p-1 ring-1 ring-white/10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {(
                      [
                        { id: "both", label: t("sessionsPage.viewScheduleMap") },
                        { id: "agenda", label: t("sessionsPage.viewDaySchedule") },
                        { id: "floor", label: t("sessionsPage.viewFloorMap") },
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
                          {t("sessionsPage.daySchedule")}
                        </h3>
                        <p className="text-[11px] text-zinc-500">
                          {t("sessionsPage.scheduleSubtitle")}
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
                          if (
                            !confirm(
                              t("sessionsPage.cancelBookingConfirm", {
                                guest: item.guestName,
                              }),
                            )
                          )
                            return;
                          setSaving(true);
                          try {
                            await updateReservation(item.id, {
                              expectedVersion: item.version,
                              status: "CANCELED",
                              staffAlert: item.staffAlert,
                            });
                            await load();
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : t("sessionsPage.cancelFailed"),
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onCheckIn={async (item) => {
                          setSaving(true);
                          try {
                            await updateReservation(item.id, {
                              expectedVersion: item.version,
                              status: "CHECKED_IN",
                              staffAlert: item.staffAlert,
                            });
                            await load();
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : t("sessionsPage.checkInFailed"),
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onGuestLeft={async (item) => {
                          if (
                            !confirm(
                              t("sessionsPage.guestLeftConfirmNamed", {
                                guest: item.guestName,
                                unit: item.unitName ?? t("sessionsPage.theUnit"),
                              }),
                            )
                          ) {
                            return;
                          }
                          setSaving(true);
                          try {
                            await updateReservation(item.id, {
                              expectedVersion: item.version,
                              status: "COMPLETED",
                              endsAt: new Date().toISOString(),
                              staffAlert: item.staffAlert,
                            });
                            await load();
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : t("sessionsPage.freeUnitFailed"),
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
                              t("sessionsPage.removeBookingConfirm", {
                                guest: item.guestName,
                              }),
                            )
                          ) {
                            return;
                          }
                          setSaving(true);
                          try {
                            await deleteReservation(item.id, item.version);
                            await load();
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : t("sessionsPage.removeFailed"),
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
                            ? t("sessionsPage.liveTableMap")
                            : t("sessionsPage.digitalFloorMap")}
                        </h3>
                        <p className="text-[11px] text-zinc-500">
                          {boardMode === "dining"
                            ? t("sessionsPage.tableMapSubtitle")
                            : t("sessionsPage.floorMapSubtitle")}
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
                              expectedVersion: booking.version,
                              status: "CHECKED_IN",
                              staffAlert: booking.staffAlert,
                            });
                            await load();
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : t("sessionsPage.checkInFailed"),
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onGuestLeftBooking={async (booking) => {
                          if (
                            !confirm(
                              t("sessionsPage.guestLeftConfirmUnit", {
                                guest: booking.guestName,
                              }),
                            )
                          ) {
                            return;
                          }
                          setSaving(true);
                          try {
                            await updateReservation(booking.id, {
                              expectedVersion: booking.version,
                              status: "COMPLETED",
                              endsAt: new Date().toISOString(),
                              staffAlert: booking.staffAlert,
                            });
                            await load();
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : t("sessionsPage.freeUnitFailed"),
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                        onToggleNotWorking={async (unitId, notWorking) => {
                          try {
                            const unitVersion = catalog?.categories
                              .flatMap((category) => category.resources)
                              .find((unit) => unit.id === unitId)?.version;
                            if (!unitVersion) {
                              throw new Error("Resource changed. Reload and try again.");
                            }
                            await updateResourceUnit(unitId, {
                              expectedVersion: unitVersion,
                              status: notWorking ? "MAINTENANCE" : "AVAILABLE",
                            });
                            await load();
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : t("sessionsPage.tableStatusFailed"),
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
          onServerOverlap={() => void load()}
          onClose={() => setDialog(null)}
          onSave={async (body) => {
            setSaving(true);
            try {
              if (dialog.booking) {
                await updateReservation(dialog.booking.id, {
                  ...body,
                  expectedVersion: dialog.booking.version,
                });
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
                  if (!confirm(t("sessionsPage.cancelThisBookingConfirm"))) {
                    return;
                  }
                  setSaving(true);
                  try {
                    await updateReservation(dialog.booking!.id, {
                      expectedVersion: dialog.booking!.version,
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
                  if (!confirm(t("sessionsPage.removeThisBookingConfirm"))) {
                    return;
                  }
                  setSaving(true);
                  try {
                    await deleteReservation(
                      dialog.booking!.id,
                      dialog.booking!.version,
                    );
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

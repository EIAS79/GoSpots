import type { BowlingLaneChromeLabels } from "@/components/reservations/bowling-lane-floor-map";
import type { UnitFloorStatus } from "@/lib/booking-floor-status";
import type { MessageKey } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import type { BookingUnitKind } from "@/lib/booking-unit-kind";
import type { ResourceType } from "@/lib/resource-types";

export type StaffFloorTranslate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

/** Fallback when VenueSettingsProvider is not mounted (e.g. isolated story). */
export function staffFloorT(
  locale: string | undefined,
): StaffFloorTranslate {
  return (key, vars) => translate(locale ?? "en", key, vars);
}

export function staffFloorStatusLabels(
  t: StaffFloorTranslate,
): Record<UnitFloorStatus, string> {
  return {
    AVAILABLE: t("floor.statusAvailable"),
    UNAVAILABLE: t("floor.statusUnavailable"),
    NOT_WORKING: t("floor.statusNotWorking"),
  };
}

export type StaffFloorChromeLabels = {
  floor: string;
  floorN: (n: number) => string;
  layoutZone: string;
  noStations: string;
  noStationsInLayout: string;
  prev: string;
  next: string;
  pageOf: (page: number, total: number) => string;
  stationsRange: (from: number, to: number, total: number) => string;
  mainArea: string;
  staffStationHint: string;
};

export function staffFloorChromeLabels(
  t: StaffFloorTranslate,
): StaffFloorChromeLabels {
  return {
    floor: t("floor.floor"),
    floorN: (n) => t("floor.floorN", { n }),
    layoutZone: t("floor.layoutZone"),
    noStations: t("floor.noStations"),
    noStationsInLayout: t("floor.noStationsInLayout"),
    prev: t("floor.prev"),
    next: t("floor.next"),
    pageOf: (page, total) => t("floor.pageOf", { page, total }),
    stationsRange: (from, to, total) =>
      t("floor.stationsRange", { from, to, total }),
    mainArea: t("floor.mainArea"),
    staffStationHint: t("floor.staffStationHint"),
  };
}

export function staffBowlingChromeLabels(
  t: StaffFloorTranslate,
): BowlingLaneChromeLabels {
  return {
    floor: t("floor.floor"),
    floorN: (n) => t("floor.floorN", { n }),
    layoutZone: t("floor.layoutZone"),
    noLanes: t("floor.noLanes"),
    alleyHint: t("floor.bowlingAlleyHint"),
    swipeLanes: t("floor.swipeLanes"),
    prev: t("floor.prev"),
    next: t("floor.next"),
    lanesRange: (from, to, total) =>
      t("floor.lanesRange", { from, to, total }),
    staffLaneHint: t("floor.staffLaneHint"),
  };
}

export function staffLayoutMapLabel(
  t: StaffFloorTranslate,
  type: ResourceType,
  unitKind: BookingUnitKind,
): string {
  if (type === "DINING") return t("floor.mapLabelTables");
  if (type === "BOWLING" || unitKind === "LANE") return t("floor.mapLabelLanes");
  if (unitKind === "TABLE") return t("floor.mapLabelTables");
  return t("floor.mapLabelStations");
}

/** Secondary schedule unit-card / list action labels (Book, Restore, menu). */
export type StaffScheduleActionLabels = {
  book: string;
  restore: string;
  openBooking: string;
  checkInGuest: string;
  guestLeftFree: string;
  viewDaySchedule: string;
  markOutOfService: string;
  moreFor: (name: string) => string;
  moreToday: (n: number) => string;
  moreCount: (n: number) => string;
  markedMaintenance: string;
  noBookingsToday: string;
  freeOfTotal: (free: number, total: number) => string;
};

export function staffScheduleActionLabels(
  t: StaffFloorTranslate,
): StaffScheduleActionLabels {
  return {
    book: t("floor.actionBook"),
    restore: t("floor.actionRestore"),
    openBooking: t("floor.actionOpenBooking"),
    checkInGuest: t("floor.actionCheckInGuest"),
    guestLeftFree: t("floor.actionGuestLeftFree"),
    viewDaySchedule: t("floor.actionViewDaySchedule"),
    markOutOfService: t("floor.actionMarkOutOfService"),
    moreFor: (name) => t("floor.actionMoreFor", { name }),
    moreToday: (n) => t("floor.moreToday", { n }),
    moreCount: (n) => t("floor.moreCount", { n }),
    markedMaintenance: t("floor.markedMaintenance"),
    noBookingsToday: t("floor.noBookingsToday"),
    freeOfTotal: (free, total) => t("floor.freeOfTotal", { free, total }),
  };
}

/** Day agenda chrome + row action / phase labels (BookingDayAgenda). */
export type StaffDayAgendaLabels = {
  allEnded: string;
  emptyDay: string;
  emptyHint: string;
  title: string;
  flowHint: string;
  bookingCount: (filtered: number, active: number) => string;
  searchDining: string;
  searchGaming: string;
  filterActive: string;
  filterInUse: string;
  filterAll: string;
  clearSeatFilter: string;
  noMatch: string;
  showing: (from: number, to: number, total: number) => string;
  prevPage: string;
  nextPage: string;
  openSession: string;
  until: (time: string) => string;
  guests: (n: number) => string;
  alert: string;
  alertTitle: string;
  noUnit: string;
  collectPayment: string;
  collectPaymentTitle: string;
  checkIn: string;
  checkInTitle: string;
  guestLeft: string;
  guestLeftTitle: string;
  edit: string;
  cancelBooking: string;
  removePermanently: string;
  phase: Record<
    | "upcoming"
    | "waiting"
    | "in_use"
    | "completed"
    | "no_show"
    | "canceled",
    string
  >;
};

export function staffDayAgendaLabels(
  t: StaffFloorTranslate,
): StaffDayAgendaLabels {
  return {
    allEnded: t("floor.agendaAllEnded"),
    emptyDay: t("floor.agendaEmptyDay"),
    emptyHint: t("floor.agendaEmptyHint"),
    title: t("floor.agendaTitle"),
    flowHint: t("floor.agendaFlowHint"),
    bookingCount: (filtered, active) =>
      active === 1
        ? t("floor.agendaBookingCountOne", { filtered, active })
        : t("floor.agendaBookingCountMany", { filtered, active }),
    searchDining: t("floor.agendaSearchDining"),
    searchGaming: t("floor.agendaSearchGaming"),
    filterActive: t("floor.agendaFilterActive"),
    filterInUse: t("floor.agendaFilterInUse"),
    filterAll: t("floor.agendaFilterAll"),
    clearSeatFilter: t("floor.agendaClearSeatFilter"),
    noMatch: t("floor.agendaNoMatch"),
    showing: (from, to, total) =>
      t("floor.agendaShowing", { from, to, total }),
    prevPage: t("floor.agendaPrevPage"),
    nextPage: t("floor.agendaNextPage"),
    openSession: t("floor.agendaOpenSession"),
    until: (time) => t("floor.agendaUntil", { time }),
    guests: (n) => t("floor.agendaGuests", { n }),
    alert: t("floor.agendaAlert"),
    alertTitle: t("floor.agendaAlertTitle"),
    noUnit: t("floor.agendaNoUnit"),
    collectPayment: t("floor.agendaCollectPayment"),
    collectPaymentTitle: t("floor.agendaCollectPaymentTitle"),
    checkIn: t("floor.agendaCheckIn"),
    checkInTitle: t("floor.agendaCheckInTitle"),
    guestLeft: t("floor.agendaGuestLeft"),
    guestLeftTitle: t("floor.agendaGuestLeftTitle"),
    edit: t("common.edit"),
    cancelBooking: t("floor.agendaCancelBooking"),
    removePermanently: t("floor.agendaRemovePermanently"),
    phase: {
      upcoming: t("floor.agendaPhaseUpcoming"),
      waiting: t("floor.agendaPhaseWaiting"),
      in_use: t("floor.agendaPhaseInUse"),
      completed: t("floor.agendaPhaseCompleted"),
      no_show: t("floor.agendaPhaseNoShow"),
      canceled: t("floor.agendaPhaseCanceled"),
    },
  };
}

/** Board activity picker label + empty state (GameBookingSchedule theme). */
export type StaffBoardThemeLabels = {
  pickerLabel: string;
  emptyTitle: string;
  emptyHint: string;
};

export function staffBoardThemeLabels(
  t: StaffFloorTranslate,
  variant: "gaming" | "dining",
): StaffBoardThemeLabels {
  if (variant === "dining") {
    return {
      pickerLabel: t("floor.themeDiningPicker"),
      emptyTitle: t("floor.themeDiningEmptyTitle"),
      emptyHint: t("floor.themeDiningEmptyHint"),
    };
  }
  return {
    pickerLabel: t("floor.themeGamingPicker"),
    emptyTitle: t("floor.themeGamingEmptyTitle"),
    emptyHint: t("floor.themeGamingEmptyHint"),
  };
}

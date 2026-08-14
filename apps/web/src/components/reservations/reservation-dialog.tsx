"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  ACTIVE_BOOKING_STATUSES,
  addMinutesToTime,
  combineDateAndTime,
  splitDateAndTime,
} from "@/lib/booking-time";
import {
  holdEndFromLocal,
  parseNoShowMinutes,
} from "@/lib/dining-reservation";
import { BowlingModePicker } from "@/components/gaming/bowling-mode-picker";
import {
  buildBowlingNotes,
  estimateBowlingPrice,
  estimateTimedRatesPrice,
  suggestBowlingWalkInAmount,
  parseBowlingConfig,
  parseGamesFromNotes,
  type BowlingChargeMode,
} from "@/lib/bowling-booking";
import {
  listBowlingModes,
  modeToOfferingConfig,
  resolveBowlingMode,
} from "@/lib/bowling-modes";
import {
  getBookingUnitKind,
  getBookingUnitLabels,
  bookingCollectsPartySize,
} from "@/lib/booking-unit-kind";
import { ApiError, resolveApiErrorDisplay } from "@/lib/api";
import type { Reservation, ReservationStatus } from "@/lib/reservations-client";
import type { ResourceCatalog } from "@/lib/resources-client";
import { RESOURCE_TYPE_LABELS } from "@/lib/resource-types";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

export function ReservationDialog({
  catalog,
  initial,
  defaultUnitId,
  defaultDate,
  existingBookings = [],
  onClose,
  onSave,
  onCancelBooking,
  onDelete,
  onServerOverlap,
  saving,
}: {
  catalog: ResourceCatalog;
  initial?: Reservation | ScheduleBookingLike;
  defaultUnitId?: string;
  defaultDate?: string;
  /** Other bookings on the selected unit (for client overlap hint). */
  existingBookings?: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: ReservationStatus;
  }[];
  onClose: () => void;
  onSave: (body: {
    resourceId: string;
    guestName: string;
    guestEmail?: string;
    guestPhone?: string;
    partySize: number;
    startsAt: string;
    endsAt: string;
    status: ReservationStatus;
    staffAlert?: boolean;
    notes?: string;
  }) => Promise<void>;
  onCancelBooking?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  /** Refresh schedule when server rejects with RESERVATION_OVERLAP (§36 W2). */
  onServerOverlap?: () => void;
  saving: boolean;
}) {
  const vs = useVenueSettingsOptional();
  const formatMoney = vs?.formatMoney ?? ((n: number) => n.toFixed(2));
  const t = vs?.t ?? ((k: string) => k);
  const units = catalog.categories.flatMap((c) =>
    c.resources.map((r) => ({
      ...r,
      categoryId: c.id,
      categoryName: c.name,
      categoryType: c.type,
      slotMinutes: c.slotMinutes,
      bookingMode: c.bookingMode,
      offeringConfig: c.offeringConfig,
      unitKind: getBookingUnitKind(c.type),
    })),
  );

  const initialNotes = initial?.notes ?? "";
  const initialParsedGames = parseGamesFromNotes(initialNotes);

  const [resourceId, setResourceId] = useState(
    initial?.resourceId ?? defaultUnitId ?? units[0]?.id ?? "",
  );
  const [guestName, setGuestName] = useState(initial?.guestName ?? "");
  const [guestEmail, setGuestEmail] = useState(initial?.guestEmail ?? "");
  const [guestPhone, setGuestPhone] = useState(initial?.guestPhone ?? "");
  const [partySize, setPartySize] = useState(String(initial?.partySize ?? 1));
  const [notes, setNotes] = useState(
    initialNotes.replace(/^\[Bowling[^\]]*\]\s*/i, "").trim(),
  );
  const [staffAlert, setStaffAlert] = useState(initial?.staffAlert ?? false);
  const [feedback, setFeedback] = useState<{
    variant: "error" | "info";
    message: string;
  } | null>(null);

  const initialParts = initial
    ? splitDateAndTime(initial.startsAt)
    : { date: defaultDate ?? "", time: "14:00" };
  const initialEnd = initial
    ? splitDateAndTime(initial.endsAt)
    : { date: defaultDate ?? "", time: "15:00" };

  const [date, setDate] = useState(initialParts.date || defaultDate || "");
  const [startTime, setStartTime] = useState(initialParts.time || "14:00");
  const [endTime, setEndTime] = useState(() => {
    if (initial) return initialEnd.time || "15:00";
    return addMinutesToTime(initialParts.time || "14:00", 60);
  });

  const selected = units.find((u) => u.id === resourceId);
  const selectedCategory = catalog.categories.find(
    (c) => c.id === selected?.categoryId,
  );
  const isDining = selected?.categoryType === "DINING";
  const isBowling = selected?.categoryType === "BOWLING";
  const noShowMinutes = parseNoShowMinutes(
    selectedCategory?.offeringConfig ?? null,
  );
  const unitLabels = getBookingUnitLabels(selected?.unitKind ?? "UNIT");
  const slotMinutes = selected?.slotMinutes ?? 60;

  useEffect(() => {
    if (initial) return;
    if (isDining) return;
    setEndTime(addMinutesToTime(startTime, slotMinutes));
    // Intentionally omit startTime: applyStartTime already preserves duration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, slotMinutes, isDining, initial]);

  const bowlingModes = useMemo(
    () =>
      isBowling && selectedCategory
        ? listBowlingModes(
            selectedCategory.offeringConfig,
            selectedCategory.bookingMode,
            selectedCategory.rates ?? [],
            slotMinutes,
          )
        : [],
    [isBowling, selectedCategory, slotMinutes],
  );

  const [selectedBowlingModeId, setSelectedBowlingModeId] = useState("");
  const selectedBowlingMode = useMemo(
    () =>
      bowlingModes.find((m) => m.id === selectedBowlingModeId) ??
      bowlingModes[0] ??
      null,
    [bowlingModes, selectedBowlingModeId],
  );

  const chargeMode: BowlingChargeMode =
    selectedBowlingMode?.chargeType ?? "TIME";
  const bowlingConfig = selectedBowlingMode
    ? modeToOfferingConfig(selectedBowlingMode)
    : parseBowlingConfig(selectedCategory?.offeringConfig, slotMinutes);
  const effectiveSlotMinutes = selectedBowlingMode?.slotMinutes ?? slotMinutes;

  const [gameCount, setGameCount] = useState(
    String(initialParsedGames ?? bowlingConfig.defaultGames),
  );

  useEffect(() => {
    if (!isBowling || bowlingModes.length === 0) return;
    const resolved =
      initial?.resourceId === resourceId
        ? resolveBowlingMode(bowlingModes, initialNotes)
        : null;
    const mode = resolved ?? bowlingModes[0];
    setSelectedBowlingModeId(mode.id);
    setGameCount(
      String(
        initial?.resourceId === resourceId && initialParsedGames
          ? initialParsedGames
          : mode.defaultGames,
      ),
    );
  }, [resourceId, isBowling, bowlingModes, initial?.resourceId, initialNotes, initialParsedGames]);

  const showPartySize =
    isDining ||
    (selected != null &&
      selectedBowlingMode != null &&
      bookingCollectsPartySize(selected.categoryType, {
        bookingMode: selectedCategory?.bookingMode ?? "TIME",
        notes: buildBowlingNotes(
          "",
          {
            id: selectedBowlingMode.id,
            chargeType: selectedBowlingMode.chargeType,
          },
          parseInt(gameCount, 10) || selectedBowlingMode.defaultGames,
        ),
        offeringConfig: selectedCategory?.offeringConfig,
        categoryRates: selectedCategory?.rates,
        slotMinutes: effectiveSlotMinutes,
      }));

  const estimatedDurationMinutes = useMemo(() => {
    if (isDining) return effectiveSlotMinutes;
    if (isBowling && chargeMode === "GAME") {
      const games = parseInt(gameCount, 10) || bowlingConfig.defaultGames;
      return games * (selectedBowlingMode?.minutesPerGame ?? effectiveSlotMinutes);
    }
    if (!date || !startTime || !endTime) return effectiveSlotMinutes;
    const start = combineDateAndTime(date, startTime);
    const end = combineDateAndTime(date, endTime);
    const mins = Math.round((end.getTime() - start.getTime()) / 60_000);
    return mins > 0 ? mins : effectiveSlotMinutes;
  }, [
    isDining,
    isBowling,
    chargeMode,
    gameCount,
    bowlingConfig.defaultGames,
    selectedBowlingMode?.minutesPerGame,
    effectiveSlotMinutes,
    date,
    startTime,
    endTime,
  ]);

  const estimatedPrice = useMemo(() => {
    if (isDining) return null;
    const rates = selectedCategory?.rates ?? [];
    if (isBowling && selectedBowlingMode) {
      const games = parseInt(gameCount, 10) || bowlingConfig.defaultGames;
      const players = parseInt(partySize, 10) || 1;
      return (
        suggestBowlingWalkInAmount(
          selectedBowlingMode,
          players,
          estimatedDurationMinutes,
          games,
        ) ??
        estimateBowlingPrice(
          chargeMode,
          games,
          players,
          bowlingConfig,
          estimatedDurationMinutes,
          effectiveSlotMinutes,
        ) ??
        (rates.length > 0
          ? estimateTimedRatesPrice(rates, estimatedDurationMinutes)
          : null)
      );
    }
    if (rates.length > 0) {
      return estimateTimedRatesPrice(rates, estimatedDurationMinutes);
    }
    return null;
  }, [
    isDining,
    isBowling,
    selectedBowlingMode,
    selectedCategory?.rates,
    chargeMode,
    gameCount,
    partySize,
    bowlingConfig,
    estimatedDurationMinutes,
    effectiveSlotMinutes,
  ]);

  const overlapHint = useMemo(() => {
    if (!resourceId || !date || !startTime) return null;
    const start = combineDateAndTime(date, startTime);
    const windowEnd = isDining
      ? new Date(holdEndFromLocal(date, startTime, noShowMinutes))
      : combineDateAndTime(date, endTime);
    const clash = existingBookings.find(
      (b) =>
        b.id !== initial?.id &&
        ACTIVE_BOOKING_STATUSES.includes(b.status) &&
        start < new Date(b.endsAt) &&
        windowEnd > new Date(b.startsAt),
    );
    if (clash) {
      return isDining
        ? t("reservationDialog.overlapTable")
        : t("reservationDialog.overlapUnit");
    }
    return null;
  }, [
    resourceId,
    date,
    startTime,
    endTime,
    existingBookings,
    initial?.id,
    isDining,
    noShowMinutes,
    t,
  ]);

  function applyStartTime(next: string) {
    setStartTime(next);
    if (!isDining) {
      const start = combineDateAndTime(date || "1970-01-01", startTime);
      const end = combineDateAndTime(date || "1970-01-01", endTime);
      const span = Math.round((end.getTime() - start.getTime()) / 60_000);
      const keep = span > 0 ? span : effectiveSlotMinutes;
      setEndTime(addMinutesToTime(next, keep));
    }
  }

  function onBowlingModeChange(modeId: string) {
    setSelectedBowlingModeId(modeId);
    const mode = bowlingModes.find((m) => m.id === modeId);
    if (!mode) return;
    setGameCount(String(mode.defaultGames));
  }

  function validateBowlingFields(): string | null {
    if (!isBowling) return null;
    const players = parseInt(partySize, 10) || 0;
    if (chargeMode === "PERSON" && selectedBowlingMode) {
      if (players < selectedBowlingMode.minPlayers) {
        return t("reservationDialog.partySizeMin", {
          min: selectedBowlingMode.minPlayers,
        });
      }
      if (players > selectedBowlingMode.maxPlayers) {
        return t("reservationDialog.partySizeMax", {
          max: selectedBowlingMode.maxPlayers,
        });
      }
    }
    if (chargeMode === "GAME") {
      const games = parseInt(gameCount, 10) || 0;
      if (games < 1) return t("reservationDialog.gamesMin");
    }
    return null;
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          aria-label={t("reservationDialog.close")}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl">
          <div className="mb-0 flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {initial
                  ? t("reservationDialog.editBooking")
                  : t("reservationDialog.newBooking")}
              </h2>
              {isBowling && selectedBowlingMode ? (
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {t("reservationDialog.bowlingSubtitle", {
                    mode: selectedBowlingMode.name,
                  })}
                </p>
              ) : null}
            </div>
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center text-zinc-400">
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {feedback ? (
            <FeedbackBanner
              variant={feedback.variant === "error" ? "error" : "info"}
              message={feedback.message}
              onDismiss={() => setFeedback(null)}
              className="mb-3"
            />
          ) : null}

          {overlapHint && !feedback ? (
            <FeedbackBanner
              variant="error"
              message={overlapHint}
              className="mb-3"
            />
          ) : null}

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!resourceId) return;
              const bowlingErr = validateBowlingFields();
              if (bowlingErr) {
                setFeedback({ variant: "error", message: bowlingErr });
                return;
              }
              if (overlapHint) {
                setFeedback({ variant: "error", message: overlapHint });
                return;
              }
              const startsAt = combineDateAndTime(date, startTime).toISOString();
              const endsAt = isDining
                ? holdEndFromLocal(date, startTime, noShowMinutes)
                : combineDateAndTime(date, endTime).toISOString();
              if (!isDining) {
                const startMs = combineDateAndTime(date, startTime).getTime();
                const endMs = combineDateAndTime(date, endTime).getTime();
                if (endMs - startMs < 15 * 60_000) {
                  setFeedback({
                    variant: "error",
                    message: t("reservationDialog.endAfterStart"),
                  });
                  return;
                }
              }
              const games = parseInt(gameCount, 10) || bowlingConfig.defaultGames;
              const finalNotes =
                isBowling && selectedBowlingMode
                  ? buildBowlingNotes(
                      notes.trim(),
                      {
                        id: selectedBowlingMode.id,
                        chargeType: selectedBowlingMode.chargeType,
                      },
                      games,
                    )
                  : notes.trim() || undefined;
              const saveStatus: ReservationStatus =
                initial?.status === "CANCELED" ||
                initial?.status === "COMPLETED"
                  ? initial.status
                  : "CONFIRMED";
              setFeedback(null);
              void onSave({
                resourceId,
                guestName: guestName.trim(),
                guestEmail: guestEmail.trim() || undefined,
                guestPhone: guestPhone.trim() || undefined,
                partySize: showPartySize ? parseInt(partySize, 10) || 1 : 1,
                startsAt,
                endsAt,
                status: saveStatus,
                staffAlert,
                notes: finalNotes,
              }).catch((err) => {
                setFeedback({
                  variant: "error",
                  message: resolveApiErrorDisplay(
                    err,
                    {
                      RESERVATION_OVERLAP: isDining
                        ? t("reservationDialog.overlapTable")
                        : t("reservationDialog.overlapUnit"),
                      PERMISSION_DENIED: t("common.permissionDenied"),
                      VENUE_ACCESS_DENIED: t("common.venueAccessDenied"),
                    },
                    t("reservationDialog.saveFailed"),
                  ),
                });
                if (
                  err instanceof ApiError &&
                  err.code === "RESERVATION_OVERLAP"
                ) {
                  onServerOverlap?.();
                }
              });
            }}
          >
            <label className="block text-xs text-zinc-500">
              {unitLabels.selectLabel}
              <select
                required
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                {catalog.categories.map((cat) => {
                  const kind = getBookingUnitKind(cat.type);
                  const labels = getBookingUnitLabels(kind);
                  const catUnits = units.filter(
                    (u) =>
                      cat.resources.some((r) => r.id === u.id) &&
                      (u.status !== "MAINTENANCE" ||
                        u.id === initial?.resourceId),
                  );
                  if (catUnits.length === 0) return null;
                  return (
                    <optgroup
                      key={cat.id}
                      label={`${cat.name} (${RESOURCE_TYPE_LABELS[cat.type]} · ${labels.plural})`}
                    >
                      {catUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>

            {isBowling && bowlingModes.length > 0 ? (
              <BowlingModePicker
                modes={bowlingModes}
                value={selectedBowlingModeId}
                onChange={onBowlingModeChange}
                label={t("reservationDialog.howBooking")}
              />
            ) : null}

            <label className="block text-xs text-zinc-500">
              {t("common.date")}
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>

            {isBowling && chargeMode === "GAME" ? (
              <label className="block text-xs text-zinc-500">
                {t("reservationDialog.numberOfGames")}
                <input
                  type="number"
                  min={1}
                  required
                  value={gameCount}
                  onChange={(e) => setGameCount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
            ) : null}

            <label className="block text-xs text-zinc-500">
              {isDining
                ? t("reservationDialog.arrivalTime")
                : t("reservationDialog.startTime")}
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => applyStartTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-sm text-white"
              />
            </label>
            {!isDining ? (
              <>
                <label className="block text-xs text-zinc-500">
                  {t("reservationDialog.endTime")}
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-sm text-white"
                  />
                </label>
                <p className="text-[10px] text-zinc-600">
                  {t("reservationDialog.playWindowHint", {
                    minutes: estimatedDurationMinutes,
                    grace: noShowMinutes,
                  })}
                </p>
              </>
            ) : (
              <p className="text-[10px] text-zinc-600">
                {t("reservationDialog.holdHint", { minutes: noShowMinutes })}
              </p>
            )}

            {estimatedPrice != null ? (
              <p className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
                {t("reservationDialog.estimatedCharge", {
                  amount: formatMoney(estimatedPrice),
                })}
                <span className="mt-0.5 block text-[10px] text-emerald-200/70">
                  {t("reservationDialog.priceFromSetup", {
                    minutes: estimatedDurationMinutes,
                  })}
                </span>
              </p>
            ) : null}

            <label className="block text-xs text-zinc-500">
              {t("reservationDialog.guestName")}
              <input
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>

            {showPartySize ? (
              <label className="block text-xs text-zinc-500">
                {t("reservationDialog.playersRange", {
                  min: selectedBowlingMode?.minPlayers ?? bowlingConfig.minPlayers,
                  max: selectedBowlingMode?.maxPlayers ?? bowlingConfig.maxPlayers,
                })}
                <input
                  type="number"
                  min={selectedBowlingMode?.minPlayers ?? bowlingConfig.minPlayers}
                  max={selectedBowlingMode?.maxPlayers ?? bowlingConfig.maxPlayers}
                  value={partySize}
                  onChange={(e) => setPartySize(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
                <span className="mt-1 block text-[10px] text-zinc-600">
                  {t("reservationDialog.perPersonPricingHint", {
                    minutes:
                      selectedBowlingMode?.slotMinutes ?? effectiveSlotMinutes,
                  })}
                </span>
              </label>
            ) : isBowling && chargeMode === "TIME" ? (
              <p className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-[11px] text-zinc-500">
                {t("reservationDialog.laneRentalHint")}
              </p>
            ) : null}

            <label className="block text-xs text-zinc-500">
              {t("reservationDialog.notes")}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-2.5">
              <input
                type="checkbox"
                checked={staffAlert}
                onChange={(e) => setStaffAlert(e.target.checked)}
                className="mt-0.5 rounded border-white/20"
              />
              <span className="text-xs leading-snug text-zinc-300">
                <span className="font-medium text-amber-100">
                  {t("reservationDialog.notifyStaff")}
                </span>
                <span className="block text-zinc-500">
                  {t("reservationDialog.notifyStaffHint")}
                </span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2 pt-2">
              {initial && onCancelBooking && initial.status !== "CANCELED" ? (
                <button
                  type="button"
                  onClick={() => void onCancelBooking()}
                  className="rounded-lg border border-amber-400/30 px-3 py-2 text-sm text-amber-200"
                >
                  {t("reservationDialog.cancelBooking")}
                </button>
              ) : null}
              {initial && onDelete ? (
                <button
                  type="button"
                  onClick={() => void onDelete()}
                  className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-300"
                >
                  {t("common.remove")}
                </button>
              ) : null}
              <button
                type="submit"
                disabled={saving || !resourceId || !!overlapHint}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {t("common.save")}
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** Minimal shape for editing from the day schedule board. */
export type ScheduleBookingLike = {
  id: string;
  version: number;
  resourceId?: string;
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  partySize: number;
  startsAt: string;
  endsAt: string;
  status: ReservationStatus;
  notes?: string | null;
  staffAlert?: boolean;
};

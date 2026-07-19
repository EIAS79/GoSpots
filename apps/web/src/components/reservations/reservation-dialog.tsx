"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  ACTIVE_BOOKING_STATUSES,
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
  saving: boolean;
}) {
  const { formatMoney } = useVenueSettingsOptional() ?? {
    formatMoney: (n: number) => n.toFixed(2),
  };
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
  const [endTime, setEndTime] = useState(initialEnd.time || "15:00");

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
    if (isBowling && chargeMode === "GAME") {
      const games = parseInt(gameCount, 10) || bowlingConfig.defaultGames;
      return games * (selectedBowlingMode?.minutesPerGame ?? effectiveSlotMinutes);
    }
    return effectiveSlotMinutes;
  }, [
    isBowling,
    chargeMode,
    gameCount,
    bowlingConfig.defaultGames,
    selectedBowlingMode?.minutesPerGame,
    effectiveSlotMinutes,
  ]);

  const estimatedPrice = useMemo(() => {
    if (!isBowling || !selectedBowlingMode) return null;
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
      )
    );
  }, [
    isBowling,
    selectedBowlingMode,
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
    const holdEnd = new Date(holdEndFromLocal(date, startTime, noShowMinutes));
    const clash = existingBookings.find(
      (b) =>
        b.id !== initial?.id &&
        ACTIVE_BOOKING_STATUSES.includes(b.status) &&
        start < new Date(b.endsAt) &&
        holdEnd > new Date(b.startsAt),
    );
    if (clash) {
      return isDining
        ? "This table already has a reservation around that time."
        : "This unit already has a booking around that time.";
    }
    return null;
  }, [
    resourceId,
    date,
    startTime,
    existingBookings,
    initial?.id,
    isDining,
    noShowMinutes,
  ]);

  function applyStartTime(next: string) {
    setStartTime(next);
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
        return `Party size must be at least ${selectedBowlingMode.minPlayers}.`;
      }
      if (players > selectedBowlingMode.maxPlayers) {
        return `Party size cannot exceed ${selectedBowlingMode.maxPlayers}.`;
      }
    }
    if (chargeMode === "GAME") {
      const games = parseInt(gameCount, 10) || 0;
      if (games < 1) return "Enter at least one game.";
    }
    return null;
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          aria-label="Close"
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl">
          <div className="mb-0 flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {initial ? "Edit booking" : "New booking"}
              </h2>
              {isBowling && selectedBowlingMode ? (
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Bowling · {selectedBowlingMode.name}
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
              const endsAt = holdEndFromLocal(date, startTime, noShowMinutes);
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
                  message:
                    err instanceof Error ? err.message : "Could not save booking.",
                });
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
                label="How is this guest booking?"
              />
            ) : null}

            <label className="block text-xs text-zinc-500">
              Date
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
                Number of games
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
              {isDining ? "Arrival time" : "Start time"}
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => applyStartTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-sm text-white"
              />
            </label>
            <p className="text-[10px] text-zinc-600">
              {`No fixed end time — unit held for ${noShowMinutes} min after start. If the guest does not show, it is freed automatically. Staff checks in on arrival and marks free when they leave.`}
            </p>

            {estimatedPrice != null ? (
              <p className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
                Estimated charge: {formatMoney(estimatedPrice)}
              </p>
            ) : null}

            <label className="block text-xs text-zinc-500">
              Guest name
              <input
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>

            {showPartySize ? (
              <label className="block text-xs text-zinc-500">
                {`Players (${selectedBowlingMode?.minPlayers ?? bowlingConfig.minPlayers}–${selectedBowlingMode?.maxPlayers ?? bowlingConfig.maxPlayers})`}
                <input
                  type="number"
                  min={selectedBowlingMode?.minPlayers ?? bowlingConfig.minPlayers}
                  max={selectedBowlingMode?.maxPlayers ?? bowlingConfig.maxPlayers}
                  value={partySize}
                  onChange={(e) => setPartySize(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
                <span className="mt-1 block text-[10px] text-zinc-600">
                  Per-person pricing — charge is multiplied by player count and
                  by each {selectedBowlingMode?.slotMinutes ?? effectiveSlotMinutes}{" "}
                  min block in the booking window.
                </span>
              </label>
            ) : isBowling && chargeMode === "TIME" ? (
              <p className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-[11px] text-zinc-500">
                Lane rental for a time slot — you are booking the lane itself;
                guest count does not affect the price.
              </p>
            ) : null}

            <label className="block text-xs text-zinc-500">
              Notes
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
                  Notify staff
                </span>
                <span className="block text-zinc-500">
                  Sends an in-app alert to your team and logs this in audit when
                  saved.
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
                  Cancel booking
                </button>
              ) : null}
              {initial && onDelete ? (
                <button
                  type="button"
                  onClick={() => void onDelete()}
                  className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-300"
                >
                  Remove
                </button>
              ) : null}
              <button
                type="submit"
                disabled={saving || !resourceId || !!overlapHint}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save
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

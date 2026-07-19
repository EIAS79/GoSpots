"use client";

import { CheckCircle2, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ModalPortal } from "@/components/ui/modal-portal";
import { splitDateAndTime } from "@/lib/booking-time";
import {
  holdEndFromLocal,
  parseNoShowMinutes,
} from "@/lib/dining-reservation";
import { BowlingModePicker } from "@/components/gaming/bowling-mode-picker";
import {
  buildBowlingNotes,
  estimateBowlingPrice,
  estimateTimedRatesPrice,
  parseBowlingConfig,
  suggestBowlingWalkInAmount,
  type BowlingChargeMode,
} from "@/lib/bowling-booking";
import {
  listBowlingModes,
  modeToOfferingConfig,
} from "@/lib/bowling-modes";
import { bookingCollectsPartySize } from "@/lib/booking-unit-kind";
import { hasWindowOverlapWithBookings } from "@/lib/gaming-window-availability";
import { submitPublicGamingReservation } from "@/lib/public-gaming-client";
import { submitPublicDiningReservation } from "@/lib/public-dining-client";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import {
  combineLocalDateTime,
  todayDateInput,
} from "@/lib/seating-event-datetime";
import type { ScheduleCategory, ScheduleUnit } from "@/lib/reservations-client";

function defaultStartTime() {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PublicGamingBookingDialog({
  slug,
  bookingKind = "gaming",
  category,
  unit,
  scheduleDate,
  initialStartTime,
  initialEndTime,
  initialPartySize,
  offeringRates = [],
  currency,
  onClose,
  onBooked,
}: {
  slug: string;
  bookingKind?: "gaming" | "dining";
  category: ScheduleCategory;
  unit: ScheduleUnit;
  scheduleDate: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialPartySize?: number;
  offeringRates?: {
    label: string;
    price: number;
    durationMinutes: number | null;
  }[];
  currency?: string;
  locale?: string;
  onClose: () => void;
  onBooked?: () => void;
}) {
  const { formatMoney } = usePublicPrefs();
  const isDining = bookingKind === "dining";
  const slotMinutes = category.slotMinutes || (isDining ? 90 : 60);
  const noShowMinutes = parseNoShowMinutes(category.offeringConfig);
  const isBowling = !isDining && category.type === "BOWLING";

  const legacyRates = useMemo(
    () =>
      offeringRates.map((r) => ({
        label: r.label,
        durationMinutes: r.durationMinutes,
        price: r.price,
      })),
    [offeringRates],
  );

  const bowlingModes = useMemo(
    () =>
      isBowling
        ? listBowlingModes(
            category.offeringConfig,
            category.bookingMode,
            legacyRates,
            slotMinutes,
          )
        : [],
    [isBowling, category, legacyRates, slotMinutes],
  );

  const [selectedBowlingModeId, setSelectedBowlingModeId] = useState(
    () => bowlingModes[0]?.id ?? "",
  );
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
    : parseBowlingConfig(category.offeringConfig, slotMinutes);
  const effectiveSlotMinutes = selectedBowlingMode?.slotMinutes ?? slotMinutes;

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [partySize, setPartySize] = useState(
    () => String(initialPartySize ?? 1),
  );
  const [startTime, setStartTime] = useState(
    () => initialStartTime ?? defaultStartTime(),
  );
  const [gameCount, setGameCount] = useState(
    String(bowlingConfig.defaultGames),
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    message: string;
    statusPath?: string;
  } | null>(null);

  const date = scheduleDate || todayDateInput();

  useEffect(() => {
    if (bowlingModes.length > 0 && !selectedBowlingModeId) {
      setSelectedBowlingModeId(bowlingModes[0].id);
    }
  }, [bowlingModes, selectedBowlingModeId]);

  const showPartySize =
    isDining ||
    (selectedBowlingMode != null &&
      bookingCollectsPartySize(category.type, {
        bookingMode: category.bookingMode ?? "TIME",
        notes: buildBowlingNotes(
          "",
          {
            id: selectedBowlingMode.id,
            chargeType: selectedBowlingMode.chargeType,
          },
          parseInt(gameCount, 10) || selectedBowlingMode.defaultGames,
        ),
        offeringConfig: category.offeringConfig,
        categoryRates: legacyRates,
        slotMinutes: effectiveSlotMinutes,
      }));

  useEffect(() => {
    if (initialPartySize != null) {
      setPartySize(String(initialPartySize));
    }
  }, [initialPartySize]);

  function onBowlingModeChange(modeId: string) {
    setSelectedBowlingModeId(modeId);
    const mode = bowlingModes.find((m) => m.id === modeId);
    if (!mode) return;
    setGameCount(String(mode.defaultGames));
  }

  const startsAt = useMemo(
    () => combineLocalDateTime(date, startTime),
    [date, startTime],
  );
  const endsAt = useMemo(
    () => holdEndFromLocal(date, startTime, noShowMinutes),
    [date, startTime, noShowMinutes],
  );

  const estimatedDurationMinutes = useMemo(() => {
    if (isBowling && selectedBowlingMode) {
      if (chargeMode === "GAME") {
        const games = parseInt(gameCount, 10) || bowlingConfig.defaultGames;
        return games * (selectedBowlingMode.minutesPerGame ?? effectiveSlotMinutes);
      }
      return selectedBowlingMode.slotMinutes;
    }
    return effectiveSlotMinutes;
  }, [
    isBowling,
    selectedBowlingMode,
    chargeMode,
    gameCount,
    bowlingConfig.defaultGames,
    effectiveSlotMinutes,
  ]);

  const estimatedPrice = useMemo(() => {
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
          selectedBowlingMode.slotMinutes,
        )
      );
    }
    if (!isBowling && legacyRates.length > 0 && estimatedDurationMinutes > 0) {
      return estimateTimedRatesPrice(legacyRates, estimatedDurationMinutes);
    }
    return null;
  }, [
    isBowling,
    selectedBowlingMode,
    chargeMode,
    gameCount,
    partySize,
    bowlingConfig,
    legacyRates,
    estimatedDurationMinutes,
  ]);

  const formatEstPrice = (amount: number) =>
    formatMoney(amount, currency ?? "EUR");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!guestName.trim()) {
      setError("Your name is required.");
      return;
    }
    if (!guestEmail.trim()) {
      setError("Your email is required — we'll send your booking confirmation.");
      return;
    }
    if (!startsAt) {
      setError("Pick a valid time slot.");
      return;
    }

    const overlapEndTime = splitDateAndTime(
      holdEndFromLocal(date, startTime, noShowMinutes),
    ).time;

    const overlap = hasWindowOverlapWithBookings(
      unit,
      date,
      startTime,
      overlapEndTime,
    );
    if (overlap) {
      setError(
        `This station is already reserved ${new Date(overlap.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${new Date(overlap.endsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}. Pick a time before or after that slot.`,
      );
      return;
    }

    const games = parseInt(gameCount, 10) || bowlingConfig.defaultGames;
    const players = parseInt(partySize, 10) || 1;
    if (isDining && unit.capacity != null && players > unit.capacity) {
      setError(
        `${unit.name} seats up to ${unit.capacity} — choose a smaller party or another table.`,
      );
      return;
    }

    const bookingNotes =
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

    const resolvedEndsAt =
      endsAt ?? holdEndFromLocal(date, startTime, noShowMinutes);
    if (!resolvedEndsAt) {
      setError("Pick a valid time slot.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        resourceId: unit.id,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        guestPhone: guestPhone.trim() || undefined,
        partySize: showPartySize ? players : 1,
        startsAt,
        endsAt: resolvedEndsAt,
        notes: bookingNotes,
      };
      const res = isDining
        ? await submitPublicDiningReservation(slug, payload)
        : await submitPublicGamingReservation(slug, payload);
      setSuccess({ message: res.message, statusPath: res.statusPath });
      onBooked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete booking.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="max-h-[min(92vh,100dvh)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-zinc-950 pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gaming-book-title"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-zinc-950/95 px-5 py-4 backdrop-blur">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/90">
                {category.name}
              </p>
              <h2 id="gaming-book-title" className="text-lg font-semibold text-white">
                {isDining ? `Reserve ${unit.name}` : `Book ${unit.name}`}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {success ? (
            <div className="p-6 text-center">
              <CheckCircle2 className="mx-auto text-emerald-400" size={36} />
              <p className="mt-3 text-sm font-medium text-emerald-100">
                {success.message}
              </p>
              {success.statusPath ? (
                <Link
                  href={success.statusPath}
                  className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  Track your booking
                </Link>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="mt-4 block w-full text-xs text-zinc-500 underline"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="space-y-4 p-5">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-zinc-300">
                <div className="flex flex-col gap-0.5 leading-snug">
                  <span className="font-medium text-emerald-200">{unit.name}</span>
                  <span className="text-xs text-zinc-400">
                    {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {" · "}
                    {startTime}
                  </span>
                </div>
                {estimatedPrice != null ? (
                  <span className="mt-1 block text-xs text-emerald-300/80">
                    Est. {formatEstPrice(estimatedPrice)}
                  </span>
                ) : null}
              </div>

              {error ? (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {error}
                </p>
              ) : null}

              {isBowling && bowlingModes.length > 0 ? (
                <BowlingModePicker
                  modes={bowlingModes}
                  value={selectedBowlingModeId}
                  onChange={onBowlingModeChange}
                  label="How would you like to book?"
                  labelClassName="block text-xs text-zinc-400"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-base text-white sm:text-sm"
                />
              ) : null}

              {isBowling && chargeMode === "GAME" ? (
                <label className="block text-xs text-zinc-400">
                  Number of games
                  <input
                    type="number"
                    min={1}
                    required
                    value={gameCount}
                    onChange={(e) => setGameCount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-base text-white sm:text-sm"
                  />
                </label>
              ) : null}

              <label className="block text-xs text-zinc-400">
                Your name
                <input
                  required
                  autoFocus
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-base text-white sm:text-sm"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-zinc-400">
                  Email
                  <input
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-base text-white sm:text-sm"
                  />
                </label>
                <label className="block text-xs text-zinc-400">
                  Phone (optional)
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-base text-white sm:text-sm"
                  />
                </label>
              </div>

              {showPartySize ? (
                <label className="block text-xs text-zinc-400">
                  {isDining ? (
                    <>
                      Party size
                      {unit.capacity != null ? (
                        <span className="text-zinc-600">
                          {" "}
                          (this table: up to {unit.capacity})
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      Players ({selectedBowlingMode?.minPlayers ?? bowlingConfig.minPlayers}–{selectedBowlingMode?.maxPlayers ?? bowlingConfig.maxPlayers})
                    </>
                  )}
                  <input
                    type="number"
                    min={1}
                    max={
                      isDining && unit.capacity != null
                        ? unit.capacity
                        : selectedBowlingMode?.maxPlayers ?? bowlingConfig.maxPlayers
                    }
                    required
                    value={partySize}
                    onChange={(e) => setPartySize(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-base text-white sm:text-sm"
                  />
                  {isDining ? (
                    <span className="mt-1 block text-[10px] text-zinc-600">
                      Used for seating — no charge is calculated online for
                      dining reservations.
                    </span>
                  ) : (
                    <span className="mt-1 block text-[10px] text-zinc-600">
                      Per-person pricing — charge is per player for each{" "}
                      {selectedBowlingMode?.slotMinutes ?? effectiveSlotMinutes}{" "}
                      min block in your time slot.
                    </span>
                  )}
                </label>
              ) : isBowling && chargeMode === "TIME" ? (
                <p className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-[11px] text-zinc-500">
                  Lane rental — you book the lane for the duration; guest count
                  does not change the price.
                </p>
              ) : null}

              <label className="block text-xs text-zinc-400">
                {isDining ? "Arrival time" : "Start time"}
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-base text-white sm:text-sm"
                />
              </label>
              <p className="text-[10px] text-zinc-600">
                No fixed end time — your {isDining ? "table" : "station"} is held
                for {noShowMinutes} minutes after start. Please arrive on time.
              </p>

              <label className="block text-xs text-zinc-400">
                Notes (optional)
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Game titles, skill level, special requests…"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-base text-white sm:text-sm"
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                Confirm booking
              </button>

              <p className="text-center text-[11px] text-zinc-600">
                A confirmation email is sent when you book. Your station is
                reserved immediately for the time you selected.
              </p>
            </form>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

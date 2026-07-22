"use client";

import { CheckCircle2, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ModalPortal } from "@/components/ui/modal-portal";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
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
import {
  useConnectivityOptional,
  type ConnectivityMode,
} from "@/lib/connectivity-context";
import { PrivacyConsentCheckbox } from "@/components/venues/public/privacy-consent-checkbox";
import { PublicCaptchaWidget } from "@/components/venues/public/public-captcha-widget";
import { ApiError, resolveApiErrorDisplay } from "@/lib/api";
import { submitPublicGamingReservation } from "@/lib/public-gaming-client";
import { submitPublicDiningReservation } from "@/lib/public-dining-client";
import {
  isPublicCaptchaEnabled,
  withCaptchaToken,
} from "@/lib/public-captcha";
import { safeStatusPathHref } from "@/lib/safe-app-href";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { combineLocalDateTime } from "@/lib/seating-event-datetime";
import {
  resolveVenueTimeZone,
  venueDayKey,
} from "@/lib/venue-timezone";
import type { ScheduleCategory, ScheduleUnit } from "@/lib/reservations-client";

/** Modes A/B/C — fail-closed on public booking writes (bible #32). Mode F keeps submit. */
function isConnectivityOutage(mode: ConnectivityMode): boolean {
  return (
    mode === "offline" ||
    mode === "api_unreachable" ||
    mode === "api_unavailable"
  );
}

function outageCopyKey(
  mode: Extract<
    ConnectivityMode,
    "offline" | "api_unreachable" | "api_unavailable"
  >,
): string {
  switch (mode) {
    case "offline":
      return "venuePage.booking.outageOffline";
    case "api_unreachable":
      return "venuePage.booking.outageUnreachable";
    case "api_unavailable":
      return "venuePage.booking.outageUnavailable";
  }
}

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
  timezone,
  venueLocale,
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
    price: import("@/lib/money").MoneyWire;
    durationMinutes: number | null;
  }[];
  currency?: string;
  /** Venue IANA timezone from `PublicVenue.timezone`. */
  timezone?: string;
  /** Venue locale from `PublicVenue.locale` (fallback when IANA unset). */
  venueLocale?: string;
  onClose: () => void;
  onBooked?: () => void;
}) {
  const { formatMoney, t, locale } = usePublicPrefs();
  const venueTimeZone = resolveVenueTimeZone({
    timezone,
    locale: venueLocale ?? locale,
  });
  const connectivity = useConnectivityOptional();
  const connectivityMode = connectivity?.mode ?? "ok";
  const outage = isConnectivityOutage(connectivityMode);
  const outageMessage = outage
    ? t(
        outageCopyKey(
          connectivityMode as Extract<
            ConnectivityMode,
            "offline" | "api_unreachable" | "api_unavailable"
          >,
        ),
      )
    : null;
  const isDining = bookingKind === "dining";
  const slotMinutes = category.slotMinutes || (isDining ? 90 : 60);
  const noShowMinutes = parseNoShowMinutes(category.offeringConfig);
  const isBowling = !isDining && category.type === "BOWLING";
  const unitKind = t(
    isDining
      ? "venuePage.booking.unitKindTable"
      : "venuePage.booking.unitKindStation",
  );

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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [success, setSuccess] = useState<{
    message: string;
    statusPath?: string;
    emailSent?: boolean;
  } | null>(null);

  const date = scheduleDate || venueDayKey(venueTimeZone);

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
    if (outage) return;

    if (!guestName.trim()) {
      setError(t("venuePage.booking.nameRequired"));
      return;
    }
    if (!guestEmail.trim()) {
      setError(t("venuePage.booking.emailRequired"));
      return;
    }
    if (!startsAt) {
      setError(t("venuePage.booking.invalidTime"));
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
      const timeOpts: Intl.DateTimeFormatOptions = {
        hour: "numeric",
        minute: "2-digit",
      };
      setError(
        t("venuePage.booking.overlap", {
          start: new Date(overlap.startsAt).toLocaleTimeString(locale, timeOpts),
          end: new Date(overlap.endsAt).toLocaleTimeString(locale, timeOpts),
        }),
      );
      return;
    }

    const games = parseInt(gameCount, 10) || bowlingConfig.defaultGames;
    const players = parseInt(partySize, 10) || 1;
    if (isDining && unit.capacity != null && players > unit.capacity) {
      setError(
        t("venuePage.booking.capacityExceeded", {
          name: unit.name,
          capacity: unit.capacity,
        }),
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
      setError(t("venuePage.booking.invalidTime"));
      return;
    }

    if (!privacyConsent) {
      setError(t("venuePage.privacyConsent.required"));
      return;
    }

    if (isPublicCaptchaEnabled() && !captchaToken?.trim()) {
      setError(t("venuePage.captcha.required"));
      return;
    }

    setBusy(true);
    try {
      const payload = withCaptchaToken(
        {
          resourceId: unit.id,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone: guestPhone.trim() || undefined,
          partySize: showPartySize ? players : 1,
          startsAt,
          endsAt: resolvedEndsAt,
          notes: bookingNotes,
          privacyConsentAccepted: true,
        },
        captchaToken,
      );
      const res = isDining
        ? await submitPublicDiningReservation(slug, payload)
        : await submitPublicGamingReservation(slug, payload);
      setSuccess({
        message: res.message,
        statusPath: res.statusPath,
        emailSent: res.emailSent,
      });
      onBooked?.();
    } catch (err) {
      setError(
        resolveApiErrorDisplay(
          err,
          {
            RESERVATION_OVERLAP: t("venuePage.booking.overlapServer"),
            CAPTCHA_REQUIRED: t("venuePage.captcha.required"),
            CAPTCHA_FAILED: t("venuePage.captcha.required"),
          },
          t("venuePage.booking.submitFailed"),
        ),
      );
      if (err instanceof ApiError && err.code === "RESERVATION_OVERLAP") {
        onBooked?.();
      } else {
        setCaptchaToken(null);
        setCaptchaReset((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  const successTrackHref = success
    ? safeStatusPathHref(success.statusPath)
    : null;

  const fieldClass =
    "mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] sm:text-sm dark:border-white/10";
  const labelClass = "block text-xs text-zinc-600 dark:text-zinc-400";

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 dark:bg-black/70 sm:items-center sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="max-h-[min(92vh,100dvh)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)] text-[var(--color-foreground)] shadow-2xl dark:border-white/10 dark:bg-zinc-950 sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gaming-book-title"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-5 py-4 backdrop-blur dark:border-white/10 dark:bg-zinc-950/95">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-500/90">
                {category.name}
              </p>
              <h2 id="gaming-book-title" className="text-lg font-semibold text-[var(--color-foreground)]">
                {t(
                  isDining
                    ? "venuePage.booking.reserveTitle"
                    : "venuePage.booking.bookTitle",
                  { name: unit.name },
                )}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-600 hover:bg-black/5 hover:text-[var(--color-foreground)] dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
              aria-label={t("venuePage.booking.close")}
            >
              <X size={18} />
            </button>
          </div>

          {success ? (
            <div className="p-6 text-center">
              <CheckCircle2 className="mx-auto text-emerald-400" size={36} />
              <p className="mt-3 text-sm font-medium text-emerald-800 dark:text-emerald-100">
                {success.message}
              </p>
              {success.emailSent === false ? (
                <FeedbackBanner
                  variant="warning"
                  message={t("venuePage.booking.emailDelayed")}
                  className="mt-4 text-left"
                />
              ) : null}
              {successTrackHref ? (
                <Link
                  href={successTrackHref}
                  className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  {t("venuePage.booking.trackBooking")}
                </Link>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="mt-4 block w-full text-xs text-zinc-600 underline dark:text-zinc-500"
              >
                {t("venuePage.booking.close")}
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="space-y-4 p-5">
              {outageMessage ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="rounded-lg border border-amber-400/25 bg-amber-950/50 px-3 py-2 text-xs leading-snug text-amber-100/95"
                >
                  {outageMessage}
                </p>
              ) : null}

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                <div className="flex flex-col gap-0.5 leading-snug">
                  <span className="font-medium text-emerald-800 dark:text-emerald-200">{unit.name}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {new Date(`${date}T12:00:00`).toLocaleDateString(locale, {
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
                    {t("venuePage.booking.estPrice", {
                      price: formatEstPrice(estimatedPrice),
                    })}
                  </span>
                ) : null}
              </div>

              {error ? (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
                  {error}
                </p>
              ) : null}

              {isBowling && bowlingModes.length > 0 ? (
                <BowlingModePicker
                  modes={bowlingModes}
                  value={selectedBowlingModeId}
                  onChange={onBowlingModeChange}
                  label={t("venuePage.booking.howToBook")}
                  labelClassName={labelClass}
                  className={fieldClass}
                />
              ) : null}

              {isBowling && chargeMode === "GAME" ? (
                <label className={labelClass}>
                  {t("venuePage.booking.numberOfGames")}
                  <input
                    type="number"
                    min={1}
                    required
                    value={gameCount}
                    onChange={(e) => setGameCount(e.target.value)}
                    className={fieldClass}
                  />
                </label>
              ) : null}

              <label className={labelClass}>
                {t("venuePage.booking.yourName")}
                <input
                  required
                  autoFocus
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className={fieldClass}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  {t("venuePage.booking.email")}
                  <input
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  {t("venuePage.booking.phoneOptional")}
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className={fieldClass}
                  />
                </label>
              </div>

              {showPartySize ? (
                <label className={labelClass}>
                  {isDining ? (
                    <>
                      {t("venuePage.booking.partySize")}
                      {unit.capacity != null ? (
                        <span className="text-zinc-500 dark:text-zinc-600">
                          {" "}
                          {t("venuePage.booking.tableCapacity", {
                            capacity: unit.capacity,
                          })}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    t("venuePage.booking.playersRange", {
                      min:
                        selectedBowlingMode?.minPlayers ??
                        bowlingConfig.minPlayers,
                      max:
                        selectedBowlingMode?.maxPlayers ??
                        bowlingConfig.maxPlayers,
                    })
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
                    className={fieldClass}
                  />
                  {isDining ? (
                    <span className="mt-1 block text-[10px] text-zinc-600 dark:text-zinc-500">
                      {t("venuePage.booking.diningPartyHint")}
                    </span>
                  ) : (
                    <span className="mt-1 block text-[10px] text-zinc-600 dark:text-zinc-500">
                      {t("venuePage.booking.perPersonPricing", {
                        minutes:
                          selectedBowlingMode?.slotMinutes ??
                          effectiveSlotMinutes,
                      })}
                    </span>
                  )}
                </label>
              ) : isBowling && chargeMode === "TIME" ? (
                <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/50 px-3 py-2 text-[11px] text-zinc-600 dark:border-white/10 dark:text-zinc-500">
                  {t("venuePage.booking.laneRental")}
                </p>
              ) : null}

              <label className={labelClass}>
                {t(
                  isDining
                    ? "venuePage.booking.arrivalTime"
                    : "venuePage.booking.startTime",
                )}
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <p className="text-[10px] text-zinc-600 dark:text-zinc-500">
                {t("venuePage.booking.holdHint", {
                  unitKind,
                  minutes: noShowMinutes,
                })}
              </p>

              <label className={labelClass}>
                {t("venuePage.booking.notesOptional")}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t("venuePage.booking.notesPlaceholder")}
                  className={fieldClass}
                />
              </label>

              <PublicCaptchaWidget
                onTokenChange={setCaptchaToken}
                resetKey={captchaReset}
              />

              <PrivacyConsentCheckbox
                checked={privacyConsent}
                onChange={setPrivacyConsent}
                label={t("venuePage.privacyConsent.label")}
                disabled={busy}
              />

              <button
                type="submit"
                disabled={outage || busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                {t("venuePage.booking.confirmBooking")}
              </button>

              <p className="text-center text-[11px] text-zinc-600 dark:text-zinc-500">
                {t("venuePage.booking.confirmEmailHint", { unitKind })}
              </p>
            </form>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

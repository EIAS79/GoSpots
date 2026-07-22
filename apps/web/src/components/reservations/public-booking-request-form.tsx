"use client";

import {
  CalendarCheck,
  CheckCircle2,
  Gamepad2,
  Loader2,
  PartyPopper,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PublicCaptchaWidget } from "@/components/venues/public/public-captcha-widget";
import { PrivacyConsentCheckbox } from "@/components/venues/public/privacy-consent-checkbox";
import { cn } from "@/lib/cn";
import {
  PRIVATE_EVENT_REQUEST_TYPES,
  submitPublicEventRequest,
  type EventRequestType,
} from "@/lib/event-requests-client";
import {
  isPublicCaptchaEnabled,
  withCaptchaToken,
} from "@/lib/public-captcha";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import {
  combineLocalDateTime,
  defaultEventTimes,
} from "@/lib/seating-event-datetime";
import {
  resolveVenueTimeZone,
  venueDayKey,
} from "@/lib/venue-timezone";
import {
  SEATING_ZONES,
  type SeatingZone,
} from "@/lib/seating-zone";
import { safeStatusPathHref } from "@/lib/safe-app-href";

const { start: defaultStartTime, end: defaultEndTime } = defaultEventTimes();

export type BookingFormMode = "TABLE" | "GAMING" | "EVENT";

export type OfferingOption = {
  id: string;
  name: string;
  type?: string;
  unitCount?: number;
};

type PublicBookingRequestFormProps = {
  slug: string;
  mode: BookingFormMode;
  /** Pre-selected offering (ResourceCategory id). */
  resourceCategoryId?: string;
  /** Dining areas from digital dining layout. */
  diningOptions?: OfferingOption[];
  /** Gaming activities from gaming setup. */
  gamingOptions?: OfferingOption[];
  title?: string;
  description?: string;
  className?: string;
  /** Venue IANA timezone from `PublicVenue.timezone`. */
  timezone?: string;
  /** Venue locale from `PublicVenue.locale` (fallback when IANA unset). */
  venueLocale?: string;
};

const MODE_ICONS: Record<BookingFormMode, typeof CalendarCheck> = {
  TABLE: CalendarCheck,
  GAMING: Gamepad2,
  EVENT: PartyPopper,
};

export function PublicBookingRequestForm({
  slug,
  mode,
  resourceCategoryId: initialResourceId,
  diningOptions = [],
  gamingOptions = [],
  title,
  description,
  className,
  timezone,
  venueLocale,
}: PublicBookingRequestFormProps) {
  const { t, locale } = usePublicPrefs();
  const venueTimeZone = resolveVenueTimeZone({
    timezone,
    locale: venueLocale ?? locale,
  });
  const Icon = MODE_ICONS[mode];
  const modeTitle =
    mode === "TABLE"
      ? t("publicBooking.modeTableTitle")
      : mode === "GAMING"
        ? t("publicBooking.modeGamingTitle")
        : t("publicBooking.modeEventTitle");
  const modeDesc =
    mode === "TABLE"
      ? t("publicBooking.modeTableDesc")
      : mode === "GAMING"
        ? t("publicBooking.modeGamingDesc")
        : t("publicBooking.modeEventDesc");

  const areaOptions = useMemo(() => {
    if (mode === "GAMING") return gamingOptions;
    if (mode === "TABLE") return diningOptions;
    // Private events: prefer dining areas, then gaming offerings.
    return [...diningOptions, ...gamingOptions];
  }, [mode, diningOptions, gamingOptions]);

  const [eventType, setEventType] = useState<EventRequestType>(
    mode === "TABLE" ? "TABLE" : mode === "GAMING" ? "GAMING" : "BIRTHDAY",
  );
  const [resourceCategoryId, setResourceCategoryId] = useState(
    initialResourceId ?? areaOptions[0]?.id ?? "",
  );
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [partySize, setPartySize] = useState(mode === "TABLE" ? 4 : mode === "EVENT" ? 12 : 2);
  const [eventDate, setEventDate] = useState(() => venueDayKey(venueTimeZone));
  const [eventStartTime, setEventStartTime] = useState(defaultStartTime);
  const [eventEndTime, setEventEndTime] = useState(defaultEndTime);
  const [zone, setZone] = useState<SeatingZone>("INDOOR");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [success, setSuccess] = useState<{
    message: string;
    statusPath?: string;
  } | null>(null);

  useEffect(() => {
    if (initialResourceId) {
      setResourceCategoryId(initialResourceId);
      return;
    }
    if (areaOptions.length && !areaOptions.some((o) => o.id === resourceCategoryId)) {
      setResourceCategoryId(areaOptions[0]?.id ?? "");
    }
  }, [initialResourceId, areaOptions, resourceCategoryId]);

  const useDigitalAreas = areaOptions.length > 0;
  const showLegacyZone = !useDigitalAreas && mode !== "GAMING";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const preferredStartsAt = combineLocalDateTime(eventDate, eventStartTime);
    const preferredEndsAt = combineLocalDateTime(eventDate, eventEndTime);

    if (!guestName.trim()) {
      setError(t("venuePage.booking.nameRequired"));
      return;
    }
    if (!guestEmail.trim() && !guestPhone.trim()) {
      setError(t("publicBooking.replyRequired"));
      return;
    }
    if (!preferredStartsAt) {
      setError(t("publicBooking.pickDateStart"));
      return;
    }
    if (preferredEndsAt && preferredEndsAt <= preferredStartsAt) {
      setError(t("publicBooking.endAfterStart"));
      return;
    }
    if ((mode === "GAMING" || (mode === "EVENT" && useDigitalAreas)) && !resourceCategoryId) {
      setError(
        mode === "GAMING"
          ? t("publicBooking.selectActivity")
          : t("publicBooking.selectAreaOrActivity"),
      );
      return;
    }
    if (mode === "TABLE" && useDigitalAreas && !resourceCategoryId) {
      setError(t("publicBooking.selectDiningArea"));
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
      const resolvedType: EventRequestType =
        mode === "EVENT" ? eventType : mode === "TABLE" ? "TABLE" : "GAMING";
      const res = await submitPublicEventRequest(
        slug,
        withCaptchaToken(
          {
            eventType: resolvedType,
            guestName: guestName.trim(),
            guestEmail: guestEmail.trim() || undefined,
            guestPhone: guestPhone.trim() || undefined,
            partySize,
            preferredStartsAt,
            preferredEndsAt,
            zone: showLegacyZone ? zone : undefined,
            message: message.trim() || undefined,
            resourceCategoryId:
              useDigitalAreas || mode === "GAMING"
                ? resourceCategoryId || undefined
                : undefined,
            privacyConsentAccepted: true,
          },
          captchaToken,
        ),
      );
      setSuccess({
        message: res.message,
        statusPath: res.statusPath,
      });
      setGuestName("");
      setGuestEmail("");
      setGuestPhone("");
      setMessage("");
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("publicBooking.sendFailed"));
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    const trackHref = safeStatusPathHref(success.statusPath);
    return (
      <div
        className={cn(
          "rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-6 text-center",
          className,
        )}
      >
        <CheckCircle2 className="mx-auto text-emerald-400" size={32} />
        <p className="mt-3 text-sm font-medium text-emerald-100">{success.message}</p>
        {trackHref ? (
          <Link
            href={trackHref}
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            {t("publicBooking.trackRequest")}
          </Link>
        ) : null}
        <p className="mt-3 text-xs text-emerald-200/70">
          {t("publicBooking.statusLinkHint")}
        </p>
        <button
          type="button"
          onClick={() => setSuccess(null)}
          className="mt-4 text-xs text-emerald-300 underline"
        >
          {t("publicBooking.submitAnother")}
        </button>
      </div>
    );
  }

  const partyLabel =
    mode === "GAMING"
      ? t("publicBooking.players")
      : mode === "TABLE"
        ? t("publicBooking.guests")
        : t("publicBooking.partySize");

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" size={22} />
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-foreground)]">
            {title ?? modeTitle}
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            {description ?? modeDesc}
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {mode === "EVENT" ? (
          <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
            {t("publicBooking.eventType")}
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventRequestType)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
            >
              {PRIVATE_EVENT_REQUEST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`guestStatus.event.type.${type}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {useDigitalAreas ? (
          <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
            {mode === "GAMING"
              ? t("publicBooking.activity")
              : mode === "TABLE"
                ? t("publicBooking.diningArea")
                : t("publicBooking.preferredAreaActivity")}
            <select
              value={resourceCategoryId}
              onChange={(e) => setResourceCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
            >
              {areaOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.unitCount != null
                    ? t("publicBooking.unitsSuffix", { n: o.unitCount })
                    : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          {t("venuePage.booking.yourName")}
          <input
            required
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          {partyLabel}
          <input
            type="number"
            min={1}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value) || 1)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          {t("venuePage.contact.phone")}
          <input
            type="tel"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          {t("venuePage.booking.email")}
          <input
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <p className="text-[11px] text-zinc-600 sm:col-span-2">
          {t("publicBooking.reachHint")}
        </p>

        {showLegacyZone ? (
          <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
            {t("publicBooking.preferredArea")}
            <div className="mt-1 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-0.5">
              {SEATING_ZONES.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZone(z)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-2 text-xs font-medium transition",
                    zone === z
                      ? "bg-amber-500/20 text-amber-800 dark:text-amber-100"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300",
                  )}
                >
                  {z === "OUTDOOR"
                    ? t("publicBooking.zoneOutdoor")
                    : t("publicBooking.zoneIndoor")}
                </button>
              ))}
            </div>
          </label>
        ) : null}

        <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
          {t("publicBooking.preferredDate")}
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          {t("publicBooking.startTime")}
          <input
            type="time"
            value={eventStartTime}
            onChange={(e) => setEventStartTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          {t("publicBooking.endTime")}
          <input
            type="time"
            value={eventEndTime}
            onChange={(e) => setEventEndTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
          {mode === "TABLE"
            ? t("publicBooking.notesTable")
            : mode === "GAMING"
              ? t("publicBooking.notesGaming")
              : t("publicBooking.notesEvent")}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder={
              mode === "TABLE"
                ? t("publicBooking.notesTablePlaceholder")
                : mode === "GAMING"
                  ? t("publicBooking.notesGamingPlaceholder")
                  : t("publicBooking.notesEventPlaceholder")
            }
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
      </div>

      <PublicCaptchaWidget
        className="mt-4"
        onTokenChange={setCaptchaToken}
        resetKey={captchaReset}
      />

      <div className="mt-3">
        <PrivacyConsentCheckbox
          checked={privacyConsent}
          onChange={setPrivacyConsent}
          label={t("venuePage.privacyConsent.label")}
          disabled={busy}
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 py-2.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 sm:w-auto sm:px-6"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
        {t("publicBooking.sendRequest")}
      </button>
    </form>
  );
}

/** @deprecated use PublicBookingRequestForm */
export function PublicEventRequestForm(
  props: Omit<PublicBookingRequestFormProps, "mode">,
) {
  return <PublicBookingRequestForm {...props} mode="EVENT" />;
}

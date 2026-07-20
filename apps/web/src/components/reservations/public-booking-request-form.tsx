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
import { cn } from "@/lib/cn";
import {
  EVENT_REQUEST_TYPE_LABELS,
  PRIVATE_EVENT_REQUEST_TYPES,
  submitPublicEventRequest,
  type EventRequestType,
} from "@/lib/event-requests-client";
import {
  combineLocalDateTime,
  defaultEventTimes,
  todayDateInput,
} from "@/lib/seating-event-datetime";
import {
  SEATING_ZONE_LABELS,
  SEATING_ZONES,
  type SeatingZone,
} from "@/lib/seating-zone";

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
};

const MODE_META: Record<
  BookingFormMode,
  { title: string; description: string; icon: typeof CalendarCheck }
> = {
  TABLE: {
    title: "Request a table",
    description:
      "Pick a date, time, and party size. The venue confirms availability before your visit.",
    icon: CalendarCheck,
  },
  GAMING: {
    title: "Book an activity",
    description:
      "Reserve bowling, billiards, gaming stations, and more. Staff will confirm your slot.",
    icon: Gamepad2,
  },
  EVENT: {
    title: "Request a private event",
    description:
      "Birthdays, meetings, parties — tell us what you need. The venue reviews every request against their live floor.",
    icon: PartyPopper,
  },
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
}: PublicBookingRequestFormProps) {
  const meta = MODE_META[mode];
  const Icon = meta.icon;

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
  const [eventDate, setEventDate] = useState(todayDateInput());
  const [eventStartTime, setEventStartTime] = useState(defaultStartTime);
  const [eventEndTime, setEventEndTime] = useState(defaultEndTime);
  const [zone, setZone] = useState<SeatingZone>("INDOOR");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError("Your name is required.");
      return;
    }
    if (!guestEmail.trim() && !guestPhone.trim()) {
      setError("Please provide an email or phone number so the venue can reply.");
      return;
    }
    if (!preferredStartsAt) {
      setError("Pick a date and start time.");
      return;
    }
    if (preferredEndsAt && preferredEndsAt <= preferredStartsAt) {
      setError("End time must be after start time.");
      return;
    }
    if ((mode === "GAMING" || (mode === "EVENT" && useDigitalAreas)) && !resourceCategoryId) {
      setError(
        mode === "GAMING"
          ? "Select an activity to book."
          : "Select a dining area or activity for your event.",
      );
      return;
    }
    if (mode === "TABLE" && useDigitalAreas && !resourceCategoryId) {
      setError("Select a dining area.");
      return;
    }

    setBusy(true);
    try {
      const resolvedType: EventRequestType =
        mode === "EVENT" ? eventType : mode === "TABLE" ? "TABLE" : "GAMING";
      const res = await submitPublicEventRequest(slug, {
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
      });
      setSuccess({
        message: res.message,
        statusPath: res.statusPath,
      });
      setGuestName("");
      setGuestEmail("");
      setGuestPhone("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div
        className={cn(
          "rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-6 text-center",
          className,
        )}
      >
        <CheckCircle2 className="mx-auto text-emerald-400" size={32} />
        <p className="mt-3 text-sm font-medium text-emerald-100">{success.message}</p>
        {success.statusPath ? (
          <Link
            href={success.statusPath}
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Track your request
          </Link>
        ) : null}
        <p className="mt-3 text-xs text-emerald-200/70">
          Save the status link — you can cancel from there while the request is
          still pending or before the approved event starts.
        </p>
        <button
          type="button"
          onClick={() => setSuccess(null)}
          className="mt-4 text-xs text-emerald-300 underline"
        >
          Submit another request
        </button>
      </div>
    );
  }

  const partyLabel =
    mode === "GAMING" ? "Players" : mode === "TABLE" ? "Guests" : "Party size";

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
            {title ?? meta.title}
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            {description ?? meta.description}
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
            Event type
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventRequestType)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
            >
              {PRIVATE_EVENT_REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_REQUEST_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {useDigitalAreas ? (
          <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
            {mode === "GAMING"
              ? "Activity"
              : mode === "TABLE"
                ? "Dining area"
                : "Preferred dining area / activity"}
            <select
              value={resourceCategoryId}
              onChange={(e) => setResourceCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
            >
              {areaOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.unitCount != null ? ` · ${o.unitCount} units` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          Your name
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
          Phone
          <input
            type="tel"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          Email
          <input
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <p className="text-[11px] text-zinc-600 sm:col-span-2">
          Provide at least one way to reach you.
        </p>

        {showLegacyZone ? (
          <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
            Preferred area
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
                  {SEATING_ZONE_LABELS[z]}
                </button>
              ))}
            </div>
          </label>
        ) : null}

        <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
          Preferred date
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          Start time
          <input
            type="time"
            value={eventStartTime}
            onChange={(e) => setEventStartTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          End time
          <input
            type="time"
            value={eventEndTime}
            onChange={(e) => setEventEndTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
          {mode === "TABLE"
            ? "Notes for the venue"
            : mode === "GAMING"
              ? "Anything we should know?"
              : "Tell us about your event"}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder={
              mode === "TABLE"
                ? "High chair, window seat, birthday setup…"
                : mode === "GAMING"
                  ? "Lane preference, game titles, skill level…"
                  : "Birthday for 12, need projector, dietary needs…"
            }
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-base text-[var(--color-foreground)] outline-none focus:border-amber-500/40 sm:text-sm"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 py-2.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 sm:w-auto sm:px-6"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
        Send request
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

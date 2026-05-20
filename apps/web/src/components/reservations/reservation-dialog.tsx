"use client";

import { Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  ACTIVE_BOOKING_STATUSES,
  addMinutesToTime,
  combineDateAndTime,
  splitDateAndTime,
  validateBookingWindow,
} from "@/lib/booking-time";
import {
  getBookingUnitKind,
  getBookingUnitLabels,
} from "@/lib/booking-unit-kind";
import type { Reservation, ReservationStatus } from "@/lib/reservations-client";
import type { ResourceCatalog } from "@/lib/resources-client";
import { RESOURCE_TYPE_LABELS } from "@/lib/resource-types";

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
  const units = catalog.categories.flatMap((c) =>
    c.resources.map((r) => ({
      ...r,
      categoryName: c.name,
      categoryType: c.type,
      slotMinutes: c.slotMinutes,
      unitKind: getBookingUnitKind(c.type),
    })),
  );

  const [resourceId, setResourceId] = useState(
    initial?.resourceId ?? defaultUnitId ?? units[0]?.id ?? "",
  );
  const [guestName, setGuestName] = useState(initial?.guestName ?? "");
  const [guestEmail, setGuestEmail] = useState(initial?.guestEmail ?? "");
  const [guestPhone, setGuestPhone] = useState(initial?.guestPhone ?? "");
  const [partySize, setPartySize] = useState(String(initial?.partySize ?? 1));
  const [status, setStatus] = useState<ReservationStatus>(
    initial?.status === "CHECKED_IN" ? "CHECKED_IN" : "CONFIRMED",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
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
  const unitLabels = getBookingUnitLabels(selected?.unitKind ?? "UNIT");
  const slotMinutes = selected?.slotMinutes ?? 60;

  const overlapHint = useMemo(() => {
    if (!resourceId || !date) return null;
    const err = validateBookingWindow(date, startTime, endTime);
    if (err) return err;
    const start = combineDateAndTime(date, startTime);
    const end = combineDateAndTime(date, endTime);
    const clash = existingBookings.find(
      (b) =>
        b.id !== initial?.id &&
        ACTIVE_BOOKING_STATUSES.includes(b.status) &&
        start < new Date(b.endsAt) &&
        end > new Date(b.startsAt),
    );
    if (clash) {
      return "This unit already has a booking in that time range.";
    }
    return null;
  }, [
    resourceId,
    date,
    startTime,
    endTime,
    existingBookings,
    initial?.id,
  ]);

  function applyStartTime(next: string) {
    setStartTime(next);
    setEndTime(addMinutesToTime(next, slotMinutes));
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
        <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl sm:rounded-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              {initial ? "Edit booking" : "New booking"}
            </h2>
            <button type="button" onClick={onClose} className="text-zinc-400">
              <X size={18} />
            </button>
          </div>

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
              const windowErr = validateBookingWindow(date, startTime, endTime);
              if (windowErr) {
                setFeedback({ variant: "error", message: windowErr });
                return;
              }
              if (overlapHint) {
                setFeedback({ variant: "error", message: overlapHint });
                return;
              }
              const startsAt = combineDateAndTime(date, startTime).toISOString();
              const endsAt = combineDateAndTime(date, endTime).toISOString();
              setFeedback(null);
              void onSave({
                resourceId,
                guestName: guestName.trim(),
                guestEmail: guestEmail.trim() || undefined,
                guestPhone: guestPhone.trim() || undefined,
                partySize: parseInt(partySize, 10) || 1,
                startsAt,
                endsAt,
                status,
                staffAlert,
                notes: notes.trim() || undefined,
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
                  const catUnits = units.filter((u) =>
                    cat.resources.some((r) => r.id === u.id),
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

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-zinc-500">
                Start time
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => applyStartTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-zinc-500">
                End time
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-sm text-white"
                />
              </label>
            </div>
            <p className="text-[10px] text-zinc-600">
              Same-day only · end must be after start · default slot{" "}
              {slotMinutes} min · no overlapping bookings on one unit
            </p>

            <label className="block text-xs text-zinc-500">
              Guest name
              <input
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="block text-xs text-zinc-500">
              Session status
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as ReservationStatus)
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                <option value="CONFIRMED">Scheduled — not in use yet</option>
                <option value="CHECKED_IN">In use — unit unavailable now</option>
              </select>
            </label>

            <label className="block text-xs text-zinc-500">
              {unitLabels.countLabel}
              <input
                type="number"
                min={1}
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>

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

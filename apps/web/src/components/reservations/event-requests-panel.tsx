"use client";

import {
  Check,
  Loader2,
  PartyPopper,
  Phone,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  cancelEventRequest,
  createStaffEventRequest,
  eventRequestSourceLabel,
  eventRequestStatusLabel,
  eventRequestTypeLabel,
  EVENT_REQUEST_TYPES,
  fetchEventRequests,
  reviewEventRequest,
  type EventRequest,
  type EventRequestStatus,
  type EventRequestType,
} from "@/lib/event-requests-client";
import {
  combineLocalDateTime,
  defaultEventTimes,
  formatEventWindow,
} from "@/lib/seating-event-datetime";
import {
  resolveVenueTimeZone,
  venueDayKey,
} from "@/lib/venue-timezone";
import {
  SEATING_ZONE_LABELS,
  SEATING_ZONES,
  type SeatingZone,
} from "@/lib/seating-zone";
import { publishLiveEvent } from "@/lib/live-events";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

const { start: defaultStartTime, end: defaultEndTime } = defaultEventTimes();

type Filter = "PENDING" | "ALL";

function initialLogDraft(eventDate: string) {
  return {
    eventType: "BIRTHDAY" as EventRequestType,
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    partySize: 10,
    eventDate,
    eventStartTime: defaultStartTime,
    eventEndTime: defaultEndTime,
    zone: "INDOOR" as SeatingZone,
    message: "",
  };
}

export function EventRequestsPanel({ canWrite }: { canWrite: boolean }) {
  const vs = useVenueSettingsOptional();
  const t = vs?.t ?? ((k: string) => k);
  const venueTimeZone = resolveVenueTimeZone({
    timezone: vs?.shop?.timezone,
    locale: vs?.shop?.locale ?? vs?.locale,
  });
  const venueToday = venueDayKey(venueTimeZone);
  const [requests, setRequests] = useState<EventRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logDraft, setLogDraft] = useState(() => initialLogDraft(venueToday));
  const [declineTarget, setDeclineTarget] = useState<EventRequest | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchEventRequests(
          filter === "PENDING" ? { status: "PENDING" } : undefined,
        );
        setRequests(data.requests);
        setPendingCount(data.pendingCount);
        return true;
      } catch (e) {
        if (!opts.silent) {
          setError(
            e instanceof Error ? e.message : t("eventRequests.loadFailed"),
          );
        }
        return false;
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [filter, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(() => load({ silent: true }), [filter], {
    intervalMs: 10_000,
    refreshOnSections: ["reservation"],
  });

  async function logPhoneRequest() {
    if (!canWrite) return;
    const preferredStartsAt = combineLocalDateTime(
      logDraft.eventDate,
      logDraft.eventStartTime,
    );
    const preferredEndsAt = combineLocalDateTime(
      logDraft.eventDate,
      logDraft.eventEndTime,
    );
    if (!logDraft.guestName.trim()) {
      setError(t("eventRequests.guestNameRequired"));
      return;
    }
    if (!preferredStartsAt) {
      setError(t("eventRequests.pickDateAndTime"));
      return;
    }
    setBusyId("log");
    try {
      await createStaffEventRequest({
        eventType: logDraft.eventType,
        source: "PHONE",
        guestName: logDraft.guestName.trim(),
        guestEmail: logDraft.guestEmail.trim() || undefined,
        guestPhone: logDraft.guestPhone.trim() || undefined,
        partySize: logDraft.partySize,
        preferredStartsAt,
        preferredEndsAt,
        zone: logDraft.zone,
        message: logDraft.message.trim() || undefined,
      });
      setShowLogForm(false);
      setLogDraft(initialLogDraft(venueToday));
      await load();
      publishLiveEvent({ section: "reservation" });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("eventRequests.logRequestFailed"),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function approve(request: EventRequest) {
    if (!canWrite) return;
    setBusyId(request.id);
    try {
      await reviewEventRequest(request.id, {
        action: "approve",
        // Legacy seating blocks only when guest did not pick a digital offering.
        createFloorBlock: !request.resourceCategoryId,
        floorBlockLabel: `${eventRequestTypeLabel(request.eventType, t)} — ${request.guestName}`,
      });
      await load();
      publishLiveEvent({ section: "reservation" });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("eventRequests.approveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function submitDecline() {
    if (!declineTarget || !canWrite) return;
    const note = declineNote.trim();
    if (!note) {
      setError(t("eventRequests.declineNoteRequired"));
      return;
    }
    setBusyId(declineTarget.id);
    try {
      await reviewEventRequest(declineTarget.id, {
        action: "decline",
        staffResponseNote: note,
      });
      setDeclineTarget(null);
      setDeclineNote("");
      await load();
      publishLiveEvent({ section: "reservation" });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("eventRequests.declineFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(request: EventRequest) {
    if (
      !canWrite ||
      !confirm(t("eventRequests.removeConfirm", { guest: request.guestName }))
    ) {
      return;
    }
    setBusyId(request.id);
    try {
      await cancelEventRequest(request.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("eventRequests.removeFailed"));
    } finally {
      setBusyId(null);
    }
  }

  const visible = filter === "PENDING"
    ? requests.filter((r) => r.status === "PENDING")
    : requests;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
        <div className="flex items-start gap-3">
          <PartyPopper className="mt-0.5 shrink-0 text-violet-300" size={20} />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-white">
              {t("eventRequests.bannerTitle")}
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-zinc-400">
              <li>
                <span className="text-violet-200">
                  {t("eventRequests.bannerInboxLabel")}
                </span>{" "}
                — {t("eventRequests.bannerInboxText")}
              </li>
              <li>
                <span className="text-amber-200">
                  {t("eventRequests.bannerDiningLabel")}
                </span>{" "}
                — {t("eventRequests.bannerDiningTextPrefix")}{" "}
                <strong className="font-medium text-zinc-300">
                  {t("eventRequests.bannerDiningTabName")}
                </strong>{" "}
                {t("eventRequests.bannerDiningTextSuffix")}
              </li>
            </ul>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            {t("eventRequests.dismiss")}
          </button>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-white/10 bg-zinc-950/80 p-1">
          {(
            [
              { id: "PENDING" as const, label: t("eventRequests.filterPending") },
              { id: "ALL" as const, label: t("eventRequests.filterAll") },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                filter === id
                  ? "bg-violet-500/20 text-violet-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {label}
              {id === "PENDING" && pendingCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-violet-500/30 px-1.5 py-0.5 text-[10px]">
                  {pendingCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setShowLogForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/5"
          >
            <Phone size={14} />
            {t("eventRequests.logPhoneRequest")}
            <Plus
              size={12}
              className={cn("transition", showLogForm && "rotate-45")}
            />
          </button>
        ) : null}
      </div>

      {showLogForm && canWrite ? (
        <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
          <p className="text-sm font-medium text-white">
            {t("eventRequests.logFormTitle")}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {t("eventRequests.logFormSubtitle")}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400 sm:col-span-2">
              {t("eventRequests.fieldEventType")}
              <select
                value={logDraft.eventType}
                onChange={(e) =>
                  setLogDraft((d) => ({
                    ...d,
                    eventType: e.target.value as EventRequestType,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              >
                {EVENT_REQUEST_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {eventRequestTypeLabel(type, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-zinc-400">
              {t("eventRequests.fieldGuestName")}
              <input
                value={logDraft.guestName}
                onChange={(e) =>
                  setLogDraft((d) => ({ ...d, guestName: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              {t("eventRequests.fieldPartySize")}
              <input
                type="number"
                min={1}
                value={logDraft.partySize}
                onChange={(e) =>
                  setLogDraft((d) => ({
                    ...d,
                    partySize: Number(e.target.value) || 1,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              {t("eventRequests.fieldPhone")}
              <input
                value={logDraft.guestPhone}
                onChange={(e) =>
                  setLogDraft((d) => ({ ...d, guestPhone: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              {t("eventRequests.fieldEmail")}
              <input
                type="email"
                value={logDraft.guestEmail}
                onChange={(e) =>
                  setLogDraft((d) => ({ ...d, guestEmail: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400 sm:col-span-2">
              {t("eventRequests.fieldPreferredArea")}
              <div className="mt-1 flex gap-1 rounded-lg border border-white/10 bg-zinc-950/80 p-0.5">
                {SEATING_ZONES.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setLogDraft((d) => ({ ...d, zone: z }))}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition",
                      logDraft.zone === z
                        ? "bg-white/10 text-white"
                        : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    {SEATING_ZONE_LABELS[z]}
                  </button>
                ))}
              </div>
            </label>
            <label className="block text-xs text-zinc-400 sm:col-span-2">
              {t("eventRequests.fieldDate")}
              <input
                type="date"
                value={logDraft.eventDate}
                onChange={(e) =>
                  setLogDraft((d) => ({ ...d, eventDate: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              {t("eventRequests.fieldStart")}
              <input
                type="time"
                value={logDraft.eventStartTime}
                onChange={(e) =>
                  setLogDraft((d) => ({ ...d, eventStartTime: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              {t("eventRequests.fieldEnd")}
              <input
                type="time"
                value={logDraft.eventEndTime}
                onChange={(e) =>
                  setLogDraft((d) => ({ ...d, eventEndTime: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-400 sm:col-span-2">
              {t("eventRequests.fieldDetails")}
              <textarea
                value={logDraft.message}
                onChange={(e) =>
                  setLogDraft((d) => ({ ...d, message: e.target.value }))
                }
                rows={2}
                placeholder={t("eventRequests.detailsPlaceholder")}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busyId === "log"}
              onClick={() => void logPhoneRequest()}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {t("eventRequests.saveToInbox")}
            </button>
            <button
              type="button"
              onClick={() => setShowLogForm(false)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400"
            >
              {t("eventRequests.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-zinc-500">
          {filter === "PENDING"
            ? t("eventRequests.emptyPending")
            : t("eventRequests.emptyAll")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((request) => (
            <EventRequestCard
              key={request.id}
              request={request}
              canWrite={canWrite}
              busy={busyId === request.id}
              t={t}
              onApprove={() => void approve(request)}
              onDecline={() => {
                setDeclineTarget(request);
                setDeclineNote("");
              }}
              onDismiss={() => void dismiss(request)}
            />
          ))}
        </div>
      )}

      {declineTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[min(90dvh,32rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-white">
              {t("eventRequests.declineTitle", {
                guest: declineTarget.guestName,
              })}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              {t("eventRequests.declineSubtitle")}
            </p>
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              rows={3}
              placeholder={t("eventRequests.declinePlaceholder")}
              className="mt-3 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              autoFocus
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeclineTarget(null)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400"
              >
                {t("eventRequests.cancel")}
              </button>
              <button
                type="button"
                disabled={busyId === declineTarget.id}
                onClick={() => void submitDecline()}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {t("eventRequests.declineRequestBtn")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function statusStyles(status: EventRequestStatus) {
  switch (status) {
    case "PENDING":
      return "border-amber-400/30 bg-amber-500/10 text-amber-200";
    case "APPROVED":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "DECLINED":
      return "border-rose-400/30 bg-rose-500/10 text-rose-200";
    default:
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
  }
}

function EventRequestCard({
  request,
  canWrite,
  busy,
  onApprove,
  onDecline,
  onDismiss,
  t,
}: {
  request: EventRequest;
  canWrite: boolean;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onDismiss: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const schedule = formatEventWindow(
    request.preferredStartsAt,
    request.preferredEndsAt,
  );

  return (
    <article className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">
            {request.guestName}
          </h3>
          <p className="text-[11px] text-zinc-500">
            {eventRequestTypeLabel(request.eventType, t)} · {request.partySize}{" "}
            {t("eventRequests.guestsSuffix")}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
            statusStyles(request.status),
          )}
        >
          {eventRequestStatusLabel(request.status, t)}
        </span>
      </div>

      {schedule ? (
        <p className="mt-2 text-xs text-violet-200/90">{schedule}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-zinc-400">
          {eventRequestSourceLabel(request.source, t)}
        </span>
        {request.resourceCategory ? (
          <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-amber-100">
            {request.resourceCategory.name}
            {request.resourceCategory.type === "DINING"
              ? ` ${t("eventRequests.diningSuffix")}`
              : ""}
          </span>
        ) : null}
        {request.zone ? (
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-zinc-400">
            {SEATING_ZONE_LABELS[request.zone]}
          </span>
        ) : null}
      </div>

      {request.message ? (
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          {request.message}
        </p>
      ) : null}

      {(request.guestPhone || request.guestEmail) && (
        <p className="mt-2 text-[11px] text-zinc-500">
          {[request.guestPhone, request.guestEmail].filter(Boolean).join(" · ")}
        </p>
      )}

      {request.staffResponseNote && request.status === "DECLINED" ? (
        <p className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-2 py-1.5 text-[11px] text-rose-200/90">
          {t("eventRequests.declinedNote", { note: request.staffResponseNote })}
        </p>
      ) : null}

      {request.status === "APPROVED" && request.seatingTableGroupId ? (
        <p
          className="mt-2 text-[11px] text-emerald-300/80"
          title={t("eventRequests.floorBlockHint")}
        >
          {t("eventRequests.floorBlockLabel")} — {t("eventRequests.floorBlockHint")}
        </p>
      ) : null}

      {request.status === "APPROVED" &&
      request.resourceCategory?.type === "DINING" ? (
        <p className="mt-2 text-[11px] text-amber-200/80">
          {t("eventRequests.reserveTablesHint")}
        </p>
      ) : null}

      {canWrite && request.status === "PENDING" ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={onApprove}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Check size={12} />
            )}
            {request.resourceCategory?.type === "DINING"
              ? t("eventRequests.acceptBookNext")
              : t("eventRequests.accept")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDecline}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
          >
            <X size={12} />
            {t("eventRequests.decline")}
          </button>
        </div>
      ) : null}

      {canWrite && request.status !== "PENDING" ? (
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="mt-3 text-[11px] text-zinc-600 hover:text-zinc-400"
        >
          {t("eventRequests.removeFromList")}
        </button>
      ) : null}
    </article>
  );
}

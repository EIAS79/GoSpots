"use client";

import { Loader2, UserX, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  combineDateAndTime,
  splitDateAndTime,
  validateBookingWindow,
} from "@/lib/booking-time";
import {
  cancelPlayBilling,
  updatePlayBilling,
  type PlayBillingItem,
} from "@/lib/play-billing-client";
import type { ResourceCatalog } from "@/lib/resources-client";
import { RESOURCE_TYPE_LABELS } from "@/lib/resource-types";

export function PlayBillingEditDialog({
  item,
  catalog,
  onClose,
  onSaved,
}: {
  item: PlayBillingItem;
  catalog: ResourceCatalog;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const units = useMemo(
    () =>
      catalog.categories.flatMap((c) =>
        c.resources.map((r) => ({
          id: r.id,
          name: r.name,
          categoryName: c.name,
          typeLabel: RESOURCE_TYPE_LABELS[c.type],
        })),
      ),
    [catalog],
  );

  const startParts = splitDateAndTime(item.startsAt);
  const endParts = splitDateAndTime(item.endsAt);

  const [resourceId, setResourceId] = useState(item.resource.id);
  const [guestName, setGuestName] = useState(item.guestName);
  const [partySize, setPartySize] = useState(String(item.partySize));
  const [date, setDate] = useState(startParts.date);
  const [startTime, setStartTime] = useState(startParts.time);
  const [endTime, setEndTime] = useState(endParts.time);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [customCharge, setCustomCharge] = useState(
    item.billedAmount != null ? String(item.billedAmount) : "",
  );
  const [clearPaid, setClearPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const windowErr = useMemo(
    () => validateBookingWindow(date, startTime, endTime),
    [date, startTime, endTime],
  );

  const displayAmount = item.isPaid
    ? (item.billedAmount ?? item.computedAmount)
    : customCharge.trim()
      ? Number(customCharge)
      : item.computedAmount;

  async function handleSave() {
    if (!guestName.trim() || !resourceId) return;
    if (windowErr) {
      setFeedback(windowErr);
      return;
    }
    const startsAt = combineDateAndTime(date, startTime).toISOString();
    const endsAt = combineDateAndTime(date, endTime).toISOString();
    const parsedParty = Math.max(1, parseInt(partySize, 10) || 1);
    let amountOverride: number | null | undefined;
    if (customCharge.trim() === "") {
      amountOverride = item.billedAmount != null ? null : undefined;
    } else {
      const n = Number(customCharge);
      if (Number.isNaN(n) || n < 0) {
        setFeedback("Enter a valid charge amount.");
        return;
      }
      amountOverride = n;
    }

    setSaving(true);
    setFeedback(null);
    try {
      await updatePlayBilling(item.id, {
        guestName: guestName.trim(),
        resourceId,
        partySize: parsedParty,
        startsAt,
        endsAt,
        notes: notes.trim() || null,
        amountOverride,
        clearPaid: item.isPaid && clearPaid ? true : undefined,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleNoShow() {
    setSaving(true);
    setFeedback(null);
    try {
      await cancelPlayBilling(item.id, { reason: "NO_SHOW" });
      await onSaved();
      onClose();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Could not cancel booking.");
    } finally {
      setSaving(false);
      setConfirmNoShow(false);
    }
  }

  return (
    <>
      <ModalPortal>
        <div className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Edit session</h2>
              <button type="button" onClick={onClose} className="text-zinc-400">
                <X size={18} />
              </button>
            </div>

            {feedback ? (
              <FeedbackBanner
                variant="error"
                message={feedback}
                onDismiss={() => setFeedback(null)}
                className="mb-3"
              />
            ) : null}

            {windowErr && !feedback ? (
              <FeedbackBanner
                variant="error"
                message={windowErr}
                className="mb-3"
              />
            ) : null}

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
            >
              <label className="block text-xs text-zinc-500">
                Guest
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  required
                />
              </label>

              <label className="block text-xs text-zinc-500">
                Game / unit
                <select
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.categoryName} ({u.typeLabel})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-zinc-500">
                Date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  required
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-zinc-500">
                  Start
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                    required
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  End
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                    required
                  />
                </label>
              </div>

              <label className="block text-xs text-zinc-500">
                Party size
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
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>

              <label className="block text-xs text-zinc-500">
                Custom charge (optional)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={customCharge}
                  onChange={(e) => setCustomCharge(e.target.value)}
                  placeholder={String(item.computedAmount)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
                <span className="mt-1 block text-[10px] text-zinc-600">
                  Leave empty to use Gaming setup rates (
                  {item.rateLabel}). Current estimate: {displayAmount}
                </span>
              </label>

              {item.isPaid ? (
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={clearPaid}
                    onChange={(e) => setClearPaid(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  Undo paid — move back to awaiting payment
                </label>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving || !!windowErr}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={16} className="mx-auto animate-spin" />
                  ) : (
                    "Save changes"
                  )}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmNoShow(true)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-400/30 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  <UserX size={14} />
                  No-show
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>

      <ConfirmDialog
        open={confirmNoShow}
        title="Mark as no-show?"
        description="The guest did not show up. This removes the booking from play billing and frees the unit."
        confirmLabel="No-show"
        variant="danger"
        onConfirm={() => void handleNoShow()}
        onCancel={() => setConfirmNoShow(false)}
      />
    </>
  );
}

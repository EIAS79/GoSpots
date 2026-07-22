"use client";

import { Loader2, Trash2, UserX, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  combineDateAndTime,
  splitDateAndTime,
  validateBookingWindow,
} from "@/lib/booking-time";
import {
  applyBillingTotal,
  cancelPlayBilling,
  cancelWalkIn,
  updatePlayBilling,
  updateWalkIn,
  type PlayBillingItem,
} from "@/lib/play-billing-client";
import type { ResourceCatalog } from "@/lib/resources-client";
import { bookingCollectsPartySize } from "@/lib/booking-unit-kind";
import type { ResourceType } from "@/lib/resource-types";
import { coerceMoney } from "@/lib/money";
import { useVenueSettings } from "@/lib/venue-settings-context";

export function GameBillingEditDialog({
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
  const { formatMoney, t } = useVenueSettings();
  const isWalkIn = item.source === "walk_in";

  const units = useMemo(
    () =>
      catalog.categories.flatMap((c) =>
        c.resources.map((r) => ({
          id: r.id,
          name: r.name,
          categoryName: c.name,
          categoryType: c.type as ResourceType,
          bookingMode: c.bookingMode,
          offeringConfig: c.offeringConfig,
          rates: c.rates,
          slotMinutes: c.slotMinutes,
        })),
      ),
    [catalog],
  );

  const startParts = splitDateAndTime(item.startsAt);
  const endParts = splitDateAndTime(item.endsAt);

  const [resourceId, setResourceId] = useState(item.resource?.id ?? "");
  const [guestName, setGuestName] = useState(item.guestName);
  const [partySize, setPartySize] = useState(String(item.partySize));
  const [date, setDate] = useState(startParts.date);
  const [startTime, setStartTime] = useState(startParts.time);
  const [endTime, setEndTime] = useState(endParts.time);
  const [durationMinutes, setDurationMinutes] = useState(
    String(item.durationMinutes),
  );
  const [notes, setNotes] = useState(item.notes ?? "");
  const [baseCharge, setBaseCharge] = useState(
    String(item.baseAmount ?? item.computedAmount),
  );
  const [discountPercent, setDiscountPercent] = useState(
    String(item.discountPercent ?? 0),
  );
  const [clearPaid, setClearPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const selectedUnit = units.find((u) => u.id === resourceId);
  const billingNotes =
    item.source === "walk_in" &&
    selectedUnit?.categoryType === "BOWLING" &&
    !item.notes
      ? selectedUnit.bookingMode === "PERSON"
        ? "[Bowling · per person]"
        : "[Bowling · time slot]"
      : item.notes;
  const showPartyField =
    selectedUnit != null
      ? bookingCollectsPartySize(selectedUnit.categoryType, {
          bookingMode: selectedUnit.bookingMode,
          notes: billingNotes,
          offeringConfig: selectedUnit.offeringConfig,
          categoryRates: selectedUnit.rates,
          slotMinutes: selectedUnit.slotMinutes,
        })
      : (item.collectsPartySize ?? false);

  const windowErr = useMemo(
    () =>
      isWalkIn ? null : validateBookingWindow(date, startTime, endTime),
    [isWalkIn, date, startTime, endTime],
  );

  const parsedDiscount = Math.min(
    100,
    Math.max(0, parseFloat(discountPercent) || 0),
  );

  const parsedBase = Math.max(0, parseFloat(baseCharge) || 0);

  const previewAmount = applyBillingTotal(parsedBase, parsedDiscount);

  const usesRateAmount =
    !isWalkIn &&
    Math.abs(parsedBase - coerceMoney(item.computedAmount)) < 0.005 &&
    item.baseAmount == null;

  async function handleSave() {
    if (!guestName.trim()) return;
    if (!isWalkIn && windowErr) {
      setFeedback(windowErr);
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const baseNum = parsedBase;
      if (Number.isNaN(baseNum) || baseNum < 0) {
        setFeedback(t("finance.playValidCharge"));
        setSaving(false);
        return;
      }

      if (isWalkIn) {
        await updateWalkIn(item.id, {
          resourceId: resourceId || null,
          playerCount: showPartyField
            ? Math.max(1, parseInt(partySize, 10) || 1)
            : 1,
          durationMinutes: Math.max(1, parseInt(durationMinutes, 10) || 60),
          amount: baseNum,
          discountPercent: parsedDiscount,
          label: guestName.trim(),
          note: notes.trim() || null,
          clearPaid: item.isPaid && clearPaid ? true : undefined,
        });
      } else {
        if (!resourceId) return;
        const startsAt = combineDateAndTime(date, startTime).toISOString();
        const endsAt = combineDateAndTime(date, endTime).toISOString();
        const revertToRates =
          Math.abs(baseNum - coerceMoney(item.computedAmount)) < 0.005;
        await updatePlayBilling(item.id, {
          guestName: guestName.trim(),
          resourceId,
          partySize: showPartyField
            ? Math.max(1, parseInt(partySize, 10) || 1)
            : 1,
          startsAt,
          endsAt,
          notes: notes.trim() || null,
          baseAmount: revertToRates ? null : baseNum,
          discountPercent: parsedDiscount,
          clearPaid: item.isPaid && clearPaid ? true : undefined,
        });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : t("finance.playSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    setSaving(true);
    setFeedback(null);
    try {
      if (isWalkIn) {
        await cancelWalkIn(item.id);
      } else {
        await cancelPlayBilling(item.id, {
          reason: item.bucket === "awaiting_payment" ? "CANCELED" : "NO_SHOW",
        });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setFeedback(
        e instanceof Error ? e.message : t("finance.playRemoveFailed"),
      );
    } finally {
      setSaving(false);
      setConfirmCancel(false);
    }
  }

  const inputClass =
    "mt-0.5 w-full rounded-md border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-sm text-white";
  const labelClass = "block text-[11px] font-medium text-zinc-500";

  return (
    <>
      <ModalPortal>
        <div className="fixed inset-0 z-[400] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label={t("finance.playClose")}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="relative z-10 flex max-h-[min(92dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:max-h-[min(88dvh,600px)] sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  {isWalkIn
                    ? t("finance.playEditWalkIn")
                    : t("finance.playEditCharge")}
                </h2>
                <p className="text-[10px] text-zinc-500">
                  {item.resource?.name ?? t("finance.playNoUnit")}
                  {item.resource?.categoryName
                    ? ` · ${item.resource.categoryName}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
            >
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
                {feedback ? (
                  <FeedbackBanner
                    variant="error"
                    message={feedback}
                    onDismiss={() => setFeedback(null)}
                  />
                ) : null}

                {windowErr && !feedback ? (
                  <FeedbackBanner variant="error" message={windowErr} />
                ) : null}

                <div className={cn("grid gap-2", showPartyField ? "grid-cols-2" : "grid-cols-1")}>
                  <label className={labelClass}>
                    {t("finance.playGuest")}
                    <input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className={inputClass}
                      required
                    />
                  </label>
                  {showPartyField ? (
                    <label className={labelClass}>
                      {t("finance.playPlayers")}
                      <input
                        type="number"
                        min={1}
                        value={partySize}
                        onChange={(e) => setPartySize(e.target.value)}
                        className={inputClass}
                      />
                    </label>
                  ) : null}
                </div>

                <label className={labelClass}>
                  {t("finance.playGameUnit")}
                  <select
                    value={resourceId}
                    onChange={(e) => setResourceId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">{t("finance.playNone")}</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.categoryName}
                      </option>
                    ))}
                  </select>
                </label>

                {isWalkIn ? (
                  <label className={labelClass}>
                    {t("finance.playDuration")}
                    <input
                      type="number"
                      min={1}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <label className={labelClass}>
                      {t("finance.playDate")}
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </label>
                    <label className={labelClass}>
                      {t("finance.playStart")}
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </label>
                    <label className={labelClass}>
                      {t("finance.playEndTime")}
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </label>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <label className={labelClass}>
                    {t("finance.playDiscountPct")}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    {t("finance.playCharge")}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={baseCharge}
                      onChange={(e) => setBaseCharge(e.target.value)}
                      className={inputClass}
                      required
                    />
                  </label>
                </div>
                {!isWalkIn && item.computedAmount !== parsedBase ? (
                  <p className="text-[10px] text-zinc-600">
                    {t("finance.playFromRates", {
                      amount: formatMoney(item.computedAmount),
                    })}
                    {usesRateAmount
                      ? t("finance.playUsingRates")
                      : t("finance.playYouEdited")}
                  </p>
                ) : null}

                <label className={labelClass}>
                  {t("finance.playNotes")}
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("finance.playNotesOptional")}
                    className={inputClass}
                  />
                </label>

                {item.isPaid ? (
                  <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={clearPaid}
                      onChange={(e) => setClearPaid(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    {t("finance.playUndoPaid")}
                  </label>
                ) : null}
              </div>

              <div className="shrink-0 space-y-2 border-t border-white/10 bg-zinc-950/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">
                    {t("finance.playBase", { amount: formatMoney(parsedBase) })}
                    {parsedDiscount > 0 ? ` · −${parsedDiscount}%` : ""}
                  </span>
                  <span className="font-semibold text-white">
                    {t("finance.playTotal", {
                      amount: formatMoney(previewAmount),
                    })}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving || !!windowErr}
                    className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 size={16} className="mx-auto animate-spin" />
                    ) : (
                      t("finance.playSave")
                    )}
                  </button>
                  {!item.isPaid ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setConfirmCancel(true)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-400/30 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      {isWalkIn ? (
                        <>
                          <Trash2 size={14} />
                          {t("finance.playDelete")}
                        </>
                      ) : (
                        <>
                          <UserX size={14} />
                          {t("finance.playCancel")}
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>

      <ConfirmDialog
        open={confirmCancel}
        title={
          isWalkIn
            ? t("finance.playDeleteWalkInTitle")
            : t("finance.playCancelChargeTitle")
        }
        description={
          isWalkIn
            ? t("finance.playDeleteWalkInDesc")
            : t("finance.playCancelChargeDesc")
        }
        confirmLabel={
          isWalkIn ? t("finance.playDelete") : t("finance.playCancelBooking")
        }
        variant="danger"
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  );
}

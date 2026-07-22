"use client";

import { Clock, X } from "lucide-react";
import { ModalPortal } from "@/components/ui/modal-portal";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import type { ScheduleBooking, ScheduleUnit } from "@/lib/reservations-client";

export function GamingUnitBlockDialog({
  unit,
  booking,
  onClose,
}: {
  unit: ScheduleUnit;
  booking: ScheduleBooking;
  onClose: () => void;
}) {
  const { t, locale } = usePublicPrefs();

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 dark:bg-black/70"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-foreground)] shadow-xl dark:border-white/10 dark:bg-zinc-950"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-300" size={18} />
              <div>
                <p className="text-sm font-semibold text-[var(--color-foreground)]">{unit.name}</p>
                <p className="mt-1 text-xs text-rose-700 dark:text-rose-200">
                  {t("venuePage.floor.reservedTitle")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-600 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/5"
              aria-label={t("venuePage.floor.close")}
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/60 px-4 py-3 text-sm text-zinc-700 dark:border-white/10 dark:text-zinc-300">
            <p>
              <span className="text-zinc-600 dark:text-zinc-500">
                {t("venuePage.floor.from")}{" "}
              </span>
              <span className="font-medium text-[var(--color-foreground)]">
                {formatTime(booking.startsAt)}
              </span>
            </p>
            <p className="mt-1">
              <span className="text-zinc-600 dark:text-zinc-500">
                {t("venuePage.floor.until")}{" "}
              </span>
              <span className="font-medium text-[var(--color-foreground)]">
                {formatTime(booking.endsAt)}
              </span>
            </p>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-zinc-600 dark:text-zinc-500">
            {t("venuePage.floor.blockHint")}
          </p>
        </div>
      </div>
    </ModalPortal>
  );
}

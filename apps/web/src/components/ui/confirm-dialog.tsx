"use client";

import { Loader2 } from "lucide-react";
import { ModalPortal } from "./modal-portal";
import { cn } from "@/lib/cn";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={() => !busy && onCancel()}
      >
        <div
          role="alertdialog"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-desc"
          className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/50"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="confirm-title" className="text-lg font-semibold text-white">
            {title}
          </h2>
          <p id="confirm-desc" className="mt-2 text-sm leading-relaxed text-zinc-400">
            {description}
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className={cn(
                "inline-flex min-w-[5.5rem] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50",
                variant === "danger"
                  ? "bg-rose-600 hover:bg-rose-500"
                  : "bg-emerald-600 hover:bg-emerald-500",
              )}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

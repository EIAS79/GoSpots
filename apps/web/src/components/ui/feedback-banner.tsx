"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type FeedbackVariant = "error" | "success" | "info" | "warning";

export function FeedbackBanner({
  variant,
  message,
  onDismiss,
  className,
}: {
  variant: FeedbackVariant;
  message: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const Icon =
    variant === "success"
      ? CheckCircle2
      : variant === "warning"
        ? AlertTriangle
        : AlertCircle;

  return (
    <div
      role={variant === "warning" ? "status" : "alert"}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm",
        variant === "error" &&
          "border-rose-400/35 bg-rose-500/15 text-rose-50",
        variant === "success" &&
          "border-emerald-400/35 bg-emerald-500/15 text-emerald-50",
        variant === "info" &&
          "border-sky-400/35 bg-sky-500/15 text-sky-50",
        variant === "warning" &&
          "border-amber-400/35 bg-amber-500/15 text-amber-50",
        className,
      )}
    >
      <Icon
        size={18}
        className={cn(
          "mt-0.5 shrink-0",
          variant === "error" && "text-rose-300",
          variant === "success" && "text-emerald-300",
          variant === "info" && "text-sky-300",
          variant === "warning" && "text-amber-300",
        )}
        aria-hidden
      />
      <p className="min-w-0 flex-1 leading-snug">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-0.5 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "emerald",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "emerald" | "amber" | "rose" | "sky";
}) {
  const borderBg = {
    emerald: "border-emerald-400/20 bg-emerald-500/5",
    amber: "border-amber-400/20 bg-amber-500/5",
    rose: "border-rose-400/20 bg-rose-500/5",
    sky: "border-sky-400/20 bg-sky-500/5",
  };
  const iconTone = {
    emerald: "border-emerald-400/30 text-emerald-300",
    amber: "border-amber-400/30 text-amber-300",
    rose: "border-rose-400/30 text-rose-300",
    sky: "border-sky-400/30 text-sky-300",
  };
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border p-4 backdrop-blur-sm",
        borderBg[tone],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <p className="mt-1 truncate text-2xl font-semibold text-white">
            {value}
          </p>
          {hint ? (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{hint}</p>
          ) : null}
        </div>
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg border",
            iconTone[tone],
          )}
        >
          <Icon size={16} />
        </span>
      </div>
    </div>
  );
}

import { cn } from "@/lib/cn";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

const STATUS_STYLES = {
  PENDING: "bg-amber-500/15 text-amber-200 ring-amber-500/25",
  COMPLETED: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25",
  CANCELED: "bg-zinc-500/20 text-zinc-400 ring-white/10",
} as const;

const STATUS_KEYS = {
  PENDING: "orders.tabPreparing",
  COMPLETED: "orders.tabHandedOff",
  CANCELED: "orders.tabCanceled",
} as const;

export function OrderStatusBadge({
  status,
  className,
}: {
  status: keyof typeof STATUS_STYLES;
  className?: string;
}) {
  const t = useVenueSettingsOptional()?.t ?? ((k: string) => k);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        STATUS_STYLES[status],
        className,
      )}
    >
      {t(STATUS_KEYS[status])}
    </span>
  );
}

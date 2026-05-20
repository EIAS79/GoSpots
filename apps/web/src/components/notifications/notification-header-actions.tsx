"use client";

import { Archive, Bell } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useVenueHref } from "@/lib/venue-context";

export function NotificationHeaderActions({
  unreadCount,
  className,
}: {
  unreadCount: number;
  className?: string;
}) {
  const inboxHref = useVenueHref("/notifications");
  const archivedHref = useVenueHref("/notifications?status=archived");

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Link
        href={archivedHref}
        className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-violet-400/30 hover:bg-violet-500/10 hover:text-violet-200"
        aria-label="View archived notifications"
        title="Archived — restore to inbox"
      >
        <Archive size={17} />
      </Link>
      <Link
        href={inboxHref}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-white/20 hover:text-white"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        title="Notifications inbox"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-zinc-950">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

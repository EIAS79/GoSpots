"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useVenueHref } from "@/lib/venue-context";

export function NotificationBell({
  unreadCount,
  className,
}: {
  unreadCount: number;
  className?: string;
}) {
  const href = useVenueHref("/notifications");

  return (
    <Link
      href={href}
      className={cn(
        "relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-white/20 hover:text-white",
        className,
      )}
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications"
      }
    >
      <Bell size={18} />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-zinc-950">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}

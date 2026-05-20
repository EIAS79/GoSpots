"use client";

import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  fetchRecentNotifications,
  markNotificationRead,
  type NotificationRow,
} from "@/lib/notifications-client";
import { publishLiveEvent } from "@/lib/live-events";
import { useVenueHref } from "@/lib/venue-context";

const POLL_MS = 15_000;
const TOAST_MS = 8_000;

type Toast = NotificationRow & { visible: boolean };

export function NotificationToasts({
  onUnreadChange,
}: {
  onUnreadChange?: (count: number) => void;
}) {
  const hrefBase = useVenueHref("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sinceRef = useRef(new Date().toISOString());
  const seenRef = useRef(new Set<string>());

  const poll = useCallback(async () => {
    try {
      const data = await fetchRecentNotifications(sinceRef.current);
      onUnreadChange?.(data.unreadCount);
      const fresh = data.items.filter((n) => !seenRef.current.has(n.id));
      if (fresh.length === 0) return;

      for (const n of fresh) seenRef.current.add(n.id);
      sinceRef.current = new Date().toISOString();

      // Tell other pages something changed in their section so they refetch
      // immediately instead of waiting for their own poll interval.
      for (const n of fresh) {
        publishLiveEvent({ section: n.section, meta: { id: n.id } });
      }

      setToasts((prev) =>
        [...fresh.map((n) => ({ ...n, visible: true })), ...prev].slice(0, 5),
      );
    } catch {
      /* ignore when offline */
    }
  }, [onUnreadChange]);

  useEffect(() => {
    void poll();
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void poll();
    }, POLL_MS);
    const onFocus = () => void poll();
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((x) => (x.id === t.id ? { ...x, visible: false } : x)),
        );
        setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== t.id));
        }, 300);
      }, TOAST_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  const dismiss = (id: string) => {
    setToasts((prev) =>
      prev.map((x) => (x.id === id ? { ...x, visible: false } : x)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 300);
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const target = t.href ? `${hrefBase}${t.href}` : null;
        const inner = (
          <>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/20 text-emerald-300">
              <Bell size={14} />
            </span>
            <div className="min-w-0 flex-1 pr-6">
              <p className="text-sm font-semibold text-white">{t.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{t.body}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dismiss(t.id);
              }}
              className="pointer-events-auto absolute right-2 top-2 rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </>
        );

        const className = cn(
          "pointer-events-auto relative flex gap-3 rounded-xl border border-emerald-400/20 bg-zinc-950/95 p-3 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur transition-all duration-300",
          t.visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0",
        );

        const onOpen = () => {
          if (!t.readAt) void markNotificationRead(t.id);
          dismiss(t.id);
        };

        if (target) {
          return (
            <Link key={t.id} href={target} className={className} onClick={onOpen}>
              {inner}
            </Link>
          );
        }

        return (
          <button
            key={t.id}
            type="button"
            className={cn(className, "text-left")}
            onClick={onOpen}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

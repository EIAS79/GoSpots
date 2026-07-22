"use client";

import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useConnectivityOptional } from "@/lib/connectivity-context";
import {
  fetchRecentNotifications,
  markNotificationRead,
  type NotificationRow,
} from "@/lib/notifications-client";
import { publishLiveEvent } from "@/lib/live-events";
import { notificationNavHref } from "@/lib/safe-app-href";
import { livePollIntervalMs } from "@/lib/use-live-data";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

const POLL_MS = 15_000;
const TOAST_MS = 8_000;

type Toast = NotificationRow & { visible: boolean };

export function NotificationToasts({
  onUnreadChange,
}: {
  onUnreadChange?: (count: number) => void;
}) {
  const hrefBase = useVenueHref("");
  const tx = useVenueSettingsOptional()?.t ?? ((key: string) => key);
  const connectivity = useConnectivityOptional();
  const mode = connectivity?.mode ?? "ok";
  const reportLivePollResult = connectivity?.reportLivePollResult;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sinceRef = useRef(new Date().toISOString());
  const seenRef = useRef(new Set<string>());
  const failCountRef = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const reportRef = useRef(reportLivePollResult);
  reportRef.current = reportLivePollResult;
  const onUnreadChangeRef = useRef(onUnreadChange);
  onUnreadChangeRef.current = onUnreadChange;

  const poll = useCallback(async (): Promise<boolean> => {
    try {
      const data = await fetchRecentNotifications(sinceRef.current);
      onUnreadChangeRef.current?.(data.unreadCount);
      failCountRef.current = 0;
      reportRef.current?.(true);

      const fresh = data.items.filter((n) => !seenRef.current.has(n.id));
      if (fresh.length === 0) return true;

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
      return true;
    } catch {
      failCountRef.current += 1;
      reportRef.current?.(false);
      return false;
    }
  }, []);

  // Background poll with visibility pause + connectivity / failure backoff
  // (same schedule as useLiveData — bible #32 Phase 2).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const scheduleNext = () => {
      clear();
      if (cancelled) return;
      const delay = livePollIntervalMs(
        POLL_MS,
        failCountRef.current,
        modeRef.current,
      );
      timer = setTimeout(() => {
        void (async () => {
          if (typeof document !== "undefined" && document.hidden) {
            scheduleNext();
            return;
          }
          await poll();
          scheduleNext();
        })();
      }, delay);
    };

    void poll().then(() => {
      if (!cancelled) scheduleNext();
    });

    return () => {
      cancelled = true;
      clear();
    };
  }, [poll, mode]);

  useEffect(() => {
    const onFocus = () => void poll();
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
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
        const target = notificationNavHref(hrefBase, t.href);
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
              aria-label={tx("notif.dismiss")}
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

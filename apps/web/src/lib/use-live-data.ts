"use client";

import { useEffect, useRef } from "react";
import {
  subscribeLiveEvent,
  type LiveEvent,
} from "./live-events";

type Options = {
  /** Background poll interval in ms. Default 20s. */
  intervalMs?: number;
  /** Refetch on these `live-events` sections, in addition to polling. */
  refreshOnSections?: string[];
  /** Pause polling when document is hidden. Default true. */
  pauseWhenHidden?: boolean;
  /** Refetch immediately when the tab regains focus. Default true. */
  refetchOnFocus?: boolean;
  /** Set false to skip the loop entirely. */
  enabled?: boolean;
};

/**
 * Keeps a loader running in the background so pages stay fresh without manual refresh.
 *
 * - Re-runs `loader` every `intervalMs` (default 20s)
 * - Pauses when the tab is hidden
 * - Re-runs immediately on focus / visibility change
 * - Re-runs immediately when matching `live-events` arrive
 *
 * The hook does NOT call the loader on mount — callers should still call their
 * own initial load. This keeps it composable with paginated / parameterised
 * loaders that already manage their own initial fetch.
 */
export function useLiveData(
  loader: () => void | Promise<void>,
  deps: React.DependencyList,
  options: Options = {},
) {
  const {
    intervalMs = 20_000,
    refreshOnSections,
    pauseWhenHidden = true,
    refetchOnFocus = true,
    enabled = true,
  } = options;

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const runningRef = useRef(false);
  const run = useRef(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      await loaderRef.current();
    } finally {
      runningRef.current = false;
    }
  }).current;

  // Background polling with visibility awareness.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) {
          return;
        }
        void run();
      }, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, pauseWhenHidden, ...deps]);

  // Refetch when the tab regains focus / visibility.
  useEffect(() => {
    if (!enabled || !refetchOnFocus) return;
    const onFocus = () => void run();
    const onVisible = () => {
      if (!document.hidden) void run();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refetchOnFocus, ...deps]);

  // Cross-component live events.
  useEffect(() => {
    if (!enabled || !refreshOnSections?.length) return;
    const sections = new Set(refreshOnSections);
    return subscribeLiveEvent(
      () => void run(),
      (e: LiveEvent) => sections.has(e.section),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refreshOnSections?.join("|"), ...deps]);
}

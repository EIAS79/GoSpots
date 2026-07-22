"use client";

import { useEffect, useRef } from "react";
import {
  useConnectivityOptional,
  type ConnectivityMode,
} from "./connectivity-context";
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

const BACKOFF_MID_MS = 60_000;
const BACKOFF_CAP_MS = 120_000;

/** Bible #32 Phase 2: 20s → 60s → 120s cap on consecutive failures / known outage. */
export function livePollIntervalMs(
  baseMs: number,
  failCount: number,
  connectivityMode: ConnectivityMode | "ok",
): number {
  const degraded = connectivityMode !== "ok";
  if (degraded) {
    return Math.min(Math.max(baseMs * 3, BACKOFF_MID_MS), BACKOFF_CAP_MS);
  }
  if (failCount <= 0) return baseMs;
  if (failCount === 1) return Math.min(Math.max(baseMs, BACKOFF_MID_MS), BACKOFF_CAP_MS);
  return BACKOFF_CAP_MS;
}

/**
 * Silent `{ silent: true }` loaders often catch errors so the UI stays calm.
 * They should still `return false` on failure (and `true`/void on success) so
 * Mode F / poll backoff can see the outcome without a throw.
 */
export function livePollSucceeded(result: void | boolean): boolean {
  return result !== false;
}

/**
 * Keeps a loader running in the background so pages stay fresh without manual refresh.
 *
 * - Re-runs `loader` every `intervalMs` (default 20s)
 * - Pauses when the tab is hidden
 * - Re-runs immediately on focus / visibility change
 * - Re-runs immediately when matching `live-events` arrive
 * - Backs off when ConnectivityProvider reports offline/apiDown, or on thrown /
 *   `return false` loader failures (silent swallowers must return boolean)
 *
 * The hook does NOT call the loader on mount — callers should still call their
 * own initial load. This keeps it composable with paginated / parameterised
 * loaders that already manage their own initial fetch.
 */
export function useLiveData(
  loader: () => void | boolean | Promise<void | boolean>,
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

  const connectivity = useConnectivityOptional();
  const mode = connectivity?.mode ?? "ok";
  const reportLivePollResult = connectivity?.reportLivePollResult;

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const failCountRef = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const reportRef = useRef(reportLivePollResult);
  reportRef.current = reportLivePollResult;
  const intervalMsRef = useRef(intervalMs);
  intervalMsRef.current = intervalMs;

  const runningRef = useRef(false);
  const run = useRef(async (): Promise<boolean> => {
    if (runningRef.current) return failCountRef.current === 0;
    runningRef.current = true;
    try {
      const result = await loaderRef.current();
      if (!livePollSucceeded(result)) {
        failCountRef.current += 1;
        reportRef.current?.(false);
        return false;
      }
      failCountRef.current = 0;
      reportRef.current?.(true);
      return true;
    } catch {
      failCountRef.current += 1;
      reportRef.current?.(false);
      return false;
    } finally {
      runningRef.current = false;
    }
  }).current;

  // Background polling with visibility awareness + exponential / outage backoff.
  useEffect(() => {
    if (!enabled) return;
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
        intervalMsRef.current,
        failCountRef.current,
        modeRef.current,
      );
      timer = setTimeout(() => {
        void (async () => {
          if (
            pauseWhenHidden &&
            typeof document !== "undefined" &&
            document.hidden
          ) {
            scheduleNext();
            return;
          }
          await run();
          scheduleNext();
        })();
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, pauseWhenHidden, mode, ...deps]);

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

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getApiBaseUrl } from "./api-base-url";

/**
 * Client connectivity for bible #32 Modes A–C + F.
 * Mode A: browser offline. Mode B: API unreachable. Mode C: API up, DB/ready failing.
 * Mode F: live polls failing while /ready still looks OK (stale read).
 */

export type ConnectivityMode =
  | "ok"
  | "offline"
  | "api_unreachable"
  | "api_unavailable"
  | "stale";

type ConnectivityContextValue = {
  mode: ConnectivityMode;
  browserOnline: boolean;
  /** Report a live-poll outcome from `useLiveData` (Mode F when streak ≥ 2). */
  reportLivePollResult: (ok: boolean) => void;
};

const READY_POLL_MS = 30_000;
const READY_PROBE_TIMEOUT_MS = 8_000;
/** One bounded readiness failure is enough to surface a real proxy/API outage. */
const FAIL_STREAK_TO_BANNER = 1;
/** Live-poll fail streak before Mode F (when A–C not already active). */
const LIVE_POLL_FAIL_STREAK_TO_STALE = 2;

const ConnectivityContext = createContext<ConnectivityContextValue | null>(
  null,
);

type ReadyProbeResult =
  | { kind: "ok" }
  | { kind: "unreachable" }
  | { kind: "unavailable" };

async function probeReady(): Promise<ReadyProbeResult> {
  const url = `${getApiBaseUrl()}/ready`;
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(READY_PROBE_TIMEOUT_MS),
    });

    if (res.status === 502 || res.status === 504) {
      return { kind: "unreachable" };
    }
    if (res.status === 503) {
      return { kind: "unavailable" };
    }
    if (!res.ok) {
      // Unexpected non-OK — treat as unreachable (proxy/misconfig), not auth.
      return { kind: "unreachable" };
    }

    let body: { status?: string; database?: string } | null = null;
    try {
      body = (await res.json()) as { status?: string; database?: string };
    } catch {
      return { kind: "ok" };
    }
    if (body?.status === "error" || body?.database === "down") {
      return { kind: "unavailable" };
    }
    return { kind: "ok" };
  } catch {
    return { kind: "unreachable" };
  }
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [browserOnline, setBrowserOnline] = useState(true);
  const [serverMode, setServerMode] = useState<
    "ok" | "api_unreachable" | "api_unavailable"
  >("ok");
  const [livePollStale, setLivePollStale] = useState(false);
  const failStreakRef = useRef(0);
  const livePollFailStreakRef = useRef(0);
  const inFlightRef = useRef(false);

  const applyProbe = useCallback((result: ReadyProbeResult) => {
    if (result.kind === "ok") {
      failStreakRef.current = 0;
      setServerMode("ok");
      return;
    }
    failStreakRef.current += 1;
    if (failStreakRef.current < FAIL_STREAK_TO_BANNER) return;
    setServerMode(
      result.kind === "unavailable" ? "api_unavailable" : "api_unreachable",
    );
  }, []);

  const runProbe = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      applyProbe(await probeReady());
    } finally {
      inFlightRef.current = false;
    }
  }, [applyProbe]);

  const reportLivePollResult = useCallback((ok: boolean) => {
    if (ok) {
      livePollFailStreakRef.current = 0;
      setLivePollStale(false);
      return;
    }
    livePollFailStreakRef.current += 1;
    if (livePollFailStreakRef.current >= LIVE_POLL_FAIL_STREAK_TO_STALE) {
      setLivePollStale(true);
    }
  }, []);

  useEffect(() => {
    const syncOnline = () => {
      const online = navigator.onLine;
      setBrowserOnline(online);
      if (online) {
        // Re-check API ASAP after coming back.
        void runProbe();
      } else {
        failStreakRef.current = 0;
        setServerMode("ok");
      }
    };
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, [runProbe]);

  useEffect(() => {
    void runProbe();
    const id = window.setInterval(() => {
      void runProbe();
    }, READY_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void runProbe();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [runProbe]);

  // Priority: A (offline) > B/C (server) > F (stale polls) > ok
  const mode: ConnectivityMode = !browserOnline
    ? "offline"
    : serverMode !== "ok"
      ? serverMode
      : livePollStale
        ? "stale"
        : "ok";

  const value = useMemo(
    () => ({ mode, browserOnline, reportLivePollResult }),
    [mode, browserOnline, reportLivePollResult],
  );

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnectivityContextValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) {
    throw new Error("useConnectivity must be used inside ConnectivityProvider");
  }
  return ctx;
}

/** Soft read when banner may render outside the provider (should not happen). */
export function useConnectivityOptional(): ConnectivityContextValue | null {
  return useContext(ConnectivityContext);
}

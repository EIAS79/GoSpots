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
import {
  countOfflineOperations,
  syncOfflineOutbox,
  type OfflineCounts,
} from "./offline-outbox";

export type ConnectivityMode =
  | "ok"
  | "offline"
  | "api_unreachable"
  | "api_unavailable"
  | "stale";

type ConnectivityContextValue = {
  mode: ConnectivityMode;
  browserOnline: boolean;
  pending: number;
  conflict: number;
  failed: number;
  reportLivePollResult: (ok: boolean) => void;
  refreshOfflineCounts: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const READY_POLL_MS = 30_000;
const READY_PROBE_TIMEOUT_MS = 8_000;
const OUTBOX_POLL_MS = 15_000;
const FAIL_STREAK_TO_BANNER = 1;
const LIVE_POLL_FAIL_STREAK_TO_STALE = 2;
const EMPTY_COUNTS: OfflineCounts = { pending: 0, conflict: 0, failed: 0 };

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

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
    if (res.status === 502 || res.status === 504) return { kind: "unreachable" };
    if (res.status === 503) return { kind: "unavailable" };
    if (!res.ok) return { kind: "unreachable" };
    try {
      const body = (await res.json()) as { status?: string; database?: string };
      if (body?.status === "error" || body?.database === "down") return { kind: "unavailable" };
    } catch {
      // A successful ready response with an unexpected body still proves reachability.
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
  const [offlineCounts, setOfflineCounts] = useState<OfflineCounts>(EMPTY_COUNTS);
  const failStreakRef = useRef(0);
  const livePollFailStreakRef = useRef(0);
  const inFlightRef = useRef(false);

  const refreshOfflineCounts = useCallback(async () => {
    try {
      setOfflineCounts(await countOfflineOperations());
    } catch {
      setOfflineCounts(EMPTY_COUNTS);
    }
  }, []);

  const syncNow = useCallback(async () => {
    try {
      setOfflineCounts(await syncOfflineOutbox());
    } catch {
      await refreshOfflineCounts();
    }
  }, [refreshOfflineCounts]);

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
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await probeReady();
      applyProbe(result);
      if (result.kind === "ok") await syncNow();
    } finally {
      inFlightRef.current = false;
    }
  }, [applyProbe, syncNow]);

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
        void runProbe();
      } else {
        failStreakRef.current = 0;
        setServerMode("ok");
        void refreshOfflineCounts();
      }
    };
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, [runProbe, refreshOfflineCounts]);

  useEffect(() => {
    void refreshOfflineCounts();
    void runProbe();
    const readyId = window.setInterval(() => void runProbe(), READY_POLL_MS);
    const outboxId = window.setInterval(() => {
      if (navigator.onLine) void syncNow();
      else void refreshOfflineCounts();
    }, OUTBOX_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshOfflineCounts();
        void runProbe();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(readyId);
      window.clearInterval(outboxId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [runProbe, refreshOfflineCounts, syncNow]);

  const mode: ConnectivityMode = !browserOnline
    ? "offline"
    : serverMode !== "ok"
      ? serverMode
      : livePollStale
        ? "stale"
        : "ok";

  const value = useMemo(
    () => ({
      mode,
      browserOnline,
      pending: offlineCounts.pending,
      conflict: offlineCounts.conflict,
      failed: offlineCounts.failed,
      reportLivePollResult,
      refreshOfflineCounts,
      syncNow,
    }),
    [
      mode,
      browserOnline,
      offlineCounts,
      reportLivePollResult,
      refreshOfflineCounts,
      syncNow,
    ],
  );

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnectivityContextValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) throw new Error("useConnectivity must be used inside ConnectivityProvider");
  return ctx;
}

export function useConnectivityOptional(): ConnectivityContextValue | null {
  return useContext(ConnectivityContext);
}

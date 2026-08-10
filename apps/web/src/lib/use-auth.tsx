"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, ensureCsrf } from "./api";
import {
  notifySessionRevoked,
  registerAuthGuestHandler,
} from "./auth-session";
import { clearCachedCsrfToken } from "./csrf";
import {
  purgeOfflineAuthSnapshot,
  readOfflineAuthSnapshot,
  saveOfflineAuthSnapshot,
} from "./offline-auth-snapshot";
import { purgeAllOfflineLiteEntitlements } from "./offline-entitlement";
import { purgeAllOfflineData } from "./offline-outbox";
import { purgeOfflinePrivateNavigationCache } from "./offline-service-worker";
import { purgeOfflineShopSnapshots } from "./offline-shell-snapshot";
import {
  type AuthUser,
  fetchMe,
  logout as apiLogout,
  refresh as apiRefresh,
} from "./auth-client";

const PROACTIVE_REFRESH_MS = 10 * 60 * 1000;
/** Retry bootstrap while a sleeping/unreachable API is warming up. */
const TRANSIENT_AUTH_RETRY_MS = 3_000;

type State =
  | { status: "loading"; user: null }
  | { status: "authed"; user: AuthUser }
  | { status: "guest"; user: null };

interface AuthCtx {
  state: State;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

async function purgeOfflineSessionData() {
  purgeOfflineAuthSnapshot();
  purgeAllOfflineLiteEntitlements();
  purgeOfflineShopSnapshots();
  await Promise.all([
    purgeAllOfflineData().catch(() => undefined),
    purgeOfflinePrivateNavigationCache().catch(() => undefined),
  ]);
}

function rememberUser(user: AuthUser) {
  saveOfflineAuthSnapshot(user);
  return user;
}

function isTransientAuthFailure(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 0 ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500)
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading", user: null });
  const [retryTick, setRetryTick] = useState(0);
  const retryTimerRef = useRef<number | null>(null);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current === null) return;
    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current !== null) return;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      setRetryTick((value) => value + 1);
    }, TRANSIENT_AUTH_RETRY_MS);
  }, []);

  const reload = useCallback(async () => {
    clearRetry();
    setState((current) =>
      current.status === "authed"
        ? current
        : { status: "loading", user: null },
    );

    try {
      // `api()` already performs one refresh attempt for a genuine 401.
      // Do not issue a second refresh for 502/network failures: that turns a
      // temporary Render cold start into a false logout and extra delay.
      const user = rememberUser(await fetchMe());
      setState({ status: "authed", user });
    } catch (err) {
      if (isTransientAuthFailure(err)) {
        const cached = readOfflineAuthSnapshot();
        // Preserve a known identity while the backend wakes up. On a hard
        // refresh Offline Lite may recover the credential-free cached identity.
        setState((current) =>
          current.status === "authed"
            ? current
            : cached
              ? { status: "authed", user: cached }
              : { status: "loading", user: null },
        );
        scheduleRetry();
        return;
      }

      if (
        err instanceof ApiError &&
        (err.code === "SESSION_REVOKED" || err.status === 401)
      ) {
        if (err.code === "SESSION_REVOKED") notifySessionRevoked();
        await purgeOfflineSessionData();
        setState({ status: "guest", user: null });
        return;
      }

      setState({ status: "guest", user: null });
    }
  }, [clearRetry, scheduleRetry]);

  const signOut = useCallback(async () => {
    clearRetry();
    try {
      await ensureCsrf();
      await apiLogout();
    } finally {
      clearCachedCsrfToken();
      await purgeOfflineSessionData();
      setState({ status: "guest", user: null });
    }
  }, [clearRetry]);

  useEffect(() => {
    return registerAuthGuestHandler(() => {
      clearRetry();
      void purgeOfflineSessionData().finally(() => {
        setState({ status: "guest", user: null });
      });
    });
  }, [clearRetry]);

  useEffect(() => {
    void reload();
  }, [reload, retryTick]);

  useEffect(() => clearRetry, [clearRetry]);

  useEffect(() => {
    if (state.status !== "authed") return;

    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      try {
        await ensureCsrf();
        await apiRefresh();
      } catch (err) {
        // Temporary 5xx/timeouts must not log the user out. A subsequent
        // request/visibility tick will retry once the service is available.
        if (isTransientAuthFailure(err)) return;
        if (
          err instanceof ApiError &&
          (err.code === "SESSION_REVOKED" || err.status === 401)
        ) {
          if (err.code === "SESSION_REVOKED") notifySessionRevoked();
          clearRetry();
          await purgeOfflineSessionData();
          setState({ status: "guest", user: null });
        }
      }
    }

    const id = window.setInterval(() => {
      void tick();
    }, PROACTIVE_REFRESH_MS);

    function onVisible() {
      if (document.visibilityState === "visible") void tick();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clearRetry, state.status]);

  return (
    <AuthContext.Provider value={{ state, reload, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ApiError, ensureCsrf } from "./api";
import {
  notifySessionRevoked,
  registerAuthGuestHandler,
} from "./auth-session";
import { clearCachedCsrfToken } from "./csrf";
import { purgeAllOfflineData } from "./offline-outbox";
import {
  type AuthUser,
  fetchMe,
  logout as apiLogout,
  refresh as apiRefresh,
} from "./auth-client";

const PROACTIVE_REFRESH_MS = 10 * 60 * 1000;

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading", user: null });

  const reload = useCallback(async () => {
    await ensureCsrf();
    try {
      const user = await fetchMe();
      setState({ status: "authed", user });
    } catch {
      try {
        await ensureCsrf();
        await apiRefresh();
        const user = await fetchMe();
        setState({ status: "authed", user });
      } catch (err) {
        if (err instanceof ApiError && err.code === "SESSION_REVOKED") {
          notifySessionRevoked();
        }
        setState({ status: "guest", user: null });
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await ensureCsrf();
      await apiLogout();
    } finally {
      clearCachedCsrfToken();
      await purgeAllOfflineData().catch(() => undefined);
      setState({ status: "guest", user: null });
    }
  }, []);

  useEffect(() => {
    return registerAuthGuestHandler(() => {
      void purgeAllOfflineData().finally(() => {
        setState({ status: "guest", user: null });
      });
    });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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
        if (err instanceof ApiError && err.code === "SESSION_REVOKED") {
          notifySessionRevoked();
          await purgeAllOfflineData().catch(() => undefined);
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
  }, [state.status]);

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

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
import {
  type AuthUser,
  fetchMe,
  logout as apiLogout,
  refresh as apiRefresh,
} from "./auth-client";

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
      setState({ status: "guest", user: null });
    }
  }, []);

  useEffect(() => {
    return registerAuthGuestHandler(() => {
      setState({ status: "guest", user: null });
    });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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

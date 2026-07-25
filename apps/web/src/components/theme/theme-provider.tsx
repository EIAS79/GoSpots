"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

export type Theme = "dark" | "light";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  /** True while hydrating from localStorage */
  ready: boolean;
  /** Public marketing pages honor light/dark; dashboard stays dark. */
  isPublicTheme: boolean;
};

const STORAGE_KEY = "gospots-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const v =
      window.localStorage.getItem(STORAGE_KEY) ||
      window.localStorage.getItem("locora-theme");
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

function applyDom(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.dataset.theme = theme;
}

function isAppShellPath(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register")
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAppShell = isAppShellPath(pathname);
  const [theme, setThemeState] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  // Apply stored theme before paint — no <script> in layout (React 19 warns).
  useLayoutEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    applyDom(isAppShellPath(pathname) ? "dark" : stored);
    setReady(true);
  }, [pathname]);

  // Dashboard / auth always render dark so the public home theme toggle
  // cannot wash out the tenant sidebar (shared html.dark + translucent panels).
  useEffect(() => {
    if (!ready) return;
    const effective: Theme = isAppShell ? "dark" : theme;
    applyDom(effective);
    if (!isAppShell) {
      try {
        window.localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        /* ignore */
      }
    }
  }, [theme, ready, isAppShell]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({
      theme: isAppShell ? ("dark" as const) : theme,
      setTheme,
      toggleTheme,
      ready,
      isPublicTheme: !isAppShell,
    }),
    [theme, setTheme, toggleTheme, ready, isAppShell],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

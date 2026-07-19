"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { getApiBaseUrl } from "./api-base-url";
import { isRtlPublicLocale, translatePublic } from "./public-i18n";
import {
  isPublicCurrency,
  isPublicLocale,
  PUBLIC_PREFS_STORAGE_KEY,
  type PublicCurrency,
  type PublicLocale,
} from "./public-prefs";

type PublicPrefsContextValue = {
  locale: PublicLocale;
  currency: PublicCurrency;
  setLocale: (locale: PublicLocale) => void;
  setCurrency: (currency: PublicCurrency) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Format an amount that is stored in `fromCurrency` into the visitor display currency. */
  formatMoney: (amount: number, fromCurrency?: string) => string;
  convertAmount: (amount: number, fromCurrency?: string) => number;
};

const PublicPrefsContext = createContext<PublicPrefsContextValue | null>(null);

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

type RateCache = Record<string, number>;

export function PublicPrefsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAppShell =
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register");
  const [locale, setLocaleState] = useState<PublicLocale>("en");
  const [currency, setCurrencyState] = useState<PublicCurrency>("EUR");
  const [hydrated, setHydrated] = useState(false);
  const [ratesToDisplay, setRatesToDisplay] = useState<RateCache>({ EUR: 1 });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PUBLIC_PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { locale?: string; currency?: string };
        if (parsed.locale && isPublicLocale(parsed.locale)) {
          setLocaleState(parsed.locale);
        }
        if (parsed.currency && isPublicCurrency(parsed.currency)) {
          setCurrencyState(parsed.currency);
        }
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      PUBLIC_PREFS_STORAGE_KEY,
      JSON.stringify({ locale, currency }),
    );
    // Dashboard has its own venue language — don't override html lang/dir there.
    if (isAppShell) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtlPublicLocale(locale) ? "rtl" : "ltr";
  }, [locale, currency, hydrated, isAppShell]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    async function loadRates() {
      const bases = ["EUR", "USD", "PLN", "AED", "SAR", "EGP", "GBP"];
      const next: RateCache = { [currency]: 1 };
      await Promise.all(
        bases.map(async (from) => {
          if (from === currency) {
            next[from] = 1;
            return;
          }
          try {
            const res = await fetch(
              `${getApiBaseUrl()}/public/currency/rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(currency)}`,
            );
            if (!res.ok) return;
            const body = (await res.json()) as { rate?: number };
            if (body.rate != null && body.rate > 0) next[from] = body.rate;
          } catch {
            /* ignore */
          }
        }),
      );
      if (!cancelled) setRatesToDisplay(next);
    }

    void loadRates();
    return () => {
      cancelled = true;
    };
  }, [currency, hydrated]);

  const setLocale = useCallback((next: PublicLocale) => {
    setLocaleState(next);
  }, []);

  const setCurrency = useCallback((next: PublicCurrency) => {
    setCurrencyState(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translatePublic(locale, key, vars),
    [locale],
  );

  const convertAmount = useCallback(
    (amount: number, fromCurrency = "EUR") => {
      const from = fromCurrency.toUpperCase();
      if (from === currency) return roundMoney(amount);
      const rate = ratesToDisplay[from];
      if (rate == null || rate <= 0) return roundMoney(amount);
      return roundMoney(amount * rate);
    },
    [currency, ratesToDisplay],
  );

  const formatMoney = useCallback(
    (amount: number, fromCurrency = "EUR") => {
      const converted = convertAmount(amount, fromCurrency);
      try {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(converted);
      } catch {
        return `${converted} ${currency}`;
      }
    },
    [convertAmount, currency, locale],
  );

  const value = useMemo(
    () => ({
      locale,
      currency,
      setLocale,
      setCurrency,
      t,
      formatMoney,
      convertAmount,
    }),
    [locale, currency, setLocale, setCurrency, t, formatMoney, convertAmount],
  );

  return (
    <PublicPrefsContext.Provider value={value}>
      {children}
    </PublicPrefsContext.Provider>
  );
}

export function usePublicPrefs() {
  const ctx = useContext(PublicPrefsContext);
  if (!ctx) {
    throw new Error("usePublicPrefs must be used inside PublicPrefsProvider");
  }
  return ctx;
}

export function usePublicPrefsOptional() {
  return useContext(PublicPrefsContext);
}
